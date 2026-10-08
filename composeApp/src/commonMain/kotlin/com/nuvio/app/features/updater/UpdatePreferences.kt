package com.streamvault.app.features.updater

import com.streamvault.app.core.build.AppVersionConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal class UpdatePreferences(
    versionName: String = AppVersionConfig.VERSION_NAME,
    debugBuild: Boolean = AppUpdaterPlatform.isDebugBuild,
) {
    private val storedChannel = UpdateChannel.fromStoredValue(AppUpdaterPlatform.getUpdateChannel())
    private val _channel = MutableStateFlow(if (debugBuild) UpdateChannel.BETA else
        storedChannel ?: UpdateChannel.defaultForVersion(versionName))
    val channel = _channel.asStateFlow()

    init {
        if (storedChannel != _channel.value && AppUpdaterPlatform.isSupported) {
            AppUpdaterPlatform.setUpdateChannel(_channel.value.storedValue)
        }
    }

    fun setChannel(channel: UpdateChannel) {
        if (_channel.value == channel) return
        AppUpdaterPlatform.setUpdateChannel(channel.storedValue)
        AppUpdaterPlatform.setIgnoredTag(null)
        _channel.value = channel
    }

    companion object {
        val shared by lazy { UpdatePreferences() }
    }
}
