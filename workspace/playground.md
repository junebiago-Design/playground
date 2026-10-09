# 🔄 Files To Update (Only What Changed)

You only need to touch **3 files**:

| File | Change |
|---|---|
| ✅ `config.php` | **Replace fully** — session-based root |
| ✅ `api.php` | **Add 3 new cases** — `setRoot`, `resetRoot`, `rootInfo` |
| ✅ `index.html` | **Replace fully** — new header buttons + path modal + Home button |

**Unchanged:** `custom-tags.js`, `custom-snippets.js`, `workspace/*` seed files.

---

## 1️⃣ `config.php` — Full Replacement

```php
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
```

---

## 2️⃣ `api.php` — Add 3 New Cases

**Don't replace the whole file.** Just find the `switch ($action) {` block and add these three cases right **before** the `default:` case:

```php
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
```

Everything else in `api.php` stays exactly as it is — `tree`, `read`, `save`, `newFile`, `newFolder`, `rename`, `delete`, `move`, `export` all automatically operate on the **current session root** because they use the `WORKSPACE_ROOT` constant defined in `config.php`.

> ⚠️ If your current `api.php` starts with `require __DIR__ . '/config.php';` — good, no change needed there. `WORKSPACE_ROOT` is now dynamic.

---

## 3️⃣ `index.html` — Full Replacement

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Code Editor — Real Files (PHP backend)</title>

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.css">

<style>
  * { box-sizing: border-box; }
  html, body {
    height: 100%; margin: 0; padding: 0;
    font-family: system-ui, sans-serif;
    background: #1e1e1e; color: #ddd; overflow: hidden;
  }
  #app { display: grid; grid-template-rows: auto 1fr; height: 100vh; }

  header {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; background: #252526;
    border-bottom: 1px solid #3c3c3c; flex-wrap: wrap;
  }
  header h1 { margin: 0; font-size: 14px; font-weight: 600; color: #fff; }
  header .spacer { flex: 1; }
  header .hint-text { font-size: 12px; color: #858585; }

  #body { display: grid; grid-template-columns: 280px 1fr; overflow: hidden; }

  #sidebar {
    background: #252526; border-right: 1px solid #3c3c3c;
    display: flex; flex-direction: column; overflow: hidden;
  }
  #sidebar-header {
    display: flex; align-items: center; gap: 4px;
    padding: 8px 10px; border-bottom: 1px solid #3c3c3c;
    font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.5px; color: #858585;
  }
  #sidebar-header .spacer { flex: 1; }
  #sidebar-header .root-name {
    font-size: 11px; color: #9cdcfe;
    text-transform: none; letter-spacing: 0;
    overflow: hidden; text-overflow: ellipsis;
    max-width: 120px; white-space: nowrap;
  }

  .icon-btn {
    background: transparent; border: 1px solid transparent;
    color: #ccc; cursor: pointer; border-radius: 4px;
    width: 24px; height: 24px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 14px; padding: 0;
  }
  .icon-btn:hover { background: #3c3c3c; color: #fff; }

  #explorer {
    flex: 1; overflow-y: auto; padding: 6px 0; font-size: 13px;
  }
  #explorer::-webkit-scrollbar { width: 10px; }
  #explorer::-webkit-scrollbar-thumb { background: #3c3c3c; border-radius: 5px; }

  .tree-row {
    display: flex; align-items: center; gap: 4px;
    padding: 3px 8px 3px 6px; cursor: pointer;
    white-space: nowrap; color: #ccc;
    border: 1px dashed transparent;
  }
  .tree-row:hover { background: #2a2d2e; }
  .tree-row.selected { background: #094771; color: #fff; }
  .tree-row.drag-over { border-color: #0e639c; background: #1c2c3c; }
  .tree-row.dragging { opacity: 0.4; }
  .tree-row .arrow {
    width: 12px; text-align: center; font-size: 9px; color: #858585;
    transition: transform 0.15s;
  }
  .tree-row .arrow.open { transform: rotate(90deg); }
  .tree-row .icon { width: 16px; text-align: center; font-size: 12px; }
  .tree-children { margin-left: 12px; display: none; }
  .tree-children.open { display: block; }

  #editor-pane { display: flex; flex-direction: column; overflow: hidden; }
  #file-tabs {
    display: flex; align-items: stretch;
    background: #252526; border-bottom: 1px solid #3c3c3c;
    height: 34px; overflow-x: auto;
  }
  .tab {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 0 12px; background: #2d2d2d;
    border-right: 1px solid #252526;
    color: #969696; font-size: 13px;
    cursor: pointer; white-space: nowrap;
    border-top: 1px solid transparent;
  }
  .tab.active {
    background: #1e1e1e; color: #fff;
    border-top: 1px solid #0e639c;
  }
  .tab .close {
    opacity: 0.5; font-size: 14px;
    border-radius: 3px; padding: 0 3px;
  }
  .tab .close:hover { opacity: 1; background: #3c3c3c; }
  .tab .dirty-dot { color: #dcdcaa; font-size: 18px; line-height: 0; }

  #editor-container { flex: 1; overflow: hidden; position: relative; }
  .CodeMirror { height: 100%; font-size: 14px; font-family: 'Fira Code', 'Consolas', monospace; }

  .btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 10px; font-size: 12.5px; font-weight: 500;
    color: #fff; background: #0e639c;
    border: none; border-radius: 4px;
    cursor: pointer; white-space: nowrap;
  }
  .btn:hover { background: #1177bb; }
  .btn.secondary { background: #3a3d41; }
  .btn.secondary:hover { background: #4a4d51; }

  .filename {
    font-size: 12px; color: #9cdcfe;
    background: #1e1e1e; padding: 4px 10px;
    border-radius: 4px; border: 1px solid #3c3c3c;
  }

  #modal-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
    display: none; align-items: center; justify-content: center;
    z-index: 1000;
  }
  #modal-backdrop.open { display: flex; }
  .modal {
    background: #252526; border: 1px solid #3c3c3c;
    border-radius: 6px; padding: 20px; min-width: 420px;
    max-width: 90vw;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }
  .modal h3 { margin: 0 0 14px; font-size: 15px; color: #fff; }
  .modal label { display: block; font-size: 12px; color: #969696; margin-bottom: 6px; }
  .modal input {
    width: 100%; padding: 8px 10px;
    background: #1e1e1e; border: 1px solid #3c3c3c;
    border-radius: 4px; color: #fff; font-size: 13px;
    outline: none; margin-bottom: 8px;
    font-family: 'Fira Code', 'Consolas', monospace;
  }
  .modal input:focus { border-color: #0e639c; }
  .modal .hint {
    font-size: 11px; color: #858585;
    margin: 0 0 14px 0; display: none;
    font-family: 'Fira Code', 'Consolas', monospace;
  }
  .modal .actions { display: flex; gap: 8px; justify-content: flex-end; }

  #context-menu {
    position: fixed; background: #252526;
    border: 1px solid #3c3c3c; border-radius: 4px;
    padding: 4px 0; font-size: 13px; color: #ccc;
    z-index: 2000; min-width: 180px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    display: none;
  }
  #context-menu.open { display: block; }
  #context-menu .item {
    padding: 6px 14px; cursor: pointer;
    display: flex; align-items: center; gap: 8px;
  }
  #context-menu .item:hover { background: #094771; color: #fff; }
  #context-menu .separator { height: 1px; background: #3c3c3c; margin: 4px 0; }

  #toast {
    position: fixed; bottom: 20px; left: 50%;
    transform: translateX(-50%) translateY(80px);
    background: #0e639c; color: #fff;
    padding: 10px 18px; border-radius: 6px;
    font-size: 13px; opacity: 0;
    transition: all 0.3s ease;
    z-index: 3000; pointer-events: none;
  }
  #toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  #toast.error { background: #c0392b; }

  .icon.php  { color: #8892bf; }
  .icon.html { color: #e44d26; }
  .icon.css  { color: #2965f1; }
  .icon.js   { color: #f0db4f; }
  .icon.md   { color: #42a5f5; }
  .icon.folder { color: #dcb67a; }

  .hint-function { color: #6a9955 !important; }
  .hint-constant { color: #4fc1ff !important; }
  .hint-class    { color: #dcdcaa !important; }
  .hint-tag      { color: #ce9178 !important; }
  .hint-snippet  { color: #c586c0 !important; font-weight: 600; }
</style>
</head>
<body>

<div id="app">
  <header>
    <h1>Code Editor</h1>

    <button class="btn" id="btn-new-file">📄 New File</button>
    <button class="btn secondary" id="btn-new-folder">📁 New Folder</button>
    <button class="btn secondary" id="btn-open-file">📂 Open File</button>
    <button class="btn secondary" id="btn-open-folder">📁 Open Folder</button>
    <button class="btn secondary" id="btn-home" title="Back to default workspace">🏠 Home</button>
    <button class="btn secondary" id="btn-export-zip">📤 Export ZIP</button>

    <span class="spacer"></span>
    <span class="filename" id="filename-badge">—</span>
    <button class="btn" id="btn-save">💾 Save</button>
    <span class="spacer"></span>
    <span class="hint-text">Ctrl+S save · Ctrl+Space tags · Tab snippets</span>
  </header>

  <div id="body">
    <aside id="sidebar">
      <div id="sidebar-header">
        <span>Explorer</span>
        <span class="root-name" id="root-name" title="">workspace</span>
        <span class="spacer"></span>
        <button class="icon-btn" id="btn-refresh" title="Refresh">⟳</button>
        <button class="icon-btn" id="btn-new-file-2" title="New File">+</button>
        <button class="icon-btn" id="btn-new-folder-2" title="New Folder">🗀</button>
      </div>
      <div id="explorer"></div>
    </aside>

    <section id="editor-pane">
      <div id="file-tabs"></div>
      <div id="editor-container">
        <textarea id="code"></textarea>
      </div>
    </section>
  </div>
</div>

<div id="modal-backdrop">
  <div class="modal">
    <h3 id="modal-title">New File</h3>
    <label id="modal-label" for="modal-input">File name</label>
    <input type="text" id="modal-input" autocomplete="off" spellcheck="false">
    <div class="hint" id="modal-hint"></div>
    <div class="actions">
      <button class="btn secondary" id="modal-cancel">Cancel</button>
      <button class="btn" id="modal-ok">OK</button>
    </div>
  </div>
</div>

<div id="context-menu"></div>
<div id="toast"></div>

<!-- CodeMirror -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/xml/xml.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/css/css.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/htmlmixed/htmlmixed.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/clike/clike.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/php/php.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/markdown/markdown.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.js"></script>

<!-- JSZip for Export ZIP -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>

<!-- Your data files -->
<script src="custom-tags.js"></script>
<script src="custom-snippets.js"></script>

<script>
(function () {
  "use strict";

  var API = "api.php";
  var MODE_MAP = {
    "html": "htmlmixed", "htm": "htmlmixed",
    "php": "php", "css": "css",
    "js": "javascript", "mjs": "javascript",
    "md": "markdown", "markdown": "markdown"
  };
  function extOf(n){ return (n.split(".").pop()||"").toLowerCase(); }
  function modeFor(n){ return MODE_MAP[extOf(n)] || "php"; }
  function iconCharFor(n){
    var e = extOf(n);
    if (e === "php") return "🐘";
    if (e === "html" || e === "htm") return "🌐";
    if (e === "css") return "🎨";
    if (e === "js" || e === "mjs") return "📜";
    if (e === "md" || e === "markdown") return "📝";
    return "📄";
  }
  function iconClassFor(n){
    var e = extOf(n);
    if (["php","html","htm","css","js","mjs","md","markdown"].indexOf(e) !== -1) {
      return "icon " + (e === "htm" ? "html" : e === "mjs" ? "js" : e === "markdown" ? "md" : e);
    }
    return "icon";
  }

  var toastEl = document.getElementById("toast");
  var toastTimer;
  function toast(msg, isError){
    toastEl.textContent = msg;
    toastEl.classList.toggle("error", !!isError);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, 2400);
  }

  function api(action, opts) {
    opts = opts || {};
    var method = opts.method || "GET";
    var body   = opts.body;
    var query  = opts.query || {};
    var url = API + "?action=" + encodeURIComponent(action);
    for (var k in query) {
      if (Object.prototype.hasOwnProperty.call(query, k)) {
        url += "&" + encodeURIComponent(k) + "=" + encodeURIComponent(query[k]);
      }
    }
    var init = { method: method };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    return fetch(url, init).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || (j && j.error)) throw new Error((j && j.error) || ("HTTP " + r.status));
        return j;
      });
    });
  }

  // ---------- Snippet engine ----------
  function parseSnippet(template) {
    var text = "", stops = {}, i = 0;
    while (i < template.length) {
      var ch = template[i];
      if (ch === "$" && i + 1 < template.length) {
        var m1 = /^\$\{(\d+)(?::([^}]*))?\}/.exec(template.slice(i));
        if (m1) {
          var num = parseInt(m1[1], 10);
          var def = m1[2] || "";
          stops[num] = { index: text.length, length: def.length };
          text += def; i += m1[0].length; continue;
        }
        var m2 = /^\$(\d+)/.exec(template.slice(i));
        if (m2) {
          var num2 = parseInt(m2[1], 10);
          stops[num2] = { index: text.length, length: 0 };
          i += m2[0].length; continue;
        }
      }
      text += ch; i++;
    }
    var sorted = Object.keys(stops).map(Number)
      .filter(function (n) { return n > 0; })
      .sort(function (a, b) { return a - b; })
      .map(function (n) { return { num: n, index: stops[n].index, length: stops[n].length }; });
    var final = stops[0] ? stops[0].index : text.length;
    return { text: text, stops: sorted, final: final };
  }
  function insertSnippetAt(cm, snippet, from, to) {
    var parsed = parseSnippet(snippet.template);
    var startIdx = cm.indexFromPos(from);
    cm.replaceRange(parsed.text, from, to, "+snippet");
    if (parsed.stops.length > 0) {
      var absStops = parsed.stops.map(function (s) {
        return { from: startIdx + s.index, to: startIdx + s.index + s.length };
      });
      var first = absStops[0];
      cm.setSelection(cm.posFromIndex(first.from), cm.posFromIndex(first.to));
      cm._snippetState = { stops: absStops, current: 1 };
    } else {
      cm.setCursor(cm.posFromIndex(startIdx + parsed.final));
      cm._snippetState = null;
    }
    cm.focus();
  }
  function tryExpandSnippetAtCursor(cm) {
    if (cm.somethingSelected()) return false;
    var cur = cm.getCursor();
    var line = cm.getLine(cur.line);
    var textBefore = line.slice(0, cur.ch);
    var match = /(\w+)$/.exec(textBefore);
    if (!match) return false;
    var word = match[1];
    var snippets = window.customSnippets || [];
    for (var i = 0; i < snippets.length; i++) {
      if (snippets[i].trigger === word) {
        var from = { line: cur.line, ch: cur.ch - word.length };
        insertSnippetAt(cm, snippets[i], from, cur);
        return true;
      }
    }
    return false;
  }
  function handleTab(cm) {
    if (cm._snippetState) {
      var state = cm._snippetState;
      if (state.current < state.stops.length) {
        var s = state.stops[state.current];
        cm.setSelection(cm.posFromIndex(s.from), cm.posFromIndex(s.to));
        state.current++;
        return;
      }
      cm._snippetState = null;
    }
    if (tryExpandSnippetAtCursor(cm)) return;
    if (cm.somethingSelected()) cm.indentSelection("add");
    else cm.replaceSelection("    ", "end");
  }

  var editor = CodeMirror.fromTextArea(document.getElementById("code"), {
    mode: "php", lineNumbers: true,
    indentUnit: 4, tabSize: 4, indentWithTabs: false,
    lineWrapping: true,
    extraKeys: {
      "Ctrl-Space": "autocomplete",
      "Cmd-Space": "autocomplete",
      "Tab": handleTab,
      "Shift-Tab": function (cm) { cm.indentSelection("subtract"); },
      "Esc": function (cm) { cm._snippetState = null; },
      "Ctrl-S": function () { saveActiveTab(); },
      "Cmd-S": function () { saveActiveTab(); }
    }
  });
  editor.setSize("100%", "100%");
  window.addEventListener("resize", function () { editor.refresh(); });

  function makeCustomHintHelper(editor, options) {
    var cur = editor.getCursor();
    var token = editor.getTokenAt(cur);
    var start = token.start, end = token.end;
    var word = editor.getRange({ line: cur.line, ch: start }, cur).toLowerCase();
    var list = [];
    (window.customTags || []).forEach(function (item) {
      if (item.displayText.toLowerCase().indexOf(word) === 0) list.push(item);
    });
    (window.customSnippets || []).forEach(function (s) {
      if (s.trigger.toLowerCase().indexOf(word) === 0) {
        list.push({
          text: s.trigger,
          displayText: s.trigger + "  ⚡ " + (s.description || ""),
          className: "hint-snippet",
          hint: function (cm) {
            insertSnippetAt(cm, s, CodeMirror.Pos(cur.line, start), CodeMirror.Pos(cur.line, end));
          }
        });
      }
    });
    var anyword = CodeMirror.hint.anyword(editor, options);
    if (anyword && anyword.list) list = list.concat(anyword.list);
    return { list: list, from: CodeMirror.Pos(cur.line, start), to: CodeMirror.Pos(cur.line, end) };
  }
  ["php", "javascript", "css", "htmlmixed", "markdown"].forEach(function (mode) {
    CodeMirror.registerHelper("hint", mode, makeCustomHintHelper);
  });
  editor.on("inputRead", function (cm, change) {
    if (change.text[0] && change.text[0].match(/[a-zA-Z_\\]/)) {
      clearTimeout(cm.state.hintTimeout);
      cm.state.hintTimeout = setTimeout(function () {
        cm.showHint({ completeSingle: false });
      }, 150);
    }
  });

  var tree = [];
  var openTabs = [];
  var activeTabIndex = -1;
  var selectedNode = null;
  var openFolders = {};
  var ignoreChange = false;
  var dragSourcePath = null;

  editor.on("change", function () {
    if (ignoreChange) return;
    if (activeTabIndex >= 0) {
      openTabs[activeTabIndex].dirty = true;
      renderTabs();
    }
  });

  var explorerEl = document.getElementById("explorer");
  var rootNameEl = document.getElementById("root-name");

  function loadTree() {
    return api("tree").then(function (data) {
      tree = data.tree || [];
      renderTree();
    }).catch(function (err) {
      toast("Failed to load tree: " + err.message, true);
    });
  }

  function updateRootBadge() {
    api("rootInfo").then(function (info) {
      rootNameEl.textContent = info.root;
      rootNameEl.title = info.path;
      document.title = info.root + " — Code Editor";
    }).catch(function () {
      rootNameEl.textContent = "workspace";
    });
  }

  function renderTree() {
    explorerEl.innerHTML = "";
    tree.forEach(function (node) {
      explorerEl.appendChild(buildTreeNode(node, []));
    });
  }

  function buildTreeNode(node, parentPath) {
    var path = parentPath.concat(node.name);
    var pathStr = path.join("/");

    var wrap = document.createElement("div");
    var row = document.createElement("div");
    row.className = "tree-row";
    if (selectedNode && selectedNode.path === pathStr) row.classList.add("selected");

    var arrow = document.createElement("span");
    arrow.className = "arrow";
    if (node.type === "folder") {
      var isOpen = !!openFolders[pathStr];
      arrow.textContent = "▶";
      if (isOpen) arrow.classList.add("open");
    }

    var icon = document.createElement("span");
    if (node.type === "folder") { icon.className = "icon folder"; icon.textContent = "📁"; }
    else { icon.className = iconClassFor(node.name); icon.textContent = iconCharFor(node.name); }

    var name = document.createElement("span");
    name.className = "name"; name.textContent = node.name;

    row.appendChild(arrow); row.appendChild(icon); row.appendChild(name);
    wrap.appendChild(row);

    var childrenEl = null;
    if (node.type === "folder") {
      childrenEl = document.createElement("div");
      childrenEl.className = "tree-children";
      if (openFolders[pathStr]) childrenEl.classList.add("open");
      (node.children || []).forEach(function (c) {
        childrenEl.appendChild(buildTreeNode(c, path));
      });
      wrap.appendChild(childrenEl);
    }

    row.addEventListener("click", function () {
      selectedNode = { path: pathStr, node: node };
      renderTree();
      if (node.type === "folder") {
        openFolders[pathStr] = !openFolders[pathStr];
        renderTree();
      } else {
        openFile(pathStr);
      }
    });

    row.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      selectedNode = { path: pathStr, node: node };
      renderTree();
      showContextMenu(e.clientX, e.clientY, pathStr, node);
    });

    row.draggable = true;
    row.addEventListener("dragstart", function (e) {
      dragSourcePath = pathStr;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", pathStr);
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", function () {
      row.classList.remove("dragging");
      dragSourcePath = null;
      explorerEl.querySelectorAll(".drag-over").forEach(function (el) {
        el.classList.remove("drag-over");
      });
    });

    if (node.type === "folder") {
      row.addEventListener("dragover", function (e) {
        if (!dragSourcePath) return;
        if (pathStr === dragSourcePath) return;
        if (pathStr.indexOf(dragSourcePath + "/") === 0) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        row.classList.add("drag-over");
      });
      row.addEventListener("dragleave", function () { row.classList.remove("drag-over"); });
      row.addEventListener("drop", function (e) {
        e.preventDefault();
        row.classList.remove("drag-over");
        if (!dragSourcePath) return;
        var src = dragSourcePath;
        dragSourcePath = null;
        api("move", { method: "POST", body: { src: src, dstDir: pathStr } })
          .then(function () { toast("Moved"); return loadTree(); })
          .catch(function (err) { toast("Move failed: " + err.message, true); });
      });
    }

    return wrap;
  }

  var tabsEl = document.getElementById("file-tabs");

  function renderTabs() {
    tabsEl.innerHTML = "";
    openTabs.forEach(function (tab, idx) {
      var el = document.createElement("div");
      el.className = "tab" + (idx === activeTabIndex ? " active" : "");
      el.title = tab.path;

      var nameEl = document.createElement("span");
      nameEl.textContent = tab.name;
      el.appendChild(nameEl);

      if (tab.dirty) {
        var dot = document.createElement("span");
        dot.className = "dirty-dot"; dot.textContent = "●";
        el.appendChild(dot);
      }

      var closeEl = document.createElement("span");
      closeEl.className = "close"; closeEl.textContent = "×";
      closeEl.onclick = function (e) { e.stopPropagation(); closeTab(idx); };
      el.appendChild(closeEl);

      el.onclick = function () { activateTab(idx); };
      tabsEl.appendChild(el);
    });
  }

  function activateTab(idx) {
    if (idx < 0 || idx >= openTabs.length) return;
    if (activeTabIndex >= 0 && activeTabIndex < openTabs.length) {
      openTabs[activeTabIndex].content = editor.getValue();
    }
    activeTabIndex = idx;
    var tab = openTabs[idx];
    ignoreChange = true;
    editor.setValue(tab.content);
    editor.setOption("mode", modeFor(tab.name));
    ignoreChange = false;
    editor._snippetState = null;
    editor.clearHistory && editor.clearHistory();
    editor.focus();
    editor.refresh();
    document.getElementById("filename-badge").textContent = tab.name;
    renderTabs();
  }

  function closeTab(idx) {
    var tab = openTabs[idx];
    if (tab.dirty && !confirm("Discard unsaved changes in " + tab.name + "?")) return;
    openTabs.splice(idx, 1);
    if (openTabs.length === 0) {
      activeTabIndex = -1;
      ignoreChange = true; editor.setValue(""); ignoreChange = false;
      document.getElementById("filename-badge").textContent = "—";
    } else if (idx === activeTabIndex) {
      activateTab(Math.max(0, idx - 1));
    } else if (idx < activeTabIndex) {
      activeTabIndex--;
    }
    renderTabs();
  }

  function openFile(path) {
    for (var i = 0; i < openTabs.length; i++) {
      if (openTabs[i].path === path) { activateTab(i); return; }
    }
    api("read", { query: { path: path } }).then(function (data) {
      openTabs.push({ path: path, name: data.name, content: data.content, dirty: false });
      activateTab(openTabs.length - 1);
    }).catch(function (err) {
      toast("Cannot open: " + err.message, true);
    });
  }

  function saveActiveTab() {
    if (activeTabIndex < 0) return;
    var tab = openTabs[activeTabIndex];
    var content = editor.getValue();
    api("save", { method: "POST", body: { path: tab.path, content: content } })
      .then(function () {
        tab.content = content;
        tab.dirty = false;
        renderTabs();
        var badge = document.getElementById("filename-badge");
        var prev = badge.textContent;
        badge.textContent = "✔ Saved";
        setTimeout(function () { badge.textContent = prev; }, 800);
        toast("Saved " + tab.name);
      })
      .catch(function (err) { toast("Save failed: " + err.message, true); });
  }

  var contextMenuEl = document.getElementById("context-menu");
  function showContextMenu(x, y, path, node) {
    contextMenuEl.innerHTML = "";
    contextMenuEl.classList.add("open");
    contextMenuEl.style.left = x + "px";
    contextMenuEl.style.top = y + "px";

    function addItem(label, fn) {
      var it = document.createElement("div");
      it.className = "item"; it.textContent = label;
      it.onclick = function () { hideContextMenu(); fn(); };
      contextMenuEl.appendChild(it);
    }
    function sep() {
      var s = document.createElement("div"); s.className = "separator";
      contextMenuEl.appendChild(s);
    }

    if (node.type === "folder") {
      addItem("📄 New File Here", function () { promptNewFile(path); });
      addItem("📁 New Folder Here", function () { promptNewFolder(path); });
      sep();
    } else {
      addItem("📂 Open", function () { openFile(path); });
      sep();
    }
    addItem("✏️ Rename", function () { promptRename(path, node); });
    addItem("🗑️ Delete", function () { deleteNode(path, node); });

    setTimeout(function () {
      document.addEventListener("mousedown", outsideHandler);
    }, 0);
  }
  function hideContextMenu() {
    contextMenuEl.classList.remove("open");
    document.removeEventListener("mousedown", outsideHandler);
  }
  function outsideHandler(e) {
    if (!contextMenuEl.contains(e.target)) hideContextMenu();
  }

  function parentOf(path) {
    var i = path.lastIndexOf("/");
    return i < 0 ? "" : path.slice(0, i);
  }
  function defaultParent() {
    if (selectedNode && selectedNode.node.type === "folder") return selectedNode.path;
    if (selectedNode) return parentOf(selectedNode.path);
    return "";
  }

  function promptNewFile(explicitParent) {
    var parent = explicitParent !== undefined ? explicitParent : defaultParent();
    showModal("New File", "File name (with extension)", "untitled.php", function (name) {
      if (!name) return;
      api("newFile", { method: "POST", body: { parent: parent, name: name } })
        .then(function () { toast("Created " + name); return loadTree(); })
        .then(function () { openFile(parent ? parent + "/" + name : name); })
        .catch(function (err) { toast("Create failed: " + err.message, true); });
    });
  }
  function promptNewFolder(explicitParent) {
    var parent = explicitParent !== undefined ? explicitParent : defaultParent();
    showModal("New Folder", "Folder name", "new-folder", function (name) {
      if (!name) return;
      api("newFolder", { method: "POST", body: { parent: parent, name: name } })
        .then(function () { toast("Created folder " + name); return loadTree(); })
        .catch(function (err) { toast("Create failed: " + err.message, true); });
    });
  }
  function promptRename(path, node) {
    showModal("Rename", "New name", node.name, function (name) {
      if (!name || name === node.name) return;
      api("rename", { method: "POST", body: { path: path, newName: name } })
        .then(function () {
          var pfx = parentOf(path);
          var newPath = pfx ? pfx + "/" + name : name;
          openTabs.forEach(function (t) {
            if (t.path === path) { t.path = newPath; t.name = name; }
            else if (t.path.indexOf(path + "/") === 0) {
              t.path = newPath + t.path.slice(path.length);
            }
          });
          renderTabs();
          toast("Renamed");
          return loadTree();
        })
        .catch(function (err) { toast("Rename failed: " + err.message, true); });
    });
  }
  function deleteNode(path, node) {
    if (!confirm("Delete " + node.name + "?")) return;
    api("delete", { method: "POST", body: { path: path } })
      .then(function () {
        for (var i = openTabs.length - 1; i >= 0; i--) {
          if (openTabs[i].path === path || openTabs[i].path.indexOf(path + "/") === 0) {
            openTabs.splice(i, 1);
            if (i === activeTabIndex) activeTabIndex = -1;
            else if (i < activeTabIndex) activeTabIndex--;
          }
        }
        if (activeTabIndex === -1 && openTabs.length > 0) activateTab(0);
        else if (openTabs.length === 0) {
          ignoreChange = true; editor.setValue(""); ignoreChange = false;
          document.getElementById("filename-badge").textContent = "—";
        }
        renderTabs();
        toast("Deleted");
        return loadTree();
      })
      .catch(function (err) { toast("Delete failed: " + err.message, true); });
  }

  var modalBackdrop = document.getElementById("modal-backdrop");
  var modalTitle = document.getElementById("modal-title");
  var modalLabel = document.getElementById("modal-label");
  var modalInput = document.getElementById("modal-input");
  var modalHint = document.getElementById("modal-hint");
  var modalOk = document.getElementById("modal-ok");
  var modalCancel = document.getElementById("modal-cancel");
  var modalCallback = null;

  function showModal(title, label, def, cb, hint) {
    modalTitle.textContent = title;
    modalLabel.textContent = label;
    modalInput.value = def || "";
    modalCallback = cb;

    if (hint) {
      modalHint.textContent = hint;
      modalHint.style.display = "block";
    } else {
      modalHint.textContent = "";
      modalHint.style.display = "none";
    }

    modalBackdrop.classList.add("open");
    setTimeout(function () {
      modalInput.focus();
      if (/path/i.test(label)) {
        modalInput.setSelectionRange(modalInput.value.length, modalInput.value.length);
      } else {
        var dot = modalInput.value.lastIndexOf(".");
        if (dot > 0) modalInput.setSelectionRange(0, dot);
        else modalInput.select();
      }
    }, 30);
  }
  function hideModal() {
    modalBackdrop.classList.remove("open");
    modalCallback = null;
  }
  modalOk.addEventListener("click", function () {
    if (modalCallback) modalCallback(modalInput.value.trim());
    hideModal();
  });
  modalCancel.addEventListener("click", hideModal);
  modalBackdrop.addEventListener("click", function (e) {
    if (e.target === modalBackdrop) hideModal();
  });
  modalInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { if (modalCallback) modalCallback(modalInput.value.trim()); hideModal(); }
    if (e.key === "Escape") hideModal();
  });

  // ---------- Wire up ----------
  document.getElementById("btn-save").addEventListener("click", saveActiveTab);
  document.getElementById("btn-new-file").addEventListener("click", function () { promptNewFile(); });
  document.getElementById("btn-new-folder").addEventListener("click", function () { promptNewFolder(); });
  document.getElementById("btn-new-file-2").addEventListener("click", function () { promptNewFile(); });
  document.getElementById("btn-new-folder-2").addEventListener("click", function () { promptNewFolder(); });
  document.getElementById("btn-refresh").addEventListener("click", function () { loadTree(); });

  // =================================================================
  // 📂 OPEN FILE — mount the file's parent folder, open the file
  // =================================================================
  document.getElementById("btn-open-file").addEventListener("click", function () {
    showModal(
      "Open File",
      "Full path to the file",
      "",
      function (path) {
        if (!path) return;
        api("setRoot", { method: "POST", body: { path: path } })
          .then(function (info) {
            toast("Mounted: " + info.root);
            updateRootBadge();
            return loadTree();
          })
          .then(function () {
            var name = path.replace(/\\/g, "/").split("/").pop();
            openFile(name);
          })
          .catch(function (err) { toast("Open failed: " + err.message, true); });
      },
      "Windows: C:\\Users\\You\\project\\index.php   •   Linux/macOS: /home/you/project/index.php"
    );
  });

  // =================================================================
  // 📁 OPEN FOLDER — mount the folder itself
  // =================================================================
  document.getElementById("btn-open-folder").addEventListener("click", function () {
    showModal(
      "Open Folder",
      "Full path to the folder",
      "",
      function (path) {
        if (!path) return;
        api("setRoot", { method: "POST", body: { path: path } })
          .then(function (info) {
            toast("Mounted: " + info.root);
            updateRootBadge();
            return loadTree();
          })
          .catch(function (err) { toast("Open failed: " + err.message, true); });
      },
      "Windows: C:\\Users\\You\\project   •   Linux/macOS: /home/you/project"
    );
  });

  // =================================================================
  // 🏠 HOME — reset to default workspace
  // =================================================================
  document.getElementById("btn-home").addEventListener("click", function () {
    api("resetRoot", { method: "POST" })
      .then(function (info) {
        toast("Back to: " + info.root);
        updateRootBadge();
        return loadTree();
      })
      .catch(function (err) { toast("Reset failed: " + err.message, true); });
  });

  // =================================================================
  // 📤 EXPORT ZIP
  // =================================================================
  document.getElementById("btn-export-zip").addEventListener("click", function () {
    if (typeof JSZip === "undefined") { toast("JSZip not loaded", true); return; }
    if (activeTabIndex >= 0) {
      var tab = openTabs[activeTabIndex];
      api("save", { method: "POST", body: { path: tab.path, content: editor.getValue() } })
        .then(function () { tab.dirty = false; renderTabs(); buildAndDownloadZip(); })
        .catch(function () { buildAndDownloadZip(); });
    } else {
      buildAndDownloadZip();
    }
  });

  function buildAndDownloadZip() {
    var zip = new JSZip();
    api("export").then(function (data) {
      (data.files || []).forEach(function (f) {
        zip.file(f.path, f.content);
      });
      zip.generateAsync({ type: "blob" }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = (data.root || "workspace") + ".zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        toast("Exported " + (data.root || "workspace") + ".zip");
      });
    }).catch(function (err) {
      toast("Export failed: " + err.message, true);
    });
  }

  document.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveActiveTab(); }
    if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); promptNewFile(); }
  });

  // ---------- Init ----------
  updateRootBadge();
  loadTree().then(function () {
    function firstFile(nodes, prefix) {
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var p = prefix ? prefix + "/" + n.name : n.name;
        if (n.type === "file") return p;
        var inner = firstFile(n.children || [], p);
        if (inner) return inner;
      }
      return null;
    }
    var f = firstFile(tree, "");
    if (f) openFile(f);
    editor.focus();
  });
})();
</script>

</body>
</html>
```

---

## 📋 Summary of Changes

### `config.php`
- Added `DEFAULT_WORKSPACE_ROOT` constant (the fallback).
- Added `session_start()` and three functions: `current_root()`, `set_root()`, `reset_root()`.
- `WORKSPACE_ROOT` is now the **session root** if set, otherwise the default.

### `api.php`
- Added three new actions **before `default:`**:
  - `setRoot` — mount any folder on disk
  - `resetRoot` — return to the default workspace
  - `rootInfo` — report current root name and path
- No other changes. All existing actions (`tree`, `read`, `save`, etc.) now operate on the mounted root automatically.

### `index.html`
- **Header buttons changed:** added **📂 Open File**, **📁 Open Folder**, **🏠 Home**.
- **Removed** the hidden `<input type="file">` and `webkitdirectory` inputs (browser can't give real disk paths).
- **Open File / Open Folder** now open a modal asking for the full path.
- **New `updateRootBadge()`** shows the current mounted folder name in the sidebar header.
- **`showModal()`** now accepts a 5th `hint` argument for path examples.
- Sidebar header shows the current root name next to "Explorer".

### Unchanged
- `custom-tags.js`
- `custom-snippets.js`
- `workspace/README.md`
- `workspace/src/index.php`
- `workspace/src/style.css`

---

## 🧪 Test Flow

```bash
php -S localhost:8000
```

Open `http://localhost:8000/`.

| Test | Steps | Expected |
|---|---|---|
| Default workspace | Page loads | Sidebar shows `workspace` badge + seed files |
| Open Folder | Click 📁 → paste `C:\xampp\htdocs` (or `/var/www/html`) | Sidebar badge changes; tree shows that folder's real contents |
| Edit in place | Click a file → edit → Ctrl+S | Real file on disk updated |
| Open File | Click 📂 → paste full path to a file | Parent folder mounted + file opens in a tab |
| Home | Click 🏠 | Tree reverts to default `workspace/` |
| Export ZIP | Click 📤 | ZIP of the currently mounted folder |
| Refresh | Press F5 | Root persists (session) |

---

## ⚠️ Notes

- **The mounted root persists per browser session** (PHP session cookie). Refresh keeps it; closing the browser may lose it depending on session settings.
- **Windows paths:** use either `C:\Users\You\project` or `C:/Users/You/project` — both work.
- **Trailing slashes:** strip them or leave them — `realpath()` normalizes.
- **Permission:** the PHP process must have read/write access to the folder you mount. On Linux, make sure `www-data` (or whichever user runs PHP) owns or can write the folder.
- **Safety:** this lets anyone who can reach `api.php` mount any folder readable by PHP. **Only run this on localhost** or behind authentication.