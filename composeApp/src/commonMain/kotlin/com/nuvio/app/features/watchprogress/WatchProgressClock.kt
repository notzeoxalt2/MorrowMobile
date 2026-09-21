package com.streamvault.app.features.watchprogress

internal expect object WatchProgressClock {
    fun nowEpochMs(): Long
}
