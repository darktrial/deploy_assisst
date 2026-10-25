param(
    [ValidateSet('Build', 'Query', 'Path', 'Explain')][string]$Action = 'Build',
    [string]$Question,
    [string]$From,
    [string]$To
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$graphPython = $env:GRAPHIFY_PYTHON
if (!$graphPython) { $graphPython = Join-Path (Split-Path $repoRoot -Parent) '.codexdeps\graphify-venv\Scripts\python.exe' }
if (!(Test-Path -LiteralPath $graphPython)) { throw 'Set GRAPHIFY_PYTHON to a Python environment containing graphifyy 0.9.95.' }
function Invoke-Graphify([string[]]$Arguments) {
    & $graphPython -X utf8 -m graphify @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Graphify exited $LASTEXITCODE. Diagnose before retrying." }
}
Push-Location $repoRoot
try {
    switch ($Action) {
        'Build' {
            Invoke-Graphify @('extract', '.', '--code-only', '--no-cluster', '--force', '--max-workers', '2')
            Invoke-Graphify @('cluster-only', '.', '--no-label', '--no-viz')
            if (!(Test-Path -LiteralPath 'graphify-out\graph.json') -or !(Test-Path -LiteralPath 'graphify-out\GRAPH_REPORT.md')) { throw 'Graphify outputs are incomplete.' }
        }
        'Query' { if (!$Question) { throw 'Question is required.' }; Invoke-Graphify @('query', $Question, '--budget', '1800') }
        'Explain' { if (!$Question) { throw 'Node ID is required in Question.' }; Invoke-Graphify @('explain', $Question) }
        'Path' { if (!$From -or !$To) { throw 'From and To node IDs are required.' }; Invoke-Graphify @('path', $From, $To) }
    }
    # Read-only query commands also recreate last_query_stamp in cache.
    if ((Test-Path -LiteralPath 'graphify-out\graph.json') -and (Test-Path -LiteralPath 'graphify-out\GRAPH_REPORT.md')) {
        $cache = [IO.Path]::GetFullPath((Join-Path $repoRoot 'graphify-out\cache'))
        $expected = [IO.Path]::GetFullPath((Join-Path $repoRoot 'graphify-out')) + [IO.Path]::DirectorySeparatorChar
        if (!$cache.StartsWith($expected, [StringComparison]::OrdinalIgnoreCase)) { throw 'Cache path escaped graphify-out.' }
        if (Test-Path -LiteralPath $cache) { Remove-Item -LiteralPath $cache -Recurse -Force }
    }
} finally { Pop-Location }
