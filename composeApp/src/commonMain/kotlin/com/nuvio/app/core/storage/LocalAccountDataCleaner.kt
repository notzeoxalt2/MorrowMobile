package com.streamvault.app.core.storage

import com.streamvault.app.core.build.AppFeaturePolicy
import com.streamvault.app.core.sync.SyncManager
import com.streamvault.app.core.sync.ProfileSettingsSync
import com.streamvault.app.core.tracking.ensureTrackingProvidersRegistered
import com.streamvault.app.features.addons.AddonRepository
import com.streamvault.app.features.catalog.CatalogRepository
import com.streamvault.app.features.collection.CollectionMobileSettingsRepository
import com.streamvault.app.features.collection.CollectionRepository
import com.streamvault.app.features.details.MetaDetailsRepository
import com.streamvault.app.features.details.MetaScreenSettingsRepository
import com.streamvault.app.features.home.HomeCatalogSettingsRepository
import com.streamvault.app.features.home.HomeRepository
import com.streamvault.app.features.library.LibraryRepository
import com.streamvault.app.features.membership.MemberAccessRepository
import com.streamvault.app.features.library.LibraryDisplaySettingsRepository
import com.streamvault.app.features.notifications.EpisodeReleaseNotificationsRepository
import com.streamvault.app.features.player.PlayerLaunchStore
import com.streamvault.app.features.player.PlayerSettingsRepository
import com.streamvault.app.features.p2p.P2pSettingsRepository
import com.streamvault.app.features.plugins.PluginRepository
import com.streamvault.app.features.player.SubtitleRepository
import com.streamvault.app.features.profiles.ProfileRepository
import com.streamvault.app.features.profiles.MAX_PROFILES
import com.streamvault.app.features.search.SearchRepository
import com.streamvault.app.features.settings.ThemeSettingsRepository
import com.streamvault.app.features.streams.StreamContextStore
import com.streamvault.app.features.streams.StreamBadgeSettingsRepository
import com.streamvault.app.features.streams.StreamLaunchStore
import com.streamvault.app.features.streams.StreamsRepository
import com.streamvault.app.features.tracking.TrackingProviderRegistry
import com.streamvault.app.features.tracking.TrackingSettingsRepository
import com.streamvault.app.core.ui.CardDepthStyleRepository
import com.streamvault.app.core.ui.PosterCardStyleRepository
import com.streamvault.app.features.watchprogress.ContinueWatchingPreferencesRepository
import com.streamvault.app.features.watchprogress.ContinueWatchingEnrichmentCache
import com.streamvault.app.features.watchprogress.WatchProgressRepository
import com.streamvault.app.features.watchprogress.WatchProgressSourceCoordinator
import com.streamvault.app.features.watched.WatchedRepository

internal object LocalAccountDataCleaner {
    fun wipe() {
        ensureTrackingProvidersRegistered()
        TrackingProviderRegistry.removeStoredProfiles(1..MAX_PROFILES)
        SyncManager.cancelAccountSync()
        WatchProgressSourceCoordinator.clearLocalState()
        ProfileSettingsSync.clearAccountState()
        ContinueWatchingEnrichmentCache.clearLocalState()
        WatchProgressRepository.clearLocalState()
        WatchedRepository.clearLocalState()
        LibraryRepository.runAccountStorageWipe {
            wipePlatformStorage()
        }

        ProfileRepository.clearInMemory()
        MemberAccessRepository.clearLocalState()
        AddonRepository.clearLocalState()
        if (AppFeaturePolicy.pluginsEnabled) {
            PluginRepository.clearLocalState()
        }
        HomeRepository.clear()
        HomeCatalogSettingsRepository.clearLocalState()
        MetaScreenSettingsRepository.clearLocalState()
        LibraryRepository.clearLocalState()
        LibraryDisplaySettingsRepository.clearLocalState()
        ContinueWatchingPreferencesRepository.clearLocalState()
        EpisodeReleaseNotificationsRepository.clearLocalState()
        CollectionMobileSettingsRepository.clearLocalState()
        CollectionRepository.clearLocalState()
        ThemeSettingsRepository.clearLocalState()
        PosterCardStyleRepository.clearLocalState()
        CardDepthStyleRepository.clearLocalState()
        TrackingProviderRegistry.clearLocalState()
        TrackingSettingsRepository.clearLocalState()
        PlayerSettingsRepository.clearLocalState()
        StreamBadgeSettingsRepository.clearLocalState()
        P2pSettingsRepository.clearLocalState()
        CatalogRepository.clear()
        StreamsRepository.clear()
        MetaDetailsRepository.clear()
        SearchRepository.reset()
        SubtitleRepository.clear()
        PlayerLaunchStore.clear()
        StreamLaunchStore.clear()
        StreamContextStore.clear()
    }

    internal fun wipePlatformStorage(wipeStorage: () -> Unit = PlatformLocalAccountDataCleaner::wipe) {
        try {
            wipeStorage()
        } finally {
            ContinueWatchingEnrichmentCache.clearLocalState()
        }
    }
}

internal expect object PlatformLocalAccountDataCleaner {
    fun wipe()
}
