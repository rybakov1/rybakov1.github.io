param()

$ErrorActionPreference = 'Stop'
$workspacePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$backendPath = Join-Path $workspacePath 'backend'
$frontendPath = Join-Path $workspacePath 'frontend'
$localPath = Join-Path $workspacePath '.local'
$statePath = Join-Path $localPath 'dev-processes.json'
$pythonPath = Join-Path $backendPath '.venv\Scripts\python.exe'
$astroPath = Join-Path $frontendPath 'node_modules\astro\astro.js'

function Import-PlainEnvironment([string]$path) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw 'Root .env is missing. Copy .env.example to .env and configure it first.'
    }
    $lineNumber = 0
    foreach ($line in Get-Content -LiteralPath $path -Encoding UTF8) {
        $lineNumber++
        $trimmedLine = $line.Trim()
        if (-not $trimmedLine -or $trimmedLine.StartsWith('#')) { continue }
        if ($trimmedLine -notmatch '^([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            throw "Invalid plain KEY=VALUE syntax in .env at line $lineNumber."
        }
        $key = $Matches[1]
        $value = $Matches[2].Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        # Values are literal: never evaluate commands or expand variables.
        [Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
}

function Test-BackendReady {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2
        $config = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/config' -TimeoutSec 2
        return ($health.status -eq 'ok' -and $config.PSObject.Properties.Name -contains 'telegram_enabled' -and $config.PSObject.Properties.Name -contains 'data_mode')
    } catch { return $false }
}

function Test-FrontendReady {
    try {
        $page = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/' -UseBasicParsing -TimeoutSec 2
        return ($page.StatusCode -eq 200 -and $page.Content -match '/methodology/' -and $page.Content -match 'id="main"')
    } catch { return $false }
}

function Assert-PortFree([int]$port) {
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -gt 0) {
        throw "Port $port is occupied by a service that did not pass this project's health check. No process was stopped."
    }
}

function Save-ProcessState {
    $script:processState | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding UTF8
}

function Register-Process([string]$service, $process, [string]$executable) {
    $process.Refresh()
    $record = @{ pid = $process.Id; executable = $executable; started_at_utc = $process.StartTime.ToUniversalTime().ToString('o') }
    $script:processState.services[$service] = $record
    Save-ProcessState
}

function Wait-ForService([string]$service, $process, [scriptblock]$probe) {
    $deadline = [DateTime]::UtcNow.AddSeconds(55)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (& $probe) { return }
        $process.Refresh()
        if ($process.HasExited) {
            throw "$service exited. See .local/$service.stderr.log and .local/$service.stdout.log."
        }
        Start-Sleep -Milliseconds 400
    }
    throw "$service did not become ready. See .local logs. Its PID is retained for stop-dev.ps1."
}

Import-PlainEnvironment (Join-Path $workspacePath '.env')
if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    throw 'Backend virtualenv is missing. Run: python -m venv backend/.venv ; backend/.venv/Scripts/python -m pip install -r backend/requirements.txt'
}
if (-not (Test-Path -LiteralPath $astroPath -PathType Leaf)) {
    throw 'Frontend dependencies are missing. Run npm ci in frontend first.'
}
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Path $localPath -Force | Out-Null
$script:processState = @{ workspace = $workspacePath; services = @{} }
if (Test-Path -LiteralPath $statePath -PathType Leaf) {
    try {
        $previous = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($previous.workspace -eq $workspacePath) {
            foreach ($property in $previous.services.PSObject.Properties) {
                $script:processState.services[$property.Name] = $property.Value
            }
        }
    } catch { Write-Warning 'Previous process-state file could not be read; no processes will be stopped automatically.' }
}

# Local development uses SQLite and localhost, regardless of Compose DNS in .env.
$env:DATABASE_URL = 'sqlite:///./cenoscope.db'
$env:API_BASE_URL = 'http://127.0.0.1:8000'
$env:PUBLIC_API_URL = 'http://localhost:8000'
$env:PUBLIC_API_ENABLED = 'true'
$env:PUBLIC_SITE_URL = 'http://localhost:3000'
$env:PUBLIC_BASE_URL = 'http://localhost:3000'

if (Test-BackendReady) {
    Write-Host 'Reusing the existing API on port 8000.'
} else {
    Assert-PortFree 8000
    Push-Location -LiteralPath $backendPath
    try {
        Write-Host 'Applying database migrations...'
        & $pythonPath -m alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw 'Database migration failed. API was not started.' }
        & $pythonPath -m app.seed
        if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed. API was not started.' }
    } finally { Pop-Location }
    $backendProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000') -WorkingDirectory $backendPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $localPath 'backend.stdout.log') -RedirectStandardError (Join-Path $localPath 'backend.stderr.log') -PassThru
    Register-Process 'backend' $backendProcess $pythonPath
    Wait-ForService 'backend' $backendProcess { Test-BackendReady }
}

if (Test-FrontendReady) {
    Write-Host 'Reusing the existing site on port 3000.'
} else {
    Assert-PortFree 3000
    $frontendProcess = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $astroPath + '"'),'dev','--host','127.0.0.1','--port','3000') -WorkingDirectory $frontendPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $localPath 'frontend.stdout.log') -RedirectStandardError (Join-Path $localPath 'frontend.stderr.log') -PassThru
    Register-Process 'frontend' $frontendProcess $nodePath
    Wait-ForService 'frontend' $frontendProcess { Test-FrontendReady }
}
Save-ProcessState
Write-Host 'Site: http://localhost:3000/'
Write-Host 'API:  http://localhost:8000/docs'
Write-Host 'Logs and owned-process PIDs are in .local/. To stop: .\scripts\stop-dev.ps1'
