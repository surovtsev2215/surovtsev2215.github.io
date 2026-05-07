# Creates Golden Section icon and desktop shortcut without console window.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$item = Get-ChildItem -Path $root -Recurse -Filter 'Golden Section.pyw' -File -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $item) {
    $item = Get-ChildItem -Path $root -Recurse -Filter '*.pyw' -File -ErrorAction SilentlyContinue | Select-Object -First 1
}
if (-not $item) { Write-Error 'No .pyw launcher found under repo root.' }
$pywScript = $item.FullName
$hub = $item.DirectoryName
$icoFromLauncher = $pywScript -replace '\.pyw$', '.ico'
$icoLegacy = Join-Path $hub 'ПТО.ico'
$ico = $icoFromLauncher
if (-not (Test-Path -LiteralPath $ico) -and (Test-Path -LiteralPath $icoLegacy)) {
    $ico = $icoLegacy
}
$pngUrl = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f6e0.png'

if (-not (Test-Path $ico)) {
    $tmpPng = Join-Path $env:TEMP ('pto_twemoji_' + [Guid]::NewGuid().ToString('n') + '.png')
    try {
        Invoke-WebRequest -Uri $pngUrl -OutFile $tmpPng -UseBasicParsing
        Add-Type -AssemblyName System.Drawing
        $bmp = [System.Drawing.Bitmap]::FromFile($tmpPng)
        try {
            $hIcon = $bmp.GetHicon()
            $icon = [System.Drawing.Icon]::FromHandle($hIcon)
            $fs = [System.IO.File]::Create($ico)
            try { $icon.Save($fs) } finally { $fs.Dispose() }
            $icon.Dispose()
            $destroyIconMethod = [System.Runtime.InteropServices.Marshal].GetMethod('DestroyIcon')
            if ($destroyIconMethod) {
                [void]$destroyIconMethod.Invoke($null, @($hIcon))
            }
        } finally {
            $bmp.Dispose()
        }
    } finally {
        Remove-Item $tmpPng -Force -ErrorAction SilentlyContinue
    }
}

$target = ''
$argStr = ''
if (Test-Path 'C:\Windows\pyw.exe') {
    $target = 'C:\Windows\pyw.exe'
    $argStr = '-3 "' + $pywScript + '"'
} else {
    $pythonw = $null
    $c = Get-Command 'pythonw.exe' -ErrorAction SilentlyContinue
    if ($c -and $c.Source) { $pythonw = $c.Source }
    if (-not $pythonw) {
        foreach ($ver in @('314', '313', '312', '311')) {
            $p = Join-Path $env:LOCALAPPDATA "Programs\Python\Python$ver\pythonw.exe"
            if (Test-Path $p) { $pythonw = $p; break }
        }
    }
    if ($pythonw) {
        $target = $pythonw
        $argStr = '"' + $pywScript + '"'
    } else {
        $target = $pywScript
        $argStr = ''
    }
}

$lnkBase = 'Golden Section.lnk'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop $lnkBase
$oldLnkBase = ([char]0x041F).ToString() + ([char]0x0422).ToString() + ([char]0x041E).ToString() + '.lnk'
$oldDesktopPath = Join-Path $desktop $oldLnkBase
if (Test-Path -LiteralPath $oldDesktopPath) {
    Remove-Item -LiteralPath $oldDesktopPath -Force -ErrorAction SilentlyContinue
}
$W = New-Object -ComObject WScript.Shell
$S = $W.CreateShortcut($lnkPath)
$S.TargetPath = $target
$S.Arguments = $argStr
$S.WorkingDirectory = $hub
$S.Description = 'Golden Section utilities hub'
if (Test-Path $ico) { $S.IconLocation = $ico + ',0' }
$S.Save()
Write-Host "Shortcut (desktop): $lnkPath"

$hubLnkPath = Join-Path $hub $lnkBase
$oldHubPath = Join-Path $hub $oldLnkBase
if (Test-Path -LiteralPath $oldHubPath) {
    Remove-Item -LiteralPath $oldHubPath -Force -ErrorAction SilentlyContinue
}
$S2 = $W.CreateShortcut($hubLnkPath)
$S2.TargetPath = $target
$S2.Arguments = $argStr
$S2.WorkingDirectory = $hub
$S2.Description = 'Golden Section utilities hub'
if (Test-Path -LiteralPath $ico) { $S2.IconLocation = $ico + ',0' }
$S2.Save()
Write-Host "Shortcut (hub folder): $hubLnkPath"
