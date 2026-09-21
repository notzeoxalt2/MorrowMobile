package com.streamvault.app.features.watchprogress

actual object WatchProgressClock {
    actual fun nowEpochMs(): Long = System.currentTimeMillis()
}
