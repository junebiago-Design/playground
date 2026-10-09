
<?php
// terminal.php
// Simple browser-based Windows PowerShell terminal.

$output = '';
$command = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $command = trim($_POST['command'] ?? '');

    if ($command !== '') {
        $process = proc_open(
            [
                'powershell.exe',
                '-NoLogo',
                '-NoProfile',
                '-Command',
                $command
            ],
            [
                0 => ['pipe', 'r'],
                1 => ['pipe', 'w'],
                2 => ['pipe', 'w']
            ],
            $pipes
        );

        if (is_resource($process)) {
            fclose($pipes[0]);

            $stdout = stream_get_contents($pipes[1]);
            $stderr = stream_get_contents($pipes[2]);

            fclose($pipes[1]);
            fclose($pipes[2]);

            $exitCode = proc_close($process);

            $output = $stdout;

            if ($stderr !== '') {
                $output .= "\n" . $stderr;
            }

            $output .= "\n\nExit code: " . $exitCode;
        } else {
            $output = 'Failed to start PowerShell.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>PowerShell Web Terminal</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 24px;
            background: #111827;
            color: #e5e7eb;
            font-family: Consolas, monospace;
        }

        .terminal {
            max-width: 1000px;
            margin: 0 auto;
        }

        h2 {
            color: #38bdf8;
        }

        form {
            display: flex;
            gap: 8px;
        }

        input {
            flex: 1;
            min-width: 0;
            padding: 14px;
            background: #030712;
            color: #86efac;
            border: 1px solid #374151;
            border-radius: 6px;
            font: inherit;
        }

        button {
            padding: 14px 20px;
            background: #0284c7;
            color: white;
            border: 0;
            border-radius: 6px;
            cursor: pointer;
            font: inherit;
        }

        pre {
            min-height: 300px;
            padding: 18px;
            overflow: auto;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            background: #030712;
            border: 1px solid #374151;
            border-radius: 6px;
            color: #d1fae5;
        }

        .hint {
            color: #9ca3af;
            font-size: 13px;
        }
    </style>
</head>
<body>
<div class="terminal">
    <h2>Windows PowerShell Terminal</h2>

    <p class="hint">
        Local development only. Enter a PowerShell command below.
    </p>

    <form method="POST">
        <input
            type="text"
            name="command"
            placeholder="Get-ChildItem"
            value="<?= htmlspecialchars(
                $command,
                ENT_QUOTES,
                'UTF-8'
            ) ?>"
            autofocus
            required
        >

        <button type="submit">Run</button>
    </form>

    <h3>Output</h3>

    <pre><?= htmlspecialchars(
        $output,
        ENT_QUOTES,
        'UTF-8'
    ) ?></pre>
</div>
</body>
</html>
