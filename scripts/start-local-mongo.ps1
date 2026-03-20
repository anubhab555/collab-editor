. (Join-Path $PSScriptRoot "local-mongo-common.ps1")

$repoRoot = Get-CollabEditorRepoRoot
$dataPath = Get-LocalMongoDataPath
$logPath = Get-LocalMongoLogPath
$port = Get-LocalMongoPort
$mongoService = Get-MongoDbWindowsService

if (Test-MongoDbWindowsServiceRunning) {
    Write-Host "MongoDB Windows service is already running on this machine." -ForegroundColor Green
    Write-Host "You do not need to start a repo-managed mongod process."
    Write-Host "Service: $($mongoService.DisplayName)"
    Write-Host "Connection string: $(Get-LocalMongoUri)"
    exit 0
}

$listener = Get-LocalMongoListener

if ($listener) {
    $existingProcess = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    $processName = if ($existingProcess) { $existingProcess.ProcessName } else { "unknown" }

    Write-Host "MongoDB is already running on 127.0.0.1:$port (PID $($listener.OwningProcess), process $processName)."
    Write-Host "Data path: $dataPath"
    Write-Host "Log path:  $logPath"
    Write-Host "Connection string: $(Get-LocalMongoUri)"
    exit 0
}

$lockProcess = Get-LocalMongoLockProcess

if ($lockProcess) {
    Write-Host "Found a stale local mongod process holding the data directory lock (PID $($lockProcess.Id)). Cleaning it up first..." -ForegroundColor Yellow
    Stop-LocalMongoProcess | Out-Null
}

New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
$mongodPath = Get-MongodPath

$process = Start-Process -FilePath $mongodPath `
    -ArgumentList @(
        "--dbpath", $dataPath,
        "--logpath", $logPath,
        "--logappend",
        "--bind_ip", "127.0.0.1",
        "--port", "$port"
    ) `
    -PassThru `
    -WindowStyle Hidden

if (-not (Wait-ForLocalMongo)) {
    Write-Host "MongoDB did not start successfully. Check the log below:" -ForegroundColor Red

    if (Test-Path $logPath) {
        Get-Content $logPath -Tail 40
    }

    throw "MongoDB failed to start."
}

Write-Host "MongoDB started in the background." -ForegroundColor Green
Write-Host "PID: $($process.Id)"
Write-Host "Data path: $dataPath"
Write-Host "Log path:  $logPath"
Write-Host "Connection string: $(Get-LocalMongoUri)"
Write-Host "You can stop it later with: npm run mongo:stop"
