package com.streamvault.app.features.downloads

internal expect object DownloadsStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
}
