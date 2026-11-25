function Test-ZipvoiceIdentity($record, $metadata, $expectedScript, $expectedConfig, $expectedPython, $ownerSid, $expectedSid) {
    if (!$record -or !$metadata -or $ownerSid -ne $expectedSid -or !$expectedSid) { return $false }
    if ($record.ExecutablePath -ne $expectedPython -or $metadata.script -ne $expectedScript) { return $false }
    $command = $record.CommandLine.Replace('/', '\')
    if (!$command.Contains('"' + $expectedScript.Replace('/', '\') + '"') -or !$command.Contains('"' + $expectedConfig.Replace('/', '\') + '"')) { return $false }
    if ($metadata.configPath -and $metadata.configPath -ne $expectedConfig) { return $false }
    try {
        $timestamp = if ($metadata.processCreatedAt) { $metadata.processCreatedAt } else { $metadata.startedAt }
        # Newer PowerShell versions can deserialize an ISO timestamp directly to DateTime.
        $expectedUtc = if ($timestamp -is [datetime]) { $timestamp.ToUniversalTime() } else { ([datetimeoffset]::Parse($timestamp)).UtcDateTime }
        $difference = [math]::Abs(($record.CreationDate.ToUniversalTime() - $expectedUtc).TotalSeconds)
        $tolerance = if ($metadata.processCreatedAt) { 0.1 } else { 5 }
        return $difference -lt $tolerance
    } catch { return $false }
}
