package com.streamvault.app.features.notifications

internal expect object EpisodeReleaseNotificationsStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
}