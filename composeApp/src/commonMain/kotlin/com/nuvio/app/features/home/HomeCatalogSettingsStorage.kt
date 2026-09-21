package com.streamvault.app.features.home

internal expect object HomeCatalogSettingsStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
}
