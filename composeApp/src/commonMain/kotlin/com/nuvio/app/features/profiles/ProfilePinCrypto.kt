package com.streamvault.app.features.profiles

internal expect object ProfilePinCrypto {
    fun sha256Hex(value: String): String
}