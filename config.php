<?php
// ============================================================
// EDITOR CONFIGURATION
// ============================================================

// Default workspace (fallback). Used when no session root is set.
define('DEFAULT_WORKSPACE_ROOT', __DIR__ . '/workspace');

// Extensions allowed to be read/written
$ALLOWED_EXTENSIONS = [
    'php', 'html', 'htm', 'css', 'js', 'mjs',
    'md', 'markdown', 'json', 'txt', 'xml', 'yml', 'yaml', 'sql'
];

// Max file size (bytes) — 5 MB
define('MAX_FILE_SIZE', 5 * 1024 * 1024);

// Optional access token (leave empty to disable)
define('ACCESS_TOKEN', '');

// Ensure the default workspace exists
if (!is_dir(DEFAULT_WORKSPACE_ROOT)) {
    mkdir(DEFAULT_WORKSPACE_ROOT, 0755, true);
}

// ------------------------------------------------------------
// Session-based root resolution
// ------------------------------------------------------------
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function current_root() {
    if (!empty($_SESSION['root']) && is_dir($_SESSION['root'])) {
        return $_SESSION['root'];
    }
    return DEFAULT_WORKSPACE_ROOT;
}

function set_root($path) {
    $real = realpath($path);
    if ($real === false || !is_dir($real)) return false;
    $_SESSION['root'] = $real;
    return true;
}

function reset_root() {
    unset($_SESSION['root']);
}

define('WORKSPACE_ROOT', current_root());   // resolved per-request