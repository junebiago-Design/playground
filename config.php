<?php
// ============================================================
// EDITOR CONFIGURATION
// ============================================================

// Error reporting — keep logs, don't print warnings into JSON output
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// Default workspace (fallback). Used when no session root is set.
define('DEFAULT_WORKSPACE_ROOT', __DIR__ . '/workspace');

// Extensions allowed to be read/written
$GLOBALS['ALLOWED_EXTENSIONS'] = [
    'php', 'html', 'htm', 'css', 'js', 'mjs',
    'md', 'markdown', 'json', 'txt', 'xml', 'yml', 'yaml', 'sql'
];
$ALLOWED_EXTENSIONS = $GLOBALS['ALLOWED_EXTENSIONS'];

// Max file size (bytes) — 5 MB
define('MAX_FILE_SIZE', 5 * 1024 * 1024);

// Optional access token (leave empty to disable)
define('ACCESS_TOKEN', '');

// Ensure the default workspace exists
if (!is_dir(DEFAULT_WORKSPACE_ROOT)) {
    @mkdir(DEFAULT_WORKSPACE_ROOT, 0755, true);
}

// ------------------------------------------------------------
// Session-based root resolution
// ------------------------------------------------------------
// Only start the session if headers haven't been sent yet and no
// session is currently active.
if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
    @session_start();
}

if (!function_exists('current_root')) {
    function current_root() {
        if (!empty($_SESSION['root']) && is_dir($_SESSION['root'])) {
            return $_SESSION['root'];
        }
        return DEFAULT_WORKSPACE_ROOT;
    }
}

if (!function_exists('set_root')) {
    function set_root($path) {
        $real = realpath($path);
        if ($real === false || !is_dir($real)) return false;
        if (session_status() === PHP_SESSION_ACTIVE) {
            $_SESSION['root'] = $real;
        }
        return true;
    }
}

if (!function_exists('reset_root')) {
    function reset_root() {
        if (session_status() === PHP_SESSION_ACTIVE) {
            unset($_SESSION['root']);
        }
    }
}

// Resolve once per request
define('WORKSPACE_ROOT', current_root());