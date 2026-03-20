Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-CollabEditorRepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-LegacyRepoLocalMongoRoot {
    return (Join-Path (Get-CollabEditorRepoRoot) ".local\mongo")
}

function Get-LocalMongoBasePath {
    return (Join-Path $env:LOCALAPPDATA "collab-editor\mongo")
}

function Get-LocalMongoDataPath {
    return (Join-Path (Get-LocalMongoBasePath) "data")
}

function Get-LocalMongoLockFilePath {
    return (Join-Path (Get-LocalMongoDataPath) "mongod.lock")
}

function Get-LocalMongoLogPath {
    return (Join-Path $env:TEMP "collab-editor-mongod.log")
}

function Get-LocalMongoPort {
    return 27017
}

function Get-LocalMongoUri {
    return "mongodb://127.0.0.1:27017/collab-editor"
}

function Get-MongodPath {
    if ($env:MONGOD_PATH -and (Test-Path $env:MONGOD_PATH)) {
        return (Resolve-Path $env:MONGOD_PATH).Path
    }

    $candidates = Get-ChildItem -Path "C:\Program Files\MongoDB\Server" -Filter "mongod.exe" -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending

    if (-not $candidates) {
        throw "Could not find mongod.exe. Install MongoDB Community Server or set MONGOD_PATH to the full mongod.exe path."
    }

    return $candidates[0].FullName
}

function Get-MongoDbWindowsService {
    return Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
}

function Test-MongoDbWindowsServiceRunning {
    $mongoService = Get-MongoDbWindowsService

    return ($mongoService -and $mongoService.Status -eq "Running")
}

function Get-LocalMongoListener {
    $port = Get-LocalMongoPort

    return Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
}

function Get-LocalMongoLockProcess {
    $lockFilePath = Get-LocalMongoLockFilePath

    if (-not (Test-Path $lockFilePath)) {
        return $null
    }

    $lockFileContent = (Get-Content $lockFilePath -ErrorAction SilentlyContinue | Select-Object -First 1)

    if (-not $lockFileContent) {
        return $null
    }

    $lockPid = 0
    $parsedSuccessfully = [int]::TryParse($lockFileContent.Trim(), [ref]$lockPid)

    if (-not $parsedSuccessfully -or $lockPid -le 0) {
        return $null
    }

    $process = Get-Process -Id $lockPid -ErrorAction SilentlyContinue

    if (-not $process -or $process.ProcessName -ne "mongod") {
        return $null
    }

    return $process
}

function Stop-LocalMongoProcess {
    $listener = Get-LocalMongoListener
    $process = $null

    if ($listener) {
        $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    }

    if (-not $process) {
        $process = Get-LocalMongoLockProcess
    }

    if (-not $process) {
        return $false
    }

    if ($process.ProcessName -ne "mongod") {
        throw "Refusing to stop non-mongod process $($process.Id)."
    }

    Stop-Process -Id $process.Id -Force
    Start-Sleep -Milliseconds 500
    return $true
}

function Wait-ForLocalMongo {
    param(
        [int]$TimeoutMs = 6000
    )

    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)

    while ([DateTime]::UtcNow -lt $deadline) {
        if ((Get-LocalMongoListener) -or (Get-LocalMongoLockProcess)) {
            return $true
        }

        Start-Sleep -Milliseconds 250
    }

    return $false
}
