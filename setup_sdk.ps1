$env:ANDROID_HOME = 'E:\Android\Sdk'
$env:ANDROID_SDK_ROOT = 'E:\Android\Sdk'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot'

$sdkManager = 'E:\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat'
Write-Host "Running sdkmanager --version..."
& $sdkManager --version

Write-Host "Accepting licenses..."
cmd.exe /c "echo y | `"$sdkManager`" --licenses"

Write-Host "Installing platforms;android-34, platforms;android-35, build-tools;35.0.0, platform-tools..."
& $sdkManager "platform-tools" "platforms;android-34" "platforms;android-35" "build-tools;34.0.0" "build-tools;35.0.0"

Write-Host "Android SDK Setup Complete!"
