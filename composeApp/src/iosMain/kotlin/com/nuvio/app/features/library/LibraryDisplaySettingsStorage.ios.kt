package com.streamvault.app.features.library

import com.streamvault.app.core.storage.ProfileScopedKey
import platform.Foundation.NSUserDefaults

actual object LibraryDisplaySettingsStorage {
    private const val payloadKey = "library_display_settings_payload"

    actual fun loadPayload(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(payloadKey))

    actual fun savePayload(payload: String) {
        NSUserDefaults.standardUserDefaults.setObject(payload, forKey = ProfileScopedKey.of(payloadKey))
    }
}
