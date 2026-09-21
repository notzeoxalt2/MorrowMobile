$files = Get-ChildItem -Path 'e:\AntiGravity\StreamVault\composeApp\src' -Filter '*.kt' -Recurse

$count = 0
foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    if ($content.Contains('com.nuvio.app')) {
        $newContent = $content.Replace('com.nuvio.app', 'com.streamvault.app')
        [System.IO.File]::WriteAllText($file.FullName, $newContent, [System.Text.Encoding]::UTF8)
        $count++
        Write-Host "Fixed: $($file.Name)"
    }
}

Write-Host "Total files fixed: $count"
