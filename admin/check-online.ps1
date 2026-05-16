param(
    [string]$ApiUrl,
    [switch]$StrictPhoto
)

$ErrorActionPreference = "Stop"
if ($ApiUrl.EndsWith("/")) { $ApiUrl = $ApiUrl.TrimEnd("/") }

$healthUrl = "$ApiUrl/api/health"
$crewUrl = "$ApiUrl/api/crew/isolators"

Write-Host "Proverka: $healthUrl"
$r = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 90
$j = $r.Content | ConvertFrom-Json
Write-Host "OK health:" $r.Content

if ($j.PSObject.Properties.Name -contains "photoStorage") {
    Write-Host ""
    Write-Host "Foto v oblake (photoStorage):" $j.photoStorage
    if ($j.photoStorage -eq "disabled") {
        Write-Host 'Podskazka: admin\setup-photo-storage.bat -> Environment na Render -> Manual Deploy'
        if ($StrictPhoto) {
            Write-Host "STRICT: photoStorage ne ok"
            exit 2
        }
    }
} else {
    Write-Host ""
    Write-Host 'WARN: v otvete /api/health net polya photoStorage - staryj backend. Nuzhen Manual Deploy na Render.'
    if ($StrictPhoto) { exit 2 }
}

Write-Host ""
Write-Host "Proverka marshruta uchastnikov: $crewUrl"
try {
    Invoke-WebRequest -Uri $crewUrl -UseBasicParsing -TimeoutSec 30 | Out-Null
    Write-Host 'WARN: /api/crew/isolators otvetil bez avtorizacii, ozhidalos 401'
} catch {
    $resp = $_.Exception.Response
    if ($null -eq $resp) { throw }
    $code = [int]$resp.StatusCode
    if ($code -eq 401) {
        Write-Host 'OK: /api/crew/isolators est na servere, 401 bez tokena'
    } elseif ($code -eq 404) {
        Write-Host 'OSHIBKA: /api/crew/isolators -> 404. Nuzhen Manual Deploy pto-backend na Render.'
        exit 1
    } else {
        Write-Host "INFO: /api/crew/isolators -> HTTP $code"
    }
}

Write-Host ""
Write-Host "Vse proverki proydeny."
