<?php
/**
 * ABI Project Tracker — Authentication & User Management
 *
 * Endpoints (GET ?action=...)
 * ──────────────────────────────────────────────────────────────
 *  GET  ?action=me               Current session user or 401
 *  POST ?action=login            { username, password }
 *  POST ?action=logout           Destroy session
 *  POST ?action=change_password  { current_password, new_password }
 *
 *  GET  ?action=get_users        [admin] All user accounts
 *  POST ?action=create_user      [admin] { username, password, full_name, role }
 *  POST ?action=update_user      [admin] { id, full_name?, role?, password? }
 *  POST ?action=delete_user      [admin] { id }
 */

session_start();
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

define('AUTH_DB_HOST', 'localhost');
define('AUTH_DB_NAME', 'abitrack');
define('AUTH_DB_USER', 'root');
define('AUTH_DB_PASS', '');

function authDb(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . AUTH_DB_HOST . ';dbname=' . AUTH_DB_NAME . ';charset=utf8mb4',
            AUTH_DB_USER, AUTH_DB_PASS,
            [PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
    }
    return $pdo;
}

function sendJson(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}
function ok(mixed $data): void        { sendJson(['success' => true,  'data'  => $data]); }
function err(int $s, string $m): void { sendJson(['success' => false, 'error' => $m], $s); }

function sessUser(): ?array {
    if (!isset($_SESSION['user_id'])) return null;
    return [
        'id'        => (int)$_SESSION['user_id'],
        'username'  => $_SESSION['username'],
        'full_name' => $_SESSION['full_name'],
        'role'      => $_SESSION['role'],
    ];
}

function requireAdmin(): void {
    $u = sessUser();
    if (!$u)                    err(401, 'Not authenticated');
    if ($u['role'] !== 'admin') err(403, 'Admin access required');
}

$action = $_GET['action'] ?? '';
$body   = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
}

try { switch ($action) {

/* ── Current session user ── */
case 'me':
    $u = sessUser();
    if (!$u) err(401, 'Not authenticated');
    ok(array_merge($u, ['session_lifetime' => (int)ini_get('session.gc_maxlifetime')]));

/* ── Session keepalive ping ── */
case 'ping':
    $u = sessUser();
    if (!$u) err(401, 'Not authenticated');
    ok(['session_lifetime' => (int)ini_get('session.gc_maxlifetime')]);

/* ── Login ── */
case 'login':
    $username = trim($body['username'] ?? '');
    $password = $body['password']      ?? '';
    if ($username === '' || $password === '') err(400, 'Username and password are required');

    $stmt = authDb()->prepare('SELECT * FROM `users` WHERE `username` = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        err(401, 'Invalid username or password');
    }

    authDb()->prepare('UPDATE `users` SET `last_login` = NOW() WHERE `id` = ?')
            ->execute([$user['id']]);

    session_regenerate_id(true);
    $_SESSION['user_id']   = $user['id'];
    $_SESSION['username']  = $user['username'];
    $_SESSION['full_name'] = $user['full_name'];
    $_SESSION['role']      = $user['role'];

    ok(['id'        => $user['id'],
        'username'  => $user['username'],
        'full_name' => $user['full_name'],
        'role'      => $user['role']]);

/* ── Logout ── */
case 'logout':
    session_unset();
    session_destroy();
    ok(null);

/* ── Change own password ── */
case 'change_password':
    $u = sessUser();
    if (!$u) err(401, 'Not authenticated');

    $current = $body['current_password'] ?? '';
    $newpw   = $body['new_password']     ?? '';
    if (strlen($newpw) < 8) err(400, 'New password must be at least 8 characters');

    $row = authDb()->prepare('SELECT `password_hash` FROM `users` WHERE `id` = ?');
    $row->execute([$u['id']]);
    $r = $row->fetch();
    if (!$r || !password_verify($current, $r['password_hash'])) {
        err(400, 'Current password is incorrect');
    }

    authDb()->prepare('UPDATE `users` SET `password_hash` = ? WHERE `id` = ?')
            ->execute([password_hash($newpw, PASSWORD_BCRYPT), $u['id']]);
    ok(null);

/* ── [admin] List users ── */
case 'get_users':
    requireAdmin();
    $rows = authDb()->query(
        'SELECT `id`, `username`, `full_name`, `role`, `created_at`, `last_login` FROM `users` ORDER BY `id`'
    )->fetchAll();
    ok($rows);

/* ── [admin] Create user ── */
case 'create_user':
    requireAdmin();
    $uname = trim($body['username']  ?? '');
    $pw    = $body['password']       ?? '';
    $fname = trim($body['full_name'] ?? '');
    $role  = $body['role']           ?? 'viewer';

    if ($uname === '') err(400, 'Username is required');
    if (!preg_match('/^[a-zA-Z0-9_.\-]{3,50}$/', $uname)) {
        err(400, 'Username: 3-50 chars, letters/digits/._- only');
    }
    if (strlen($pw) < 8)                                 err(400, 'Password must be at least 8 characters');
    if (!in_array($role, ['admin','editor','viewer']))   err(400, 'Invalid role');

    try {
        $ins = authDb()->prepare(
            'INSERT INTO `users` (`username`, `password_hash`, `full_name`, `role`) VALUES (?, ?, ?, ?)'
        );
        $ins->execute([$uname, password_hash($pw, PASSWORD_BCRYPT), $fname, $role]);
        $id = (int)authDb()->lastInsertId();
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'Duplicate') !== false) {
            err(409, "Username '{$uname}' already exists");
        }
        throw $e;
    }
    ok(['id' => $id, 'username' => $uname, 'full_name' => $fname, 'role' => $role]);

/* ── [admin] Update user ── */
case 'update_user':
    requireAdmin();
    $id = (int)($body['id'] ?? 0);
    if ($id === 0) err(400, 'id is required');

    $sets = []; $params = [];
    if (array_key_exists('full_name', $body)) {
        $sets[] = '`full_name` = ?'; $params[] = trim($body['full_name']);
    }
    if (array_key_exists('role', $body)) {
        if (!in_array($body['role'], ['admin','editor','viewer'])) err(400, 'Invalid role');
        $sets[] = '`role` = ?'; $params[] = $body['role'];
    }
    if (!empty($body['password'])) {
        if (strlen($body['password']) < 8) err(400, 'Password must be at least 8 characters');
        $sets[] = '`password_hash` = ?';
        $params[] = password_hash($body['password'], PASSWORD_BCRYPT);
    }
    if (empty($sets)) err(400, 'Nothing to update');

    $params[] = $id;
    authDb()->prepare('UPDATE `users` SET ' . implode(', ', $sets) . ' WHERE `id` = ?')
            ->execute($params);
    ok(null);

/* ── [admin] Delete user ── */
case 'delete_user':
    requireAdmin();
    $id = (int)($body['id'] ?? 0);
    if ($id === 0) err(400, 'id is required');

    $u = sessUser();
    if ($u && $u['id'] === $id) err(400, 'You cannot delete your own account');

    $del = authDb()->prepare('DELETE FROM `users` WHERE `id` = ?');
    $del->execute([$id]);
    if ($del->rowCount() === 0) err(404, 'User not found');
    ok(null);

default:
    err(404, "Unknown action: '{$action}'");

}} catch (PDOException $e) {
    err(500, 'Database error: ' . $e->getMessage());
}
