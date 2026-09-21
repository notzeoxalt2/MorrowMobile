package com.streamvault.app.features.downloads

internal expect object DownloadsClock {
    fun nowEpochMs(): Long
}
