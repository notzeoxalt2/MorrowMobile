package com.streamvault.app.features.watchprogress

import com.streamvault.app.features.tracking.WatchProgressSource

internal fun projectWatchProgressSourceEntries(
    source: WatchProgressSource,
    nuvioEntries: Collection<WatchProgressEntry>,
    providerEntries: Collection<WatchProgressEntry>,
): List<WatchProgressEntry> = if (source.providerId == null) {
    nuvioEntries.toList()
} else {
    providerEntries.toList()
}
