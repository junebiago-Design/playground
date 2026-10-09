(function () {
  "use strict";

  var API = "api.php";

  var MODE_MAP = {
    "html": "htmlmixed", "htm": "htmlmixed",
    "php": "php", "css": "css",
    "js": "javascript", "mjs": "javascript",
    "md": "markdown", "markdown": "markdown",
    "json": "javascript", "jsonc": "javascript",
    "xml": "xml", "svg": "xml",
    "yml": "yaml", "yaml": "yaml",
    "sql": "text/x-sql",
    "txt": null
  };

  function extOf(n){ return (n.split(".").pop()||"").toLowerCase(); }

  function modeFor(n){
    var e = extOf(n);
    if (e === "json" || e === "jsonc") {
      return { name: "javascript", json: true };
    }
    return MODE_MAP[e] || "php";
  }

  function iconCharFor(n){
    var e = extOf(n);
    if (e === "php") return "🐘";
    if (e === "html" || e === "htm") return "🌐";
    if (e === "css") return "🎨";
    if (e === "js" || e === "mjs") return "📜";
    if (e === "md" || e === "markdown") return "📝";
    if (e === "json" || e === "jsonc") return "🔧";
    if (e === "xml" || e === "svg") return "📐";
    if (e === "yml" || e === "yaml") return "⚙️";
    if (e === "sql") return "🗄️";
    return "📄";
  }
  function iconClassFor(n){
    var e = extOf(n);
    var known = ["php","html","htm","css","js","mjs","md","markdown",
                 "json","jsonc","xml","svg","yml","yaml","sql"];
    if (known.indexOf(e) !== -1) {
      var cls = e;
      if (e === "htm") cls = "html";
      else if (e === "mjs") cls = "js";
      else if (e === "markdown") cls = "md";
      else if (e === "jsonc") cls = "json";
      else if (e === "svg") cls = "xml";
      else if (e === "yaml") cls = "yml";
      return "icon " + cls;
    }
    return "icon";
  }

  // ---------- Toast ----------
  var toastEl = document.getElementById("toast");
  var toastTimer;
  function toast(msg, isError){
    toastEl.textContent = msg;
    toastEl.classList.toggle("error", !!isError);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, isError ? 6000 : 2400);
  }

  // ---------- API ----------
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
      return r.text().then(function (text) {
        var j = null;
        try { j = JSON.parse(text); }
        catch (e) {
          var preview = text.slice(0, 200).replace(/\s+/g, " ");
          throw new Error("Bad JSON response: " + preview);
        }
        if (!r.ok || (j && j.error)) throw new Error((j && j.error) || ("HTTP " + r.status));
        return j;
      });
    });
  }

  // ---------- Snippets ----------
  window.customSnippets = window.customSnippets || [];
  var MERGE_STATIC_SNIPPETS = false;
  window.snippetStatus = { source: "static", files: [], errors: [] };

  function loadSnippetsFromServer() {
    if (!window._staticSnippets) window._staticSnippets = (window.customSnippets || []).slice();
    return api("snippets").then(function (data) {
      if (!data || !Array.isArray(data.snippets)) {
        window.snippetStatus = { source: "static", files: [], errors: ["Unexpected response from server"] };
        return;
      }
      var errs = data.errors || [];
      if (data.snippets.length === 0) {
        window.customSnippets = window._staticSnippets.slice();
        window.snippetStatus = { source: "static", files: [], errors: errs };
        return;
      }
      var list = data.snippets;
      if (MERGE_STATIC_SNIPPETS) {
        var map = {};
        window._staticSnippets.concat(list).forEach(function (sn) { map[sn.trigger] = sn; });
        list = Object.keys(map).map(function (k) { return map[k]; });
      }
      window.customSnippets = list;
      window.snippetStatus = { source: "json", files: data.files || [], errors: errs };
    }).catch(function (err) {
      window.customSnippets = window._staticSnippets.slice();
      window.snippetStatus = { source: "static", files: [], errors: [err.message] };
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

  // ---------- Editor ----------
  var editor = CodeMirror.fromTextArea(document.getElementById("code"), {
    mode: "php",
    lineNumbers: true,
    theme: "pg-dark",
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    lineWrapping: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    matchTags: { bothTags: true },
    autoCloseTags: true,
    styleActiveLine: true,
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter", "CodeMirror-lint-markers"],
    lint: true,
    extraKeys: {
      "Ctrl-Space": "autocomplete",
      "Cmd-Space": "autocomplete",
      "Tab": handleTab,
      "Shift-Tab": function (cm) { cm.indentSelection("subtract"); },
      "Ctrl-F": "findPersistent",
      "Cmd-F": "findPersistent",
      "Ctrl-H": "replace",
      "Alt-G": "jumpToLine",
      "Ctrl-G": "jumpToLine",
      "Ctrl-S": function () { saveActiveTab(); },
      "Cmd-S": function () { saveActiveTab(); },
      "Ctrl-Shift-S": function () { saveAsActiveTab(); },
      "Cmd-Shift-S": function () { saveAsActiveTab(); },
      "Esc": function (cm) { cm._snippetState = null; }
    }
  });
  editor.setSize("100%", "100%");
  window.addEventListener("resize", function () { editor.refresh(); });

  // ---------- Hint helper ----------
  function makeCustomHintHelper(editor, options) {
    var cur = editor.getCursor();
    var token = editor.getTokenAt(cur);
    var start = token.start, end = token.end;
    var word = editor.getRange({ line: cur.line, ch: start }, cur).toLowerCase();
    var list = [];

    (window.customTags || []).forEach(function (item) {
      if (item.displayText && item.displayText.toLowerCase().indexOf(word) === 0) list.push(item);
    });

    (window.customSnippets || []).forEach(function (s) {
      if (s.trigger && s.trigger.toLowerCase().indexOf(word) === 0) {
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

    try {
      if (typeof CodeMirror.hint.anyword === "function") {
        var anyword = CodeMirror.hint.anyword(editor, options);
        if (anyword && anyword.list) list = list.concat(anyword.list);
      }
    } catch (e) { /* ignore */ }

    return { list: list, from: CodeMirror.Pos(cur.line, start), to: CodeMirror.Pos(cur.line, end) };
  }

  ["php", "javascript", "css", "htmlmixed", "markdown", "xml", "yaml", "text/x-sql"]
    .forEach(function (mode) {
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

  // ---------- State ----------
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

  // ---------- Tree ----------
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
      document.title = info.root + " — Playground-Editor";
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

  // ---------- Tabs ----------
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

  // ---------- Save ----------
  function saveActiveTab() {
    if (activeTabIndex < 0) { toast("No file open", true); return; }
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

  function saveAsActiveTab() {
    if (activeTabIndex < 0) { toast("No file open", true); return; }
    var tab = openTabs[activeTabIndex];
    showModal("Save As", "Destination path", tab.path,
      function (newPath) {
        if (!newPath || newPath === tab.path) return;
        api("saveAs", { method: "POST", body: {
          src: tab.path, dst: newPath, content: editor.getValue()
        }})
          .then(function (data) {
            toast("Saved as " + data.name);
            return loadTree();
          })
          .then(function () { openFile(newPath); })
          .catch(function (err) { toast("Save As failed: " + err.message, true); });
      },
      "Pick a folder below, then type a filename — or type a full path",
      "saveas"
    );
  }

  // ---------- Context menu ----------
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

  // ---------- CRUD ----------
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

  // ---------- Modal ----------
  var modalBackdrop = document.getElementById("modal-backdrop");
  var modalTitle = document.getElementById("modal-title");
  var modalLabel = document.getElementById("modal-label");
  var modalInput = document.getElementById("modal-input");
  var modalHint = document.getElementById("modal-hint");
  var modalOk = document.getElementById("modal-ok");
  var modalCancel = document.getElementById("modal-cancel");
  var modalCallback = null;

  var pickerArea    = document.getElementById("modal-picker-area");
  var pickerTree    = document.getElementById("modal-picker-tree");
  var pickerPath    = document.getElementById("modal-picker-path");
  var pickerUp      = document.getElementById("picker-up");
  var pickerHome    = document.getElementById("picker-home");
  var pickerRefresh = document.getElementById("picker-refresh");

  var pickerState = {
    mode: null,
    cwd: null,
    parentPath: null,
    selected: null,
    lastBrowsed: null,
  };

  // ---- Server-side picker helpers ----
  function setPickerPathDisplay(p) {
    pickerPath.textContent = p;
    pickerPath.title = p;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function markSelectedRow(row) {
    pickerTree.querySelectorAll(".picker-row.selected").forEach(function (el) {
      el.classList.remove("selected");
    });
    if (row) row.classList.add("selected");
  }

  function browseTo(path) {
    pickerTree.innerHTML = '<div class="picker-loading">Loading…</div>';
    pickerPath.textContent = path || "…";
    api("browse", { query: { path: path || "" } })
      .then(function (data) {
        pickerState.cwd = data.path;
        pickerState.parentPath = data.parent;
        pickerState.lastBrowsed = data.path;
        renderPickerEntries(data);
      })
      .catch(function (err) {
        pickerTree.innerHTML =
          '<div class="picker-empty">Cannot open folder:<br>' +
          escapeHtml(err.message) + "</div>";
      });
  }

  function renderPickerEntries(data) {
    pickerTree.innerHTML = "";
    var sep = data.sep || "/";

    if (data.parent) {
      var upRow = document.createElement("div");
      upRow.className = "picker-row";
      upRow.innerHTML = '<span class="p-icon">⬆</span><span class="p-name">..</span>';
      upRow.onclick = function (e) {
        e.stopPropagation();
        pickerState.selected = null;
        browseTo(data.parent);
      };
      pickerTree.appendChild(upRow);
    }

    var hasAny = false;

    // Folders first
    (data.dirs || []).forEach(function (name) {
      hasAny = true;
      var fullPath = data.path + sep + name;
      var row = document.createElement("div");
      row.className = "picker-row";
      if (pickerState.selected && pickerState.selected.path === fullPath) {
        row.classList.add("selected");
      }
      row.innerHTML =
        '<span class="p-icon">📁</span>' +
        '<span class="p-name">' + escapeHtml(name) + '</span>' +
        '<span class="p-arrow">▶</span>';
      row.onclick = function (e) {
        e.stopPropagation();
        // Folder / save-as modes: single-click selects the folder
        if (pickerState.mode === "folder" || pickerState.mode === "saveas") {
          pickerState.selected = { type: "folder", name: name, path: fullPath };
          markSelectedRow(row);
          modalInput.value = fullPath;
        }
        // File mode: single-click enters the folder
        if (pickerState.mode === "file") {
          pickerState.selected = null;
          browseTo(fullPath);
        }
      };
      row.ondblclick = function (e) {
        e.stopPropagation();
        pickerState.selected = null;
        browseTo(fullPath);
      };
      pickerTree.appendChild(row);
    });

    // Then files
    (data.files || []).forEach(function (name) {
      hasAny = true;
      var fullPath = data.path + sep + name;
      var row = document.createElement("div");
      row.className = "picker-row";
      if (pickerState.selected && pickerState.selected.path === fullPath) {
        row.classList.add("selected");
      }
      row.innerHTML =
        '<span class="p-icon">📄</span>' +
        '<span class="p-name">' + escapeHtml(name) + '</span>';
      row.onclick = function (e) {
        e.stopPropagation();
        if (pickerState.mode === "file" || pickerState.mode === "saveas") {
          pickerState.selected = { type: "file", name: name, path: fullPath };
          markSelectedRow(row);
          modalInput.value = fullPath;
        }
      };
      row.ondblclick = function (e) {
        e.stopPropagation();
        if (pickerState.mode === "file") {
          pickerState.selected = { type: "file", name: name, path: fullPath };
          modalInput.value = fullPath;
          confirmPickerSelection();
        }
      };
      pickerTree.appendChild(row);
    });

    if (!hasAny) {
      var empty = document.createElement("div");
      empty.className = "picker-empty";
      empty.textContent = "This folder is empty.";
      pickerTree.appendChild(empty);
    }

    setPickerPathDisplay(data.path);
    pickerUp.disabled = !data.parent;
  }

  function confirmPickerSelection() {
    var typed = modalInput.value.trim();
    if (typed) {
      if (modalCallback) modalCallback(typed);
      hideModal();
      return;
    }
    if (pickerState.selected) {
      if (modalCallback) modalCallback(pickerState.selected.path);
      hideModal();
      return;
    }
    if (pickerState.mode === "folder" && pickerState.cwd) {
      if (modalCallback) modalCallback(pickerState.cwd);
      hideModal();
      return;
    }
    toast("Please select a " + (pickerState.mode === "folder" ? "folder" : "file"), true);
  }

  function showModal(title, label, def, cb, hint, pickerMode) {
    modalTitle.textContent = title;
    modalLabel.textContent = label;
    modalInput.value = def || "";
    modalCallback = cb;
    pickerState.mode = pickerMode || null;
    pickerState.selected = null;
    pickerState.cwd = null;
    pickerState.parentPath = null;

    if (hint) { modalHint.textContent = hint; modalHint.style.display = "block"; }
    else { modalHint.textContent = ""; modalHint.style.display = "none"; }

    if (pickerMode) {
      pickerArea.classList.add("open");
      var startPath = "";
      if (def && (def.indexOf("/") === 0 || /^[A-Za-z]:[\\\/]/.test(def))) {
        var norm = def.replace(/\\/g, "/");
        var lastSlash = norm.lastIndexOf("/");
        if (lastSlash > 0) startPath = norm.slice(0, lastSlash);
      }
      if (!startPath && pickerState.lastBrowsed) startPath = pickerState.lastBrowsed;
      browseTo(startPath);
    } else {
      pickerArea.classList.remove("open");
      pickerTree.innerHTML = "";
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
    pickerState.mode = null;
    pickerState.selected = null;
  }

  modalOk.addEventListener("click", function () {
    if (pickerState.mode) {
      confirmPickerSelection();
    } else {
      if (modalCallback) modalCallback(modalInput.value.trim());
      hideModal();
    }
  });

  modalCancel.addEventListener("click", hideModal);
  modalBackdrop.addEventListener("click", function (e) {
    if (e.target === modalBackdrop) hideModal();
  });
  modalInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      if (pickerState.mode) confirmPickerSelection();
      else { if (modalCallback) modalCallback(modalInput.value.trim()); hideModal(); }
    }
    if (e.key === "Escape") hideModal();
  });

  pickerUp.addEventListener("click", function () {
    if (pickerState.parentPath) {
      pickerState.selected = null;
      browseTo(pickerState.parentPath);
    }
  });
  pickerHome.addEventListener("click", function () {
    pickerState.selected = null;
    browseTo("");
  });
  pickerRefresh.addEventListener("click", function () {
    if (pickerState.cwd) browseTo(pickerState.cwd);
    else browseTo("");
  });

  // ---------- Sidebar toggle ----------
  var bodyEl       = document.getElementById("body");
  var toggleBtn    = document.getElementById("btn-toggle-sidebar");
  var SIDEBAR_KEY  = "pg-sidebar-hidden";

  function setSidebarHidden(hidden) {
    bodyEl.classList.toggle("sidebar-hidden", hidden);
    toggleBtn.classList.toggle("toggle-off", hidden);
    toggleBtn.title = hidden
      ? "Show Explorer panel (Ctrl+B)"
      : "Hide Explorer panel (Ctrl+B)";
    try { localStorage.setItem(SIDEBAR_KEY, hidden ? "1" : "0"); } catch (e) {}
    // Let the CSS transition finish, then refresh the editor so it re-measures
    setTimeout(function () { editor.refresh(); }, 200);
  }

  function toggleSidebar() {
    setSidebarHidden(!bodyEl.classList.contains("sidebar-hidden"));
  }

  // Restore the saved state on load
  try {
    if (localStorage.getItem(SIDEBAR_KEY) === "1") {
      bodyEl.classList.add("sidebar-hidden");
      toggleBtn.classList.add("toggle-off");
      toggleBtn.title = "Show Explorer panel (Ctrl+B)";
    }
  } catch (e) {}

  toggleBtn.addEventListener("click", toggleSidebar);

  // ---------- Menu ----------
  var menuFileBtn = document.getElementById("menu-file");
  var menuFileDropdown = document.getElementById("menu-file-dropdown");

  function openDropdown() {
    menuFileDropdown.classList.add("open");
    menuFileBtn.classList.add("active");
    document.addEventListener("mousedown", closeDropdownOnOutside);
  }
  function closeDropdown() {
    menuFileDropdown.classList.remove("open");
    menuFileBtn.classList.remove("active");
    document.removeEventListener("mousedown", closeDropdownOnOutside);
  }
  function closeDropdownOnOutside(e) {
    if (!menuFileDropdown.contains(e.target) && e.target !== menuFileBtn && !menuFileBtn.contains(e.target)) {
      closeDropdown();
    }
  }

  menuFileBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (menuFileDropdown.classList.contains("open")) closeDropdown();
    else openDropdown();
  });

  menuFileDropdown.querySelectorAll(".item").forEach(function (item) {
    item.addEventListener("click", function () {
      closeDropdown();
      var action = item.getAttribute("data-action");
      switch (action) {
        case "new-file":     promptNewFile(); break;
        case "open-file":    promptOpenFile(); break;
        case "new-folder":   promptNewFolder(); break;
        case "open-folder":  promptOpenFolder(); break;
        case "save":         saveActiveTab(); break;
        case "save-as":      saveAsActiveTab(); break;
        case "export-zip":   doExportZip(); break;
      }
    });
  });

  document.getElementById("menu-home").addEventListener("click", function () {
    api("resetRoot", { method: "POST" })
      .then(function (info) {
        toast("Back to: " + info.root);
        updateRootBadge();
        return loadTree();
      })
      .catch(function (err) { toast("Reset failed: " + err.message, true); });
  });

  document.getElementById("btn-refresh").addEventListener("click", loadTree);
  document.getElementById("btn-new-file-2").addEventListener("click", function () { promptNewFile(); });
  document.getElementById("btn-new-folder-2").addEventListener("click", function () { promptNewFolder(); });

  document.getElementById("btn-reload-snippets").addEventListener("click", function () {
    loadSnippetsFromServer().then(function () {
      var st = window.snippetStatus, n = (window.customSnippets || []).length;
      if (st.source === "json") {
        toast("Loaded " + n + " snippets from " + st.files.length + " JSON file(s)" +
              (st.errors.length ? " · " + st.errors.length + " warning(s) — see console" : ""),
              st.errors.length > 0);
      } else {
        toast("No JSON snippets loaded — using custom-snippets.js (" + n + "). " +
              (st.errors[0] || "snippets/ folder is empty"), true);
      }
    });
  });

  // ---------- Open File / Folder ----------
  function promptOpenFile() {
    showModal("Open File", "File path", "",
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
      "Browse the tree below, or type a full path",
      "file"
    );
  }

  function promptOpenFolder() {
    showModal("Open Folder", "Folder path", "",
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
      "Browse the tree below, or type a full path",
      "folder"
    );
  }

  // ---------- Export ZIP ----------
  function doExportZip() {
    if (typeof JSZip === "undefined") {
      toast("JSZip not loaded — check your internet connection", true);
      return;
    }
    var flushPromise;
    if (activeTabIndex >= 0 && openTabs[activeTabIndex]) {
      var tab = openTabs[activeTabIndex];
      flushPromise = api("save", {
        method: "POST",
        body: { path: tab.path, content: editor.getValue() }
      }).then(function () { tab.dirty = false; renderTabs(); }).catch(function () {});
    } else {
      flushPromise = Promise.resolve();
    }
    flushPromise.then(buildAndDownloadZip);
  }

  function buildAndDownloadZip() {
    toast("Preparing ZIP…");
    api("export").then(function (data) {
      if (!data || !Array.isArray(data.files)) throw new Error("API returned no file list");
      if (data.files.length === 0) { toast("Nothing to export — folder is empty", true); return; }

      var rootName = (data.root && String(data.root).trim()) || "workspace";
      var zip = new JSZip();
      data.files.forEach(function (f) {
        if (!f || typeof f.path !== "string") return;
        zip.file(f.path, f.content == null ? "" : f.content);
      });

      zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url; a.download = rootName + ".zip";
          document.body.appendChild(a); a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          toast("Exported " + rootName + ".zip (" + data.files.length + " files)");
        }).catch(function (err) {
          toast("ZIP generation failed: " + err.message, true);
        });
    }).catch(function (err) {
      toast("Export failed: " + err.message, true);
    });
  }

  // ---------- Shortcuts ----------
  function handleShortcut(e) {
    var mod = e.ctrlKey || e.metaKey;
    var alt = e.altKey;
    var shift = e.shiftKey;
    var key = (e.key || "").toLowerCase();

    if (mod && !shift && !alt && key === "s") { e.preventDefault(); e.stopPropagation(); saveActiveTab(); return true; }
    if (mod && shift && !alt && key === "s") { e.preventDefault(); e.stopPropagation(); saveAsActiveTab(); return true; }

    if ((mod && !shift && !alt && key === "n") || (!mod && alt && !shift && key === "n")) {
      e.preventDefault(); e.stopPropagation(); promptNewFile(); return true;
    }
    if ((mod && shift && !alt && key === "n") || (!mod && alt && shift && key === "n")) {
      e.preventDefault(); e.stopPropagation(); promptNewFolder(); return true;
    }
    if ((mod && !shift && !alt && key === "o") || (!mod && alt && !shift && key === "o")) {
      e.preventDefault(); e.stopPropagation(); promptOpenFile(); return true;
    }
    if ((mod && shift && !alt && key === "o") || (!mod && alt && shift && key === "o")) {
      e.preventDefault(); e.stopPropagation(); promptOpenFolder(); return true;
    }

    if (mod && !shift && !alt && key === "f") {
      e.preventDefault(); e.stopPropagation();
      if (!editor.hasFocus()) editor.focus();
      setTimeout(function () { CodeMirror.commands.findPersistent(editor); }, 0);
      return true;
    }
    if ((mod && !shift && !alt && key === "h") || (mod && shift && !alt && key === "f")) {
      e.preventDefault(); e.stopPropagation();
      if (!editor.hasFocus()) editor.focus();
      setTimeout(function () { CodeMirror.commands.replace(editor); }, 0);
      return true;
    }
    if (mod && !shift && !alt && key === "g") {
      e.preventDefault(); e.stopPropagation();
      if (!editor.hasFocus()) editor.focus();
      setTimeout(function () { CodeMirror.commands.jumpToLine(editor); }, 0);
      return true;
    }
    if (mod && !shift && !alt && key === "e") {
      e.preventDefault(); e.stopPropagation(); doExportZip(); return true;
    }
    // Ctrl+B — toggle the Explorer sidebar
    if (mod && !shift && !alt && key === "b") {
      e.preventDefault(); e.stopPropagation(); toggleSidebar(); return true;
    }
    if (key === "escape") { closeDropdown(); hideContextMenu(); return false; }
    return false;
  }

  document.addEventListener("keydown", handleShortcut, true);
  window.addEventListener("keydown", handleShortcut, true);

  document.addEventListener("keypress", function (e) {
    var mod = e.ctrlKey || e.metaKey;
    var key = (e.key || "").toLowerCase();
    if (mod && (key === "n" || key === "o")) e.preventDefault();
  }, true);

  // ---------- Init ----------
  updateRootBadge();
  Promise.all([loadSnippetsFromServer(), loadTree()]).then(function () {
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