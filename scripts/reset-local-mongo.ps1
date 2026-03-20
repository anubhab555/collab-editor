. (Join-Path $PSScriptRoot "local-mongo-common.ps1")

$repoRoot = Get-CollabEditorRepoRoot
$dataPath = Get-LocalMongoDataPath
$logPath = Get-LocalMongoLogPath
$legacyMongoRoot = Get-LegacyRepoLocalMongoRoot
$mongoService = Get-MongoDbWindowsService

if (Test-MongoDbWindowsServiceRunning) {
    Write-Host "MongoDB Windows service is running." -ForegroundColor Yellow
    Write-Host "File-based reset is only meant for the repo-managed local mongod process."
    Write-Host "If you want a clean app database while using the service, drop the 'collab-editor' database from MongoDB Compass or stop the service with admin rights first."
    exit 1
}

Stop-LocalMongoProcess | Out-Null

if (Test-Path $dataPath) {
    Remove-Item -Recurse -Force $dataPath
}

New-Item -ItemType Directory -Force -Path $dataPath | Out-Null

if (Test-Path $logPath) {
    Remove-Item -Force $logPath
}

if (Test-Path $legacyMongoRoot) {
    Remove-Item -Recurse -Force $legacyMongoRoot
}

Write-Host "Local MongoDB data reset completed." -ForegroundColor Green
Write-Host "Data path: $dataPath"
Write-Host "Log path cleared: $logPath"
