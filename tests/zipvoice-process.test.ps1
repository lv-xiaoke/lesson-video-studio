$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../scripts/zipvoice-process.ps1')
$scriptPath = 'D:\repo\tools\zipvoice\server.py'
$configPath = 'D:\repo\data\zipvoice\service.json'
$python = 'D:\repo\data\zipvoice\runtime\Scripts\python.exe'
$now = [datetime]::UtcNow
$metadata = [pscustomobject]@{ script=$scriptPath; startedAt=$now.ToString('o') }
$record = [pscustomobject]@{ CommandLine="`"$python`" -u `"$scriptPath`" `"$configPath`""; ExecutablePath=$python; CreationDate=$now }
if (!(Test-ZipvoiceIdentity $record $metadata $scriptPath $configPath $python 'owner' 'owner')) { throw 'Owned process should match' }
if (Test-ZipvoiceIdentity $record $metadata $scriptPath 'D:\other\service.json' $python 'owner' 'owner') { throw 'Different config must never match' }
if (Test-ZipvoiceIdentity $record $metadata $scriptPath $configPath $python 'other-owner' 'owner') { throw 'Different owner must never match' }
$precise = [datetime]::new(2026, 11, 25, 7, 14, 1, 749, [DateTimeKind]::Utc)
$metadata | Add-Member -NotePropertyName processCreatedAt -NotePropertyValue $precise
$record.CreationDate = $precise
if (!(Test-ZipvoiceIdentity $record $metadata $scriptPath $configPath $python 'owner' 'owner')) { throw 'Timestamps parsed as DateTime must retain their precision' }
$record.CreationDate = $now.AddMinutes(1)
if (Test-ZipvoiceIdentity $record $metadata $scriptPath $configPath $python 'owner' 'owner') { throw 'Reused PID creation mismatch must never match' }
Write-Output 'Process identity checks passed'
