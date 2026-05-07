# PTO Site silent launcher.
# Запускает vite dev-сервер в фоне без видимого окна и открывает браузер,
# когда порт 8001 начинает слушать. При повторном запуске — просто открывает
# браузер, не поднимая второй сервер.

$ErrorActionPreference = 'Stop'

function Show-Error([string]$message) {
    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
        [System.Windows.Forms.MessageBox]::Show(
            $message, 'PTO Site',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
    } catch {
        $shell = New-Object -ComObject WScript.Shell
        $shell.Popup($message, 0, 'PTO Site', 48) | Out-Null
    }
}

function Test-PortOpen([string]$listenHost, [int]$port) {
    $client = $null
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $iar = $client.BeginConnect($listenHost, $port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(500, $false)
        if (-not $ok) { return $false }
        $client.EndConnect($iar)
        return $true
    } catch {
        return $false
    } finally {
        if ($client) { $client.Close() }
    }
}

$root      = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend  = Join-Path $root 'web\frontend'
$npm       = 'C:\Program Files\nodejs\npm.cmd'
$listenHost = '127.0.0.1'
$port      = 8001
$url       = "http://${listenHost}:${port}/"
$log       = Join-Path $frontend '.pto-site-dev.log'

if (Test-PortOpen $listenHost $port) {
    Start-Process $url | Out-Null
    return
}

if (-not (Test-Path (Join-Path $frontend 'package.json'))) {
    Show-Error "Не найден package.json:`r`n$frontend"
    exit 1
}
if (-not (Test-Path $npm)) {
    Show-Error "Не найден npm:`r`n$npm"
    exit 1
}

if (Test-Path $log) {
    try { Remove-Item $log -Force -ErrorAction SilentlyContinue } catch {}
}

if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    try {
        Start-Process -FilePath $npm `
            -ArgumentList 'install' `
            -WorkingDirectory $frontend `
            -WindowStyle Hidden `
            -Wait `
            -RedirectStandardOutput $log `
            -RedirectStandardError "$log.err" | Out-Null
    } catch {
        Show-Error "Сбой 'npm install'.`r`nЛог: $log"
        exit 1
    }
}

try {
    Start-Process -FilePath $npm `
        -ArgumentList 'run','dev','--','--host',$listenHost,'--port',"$port" `
        -WorkingDirectory $frontend `
        -WindowStyle Hidden `
        -RedirectStandardOutput $log `
        -RedirectStandardError "$log.err" | Out-Null
} catch {
    Show-Error "Не удалось запустить 'npm run dev'.`r`nЛог: $log"
    exit 1
}

$timeoutSec = 120
$elapsed    = 0
$ready      = $false
while ($elapsed -lt $timeoutSec) {
    if (Test-PortOpen $listenHost $port) { $ready = $true; break }
    Start-Sleep -Seconds 1
    $elapsed++
}

if ($ready) {
    Start-Process $url | Out-Null
} else {
    Show-Error "Сервер не успел стартовать за $timeoutSec сек.`r`nСм. лог:`r`n$log"
    exit 1
}
