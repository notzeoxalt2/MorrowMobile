$env:ANDROID_HOME = 'E:\Android\Sdk'
$env:ANDROID_SDK_ROOT = 'E:\Android\Sdk'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot'

$sdkManager = 'E:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat'
Write-Host "Installing Android SDK packages..."
& $sdkManager --sdk_root='E:\Android\Sdk' "platform-tools" "platforms;android-34" "platforms;android-35" "build-tools;34.0.0" "build-tools;35.0.0"
Write-Host "SDK Packages Installed!"
