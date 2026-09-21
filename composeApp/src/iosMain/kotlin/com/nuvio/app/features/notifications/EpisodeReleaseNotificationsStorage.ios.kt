package com.streamvault.app.features.notifications

import com.streamvault.app.core.storage.ProfileScopedKey
import platform.Foundation.NSUserDefaults

internal actual object EpisodeReleaseNotificationsStorage {
    private const val payloadKey = "episode_release_notifications_payload"

    actual fun loadPayload(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(ProfileScopedKey.of(payloadKey))

    actual fun savePayload(payload: String) {
        NSUserDefaults.standardUserDefaults.setObject(
            payload,
            forKey = ProfileScopedKey.of(payloadKey),
        )
    }
}