<?php
// ============================================================
// SIMPLE FILE API
// ------------------------------------------------------------
// All operations are restricted to WORKSPACE_ROOT.
// No path traversal outside that folder is possible.
// ============================================================

require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// ---------- Auth (optional) ----------
if (ACCESS_TOKEN !== '') {
    $token = isset($_REQUEST['token']) ? $_REQUEST['token'] : '';
    if (!hash_equals(ACCESS_TOKEN, $token)) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
}

// ---------- Helpers ----------
function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function fail($msg, $code = 400) {
    respond(['error' => $msg], $code);
}

/**
 * Safely resolve a relative path inside WORKSPACE_ROOT.
 * Blocks "..", absolute paths, null bytes, etc.
 */
function safePath($relative) {
    $relative = (string)$relative;
    if ($relative === '') return WORKSPACE_ROOT;

    // Normalise slashes
    $relative = str_replace('\\', '/', $relative);
    $relative = ltrim($relative, '/');

    // Block null bytes
    if (strpos($relative, "\0") !== false) fail('Invalid path');

    // Split into parts, reject ".." and "."
    $parts = explode('/', $relative);
    $clean = [];
    foreach ($parts as $p) {
        if ($p === '' || $p === '.') continue;
        if ($p === '..') fail('Path traversal blocked');
        $clean[] = $p;
    }

    $full = WORKSPACE_ROOT . ($clean ? '/' . implode('/', $clean) : '');
    $real = realpath(dirname($full));
    $rootReal = realpath(WORKSPACE_ROOT);

    // Directory must exist (for existing nodes)
    if ($real === false) {
        // For new nodes, check parent of the intended parent
        $parentReal = realpath(dirname(dirname($full)));
        if ($parentReal === false || strpos($parentReal, $rootReal) !== 0) {
            fail('Path outside workspace');
        }
    } else {
        if (strpos($real, $rootReal) !== 0) fail('Path outside workspace');
    }

    return $full;
}

function checkExtension($filename) {
    global $ALLOWED_EXTENSIONS;
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    if ($ext === '') return true; // folders / extension-less files
    return in_array($ext, $ALLOWED_EXTENSIONS, true);
}

/**
 * Build a recursive tree starting at $dir.
 * Returns an array of nodes.
 */
function buildTree($dir, $rel = '') {
    global $ALLOWED_EXTENSIONS;
    $items = [];
    $entries = @scandir($dir);
    if ($entries === false) return $items;

    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        if ($entry[0] === '.') continue; // hide dotfiles

        $full = $dir . '/' . $entry;
        $relPath = $rel === '' ? $entry : $rel . '/' . $entry;

        if (is_dir($full)) {
            $items[] = [
                'type'     => 'folder',
                'name'     => $entry,
                'path'     => $relPath,
                'children' => buildTree($full, $relPath),
            ];
        } else if (is_file($full)) {
            // Optional: filter by extension
            if (!checkExtension($entry)) continue;
            $items[] = [
                'type' => 'file',
                'name' => $entry,
                'path' => $relPath,
                'size' => filesize($full),
            ];
        }
    }

    // Folders first, then files; each alphabetically
    usort($items, function ($a, $b) {
        if ($a['type'] !== $b['type']) return $a['type'] === 'folder' ? -1 : 1;
        return strcasecmp($a['name'], $b['name']);
    });

    return $items;
}

// ---------- Router ----------
$action = isset($_REQUEST['action']) ? $_REQUEST['action'] : '';

switch ($action) {

    // -------- List the entire tree --------
    case 'tree':
        respond([
            'root'  => basename(WORKSPACE_ROOT),
            'tree'  => buildTree(WORKSPACE_ROOT),
        ]);

    // -------- Read a file --------
    case 'read':
        $path = isset($_GET['path']) ? $_GET['path'] : '';
        $full = safePath($path);
        if (!is_file($full)) fail('File not found', 404);
        if (filesize($full) > MAX_FILE_SIZE) fail('File too large', 413);
        if (!checkExtension(basename($full))) fail('Extension not allowed', 403);

        $content = file_get_contents($full);
        if ($content === false) fail('Read failed', 500);

        respond([
            'path'    => $path,
            'name'    => basename($full),
            'content' => $content,
            'mtime'   => filemtime($full),
        ]);

    // -------- Save a file (create or overwrite) --------
    case 'save':
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true);
        if (!is_array($payload)) fail('Invalid JSON body');

        $path    = isset($payload['path']) ? $payload['path'] : '';
        $content = isset($payload['content']) ? $payload['content'] : '';

        if ($path === '') fail('Missing path');
        if (strlen($content) > MAX_FILE_SIZE) fail('File too large', 413);
        if (!checkExtension(basename($path))) fail('Extension not allowed', 403);

        $full = safePath($path);
        $dir  = dirname($full);

        if (!is_dir($dir)) {
            if (!mkdir($dir, 0755, true)) fail('Cannot create directory', 500);
        }

        $bytes = file_put_contents($full, $content, LOCK_EX);
        if ($bytes === false) fail('Write failed', 500);

        respond([
            'ok'    => true,
            'path'  => $path,
            'bytes' => $bytes,
            'mtime' => filemtime($full),
        ]);

    // -------- Create new file --------
    case 'newFile':
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true);
        if (!is_array($payload)) fail('Invalid JSON body');

        $parent = isset($payload['parent']) ? $payload['parent'] : '';
        $name   = isset($payload['name'])   ? $payload['name']   : '';
        if ($name === '') fail('Missing name');
        if (preg_match('/[\/\\\\:*?"<>|]/', $name)) fail('Invalid characters in name');
        if (!checkExtension($name)) fail('Extension not allowed', 403);

        $parentFull = safePath($parent);
        if (!is_dir($parentFull)) fail('Parent folder not found', 404);

        $full = $parentFull . '/' . $name;
        if (file_exists($full)) fail('Already exists', 409);

        if (file_put_contents($full, '', LOCK_EX) === false) fail('Create failed', 500);

        respond(['ok' => true, 'path' => trim($parent . '/' . $name, '/')]);

    // -------- Create new folder --------
    case 'newFolder':
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true);
        if (!is_array($payload)) fail('Invalid JSON body');

        $parent = isset($payload['parent']) ? $payload['parent'] : '';
        $name   = isset($payload['name'])   ? $payload['name']   : '';
        if ($name === '') fail('Missing name');
        if (preg_match('/[\/\\\\:*?"<>|]/', $name)) fail('Invalid characters in name');

        $parentFull = safePath($parent);
        if (!is_dir($parentFull)) fail('Parent folder not found', 404);

        $full = $parentFull . '/' . $name;
        if (file_exists($full)) fail('Already exists', 409);

        if (!mkdir($full, 0755)) fail('Create failed', 500);

        respond(['ok' => true, 'path' => trim($parent . '/' . $name, '/')]);

    // -------- Rename --------
    case 'rename':
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true);
        if (!is_array($payload)) fail('Invalid JSON body');

        $path    = isset($payload['path'])    ? $payload['path']    : '';
        $newName = isset($payload['newName']) ? $payload['newName'] : '';
        if ($path === '' || $newName === '') fail('Missing path or newName');
        if (preg_match('/[\/\\\\:*?"<>|]/', $newName)) fail('Invalid characters');

        $full = safePath($path);
        if (!file_exists($full)) fail('Not found', 404);

        $parentDir = dirname($full);
        $newFull   = $parentDir . '/' . $newName;
        if (file_exists($newFull)) fail('Target name already exists', 409);

        if (!rename($full, $newFull)) fail('Rename failed', 500);

        $parentRel = trim(str_replace(WORKSPACE_ROOT, '', $parentDir), '/');
        respond(['ok' => true, 'path' => trim($parentRel . '/' . $newName, '/')]);

    // -------- Delete --------
    case 'delete':
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true);
        if (!is_array($payload)) fail('Invalid JSON body');

        $path = isset($payload['path']) ? $payload['path'] : '';
        if ($path === '') fail('Missing path');

        $full = safePath($path);
        if (!file_exists($full)) fail('Not found', 404);
        if (is_dir($full)) {
            // Recursive delete
            $it = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($full, FilesystemIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            foreach ($it as $node) {
                if ($node->isDir()) @rmdir($node->getPathname());
                else               @unlink($node->getPathname());
            }
            if (!rmdir($full)) fail('Delete failed', 500);
        } else {
            if (!unlink($full)) fail('Delete failed', 500);
        }
        respond(['ok' => true]);

    // -------- Move (drag & drop) --------
    case 'move':
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true);
        if (!is_array($payload)) fail('Invalid JSON body');

        $src    = isset($payload['src'])    ? $payload['src']    : '';
        $dstDir = isset($payload['dstDir']) ? $payload['dstDir'] : '';
        if ($src === '') fail('Missing src');

        $srcFull = safePath($src);
        $dstFull = safePath($dstDir);

        if (!file_exists($srcFull)) fail('Source not found', 404);
        if (!is_dir($dstFull))      fail('Destination folder not found', 404);

        // Prevent moving a folder into itself/descendant
        if (strpos($dstFull . '/', $srcFull . '/') === 0) fail('Cannot move folder into itself');

        $target = $dstFull . '/' . basename($srcFull);
        if (file_exists($target)) fail('Target already exists', 409);

        if (!rename($srcFull, $target)) fail('Move failed', 500);
        respond(['ok' => true]);

    // -------- Set the workspace root to an arbitrary folder --------
    case 'setRoot':
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true);
        if (!is_array($payload)) fail('Invalid JSON body');

        $path = isset($payload['path']) ? $payload['path'] : '';
        if ($path === '') fail('Missing path');

        // If the user gave a file path, use its parent folder
        $real = realpath($path);
        if ($real === false) fail('Path not found: ' . $path, 404);

        if (is_file($real)) $real = dirname($real);

        if (!is_dir($real)) fail('Not a directory', 400);
        if (!is_readable($real)) fail('Folder not readable', 403);

        if (!set_root($real)) fail('Cannot set root', 500);

        respond([
            'ok'   => true,
            'root' => basename($real),
            'path' => $real,
        ]);

    // -------- Reset the workspace root to the default --------
    case 'resetRoot':
        reset_root();
        respond([
            'ok'   => true,
            'root' => basename(DEFAULT_WORKSPACE_ROOT),
            'path' => DEFAULT_WORKSPACE_ROOT,
        ]);

    // -------- Info about the current root --------
    case 'rootInfo':
        respond([
            'root'      => basename(WORKSPACE_ROOT),
            'path'      => WORKSPACE_ROOT,
            'isDefault' => WORKSPACE_ROOT === DEFAULT_WORKSPACE_ROOT,
        ]);

    // -------- Browse the server filesystem (for the file picker) --------
    case 'browse':
        // Optional starting directory. Defaults to the workspace parent or home.
        $start = isset($_GET['path']) ? $_GET['path'] : '';
        if ($start === '') {
            $start = WORKSPACE_ROOT;
            // Try to go one level up so users can see siblings of the workspace
            $parent = dirname(WORKSPACE_ROOT);
            if ($parent && $parent !== WORKSPACE_ROOT && is_dir($parent)) {
                $start = $parent;
            }
        }

        $real = realpath($start);
        if ($real === false || !is_dir($real)) {
            // Fallback to workspace root
            $real = WORKSPACE_ROOT;
        }

        $entries = @scandir($real);
        if ($entries === false) fail('Cannot read directory', 500);

        $dirs  = [];
        $files = [];
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            if ($entry[0] === '.') continue; // hide dotfiles
            $full = $real . DIRECTORY_SEPARATOR . $entry;
            if (is_dir($full)) {
                if (!is_readable($full)) continue;
                $dirs[] = $entry;
            } else if (is_file($full)) {
                $files[] = $entry;
            }
        }
        sort($dirs, SORT_NATURAL | SORT_FLAG_CASE);
        sort($files, SORT_NATURAL | SORT_FLAG_CASE);

        // Build parent path (for ".." navigation) — only if inside a browsable chain
        $parentPath = dirname($real);
        $hasParent  = ($parentPath !== $real); // root of filesystem has no parent

        respond([
            'path'       => $real,
            'name'       => basename($real),
            'parent'     => $hasParent ? $parentPath : null,
            'dirs'       => $dirs,
            'files'      => $files,
            'sep'        => DIRECTORY_SEPARATOR,
            'isWindows'  => (DIRECTORY_SEPARATOR === '\\'),
        ]);

    // -------- Snippets (loads every *.json in ./snippets, including subfolders) --------
    // Accepted formats (can be mixed across files):
    //   Native:   [ {trigger, template, description?}, ... ]  |  {snippets:[...]}  |  single {trigger, template}
    //   VS Code:  { "Name": { "prefix": "x" | ["x","y"], "body": "text" | ["line","line"], "description": "" } }
    case 'snippets':
        $byTrigger = []; $errors = []; $files = [];
        $dir = __DIR__ . '/snippets';

        // Lenient JSON: strips BOM, // and /* */ comments, trailing commas
        $lenientDecode = function ($text) {
            $text = preg_replace('/^\xEF\xBB\xBF/', '', $text);
            $data = json_decode($text, true);
            if (is_array($data)) return [$data, null];
            // remove comments outside of strings
            $out = ''; $inStr = false; $len = strlen($text);
            for ($i = 0; $i < $len; $i++) {
                $c = $text[$i]; $n = $i + 1 < $len ? $text[$i + 1] : '';
                if ($inStr) {
                    $out .= $c;
                    if ($c === '\\') { $out .= $n; $i++; }
                    elseif ($c === '"') $inStr = false;
                } elseif ($c === '"') { $inStr = true; $out .= $c; }
                elseif ($c === '/' && $n === '/') { while ($i < $len && $text[$i] !== "\n") $i++; $out .= "\n"; }
                elseif ($c === '/' && $n === '*') { $i += 2; while ($i + 1 < $len && !($text[$i] === '*' && $text[$i + 1] === '/')) $i++; $i++; }
                else $out .= $c;
            }
            $out = preg_replace('/,(\s*[}\]])/', '$1', $out);
            $data = json_decode($out, true);
            return is_array($data) ? [$data, null] : [null, json_last_error_msg()];
        };

        // Convert VS Code syntax the editor doesn't know: ${1|a,b,c|} -> ${1:a}
        $fixTemplate = function ($t) {
            return preg_replace_callback('/\$\{(\d+)\|([^|}]*)\|\}/', function ($m) {
                $opts = explode(',', $m[2]);
                return '${' . $m[1] . ':' . $opts[0] . '}';
            }, $t);
        };

        // Normalise one entry into zero or more {trigger, template, description}
        $normalise = function ($sn, $name = '') use ($fixTemplate) {
            $out = [];
            if (!is_array($sn)) return $out;
            $tpl = null;
            if (isset($sn['template'])) $tpl = $sn['template'];
            elseif (isset($sn['body']))  $tpl = $sn['body'];
            if (is_array($tpl)) $tpl = implode("\n", $tpl);
            if (!is_string($tpl)) return $out;

            $triggers = [];
            if (!empty($sn['trigger']) && is_string($sn['trigger'])) $triggers[] = $sn['trigger'];
            if (isset($sn['prefix'])) foreach ((array)$sn['prefix'] as $pfx) if (is_string($pfx) && $pfx !== '') $triggers[] = $pfx;

            $desc = isset($sn['description']) && is_string($sn['description']) ? $sn['description'] : $name;
            foreach ($triggers as $t) {
                $out[] = ['trigger' => $t, 'template' => $fixTemplate($tpl), 'description' => $desc];
            }
            return $out;
        };

        if (is_dir($dir)) {
            $found = [];
            $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
            foreach ($it as $node) {
                if (!$node->isFile()) continue;
                $ext = strtolower($node->getExtension());
                if ($ext !== 'json' && $ext !== 'code-snippets') continue; // .code-snippets = VS Code export
                if ($node->getFilename()[0] === '.') continue;
                $found[] = $node->getPathname();
            }
            sort($found, SORT_NATURAL | SORT_FLAG_CASE);

            foreach ($found as $f) {
                $rel = ltrim(str_replace('\\', '/', substr($f, strlen($dir))), '/');
                $text = file_get_contents($f);
                if ($text === false) { $errors[] = $rel . ': cannot read file'; continue; }
                list($data, $err) = $lenientDecode($text);
                if ($data === null) { $errors[] = $rel . ': invalid JSON (' . $err . ')'; continue; }

                // Build candidate list: [entry, name]
                $cands = [];
                if (isset($data['snippets']) && is_array($data['snippets'])) {
                    foreach ($data['snippets'] as $k => $v) $cands[] = [$v, is_string($k) ? $k : '', $k];
                } elseif (isset($data['trigger']) || isset($data['prefix'])) {
                    $cands[] = [$data, '', 0];
                } else {
                    foreach ($data as $k => $v) $cands[] = [$v, is_string($k) ? $k : '', $k];
                }

                $count = 0;
                foreach ($cands as $c) {
                    $list = $normalise($c[0], $c[1]);
                    if (!$list) { $errors[] = $rel . ' [' . $c[2] . ']: skipped (needs trigger/prefix and template/body)'; continue; }
                    foreach ($list as $one) { $byTrigger[$one['trigger']] = $one; $count++; }
                }
                if ($count > 0) $files[] = $rel;
            }
        } else {
            $errors[] = 'Folder not found: ' . $dir;
        }
        respond([
            'snippets' => array_values($byTrigger),
            'errors'   => $errors,
            'files'    => $files,
            'dir'      => $dir,
        ]);

    // -------- Save As --------
    case 'saveAs':
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true);
        if (!is_array($payload)) fail('Invalid JSON body');

        $dst     = isset($payload['dst']) ? $payload['dst'] : '';
        $content = isset($payload['content']) ? $payload['content'] : '';
        if ($dst === '') fail('Missing dst');
        if (strlen($content) > MAX_FILE_SIZE) fail('File too large', 413);
        if (!checkExtension(basename($dst))) fail('Extension not allowed', 403);

        $full = safePath($dst);
        $dir  = dirname($full);
        if (!is_dir($dir) && !mkdir($dir, 0755, true)) fail('Cannot create directory', 500);
        if (file_put_contents($full, $content, LOCK_EX) === false) fail('Write failed', 500);

        respond(['ok' => true, 'path' => $dst, 'name' => basename($full)]);

    // -------- Export all files (for ZIP) --------
    case 'export':
        $files = [];
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator(WORKSPACE_ROOT, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($it as $node) {
            if (!$node->isFile()) continue;
            $rel = ltrim(str_replace('\\', '/', substr($node->getPathname(), strlen(WORKSPACE_ROOT))), '/');
            if ($rel === '' || $rel[0] === '.' || strpos($rel, '/.') !== false) continue;
            if (!checkExtension($node->getFilename())) continue;
            if ($node->getSize() > MAX_FILE_SIZE) continue;
            $files[] = ['path' => $rel, 'content' => file_get_contents($node->getPathname())];
        }
        respond(['root' => basename(WORKSPACE_ROOT), 'files' => $files]);

    // -------- Default --------
    default:
        fail('Unknown action: ' . htmlspecialchars($action), 400);
}