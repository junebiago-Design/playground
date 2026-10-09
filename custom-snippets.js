// ============================================================
// CUSTOM SNIPPETS / BOILERPLATES
// ------------------------------------------------------------
// Type the `trigger` word in the editor and press TAB to expand.
//
// PLACEHOLDER SYNTAX (same as VS Code):
//   ${1:default}  →  tab stop #1 with default text "default"
//   ${2}          →  tab stop #2 (empty)
//   $0            →  final cursor position
//
// Press Tab repeatedly to jump between stops. Press Escape to stop.
//
// ⚠️  IMPORTANT: since these templates use backtick strings,
//     write ${...} as \${...} so JavaScript doesn't try to
//     evaluate it. The output will still be ${...}.
// ============================================================

window.customSnippets = [

  // ----------------------------------------------------------
  // 🌐 HTML5 BOILERPLATE
  //    Trigger:  html
  // ----------------------------------------------------------
  {
    trigger: "html",
    description: "HTML5 boilerplate",
    template: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>\${1:Document}</title>
    <link rel="stylesheet" href="\${2:style.css}">
</head>
<body>
    \${3}
    <script src="\${4:script.js}"></script>
</body>
</html>
\$0`
  },

  // ----------------------------------------------------------
  // 🐘 PHP FILE
  //    Trigger:  php
  // ----------------------------------------------------------
  {
    trigger: "php",
    description: "PHP file with opening tag",
    template: `<?php
// \${1:Description}
declare(strict_types=1);

\${2}

\$0`
  },

  // ----------------------------------------------------------
  // 🏛️ PHP CLASS
  //    Trigger:  phpclass
  // ----------------------------------------------------------
  {
    trigger: "phpclass",
    description: "PHP class skeleton",
    template: `<?php

class \${1:ClassName}
{
    public function __construct(\${2})
    {
        \${3}
    }

    public function \${4:methodName}(\${5})
    {
        \${6}
    }
}
\$0`
  },

  // ----------------------------------------------------------
  // 🔧 PHP FUNCTION
  //    Trigger:  phpfunc
  // ----------------------------------------------------------
  {
    trigger: "phpfunc",
    description: "PHP function with docblock",
    template: `/**
 * \${1:Description}
 *
 * @param \${2:type} \$\${3:param}
 * @return \${4:void}
 */
function \${5:functionName}(\$\${3:param})
{
    \${6}
}
\$0`
  },

  // ----------------------------------------------------------
  // 🔁 PHP FOREACH LOOP
  //    Trigger:  foreach
  // ----------------------------------------------------------
  {
    trigger: "foreach",
    description: "PHP foreach loop",
    template: `foreach (\$\${1:items} as \$\${2:item}) {
    \${3}
}
\$0`
  },

  // ----------------------------------------------------------
  // ❓ PHP IF / ELSE
  //    Trigger:  ifelse
  // ----------------------------------------------------------
  {
    trigger: "ifelse",
    description: "PHP if / else block",
    template: `if (\${1:condition}) {
    \${2}
} else {
    \${3}
}
\$0`
  },

  // ----------------------------------------------------------
  // 📜 JAVASCRIPT IIFE MODULE
  //    Trigger:  js
  // ----------------------------------------------------------
  {
    trigger: "js",
    description: "JavaScript IIFE module",
    template: `(function () {
    'use strict';

    \${1}

})();
\$0`
  },

  // ----------------------------------------------------------
  // 🖥️ CONSOLE LOG
  //    Trigger:  console
  // ----------------------------------------------------------
  {
    trigger: "console",
    description: "console.log statement",
    template: `console.log('\${1:label}:', \${2:value});\$0`
  },

  // ----------------------------------------------------------
  // 🎨 CSS BASIC STYLESHEET
  //    Trigger:  css
  // ----------------------------------------------------------
  {
    trigger: "css",
    description: "CSS basic stylesheet",
    template: `/* \${1:Stylesheet} */

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: \${2:system-ui, sans-serif};
    \${3}
}
\$0`
  },

  // ----------------------------------------------------------
  // 📝 MARKDOWN TEMPLATE
  //    Trigger:  md
  // ----------------------------------------------------------
  {
    trigger: "md",
    description: "Markdown document template",
    template: `# \${1:Title}

\${2:Short description}

## Installation

\`\`\`bash
\${3:npm install}
\`\`\`

## Usage

\${4}

## License

\${5:MIT}
\$0`
  },

  // ----------------------------------------------------------
  // ➕ ADD YOUR OWN SNIPPETS BELOW
  // ----------------------------------------------------------
  // {
  //   trigger: "myword",
  //   description: "What it does",
  //   template: `line 1
  // line 2
  // \${1:placeholder}
  // \$0`
  // },

];