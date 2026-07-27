<?php
/**
 * ABI Project Tracker — REST API
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────────
 *  GET  ?action=get_projects                   All projects with pre-computed stats
 *  GET  ?action=get_project&id=…               Single project metadata
 *  POST ?action=create_project                 [editor+] Create project (body: meta + items[])
 *  POST ?action=update_project                 [editor+] Update project metadata
 *  POST ?action=delete_project                 [admin]   Delete project + items (body: {id})
 *
 *  GET  ?action=get_items&project_id=…         All items for a project
 *  GET  ?action=get_item&project_id=…&no=…     Single item
 *  POST ?action=update_item                    [editor+] Update item (body includes project_id)
 *  POST ?action=add_item                       [editor+] Add item   (body includes project_id)
 *  POST ?action=delete_item                    [editor+] Delete item (body: {project_id, no})
 *
 *  GET  ?action=get_item_history&project_id=…&no=…   Change log for one item
 *  GET  ?action=get_audit_log                  [editor+] Full audit log (optional &project_id=)
 * ─────────────────────────────────────────────────────────────────
 */

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/* ── DB config ──────────────────────────────────────────────────── */
define('DB_HOST', 'localhost');
define('DB_NAME', 'abitrack');
define('DB_USER', 'root');
define('DB_PASS', '');

/* ── Helpers ────────────────────────────────────────────────────── */
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
             PDO::ATTR_EMULATE_PREPARES   => false]
        );
    }
    return $pdo;
}

function sendJson(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function ok(mixed $data, string $msg = 'OK'): void {
    sendJson(['success' => true, 'message' => $msg, 'data' => $data]);
}
function err(int $status, string $msg): void {
    sendJson(['success' => false, 'error' => $msg], $status);
}

/* ── Auth ───────────────────────────────────────────────────────── */
function requireAuth(string $minRole = 'viewer'): array {
    if (!isset($_SESSION['user_id'])) {
        err(401, 'Authentication required');
    }
    $levels = ['viewer' => 0, 'editor' => 1, 'admin' => 2];
    $have   = $levels[$_SESSION['role']] ?? -1;
    $need   = $levels[$minRole]          ?? 99;
    if ($have < $need) {
        err(403, "This action requires '{$minRole}' access or higher");
    }
    return [
        'id'       => (int)$_SESSION['user_id'],
        'username' => $_SESSION['username'],
        'role'     => $_SESSION['role'],
    ];
}

/* ── Audit ──────────────────────────────────────────────────────── */
function auditLog(
    array   $user,
    string  $action,
    string  $entity,
    string  $projectId,
    ?int    $itemNo,
    ?string $itemScope,
    array   $changes
): void {
    try {
        db()->prepare("
            INSERT INTO `audit_log`
              (`user_id`, `username`, `action`, `entity`, `project_id`, `item_no`, `item_scope`, `changes`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ")->execute([
            $user['id'], $user['username'], $action, $entity,
            $projectId, $itemNo, $itemScope,
            json_encode($changes, JSON_UNESCAPED_UNICODE),
        ]);
    } catch (\Throwable $e) {
        // Audit failures must never break the main operation
    }
}

/* Compute field-level diff between old and new values for listed fields */
function diffChanges(array $old, array $new, array $fields): array {
    $changes = [];
    foreach ($fields as $f) {
        $o = $old[$f] ?? '';
        $n = $new[$f] ?? '';
        if (is_numeric($o) && is_numeric($n)) {
            if ((float)$o === (float)$n) continue;
        } elseif ((string)$o === (string)$n) {
            continue;
        }
        $changes[$f] = ['old' => $o === '' ? null : $o, 'new' => $n === '' ? null : $n];
    }
    return $changes;
}

/* ── Type casts ─────────────────────────────────────────────────── */
function castItem(array $row): array {
    $nums = ['budget','endorsed_amount','savings_budget_endorsed','negotiated_proposal',
             'po_amount','savings_endorsed_po','rfp_amount'];
    $row['no'] = (int)$row['no'];
    foreach ($nums as $f) {
        $row[$f] = isset($row[$f]) ? (float)$row[$f] : 0.0;
    }
    unset($row['id'], $row['project_id'], $row['parent_no']);
    foreach ($row as $k => $v) {
        if ($v === null) $row[$k] = '';
    }
    return $row;
}

function castProject(array $row): array {
    $row['total_budget']                   = (float)($row['total_budget'] ?? 0);
    $row['no_need_commercial_endorsement'] = (int)($row['no_need_commercial_endorsement'] ?? 0);
    $row['color_index']                    = (int)($row['color_index'] ?? 0);
    $row['is_default']                     = (int)($row['is_default']  ?? 0);
    foreach ($row as $k => $v) {
        if ($v === null) $row[$k] = '';
    }
    return $row;
}

/* Allowed item fields (never overwrite project_id / id / no via update) */
const ITEM_FIELDS = [
    'trade','scope','remarks','budget','endorsed_vendor','endorsement_remarks',
    'endorsement_date','endorsed_amount','savings_budget_endorsed','vendor_timeline',
    'date_needed','approved_vendor','priority','dp_required','downpayment',
    'progress_billing','upon_completion','notes','awarded_vendor','pr_no',
    'negotiated_proposal','po_amount','date_of_po','po_no','date_issuance_po',
    'savings_endorsed_po','po_remarks','invoice_no','invoice_date','rfp_no',
    'rfp_date','date_submission_ap','rfp_amount','pt','conditions','due_date','final_remarks',
];

/* ── Input ──────────────────────────────────────────────────────── */
$action = $_GET['action'] ?? '';
$body   = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true) ?? [];
}

/* ── Router ─────────────────────────────────────────────────────── */
try {

switch ($action) {

/* ──────────────────────────────────────────────────────────────────
   GET_PROJECTS  — all projects with aggregated stats (via LEFT JOIN)
   ────────────────────────────────────────────────────────────────── */
case 'get_projects':
    requireAuth();
    $rows = db()->query("
        SELECT
            p.*,
            COUNT(i.id)                                                    AS total_items,
            COUNT(CASE WHEN i.endorsed_amount  > 0    THEN 1 END)         AS endorsed_count,
            COUNT(CASE WHEN i.po_no           != ''   THEN 1 END)         AS with_po_count,
            COUNT(CASE WHEN i.endorsement_remarks = 'LONG LEAD ITEMS' THEN 1 END) AS long_lead_count,
            COALESCE(SUM(CASE WHEN i.endorsed_amount > 0   THEN i.endorsed_amount   ELSE 0 END), 0) AS total_endorsed,
            COALESCE(SUM(CASE WHEN i.po_no != ''           THEN i.po_amount         ELSE 0 END), 0) AS total_po,
            COALESCE(SUM(CASE WHEN i.po_no != ''           THEN i.savings_endorsed_po ELSE 0 END), 0) AS total_savings,
            (SELECT COUNT(*) FROM `audit_log` al WHERE al.`project_id` COLLATE utf8mb4_unicode_ci = p.`id` COLLATE utf8mb4_unicode_ci) AS audit_count
        FROM projects p
        LEFT JOIN items i ON i.project_id = p.id
        GROUP BY p.id
        ORDER BY p.is_default DESC, p.created_at ASC
    ")->fetchAll();

    $result = array_map(function (array $r) {
        $r = castProject($r);
        $r['stats'] = [
            'total_items'    => (int)$r['total_items'],
            'endorsed_count' => (int)$r['endorsed_count'],
            'with_po_count'  => (int)$r['with_po_count'],
            'long_lead_count'=> (int)$r['long_lead_count'],
            'total_endorsed' => (float)$r['total_endorsed'],
            'total_po'       => (float)$r['total_po'],
            'total_savings'  => (float)$r['total_savings'],
            'balance'        => (float)$r['total_budget'] - (float)$r['total_endorsed'],
            'budget'         => (float)$r['total_budget'],
            'no_commercial_endorsement' => (int)$r['no_need_commercial_endorsement'],
            'audit_count'    => (int)$r['audit_count'],
        ];
        foreach (['total_items','endorsed_count','with_po_count','long_lead_count',
                  'total_endorsed','total_po','total_savings','audit_count'] as $k) {
            unset($r[$k]);
        }
        return $r;
    }, $rows);

    ok($result);

/* ──────────────────────────────────────────────────────────────────
   GET_PROJECT  — single project metadata
   ────────────────────────────────────────────────────────────────── */
case 'get_project':
    requireAuth();
    $id = $_GET['id'] ?? '';
    if ($id === '') err(400, 'id is required');

    $stmt = db()->prepare('SELECT * FROM `projects` WHERE `id` = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) err(404, "Project '{$id}' not found");

    ok(castProject($row));

/* ──────────────────────────────────────────────────────────────────
   CREATE_PROJECT  — insert project + optional items[]
   ────────────────────────────────────────────────────────────────── */
case 'create_project':
    $user = requireAuth('editor');
    if (empty($body['id']))   err(400, 'id is required');
    if (empty($body['name'])) err(400, 'name is required');

    $pdo = db();

    $pdo->prepare("INSERT INTO `projects`
        (id, name, code, client, status, total_budget, start_date, notes, color_index,
         no_need_commercial_endorsement, is_default)
        VALUES (:id, :name, :code, :client, :status, :budget, :start, :notes, :ci, :nc, 0)")
        ->execute([
            'id'     => $body['id'],
            'name'   => $body['name'],
            'code'   => $body['code']       ?? '',
            'client' => $body['client']     ?? '',
            'status' => $body['status']     ?? 'active',
            'budget' => $body['budget']     ?? 0,
            'start'  => $body['startDate']  ?? '',
            'notes'  => $body['notes']      ?? '',
            'ci'     => $body['colorIndex'] ?? 0,
            'nc'     => $body['no_need_commercial_endorsement'] ?? 0,
        ]);

    $items = $body['items'] ?? [];
    if (!empty($items)) {
        $allF = ITEM_FIELDS;
        $cols = 'project_id, no, ' . implode(', ', $allF);
        $plch = ':project_id, :no, :' . implode(', :', $allF);
        $stmt = $pdo->prepare("INSERT IGNORE INTO `items` ($cols) VALUES ($plch)");
        $nums = ['budget','endorsed_amount','savings_budget_endorsed','negotiated_proposal',
                 'po_amount','savings_endorsed_po','rfp_amount'];
        foreach ($items as $item) {
            $params = ['project_id' => $body['id'], 'no' => (int)($item['no'] ?? 0)];
            foreach ($allF as $f) {
                $params[$f] = $item[$f] ?? (in_array($f, $nums) ? 0 : '');
            }
            $stmt->execute($params);
        }
    }

    auditLog($user, 'create', 'project', $body['id'], null, $body['name'], [
        'snapshot' => array_filter([
            'name'   => $body['name'],
            'code'   => $body['code']   ?? '',
            'client' => $body['client'] ?? '',
            'status' => $body['status'] ?? 'active',
            'budget' => $body['budget'] ?? null,
        ], fn($v) => $v !== null && $v !== ''),
    ]);

    $stmt2 = db()->prepare('SELECT * FROM `projects` WHERE `id` = ?');
    $stmt2->execute([$body['id']]);
    ok(castProject($stmt2->fetch()), 'Project created');

/* ──────────────────────────────────────────────────────────────────
   UPDATE_PROJECT  — update metadata fields
   ────────────────────────────────────────────────────────────────── */
case 'update_project':
    $user = requireAuth('editor');
    if (empty($body['id'])) err(400, 'id is required');

    // Fetch current row so we can diff before overwriting
    $oldStmt = db()->prepare('SELECT * FROM `projects` WHERE `id` = ?');
    $oldStmt->execute([$body['id']]);
    $oldRow = $oldStmt->fetch();
    if (!$oldRow) err(404, "Project '{$body['id']}' not found");

    $allowed = ['name','code','client','status','total_budget','start_date','notes',
                'color_index','no_need_commercial_endorsement'];
    $map = [
        'budget'     => 'total_budget',
        'startDate'  => 'start_date',
        'colorIndex' => 'color_index',
    ];
    foreach ($map as $js => $db_col) {
        if (array_key_exists($js, $body)) $body[$db_col] = $body[$js];
    }

    $sets      = [];
    $params    = ['id' => $body['id']];
    $updFields = [];
    foreach ($allowed as $f) {
        if (array_key_exists($f, $body)) {
            $sets[]      = "`{$f}` = :{$f}";
            $params[$f]  = $body[$f];
            $updFields[] = $f;
        }
    }
    if (empty($sets)) err(400, 'No valid fields to update');

    db()->prepare('UPDATE `projects` SET ' . implode(', ', $sets) . ' WHERE `id` = :id')
        ->execute($params);

    $changes = diffChanges($oldRow, $params, $updFields);
    if (!empty($changes)) {
        auditLog($user, 'update', 'project', $body['id'], null, $oldRow['name'], $changes);
    }

    $stmt = db()->prepare('SELECT * FROM `projects` WHERE `id` = ?');
    $stmt->execute([$body['id']]);
    ok(castProject($stmt->fetch()), 'Project updated');

/* ──────────────────────────────────────────────────────────────────
   DELETE_PROJECT  — cascade-deletes items via FK
   ────────────────────────────────────────────────────────────────── */
case 'delete_project':
    $user = requireAuth('admin');
    $id = $body['id'] ?? '';
    if ($id === '') err(400, 'id is required');

    // Fetch name before delete for audit label
    $nameStmt = db()->prepare('SELECT `name` FROM `projects` WHERE `id` = ?');
    $nameStmt->execute([$id]);
    $nameRow = $nameStmt->fetch();
    if (!$nameRow) err(404, "Project '{$id}' not found");

    db()->prepare('DELETE FROM `projects` WHERE `id` = ?')->execute([$id]);
    auditLog($user, 'delete', 'project', $id, null, $nameRow['name'], []);
    ok(null, "Project '{$id}' deleted");

/* ──────────────────────────────────────────────────────────────────
   GET_ITEMS  — all items for a project (with optional filters)
   ────────────────────────────────────────────────────────────────── */
case 'get_items':
    requireAuth();
    $pid = $_GET['project_id'] ?? '';
    if ($pid === '') err(400, 'project_id is required');

    $sql    = 'SELECT * FROM `items` WHERE `project_id` = ? ORDER BY `no` ASC';
    $params = [$pid];

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = array_map('castItem', $stmt->fetchAll());
    ok(['items' => $rows, 'total' => count($rows)]);

/* ──────────────────────────────────────────────────────────────────
   UPDATE_ITEM  — merge allowed fields
   ────────────────────────────────────────────────────────────────── */
case 'update_item':
    $user = requireAuth('editor');
    $pid = $body['project_id'] ?? '';
    $no  = (int)($body['no']   ?? 0);
    if ($pid === '') err(400, 'project_id is required');
    if ($no === 0)  err(400, 'no is required');

    // Fetch old item for diff
    $oldStmt = db()->prepare('SELECT * FROM `items` WHERE `project_id` = ? AND `no` = ?');
    $oldStmt->execute([$pid, $no]);
    $oldRow = $oldStmt->fetch();
    if (!$oldRow) err(404, "Item #{$no} not found in project '{$pid}'");

    $sets   = [];
    $params = ['project_id' => $pid, 'no' => $no];
    foreach (ITEM_FIELDS as $f) {
        if (array_key_exists($f, $body)) {
            $sets[]    = "`{$f}` = :{$f}";
            $params[$f] = $body[$f];
        }
    }
    if (empty($sets)) err(400, 'No valid fields to update');

    db()->prepare('UPDATE `items` SET ' . implode(', ', $sets) .
                  ' WHERE `project_id` = :project_id AND `no` = :no')
        ->execute($params);

    // Compute diff and log only if something actually changed
    $changedFields = array_intersect(array_keys($body), ITEM_FIELDS);
    $changes = diffChanges($oldRow, $body, $changedFields);
    $note = isset($body['_note']) ? trim((string)$body['_note']) : '';
    if ($note !== '') $changes['_note'] = $note;
    if (!empty($changes)) {
        auditLog($user, 'update', 'item', $pid, $no, $oldRow['scope'], $changes);
    }

    $stmt = db()->prepare('SELECT * FROM `items` WHERE `project_id` = ? AND `no` = ?');
    $stmt->execute([$pid, $no]);
    ok(castItem($stmt->fetch()), "Item #{$no} updated");

/* ──────────────────────────────────────────────────────────────────
   ADD_ITEM  — insert new item
   ────────────────────────────────────────────────────────────────── */
case 'add_item':
    $user = requireAuth('editor');
    $pid = $body['project_id'] ?? '';
    $no  = (int)($body['no']   ?? 0);
    if ($pid === '') err(400, 'project_id is required');
    if ($no === 0)  err(400, 'no is required');

    $chk = db()->prepare('SELECT `id` FROM `items` WHERE `project_id` = ? AND `no` = ?');
    $chk->execute([$pid, $no]);
    if ($chk->fetch()) err(409, "Item #{$no} already exists in project '{$pid}'");

    $nums = ['budget','endorsed_amount','savings_budget_endorsed','negotiated_proposal',
             'po_amount','savings_endorsed_po','rfp_amount'];
    $cols  = 'project_id, no, ' . implode(', ', ITEM_FIELDS);
    $plch  = ':project_id, :no, :' . implode(', :', ITEM_FIELDS);
    $params = ['project_id' => $pid, 'no' => $no];
    foreach (ITEM_FIELDS as $f) {
        $params[$f] = $body[$f] ?? (in_array($f, $nums) ? 0 : '');
    }

    db()->prepare("INSERT INTO `items` ($cols) VALUES ($plch)")->execute($params);

    $stmt = db()->prepare('SELECT * FROM `items` WHERE `project_id` = ? AND `no` = ?');
    $stmt->execute([$pid, $no]);
    $newItem = $stmt->fetch();

    // Log creation snapshot (only non-empty fields)
    $snapshot = [];
    foreach (ITEM_FIELDS as $f) {
        $v = $newItem[$f] ?? '';
        if ($v !== '' && $v !== 0 && $v !== 0.0) $snapshot[$f] = $v;
    }
    auditLog($user, 'create', 'item', $pid, $no, $newItem['scope'] ?? '', ['snapshot' => $snapshot]);

    ok(castItem($newItem), "Item #{$no} added");

/* ──────────────────────────────────────────────────────────────────
   DELETE_ITEM
   ────────────────────────────────────────────────────────────────── */
case 'delete_item':
    $user = requireAuth('editor');
    $pid = $body['project_id'] ?? '';
    $no  = (int)($body['no']   ?? 0);
    if ($pid === '') err(400, 'project_id is required');
    if ($no === 0)  err(400, 'no is required');

    // Fetch before delete for audit snapshot
    $fetchStmt = db()->prepare('SELECT * FROM `items` WHERE `project_id` = ? AND `no` = ?');
    $fetchStmt->execute([$pid, $no]);
    $item = $fetchStmt->fetch();
    if (!$item) err(404, "Item #{$no} not found in project '{$pid}'");

    db()->prepare('DELETE FROM `items` WHERE `project_id` = ? AND `no` = ?')->execute([$pid, $no]);

    $snapshot = [];
    foreach (ITEM_FIELDS as $f) {
        $v = $item[$f] ?? '';
        if ($v !== '' && $v !== null && $v !== 0 && $v !== 0.0) $snapshot[$f] = $v;
    }
    auditLog($user, 'delete', 'item', $pid, $no, $item['scope'] ?? '', ['snapshot' => $snapshot]);

    ok(null, "Item #{$no} deleted");

/* ──────────────────────────────────────────────────────────────────
   GET_ITEM_HISTORY  — audit trail for a single item
   ────────────────────────────────────────────────────────────────── */
case 'get_item_history':
    $viewer  = requireAuth();
    $isAdmin = ($viewer['role'] === 'admin');
    $pid = $_GET['project_id'] ?? '';
    $no  = (int)($_GET['no'] ?? 0);
    if ($pid === '') err(400, 'project_id is required');
    if ($no === 0)  err(400, 'no is required');

    $adminFilter = $isAdmin ? '' : "AND `username` NOT IN (SELECT `username` FROM `users` WHERE `role` = 'admin')";
    $stmt = db()->prepare("
        SELECT `id`, `username`, `action`, `changes`, `changed_at`
        FROM `audit_log`
        WHERE `project_id` = ? AND `item_no` = ? AND `entity` = 'item'
        $adminFilter
        ORDER BY `changed_at` DESC
        LIMIT 200
    ");
    $stmt->execute([$pid, $no]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['changes'] = json_decode($r['changes'], true);
    }
    unset($r);
    ok($rows);

/* ──────────────────────────────────────────────────────────────────
   GET_AUDIT_LOG  — full log for editors and admins (paginated)
   ────────────────────────────────────────────────────────────────── */
case 'get_audit_log':
    $viewer  = requireAuth('editor');
    $isAdmin = ($viewer['role'] === 'admin');
    $pid     = $_GET['project_id'] ?? '';
    $limit   = min(max((int)($_GET['limit']  ?? 100), 1), 500);
    $offset  = max((int)($_GET['offset'] ?? 0), 0);

    $where  = [];
    $wParam = [];
    if ($pid !== '') {
        $where[]  = '`project_id` = ?';
        $wParam[] = $pid;
    }
    // Editors cannot see entries made by admin accounts
    if (!$isAdmin) {
        $where[] = '`username` NOT IN (SELECT `username` FROM `users` WHERE `role` = \'admin\')';
    }
    $whereClause = $where ? ' WHERE ' . implode(' AND ', $where) : '';

    $stmt = db()->prepare(
        "SELECT `id`, `username`, `action`, `entity`, `project_id`, `item_no`, `item_scope`, `changes`, `changed_at`
         FROM `audit_log`" . $whereClause . " ORDER BY `changed_at` DESC LIMIT ? OFFSET ?"
    );
    $stmt->execute(array_merge($wParam, [$limit, $offset]));
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['changes'] = json_decode($r['changes'], true);
    }
    unset($r);

    $cntStmt = db()->prepare("SELECT COUNT(*) FROM `audit_log`" . $whereClause);
    $cntStmt->execute($wParam);
    $total = (int)$cntStmt->fetchColumn();

    ok(['logs' => $rows, 'total' => $total, 'limit' => $limit, 'offset' => $offset]);

/* ──────────────────────────────────────────────────────────────────
   404
   ────────────────────────────────────────────────────────────────── */
default:
    err(404, "Unknown action: '{$action}'");

} // end switch

} catch (PDOException $e) {
    err(500, 'Database error: ' . $e->getMessage());
}
