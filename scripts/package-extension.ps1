param()
$ErrorActionPreference = 'Stop'
$workspacePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$extensionPath = Join-Path $workspacePath 'browser-extension'
$manifest = Get-Content -LiteralPath (Join-Path $extensionPath 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.manifest_version -ne 3 -or $manifest.version -ne '0.6.0') { throw 'Expected offline Manifest V3 version 0.6.0.' }
$fileNames = @('manifest.json','background.js','collector-engine.js','extractor.js','popup.html','popup.js','popup.css','README.md','export-format.md','export-schema.json','example-export.json')
$filePaths = @($fileNames | ForEach-Object {
    $filePath = Join-Path $extensionPath $_
    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) { throw "Missing extension file: $_" }
    $filePath
})
$archivePath = Join-Path $extensionPath "cenoskop-collector-v$($manifest.version).zip"
Compress-Archive -LiteralPath $filePaths -DestinationPath $archivePath -Force
$archive = Get-Item -LiteralPath $archivePath
[PSCustomObject]@{ Archive = $archive.FullName; Bytes = $archive.Length; SHA256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash }
