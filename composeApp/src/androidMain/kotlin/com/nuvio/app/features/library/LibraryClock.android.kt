package com.streamvault.app.features.library

actual object LibraryClock {
    actual fun nowEpochMs(): Long = System.currentTimeMillis()
}
