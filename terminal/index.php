<?php
declare(strict_types=1);

/*
 * PlayGround-Terminal V2
 * Local Windows development only.
 *
 * SECURITY: This page executes PowerShell commands as the Windows account
 * running PHP. Keep the PHP server bound to 127.0.0.1 and never expose this
 * page to a public network.
 */

$output = '';
$command = '';
$exitCode = null;
$workingDirectory = 'D:\00_Inbox\01-Webdev\playground';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $command = trim((string)($_POST['command'] ?? ''));

    if ($command !== '') {
        if (PHP_OS_FAMILY !== 'Windows') {
            $output = 'This terminal is configured for Windows PowerShell.';
        } elseif (!function_exists('proc_open')) {
            $output = 'Error: proc_open() is disabled in this PHP installation.';
        } else {
           $process = proc_open(
    [
        'powershell.exe',
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'RemoteSigned',
        '-Command',
        $command
    ],
    [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w']
    ],
    $pipes,
    $workingDirectory
);

            if (is_resource($process)) {
                fclose($pipes[0]);

                // Read both streams so PowerShell output and errors are shown.
                $stdout = stream_get_contents($pipes[1]);
                $stderr = stream_get_contents($pipes[2]);

                fclose($pipes[1]);
                fclose($pipes[2]);

                $exitCode = proc_close($process);
                $output = (string)$stdout;

                if ((string)$stderr !== '') {
                    $output .= ($output !== '' ? "\n" : '') . (string)$stderr;
                }

                $output .= "\n\nExit code: " . $exitCode;
            } else {
                $output = 'Error: failed to start PowerShell. Check that powershell.exe is available.';
            }
        }
    }
}

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>PlayGround-Terminal V2</title>
    <style>
        :root {
            color-scheme: dark;
            font-family: Consolas, "Courier New", monospace;
            background: #0b1120;
            color: #e5e7eb;

            --page-pad: 24px;
            --gap: 14px;
            --header-h: 40px;
            --hint-h: 42px;
            --form-h: 52px;
        }

        * { box-sizing: border-box; }

        html, body {
            height: 100%;
            margin: 0;
        }

        body {
            padding: var(--page-pad);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .terminal {
            max-width: 1100px;
            width: 100%;
            margin: 0 auto;
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
            gap: var(--gap);
        }

        header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            flex-shrink: 0;
            min-height: var(--header-h);
        }

        h1 {
            margin: 0;
            color: #38bdf8;
            font-size: 1.35rem;
        }

        .status, .hint {
            color: #94a3b8;
            font-size: .85rem;
        }

        .panel {
            border: 1px solid #273449;
            background: #0f172a;
            border-radius: 10px;
            overflow: hidden;
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }

        .panel-title {
            padding: 10px 14px;
            background: #172033;
            border-bottom: 1px solid #273449;
            color: #cbd5e1;
            font-size: .85rem;
            flex-shrink: 0;
        }

        #output {
            flex: 1 1 auto;
            min-height: 0;
            overflow: auto;
            margin: 0;
            padding: 16px;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            color: #d1fae5;
            font: inherit;
            line-height: 1.5;
            tab-size: 4;
        }

        form {
            display: flex;
            gap: 10px;
            flex-shrink: 0;
            min-height: var(--form-h);
        }

        .input-wrap {
            position: relative;
            flex: 1;
            min-width: 0;
        }

        #command {
            width: 100%;
            height: 100%;
            padding: 14px 15px;
            border: 1px solid #334155;
            border-radius: 8px;
            outline: none;
            background: #020617;
            color: #86efac;
            font: inherit;
        }

        #command:focus {
            border-color: #38bdf8;
            box-shadow: 0 0 0 3px rgb(56 189 248 / 12%);
        }

        button {
            border: 0;
            border-radius: 8px;
            padding: 0 18px;
            background: #0284c7;
            color: white;
            font: inherit;
            cursor: pointer;
            flex-shrink: 0;
        }

        button:hover { background: #0369a1; }

        #suggestions {
            position: absolute;
            z-index: 10;
            left: 0;
            right: 0;
            bottom: calc(100% + 6px);
            display: none;
            max-height: 230px;
            overflow: auto;
            border: 1px solid #334155;
            border-radius: 8px;
            background: #111827;
            box-shadow: 0 12px 28px rgb(0 0 0 / 30%);
        }

        .suggestion {
            padding: 10px 12px;
            border-bottom: 1px solid #263244;
            cursor: pointer;
        }

        .suggestion:last-child { border-bottom: 0; }
        .suggestion.active, .suggestion:hover { background: #1e3a5f; }
        .suggestion strong { color: #7dd3fc; }
        .suggestion small {
            display: block;
            margin-top: 4px;
            color: #9ca3af;
            overflow-wrap: anywhere;
        }

        .hint {
            margin: 0 2px;
            line-height: 1.6;
            flex-shrink: 0;
            min-height: var(--hint-h);
        }

        kbd {
            padding: 2px 5px;
            border: 1px solid #475569;
            border-radius: 4px;
            color: #e2e8f0;
        }

        @media (max-width: 600px) {
            :root {
                --page-pad: 14px;
                --gap: 10px;
                --hint-h: 60px;
            }
            form { flex-direction: column; min-height: auto; }
            .input-wrap { min-height: 48px; }
            button { min-height: 44px; }
        }
    </style>
</head>
<body>
<main class="terminal">
    <header>
        <h1>PlayGround-Terminal V2</h1>
        <span class="status">Local Windows PowerShell</span>
    </header>

    <section class="panel" aria-label="Terminal output">
        <div class="panel-title">Output</div>
        <pre id="output" aria-live="polite"><?= h($output !== '' ? $output : "Ready. Enter a command below.\n") ?></pre>
    </section>

    <form method="post" id="terminal-form" autocomplete="off">
        <div class="input-wrap">
            <input
                id="command"
                type="text"
                name="command"
                placeholder="Type a command, e.g. Get-ChildItem"
                autocomplete="off"
                spellcheck="false"
                autofocus
                required
            >
            <div id="suggestions" role="listbox" aria-label="Command snippets"></div>
        </div>
        <button type="submit">Run</button>
    </form>

    <p class="hint">
        Snippets: type a trigger and press <kbd>Tab</kbd> to complete it.
        Press <kbd>↑</kbd>/<kbd>↓</kbd> to move through suggestions.
        Edit <code>terminal-snippets.json</code> to add your own.
    </p>
</main>

<script>
(() => {
    const input = document.getElementById('command');
    const form = document.getElementById('terminal-form');
    const suggestionsBox = document.getElementById('suggestions');

    let snippets = [];
    let matches = [];
    let activeIndex = 0;

    window.addEventListener('DOMContentLoaded', () => {
        input.value = '';
        input.focus();
        input.setSelectionRange(0, 0);
    });

    fetch('terminal-snippets.json', { cache: 'no-store' })
        .then(response => {
            if (!response.ok) throw new Error('Could not load snippets JSON');
            return response.json();
        })
        .then(data => {
            snippets = Array.isArray(data.snippets) ? data.snippets : [];
        })
        .catch(() => {
            snippets = [];
        });

    function closeSuggestions() {
        suggestionsBox.style.display = 'none';
        suggestionsBox.replaceChildren();
        matches = [];
        activeIndex = 0;
    }

    /*
     * Turn a VS Code-style snippet template into plain text and
     * select the first ${N:placeholder} so the user can type over it.
     *
     * Examples:
     *   "git commit -m \"${1:comment}\""
     *     -> "git commit -m \"comment\""
     *     -> selects the word: comment
     *
     *   "git checkout ${1:branch-name}"
     *     -> "git checkout branch-name"
     *     -> selects: branch-name
     *
     *   "Get-ChildItem -Force"
     *     -> "Get-ChildItem -Force"
     *     -> cursor at end
     */
    function chooseSnippet(snippet) {
        const raw = String(snippet.template ?? '');

        // Find the first placeholder: ${N:default} or ${N}
        const match = raw.match(/\$\{(\d+)(?::([^}]*))?\}/);

        if (!match) {
            input.value = raw;
            closeSuggestions();
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
            return;
        }

        const placeholderText = match[2] ?? '';
        const before = raw.slice(0, match.index);
        const after  = raw.slice(match.index + match[0].length);

        // Compose the final text with the placeholder's default value
        input.value = before + placeholderText + after;

        closeSuggestions();
        input.focus();

        const start = before.length;
        const end   = start + placeholderText.length;

        // Select the placeholder so typing replaces it immediately
        input.setSelectionRange(start, end);
    }

    function renderSuggestions() {
        const typed = input.value.trim().toLowerCase();

        if (!typed || !snippets.length) {
            closeSuggestions();
            return;
        }

        matches = snippets.filter(snippet => {
            const trigger = String(snippet.trigger ?? '').toLowerCase();
            return trigger.startsWith(typed) || trigger.includes(typed);
        }).slice(0, 8);

        if (!matches.length) {
            closeSuggestions();
            return;
        }

        activeIndex = Math.min(activeIndex, matches.length - 1);
        suggestionsBox.replaceChildren();

        matches.forEach((snippet, index) => {
            const item = document.createElement('div');
            item.className = 'suggestion' + (index === activeIndex ? ' active' : '');
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');

            const title = document.createElement('strong');
            title.textContent = snippet.trigger || '(no trigger)';

            const description = document.createElement('small');
            description.textContent = snippet.description || snippet.template || '';

            item.append(title, description);
            item.addEventListener('mousedown', event => {
                event.preventDefault();
                chooseSnippet(snippet);
            });
            suggestionsBox.appendChild(item);
        });

        suggestionsBox.style.display = 'block';
    }

    input.addEventListener('input', () => {
        activeIndex = 0;
        renderSuggestions();
    });

    input.addEventListener('keydown', event => {
        if (event.key === 'Tab') {
            if (!matches.length) return;

            event.preventDefault();
            const typed = input.value.trim().toLowerCase();

            const exact = matches.find(snippet =>
                String(snippet.trigger ?? '').toLowerCase() === typed
            );

            chooseSnippet(exact || matches[activeIndex]);
        } else if (event.key === 'ArrowDown' && matches.length) {
            event.preventDefault();
            activeIndex = (activeIndex + 1) % matches.length;
            renderSuggestions();
        } else if (event.key === 'ArrowUp' && matches.length) {
            event.preventDefault();
            activeIndex = (activeIndex - 1 + matches.length) % matches.length;
            renderSuggestions();
        } else if (event.key === 'Escape') {
            closeSuggestions();
        }
    });

    form.addEventListener('submit', () => {
        closeSuggestions();
    });

    document.addEventListener('click', event => {
        if (!event.target.closest('.input-wrap')) closeSuggestions();
    });
})();
</script>
</body>
</html>