package com.streamvault.app.features.watched

expect object WatchedClock {
    fun nowEpochMs(): Long
}

