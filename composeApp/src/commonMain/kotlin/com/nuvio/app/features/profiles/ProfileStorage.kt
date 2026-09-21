package com.streamvault.app.features.profiles

internal expect object ProfileStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
}