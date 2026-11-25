$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repoRoot
if (!(Test-Path -LiteralPath '.next/BUILD_ID')) { throw '请先运行 npm run build' }
$node = (Get-Command node).Source
$dataRoot = & $node --env-file-if-exists=.env.local -e "console.log(require('node:path').resolve(process.env.DATA_DIR || 'data'))"
if ($LASTEXITCODE -ne 0) { throw '读取数据目录失败' }
$metadata = Join-Path $dataRoot 'services/current.json'
if (Test-Path -LiteralPath (Join-Path $dataRoot 'zipvoice/service.json')) {
    try { & (Join-Path $PSScriptRoot 'start-zipvoice.ps1') } catch { Write-Warning '本地 ZipVoice 未能启动。网页和云端配音仍会启动；请检查 ZipVoice 日志。' }
}
$saved = $null
if (Test-Path -LiteralPath $metadata) { $saved = Get-Content -Raw -LiteralPath $metadata | ConvertFrom-Json }
function Find-OwnedProcess($processId, $pattern) {
    if (!$saved -or $saved.workingDirectory -ne $repoRoot -or !$processId) { return $null }
    $record = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
    if ($record -and $record.CommandLine -match $pattern -and $record.ExecutablePath -eq $node) { return Get-Process -Id $processId }
    return $null
}
$web = if ($saved) { Find-OwnedProcess $saved.webPid 'node_modules/next/dist/bin/next' } else { $null }
$worker = if ($saved) { Find-OwnedProcess $saved.workerPid 'src/worker/index.ts' } else { $null }
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener -and (!$web -or $listener.OwningProcess -notcontains $web.Id)) { throw '3000 端口被其他进程占用，未改动任何已有服务' }
$serviceRoot = Join-Path $dataRoot ('services/' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $serviceRoot -Force | Out-Null
if (!$env:REMOTION_BROWSER_EXECUTABLE -and (Test-Path -LiteralPath 'C:/Program Files/Google/Chrome/Application/chrome.exe')) { $env:REMOTION_BROWSER_EXECUTABLE = 'C:/Program Files/Google/Chrome/Application/chrome.exe' }
$newChildren = @()
try {
    if (!$web) {
        $web = Start-Process -FilePath $node -ArgumentList @('--env-file-if-exists=.env.local','node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3000') -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $serviceRoot 'web.log') -RedirectStandardError (Join-Path $serviceRoot 'web-error.log')
        $newChildren += $web
    }
    if (!$worker) {
        $worker = Start-Process -FilePath $node -ArgumentList @('--env-file-if-exists=.env.local','src/worker/index.ts') -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $serviceRoot 'worker.log') -RedirectStandardError (Join-Path $serviceRoot 'worker-error.log')
        $newChildren += $worker
    }
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        if ($web.HasExited -or $worker.HasExited) { throw "服务启动失败，请查看 $serviceRoot" }
        try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000' -TimeoutSec 1 } catch { continue }
        if ($response.StatusCode -eq 200) {
            @{ startedAt = (Get-Date).ToString('o'); url = 'http://127.0.0.1:3000'; webPid = $web.Id; workerPid = $worker.Id; logDirectory = $serviceRoot; workingDirectory = $repoRoot } | ConvertTo-Json | Set-Content -LiteralPath $metadata -Encoding utf8
            Write-Output '网页与后台已就绪：http://127.0.0.1:3000'; exit 0
        }
    }
    throw "网页健康检查超时，请查看 $serviceRoot"
} catch {
    foreach ($child in $newChildren) { if (!$child.HasExited) { Stop-Process -Id $child.Id -ErrorAction SilentlyContinue } }
    throw
}
