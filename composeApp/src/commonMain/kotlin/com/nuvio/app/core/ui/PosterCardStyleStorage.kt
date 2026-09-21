package com.streamvault.app.core.ui

internal expect object PosterCardStyleStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
}