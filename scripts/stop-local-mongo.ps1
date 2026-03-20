. (Join-Path $PSScriptRoot "local-mongo-common.ps1")

$mongoService = Get-MongoDbWindowsService

if (Test-MongoDbWindowsServiceRunning) {
    Write-Host "MongoDB Windows service is running." -ForegroundColor Yellow
    Write-Host "The helper stop script does not stop service-managed MongoDB."
    Write-Host "If you really want to stop it, use Services or an elevated PowerShell session."
    exit 1
}

$stopped = Stop-LocalMongoProcess

if (-not $stopped) {
    Write-Host "MongoDB is not running on 127.0.0.1:$(Get-LocalMongoPort) and no local repo lock holder was found."
    exit 0
}

Write-Host "Stopped local MongoDB." -ForegroundColor Green
