param()

$ErrorActionPreference = 'Stop'
$workspacePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$statePath = Join-Path $workspacePath '.local\dev-processes.json'
if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
    Write-Host 'No process-state file exists. No processes were stopped.'
    exit 0
}
$state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not [string]::Equals([string]$state.workspace, $workspacePath, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Process-state workspace does not match this checkout. No processes were stopped.'
}
$expectedPython = Join-Path $workspacePath 'backend\.venv\Scripts\python.exe'
$expectedAstro = Join-Path $workspacePath 'frontend\node_modules\astro\astro.js'
$expectedNode = (Get-Command node.exe -ErrorAction Stop).Source
$remaining = @{}
foreach ($service in @('frontend','backend')) {
    $record = $state.services.$service
    if (-not $record) { continue }
    $processId = [int]$record.pid
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $process) { Write-Host "$service is already stopped."; continue }
    $safe = $false
    try {
        $details = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop
        $expectedExecutable = if ($service -eq 'backend') { $expectedPython } else { $expectedNode }
        $recordMatches = [string]::Equals([string]$record.executable, $expectedExecutable, [StringComparison]::OrdinalIgnoreCase)
        $actualMatches = [string]::Equals([string]$details.ExecutablePath, $expectedExecutable, [StringComparison]::OrdinalIgnoreCase)
        $startedAt = if ($record.started_at_utc -is [DateTime]) {
            $record.started_at_utc.ToUniversalTime()
        } elseif ($record.started_at_utc -is [DateTimeOffset]) {
            $record.started_at_utc.UtcDateTime
        } else {
            [DateTime]::Parse([string]$record.started_at_utc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
        }
        $timeMatches = [Math]::Abs(($process.StartTime.ToUniversalTime() - $startedAt).TotalSeconds) -lt 2
        $commandMatches = if ($service -eq 'backend') {
            $details.CommandLine -match '(^|\s)-m\s+uvicorn\s+app\.main:app(\s|$)'
        } else {
            $details.CommandLine.IndexOf($expectedAstro, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $details.CommandLine -match '\sdev\s'
        }
        $safe = $recordMatches -and $actualMatches -and $timeMatches -and $commandMatches
    } catch { $safe = $false }
    if (-not $safe) {
        Write-Warning "Refusing to stop PID $processId for ${service}: executable, command line or start time did not match this checkout."
        $remaining[$service] = $record
        continue
    }
    Stop-Process -Id $processId -ErrorAction Stop
    Write-Host "Stopped $service (PID $processId)."
}
@{ workspace = $workspacePath; services = $remaining } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding UTF8
Write-Host 'Log files were retained in .local/.'
