<?php
/**
 * ABI Project Tracker — One-time database setup for auth & audit trail.
 * Visit: http://localhost/ABITrack/php/setup.php
 * A lock file (setup.lock) is written after success; delete it to re-run.
 */

define('SETUP_DB_HOST', 'localhost');
define('SETUP_DB_NAME', 'abitrack');
define('SETUP_DB_USER', 'root');
define('SETUP_DB_PASS', '');

$lockFile = __DIR__ . '/setup.lock';
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>ABI Tracker — Setup</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 540px; margin: 60px auto; padding: 0 24px; color: #111; }
  h1   { font-size: 1.35rem; font-weight: 700; margin-bottom: 1.5rem; }
  .box { padding: 14px 18px; border-radius: 8px; margin: 12px 0; font-size: .9rem; line-height: 1.6; }
  .ok  { background: #dcfce7; color: #166534; }
  .err { background: #fee2e2; color: #991b1b; }
  .warn{ background: #fef3c7; color: #92400e; }
  code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-size: .88em; }
  a    { color: #2563eb; }
  p    { margin: 1rem 0; }
</style>
</head>
<body>
<h1>ABI Project Tracker — Database Setup</h1>
<?php

if (file_exists($lockFile)) {
    echo '<div class="box warn">&#9888; Setup has already run (lock file at <code>php/setup.lock</code>). Delete it to re-run &mdash; not recommended in production.</div>';
    echo '<p><a href="../login.html">&rarr; Go to login</a></p>';
    exit;
}

try {
    $pdo = new PDO(
        'mysql:host=' . SETUP_DB_HOST . ';dbname=' . SETUP_DB_NAME . ';charset=utf8mb4',
        SETUP_DB_USER, SETUP_DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    /* ── Users table ── */
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `users` (
          `id`            INT AUTO_INCREMENT PRIMARY KEY,
          `username`      VARCHAR(50)  NOT NULL UNIQUE,
          `password_hash` VARCHAR(255) NOT NULL,
          `full_name`     VARCHAR(100) NOT NULL DEFAULT '',
          `role`          ENUM('admin','editor','viewer') NOT NULL DEFAULT 'viewer',
          `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          `last_login`    TIMESTAMP NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    /* ── Audit log table ── */
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `audit_log` (
          `id`         INT AUTO_INCREMENT PRIMARY KEY,
          `user_id`    INT,
          `username`   VARCHAR(50),
          `action`     ENUM('create','update','delete') NOT NULL,
          `entity`     ENUM('item','project')           NOT NULL DEFAULT 'item',
          `project_id` VARCHAR(64),
          `item_no`    INT,
          `item_scope` VARCHAR(500),
          `changes`    JSON,
          `changed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX `idx_proj_item`  (`project_id`, `item_no`),
          INDEX `idx_changed_at` (`changed_at`),
          INDEX `idx_user`       (`user_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    /* ── Default admin user ── */
    $hash = password_hash('admin123', PASSWORD_BCRYPT);
    $stmt = $pdo->prepare("INSERT IGNORE INTO `users` (`username`, `password_hash`, `full_name`, `role`) VALUES (?, ?, 'Administrator', 'admin')");
    $stmt->execute(['admin', $hash]);
    $created = $stmt->rowCount() > 0;

    file_put_contents($lockFile, date('c'));

    echo '<div class="box ok">&#10003; Tables created successfully.</div>';
    if ($created) {
        echo '<div class="box ok"><strong>Default admin credentials created:</strong><br>
            Username: <code>admin</code><br>
            Password: <code>admin123</code><br><br>
            &#9888; <strong>Change this password immediately after first login.</strong></div>';
    } else {
        echo '<div class="box warn">Admin user already existed &mdash; password not changed.</div>';
    }
    echo '<p><a href="../login.html">&rarr; Go to login</a></p>';

} catch (PDOException $e) {
    echo '<div class="box err">&#10007; Setup failed: ' . htmlspecialchars($e->getMessage()) . '</div>';
    echo '<p>Verify the database <code>' . SETUP_DB_NAME . '</code> exists and DB credentials are correct in <code>php/setup.php</code>.</p>';
}
?>
</body>
</html>
