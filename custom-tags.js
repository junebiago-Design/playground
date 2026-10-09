// ============================================================
// CUSTOM TAGS FOR "MINI BLOG" PROJECT
// ------------------------------------------------------------
// Think of this file as your project's "word list".
// Each line = one thing the editor should suggest.
// ============================================================

window.customTags = [

  // 🗄️ DATABASE HELPERS  (from helpers.php)
  { text: "db_connect()",              displayText: "db_connect",        className: "hint-function" },
  { text: "db_query($sql)",            displayText: "db_query",          className: "hint-function" },
  { text: "db_fetch($result)",         displayText: "db_fetch",          className: "hint-function" },
  { text: "db_escape($string)",        displayText: "db_escape",         className: "hint-function" },

  // 🔐 AUTH HELPERS  (from helpers.php)
  { text: "is_logged_in()",            displayText: "is_logged_in",      className: "hint-function" },
  { text: "current_user()",            displayText: "current_user",      className: "hint-function" },
  { text: "require_login()",           displayText: "require_login",     className: "hint-function" },
  { text: "logout()",                  displayText: "logout",            className: "hint-function" },

  // ⚙️ CONFIG CONSTANTS  (from config.php)
  { text: "DB_HOST",                   displayText: "DB_HOST",           className: "hint-constant" },
  { text: "DB_NAME",                   displayText: "DB_NAME",           className: "hint-constant" },
  { text: "APP_NAME",                  displayText: "APP_NAME",          className: "hint-constant" },
  { text: "BASE_URL",                  displayText: "BASE_URL",          className: "hint-constant" },

  // 🏗️ CLASSES  (from classes/)
  { text: "User",                      displayText: "User",              className: "hint-class" },
  { text: "Post",                      displayText: "Post",              className: "hint-class" },
  { text: "new User()",                displayText: "new User()",        className: "hint-class" },
  { text: "new Post()",                displayText: "new Post()",        className: "hint-class" },

  // 📝 SNIPPETS  (things you type a lot)
  { text: "<?php\n\n",                 displayText: "php open tag",      className: "hint-tag" },
  { text: "<?= $var ?>",               displayText: "php echo",          className: "hint-tag" },
  { text: "foreach ($items as $item) {\n    \n}", displayText: "foreach loop", className: "hint-tag" },
  { text: "if (isset($x)) {\n    \n}", displayText: "if isset",          className: "hint-tag" },

];