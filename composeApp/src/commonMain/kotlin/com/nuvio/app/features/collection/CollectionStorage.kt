package com.streamvault.app.features.collection

internal expect object CollectionStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
}
