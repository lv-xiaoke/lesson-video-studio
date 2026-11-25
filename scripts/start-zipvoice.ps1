param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'zipvoice-process.ps1')
Set-Location -LiteralPath $repoRoot
$configuredDataRoot = & node --env-file-if-exists=.env.local -e "console.log(require('node:path').resolve(process.env.DATA_DIR || 'data'))"
if ($LASTEXITCODE -ne 0) { throw '读取数据目录失败' }
$zipvoiceRoot = Join-Path $configuredDataRoot 'zipvoice'
$python = Join-Path $zipvoiceRoot 'runtime/Scripts/python.exe'
$configPath = Join-Path $zipvoiceRoot 'service.json'
if (!(Test-Path -LiteralPath $python) -or !(Test-Path -LiteralPath $configPath)) { throw '请先运行 python scripts/setup-zipvoice.py' }
$config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
if ($Restart) {
    & node --env-file-if-exists=.env.local (Join-Path $PSScriptRoot 'check-local-queues.mjs')
    if ($LASTEXITCODE -ne 0) { throw '仍有任务等待或运行，请完成后再重启本地引擎' }
    $processFile = Join-Path $zipvoiceRoot 'process.json'
    if (Test-Path -LiteralPath $processFile) {
        $metadata = Get-Content -Raw -LiteralPath $processFile | ConvertFrom-Json
        $allProcesses = Get-CimInstance Win32_Process
        $parent = $allProcesses | Where-Object ProcessId -eq $metadata.pid
        $expectedScript = Join-Path $repoRoot 'tools/zipvoice/server.py'
        if ($parent) {
            $sidResult = Invoke-CimMethod -InputObject $parent -MethodName GetOwnerSid
            $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
            if (!(Test-ZipvoiceIdentity $parent $metadata $expectedScript $configPath $python $sidResult.Sid $currentSid)) { throw '本地引擎进程身份不匹配，未结束任何进程' }
        }
        if ($parent) {
            $owned = @($parent); $level = @($parent.ProcessId)
            while ($level.Count) { $next = @($allProcesses | Where-Object { $level -contains $_.ParentProcessId }); $owned += $next; $level = @($next | ForEach-Object ProcessId) }
            [array]::Reverse($owned)
            foreach ($item in $owned) {
                if ($item.ExecutablePath -and (Split-Path $item.ExecutablePath -Leaf) -eq 'python.exe') { Stop-Process -Id $item.ProcessId -ErrorAction SilentlyContinue }
            }
        }
    }
}
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$($config.port)/health" -Headers @{ Authorization = "Bearer $($config.token)" } -TimeoutSec 2
    if ($health.ready) { Write-Output 'ZipVoice 已在运行'; exit 0 }
} catch {}
if (Get-NetTCPConnection -LocalPort $config.port -State Listen -ErrorAction SilentlyContinue) { throw 'ZipVoice 端口已被占用，请检查运行程序' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$serverPath = Join-Path $repoRoot 'tools/zipvoice/server.py'
$process = Start-Process -FilePath $python -ArgumentList @('-u', "`"$serverPath`"", "`"$configPath`"") -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $zipvoiceRoot "$stamp.out.log") -RedirectStandardError (Join-Path $zipvoiceRoot "$stamp.err.log")
$created = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
@{ pid = $process.Id; script = $serverPath; configPath = $configPath; processCreatedAt = $created.CreationDate.ToUniversalTime().ToString('o'); startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $zipvoiceRoot 'process.json')
for ($attempt = 0; $attempt -lt 120; $attempt++) {
    Start-Sleep -Seconds 1
    if ($process.HasExited) { throw "ZipVoice 启动失败，请查看 data/zipvoice/$stamp.err.log" }
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$($config.port)/health" -Headers @{ Authorization = "Bearer $($config.token)" } -TimeoutSec 1
        if ($health.ready) { Write-Output "ZipVoice 已启动，模型加载 $($health.loadSeconds) 秒"; exit 0 }
    } catch {}
}
throw 'ZipVoice 健康检查超时，请查看 data/zipvoice 日志'
