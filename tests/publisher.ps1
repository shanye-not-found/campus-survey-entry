$ErrorActionPreference = 'Stop'
$entryRoot = Split-Path -Parent $PSScriptRoot
$fixtureRoot = Join-Path $entryRoot '.runtime/publisher-fixture'
$null = New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'scripts') -Force
@'
function Get-CampusLanAddresses { return $global:FixtureAddresses }
function Test-CampusUrl { param([string]$Url); return $global:FixtureReady }
'@ | Set-Content -LiteralPath (Join-Path $fixtureRoot 'scripts/network.ps1') -Encoding UTF8
$global:FixtureAddresses = @(
    [PSCustomObject]@{ Adapter = 'WLAN'; Address = '10.31.94.172'; Url = 'http://10.31.94.172:5173' },
    [PSCustomObject]@{ Adapter = 'public'; Address = '8.8.8.8'; Url = 'http://8.8.8.8:5173' }
)
$global:FixtureReady = $true
$global:FixtureFailure = $false
$global:FixtureWrites = 0
$global:FixtureLastRecord = $null
function global:git {
    $global:LASTEXITCODE = 0
    'protocol=https'
    'host=github.com'
    'password=publisher-fixture-only'
}
function global:Invoke-RestMethod {
    param($Uri, $Headers, $Method = 'Get', $TimeoutSec, $ContentType, $Body)
    if (!$Uri.StartsWith('https://api.github.com/repos/shanye-not-found/campus-survey-entry/contents/address.json')) { throw 'Unexpected destination' }
    if ($Method -eq 'Put') {
        $global:FixtureWrites++
        if ($global:FixtureFailure) { throw 'Simulated network outage' }
        $payload = [Text.Encoding]::UTF8.GetString($Body) | ConvertFrom-Json
        $global:FixtureLastRecord = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload.content)) | ConvertFrom-Json
        return @{ content = @{ sha = 'written' } }
    }
    return @{ sha = 'current' }
}
$publisher = Join-Path $entryRoot 'scripts/publish-address.ps1'
& $publisher -ProjectRoot $fixtureRoot -State started
if ($global:FixtureLastRecord.state -ne 'started' -or @($global:FixtureLastRecord.addresses).Count -ne 1 -or $global:FixtureLastRecord.addresses[0].url -ne 'http://10.31.94.172:5173') { throw 'Started publication or public IP filtering failed' }
Write-Output 'PASS: started record contains only private LAN address'
& $publisher -ProjectRoot $fixtureRoot -State stopped
if ($global:FixtureLastRecord.state -ne 'stopped' -or @($global:FixtureLastRecord.addresses).Count -ne 0) { throw 'Stopped publication failed' }
Write-Output 'PASS: stopped record clears links'
$global:FixtureAddresses = @()
& $publisher -ProjectRoot $fixtureRoot -State started
if ($global:FixtureLastRecord.state -ne 'unavailable') { throw 'Missing NIC handling failed' }
Write-Output 'PASS: missing NIC reports unavailable'
$global:FixtureReady = $false
$caught = $false
try { & $publisher -ProjectRoot $fixtureRoot -State started } catch { $caught = $true }
if (!$caught -or $global:FixtureWrites -ne 3) { throw 'Unready services were incorrectly published' }
Write-Output 'PASS: startup readiness checked before writes'
$global:FixtureReady = $true
$global:FixtureFailure = $true
$caught = $false
try { & $publisher -ProjectRoot $fixtureRoot -State stopped } catch { $caught = $true }
if (!$caught -or $global:FixtureWrites -ne 6) { throw 'Network retry limit failed' }
Write-Output 'PASS: publication failures stop after three attempts'
