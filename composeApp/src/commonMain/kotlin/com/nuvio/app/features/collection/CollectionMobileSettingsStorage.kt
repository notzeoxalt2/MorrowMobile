package com.streamvault.app.features.collection

internal expect object CollectionMobileSettingsStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
}
