. (Join-Path $PSScriptRoot "local-mongo-common.ps1")

$listener = Get-LocalMongoListener
$lockProcess = Get-LocalMongoLockProcess
$dataPath = Get-LocalMongoDataPath
$logPath = Get-LocalMongoLogPath
$mongoService = Get-MongoDbWindowsService

if (Test-MongoDbWindowsServiceRunning) {
    Write-Host "MongoDB Windows service is running." -ForegroundColor Green
    Write-Host "Service: $($mongoService.DisplayName)"
    Write-Host "Start type: $($mongoService.StartType)"
    Write-Host "Connection string: $(Get-LocalMongoUri)"
    exit 0
}

if (-not $listener) {
    if ($lockProcess) {
        Write-Host "A local mongod process is holding the repo data lock but is not listening on 127.0.0.1:$(Get-LocalMongoPort)." -ForegroundColor Yellow
        Write-Host "PID: $($lockProcess.Id)"
        Write-Host "Recommended fix: npm run mongo:stop"
    } else {
        Write-Host "MongoDB is not listening on 127.0.0.1:$(Get-LocalMongoPort)." -ForegroundColor Yellow
    }

    Write-Host "Data path: $dataPath"
    Write-Host "Log path:  $logPath"
    exit 1
}

$process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
$processName = if ($process) { $process.ProcessName } else { "unknown" }

Write-Host "MongoDB is running on 127.0.0.1:$(Get-LocalMongoPort)." -ForegroundColor Green
Write-Host "PID: $($listener.OwningProcess)"
Write-Host "Process: $processName"
Write-Host "Data path: $dataPath"
Write-Host "Log path:  $logPath"
Write-Host "Connection string: $(Get-LocalMongoUri)"
