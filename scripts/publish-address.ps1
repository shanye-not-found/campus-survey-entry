param(
    [ValidateSet('started', 'stopped')][string]$State = 'started',
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$entryRoot = Split-Path -Parent $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $entryRoot 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
. (Join-Path $ProjectRoot 'scripts/network.ps1')

# 仅公开物理网卡的私有 IPv4，不上传网卡 MAC、问卷、照片或主机名。
$addresses = @()
if ($State -eq 'started') {
    if (!(Test-CampusUrl 'http://127.0.0.1:5173') -or !(Test-CampusUrl 'http://127.0.0.1:8000/api/submissions?date=1')) {
        throw 'Local services are not ready; the previous address record was preserved.'
    }
    foreach ($address in @(Get-CampusLanAddresses)) {
        $ip = [Net.IPAddress]::Parse($address.Address).GetAddressBytes()
        if ($ip[0] -eq 10 -or ($ip[0] -eq 172 -and $ip[1] -ge 16 -and $ip[1] -le 31) -or ($ip[0] -eq 192 -and $ip[1] -eq 168)) {
            $addresses += [ordered]@{ label = $address.Adapter; url = $address.Url }
        }
    }
}
$reportedState = $State
if ($State -eq 'started' -and !$addresses.Count) { $reportedState = 'unavailable' }
$record = [ordered]@{ schema_version = 1; state = $reportedState; updated_at = [DateTime]::UtcNow.ToString('o'); addresses = @($addresses) }
$recordJson = $record | ConvertTo-Json -Depth 5
if ($DryRun) { Write-Output $recordJson; return }

# 复用 Windows Git Credential Manager；凭证只驻留进程内存，不写入仓库或页面。
$oldPrompt = $env:GIT_TERMINAL_PROMPT
$oldInteractive = $env:GCM_INTERACTIVE
try {
    $env:GIT_TERMINAL_PROMPT = '0'
    $env:GCM_INTERACTIVE = 'never'
    $credentialLines = @("protocol=https`nhost=github.com`n`n" | & git credential fill 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'No noninteractive GitHub credential is available in Git Credential Manager.' }
} finally {
    $env:GIT_TERMINAL_PROMPT = $oldPrompt
    $env:GCM_INTERACTIVE = $oldInteractive
}
$credential = @{}
foreach ($line in $credentialLines) {
    $parts = $line -split '=', 2
    if ($parts.Count -eq 2) { $credential[$parts[0]] = $parts[1] }
}
if (!$credential.password) { throw 'GitHub credential is missing.' }
$headers = @{ Authorization = ('Bearer ' + $credential.password); Accept = 'application/vnd.github+json'; 'User-Agent' = 'campus-survey-entry'; 'X-GitHub-Api-Version' = '2022-11-28' }
$uri = 'https://api.github.com/repos/' + $config.owner + '/' + $config.repository + '/contents/address.json'
$content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($recordJson))
$published = $false
try {
    # 冲突时重新读取 SHA；短暂断网不会影响本机服务。
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            $current = Invoke-RestMethod -Uri ($uri + '?ref=' + $config.status_branch) -Headers $headers -TimeoutSec 10
            $payload = @{ message = ('Report service ' + $reportedState); content = $content; sha = $current.sha; branch = $config.status_branch } | ConvertTo-Json
            $null = Invoke-RestMethod -Method Put -Uri $uri -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($payload)) -TimeoutSec 10
            $published = $true
            break
        } catch {
            $status = 0
            if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
            if ($attempt -eq 3 -or ($status -ne 0 -and $status -ne 409 -and $status -ne 429 -and $status -lt 500)) {
                throw ('GitHub address update failed (HTTP ' + $status + '). Check network and repository write access.')
            }
            Start-Sleep -Seconds $attempt
        }
    }
} finally {
    $credential.Clear()
    $credentialLines = $null
    $headers.Authorization = $null
}
if (!$published) { throw 'GitHub address update did not complete.' }
Write-Output ('Fixed entry updated: https://' + $config.owner + '.github.io/' + $config.repository + '/')
