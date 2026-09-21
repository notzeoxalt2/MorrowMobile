package com.streamvault.app.features.library

internal expect object LibraryClock {
    fun nowEpochMs(): Long
}
