param()

$root = 'e:\AntiGravity\StreamVault'

function ReplaceInFile($path, $replacements) {
    if (!(Test-Path $path)) { return }
    $content = Get-Content $path -Raw -Encoding UTF8
    $changed = $false
    foreach ($pair in $replacements) {
        $newContent = $content -replace [regex]::Escape($pair[0]), $pair[1]
        if ($newContent -ne $content) { $changed = $true; $content = $newContent }
    }
    if ($changed) {
        Set-Content $path $content -Encoding UTF8 -NoNewline
        Write-Host "  UPDATED: $path"
    }
}

function ReplaceRegexInFile($path, $pattern, $replacement) {
    if (!(Test-Path $path)) { return }
    $content = Get-Content $path -Raw -Encoding UTF8
    $newContent = $content -replace $pattern, $replacement
    if ($newContent -ne $content) {
        Set-Content $path $newContent -Encoding UTF8 -NoNewline
        Write-Host "  UPDATED: $path"
    }
}

Write-Host "=== Phase 1: Gradle files ==="

# settings.gradle.kts
ReplaceInFile "$root\settings.gradle.kts" @(
    @('rootProject.name = "Nuvio"', 'rootProject.name = "StreamVault"')
)

# androidApp/build.gradle.kts
ReplaceInFile "$root\androidApp\build.gradle.kts" @(
    @('com.nuvio.app', 'com.streamvault.app'),
    @('com.nuvio.android', 'com.streamvault.android'),
    @('com.nuviodebug.com', 'com.streamvault.debug'),
    @('nuvio.app.versionName', 'streamvault.app.versionName'),
    @('NUVIO_RELEASE_STORE_FILE', 'STREAMVAULT_RELEASE_STORE_FILE'),
    @('NUVIO_RELEASE_STORE_PASSWORD', 'STREAMVAULT_RELEASE_STORE_PASSWORD'),
    @('NUVIO_RELEASE_KEY_ALIAS', 'STREAMVAULT_RELEASE_KEY_ALIAS'),
    @('NUVIO_RELEASE_KEY_PASSWORD', 'STREAMVAULT_RELEASE_KEY_PASSWORD')
)

Write-Host "=== Phase 2: AndroidManifest files ==="

# Collect all AndroidManifest files
Get-ChildItem -Path "$root\androidApp\src" -Filter "AndroidManifest.xml" -Recurse | ForEach-Object {
    ReplaceInFile $_.FullName @(
        @('com.nuvio.app', 'com.streamvault.app'),
        @('Theme.Nuvio', 'Theme.StreamVault'),
        @('android:scheme="nuvio"', 'android:scheme="streamvault"')
    )
}

Write-Host "=== Phase 3: Kotlin source files ==="

$ktFiles = Get-ChildItem -Path "$root\composeApp\src" -Filter "*.kt" -Recurse
$ktFiles += Get-ChildItem -Path "$root\androidApp\src" -Filter "*.kt" -Recurse

foreach ($f in $ktFiles) {
    ReplaceInFile $f.FullName @(
        @('package com.nuvio.app', 'package com.streamvault.app'),
        @('import com.nuvio.app', 'import com.streamvault.app'),
        @('com.nuvio.android', 'com.streamvault.android'),
        @('nuvio.composeapp', 'streamvault.composeapp')
    )
}

Write-Host "=== Phase 4: composeApp build.gradle.kts ==="

$composeBuild = "$root\composeApp\build.gradle.kts"
if (Test-Path $composeBuild) {
    ReplaceInFile $composeBuild @(
        @('com.nuvio.app', 'com.streamvault.app'),
        @('com.nuvio.android', 'com.streamvault.android'),
        @('"nuvio"', '"streamvault"')
    )
}

Write-Host "=== Phase 5: XML resources (strings, themes, etc.) ==="

$xmlFiles = Get-ChildItem -Path "$root\composeApp\src" -Filter "*.xml" -Recurse
$xmlFiles += Get-ChildItem -Path "$root\androidApp\src" -Filter "*.xml" -Recurse

foreach ($f in $xmlFiles) {
    ReplaceInFile $f.FullName @(
        @('Theme.Nuvio', 'Theme.StreamVault'),
        @('nuvio.tv', 'streamvault.app'),
        @('api.nuvio.tv', 'api.streamvault.app'),
        @('>Nuvio<', '>StreamVault<'),
        @('"Nuvio"', '"StreamVault"'),
        @('nuvio://', 'streamvault://')
    )
}

Write-Host "=== Phase 6: Strings XML - brand references ==="

# Main strings.xml - replace user-visible Nuvio brand strings
$stringsMain = "$root\composeApp\src\commonMain\composeResources\values\strings.xml"
if (Test-Path $stringsMain) {
    ReplaceInFile $stringsMain @(
        @('Bring your library into Nuvio with the addons you use.', 'Bring your library into StreamVault with the addons you use.'),
        @('Add an addon to start building your library.', 'Add an addon to start building your library.'),
        @('Make Nuvio yours.', 'Make StreamVault yours.'),
        @('Add a manifest URL to start loading catalogs, metadata, streams or subtitles into Nuvio.', 'Add a manifest URL to start loading catalogs, metadata, streams or subtitles into StreamVault.'),
        @('Open nuvio.tv/link', 'Open streamvault.app/link'),
        @('Made with', 'Made with'),
        @('Learn how Nuvio handles your data', 'Learn how StreamVault handles your data'),
        @('Manage addons and choose what appears in Nuvio.', 'Manage addons and choose what appears in StreamVault.'),
        @('nuvio.tv', 'streamvault.app'),
        @('Custom background URLs can be configured from the Nuvio web panel.', 'Custom background URLs can be configured from the StreamVault web panel.'),
        @('If blank, Nuvio creates one from the source.', 'If blank, StreamVault creates one from the source.')
    )
}

Write-Host "=== Phase 7: Rename Kotlin package directories ==="

# We need to move files from com/nuvio/app to com/streamvault/app in androidApp/src
$srcDirs = @(
    "$root\androidApp\src\main\kotlin\com\nuvio",
    "$root\androidApp\src\debug\kotlin\com\nuvio",
    "$root\androidApp\src\androidTest\kotlin\com\nuvio"
)

foreach ($oldDir in $srcDirs) {
    if (Test-Path $oldDir) {
        $parentDir = Split-Path $oldDir -Parent
        $newDir = Join-Path $parentDir "streamvault"
        Write-Host "  Moving: $oldDir -> $newDir"
        if (!(Test-Path $newDir)) {
            New-Item -ItemType Directory -Path $newDir -Force | Out-Null
        }
        # Copy contents
        Copy-Item -Path "$oldDir\*" -Destination $newDir -Recurse -Force
        # Remove old
        Remove-Item -Path $oldDir -Recurse -Force
    }
}

Write-Host ""
Write-Host "=== Rebrand complete! ==="
