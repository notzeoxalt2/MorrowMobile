package com.streamvault.app

import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.streamvault.app.core.auth.AuthStorage
import com.streamvault.app.core.network.ServerConfigurationStorage
import com.streamvault.app.core.diagnostics.SentryInitializer
import com.streamvault.app.core.deeplink.handleAppUrl
import com.streamvault.app.core.storage.PlatformLocalAccountDataCleaner
import com.streamvault.app.core.sync.SyncClientIdentityStorage
import com.streamvault.app.features.addons.AddonHttpClientProvider
import com.streamvault.app.features.addons.AddonStorage
import com.streamvault.app.features.addons.DefaultAddonsSeedStorage
import com.streamvault.app.features.collection.CollectionMobileSettingsStorage
import com.streamvault.app.features.collection.CollectionStorage
import com.streamvault.app.features.debrid.DebridSettingsStorage
import com.streamvault.app.features.downloads.DownloadsLiveStatusPlatform
import com.streamvault.app.features.downloads.DownloadsPlatformDownloader
import com.streamvault.app.features.downloads.DownloadsStorage
import com.streamvault.app.features.library.LibraryDisplaySettingsStorage
import com.streamvault.app.features.membership.MemberAssetStorage
import com.streamvault.app.features.library.LibraryStorage
import com.streamvault.app.features.details.MetaScreenSettingsStorage
import com.streamvault.app.features.home.HomeCatalogSettingsStorage
import com.streamvault.app.features.mdblist.MdbListSettingsStorage
import com.streamvault.app.features.notifications.EpisodeReleaseNotificationPlatform
import com.streamvault.app.features.notifications.EpisodeReleaseNotificationsStorage
import com.streamvault.app.features.player.PlayerSettingsStorage
import com.streamvault.app.features.player.PlayerTrackPreferenceStorage
import com.streamvault.app.features.player.ExternalPlayerPlatform
import com.streamvault.app.features.player.SubtitleFileCache
import com.streamvault.app.features.player.PlayerPictureInPictureManager
import com.streamvault.app.features.player.PipRemoteActionReceiver
import com.streamvault.app.features.p2p.P2pSettingsStorage
import com.streamvault.app.features.p2p.P2pStreamingEngine
import com.streamvault.app.features.plugins.PluginStorage
import com.streamvault.app.features.profiles.AvatarStorage
import com.streamvault.app.features.profiles.ProfilePinCacheStorage
import com.streamvault.app.features.profiles.ProfileStorage
import com.streamvault.app.features.details.SeasonViewModeStorage
import com.streamvault.app.features.search.DiscoverSelectionStorage
import com.streamvault.app.features.search.SearchHistoryStorage
import com.streamvault.app.features.settings.SentrySettingsStorage
import com.streamvault.app.features.settings.AppIconPlatform
import com.streamvault.app.features.settings.ThemeSettingsStorage
import com.streamvault.app.features.trakt.TraktAuthStorage
import com.streamvault.app.features.trakt.TraktCommentsStorage
import com.streamvault.app.features.trakt.TraktLibraryStorage
import com.streamvault.app.features.trakt.TraktSettingsStorage
import com.streamvault.app.features.simkl.SimklAuthStorage
import com.streamvault.app.features.simkl.SimklSyncStorage
import com.streamvault.app.features.tmdb.TmdbSettingsStorage
import com.streamvault.app.features.updater.AndroidAppUpdaterPlatform
import com.streamvault.app.core.ui.CardDepthStyleStorage
import com.streamvault.app.core.ui.PosterCardStyleStorage
import com.streamvault.app.features.watched.WatchedStorage
import com.streamvault.app.features.streams.StreamLinkCacheStorage
import com.streamvault.app.features.streams.StreamBadgeSettingsStorage
import com.streamvault.app.features.streams.BingeGroupCacheStorage
import com.streamvault.app.features.watchprogress.ContinueWatchingEnrichmentStorage
import com.streamvault.app.features.watchprogress.ContinueWatchingPreferencesStorage
import com.streamvault.app.features.watchprogress.ResumePromptStorage
import com.streamvault.app.features.watchprogress.WatchProgressStorage

open class MainActivity : AppCompatActivity() {
    private var pipRemoteActionReceiver: PipRemoteActionReceiver? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge(
            navigationBarStyle = SystemBarStyle.dark(
                scrim = 0xFF020404.toInt(),
            ),
        )
        ThemeSettingsStorage.initialize(applicationContext)
        AppIconPlatform.initialize(applicationContext)
        SentrySettingsStorage.initialize(applicationContext)
        SentryInitializer.start(application)
        super.onCreate(savedInstanceState)
        window.setBackgroundDrawableResource(R.color.streamvault_background)
        pipRemoteActionReceiver = PipRemoteActionReceiver.register(this)
        SyncClientIdentityStorage.initialize(applicationContext)
        AddonHttpClientProvider.initialize(applicationContext)
        AddonStorage.initialize(applicationContext)
        DefaultAddonsSeedStorage.initialize(applicationContext)
        AuthStorage.initialize(applicationContext)
        ServerConfigurationStorage.initialize(applicationContext)
        LibraryStorage.initialize(applicationContext)
        WatchedStorage.initialize(applicationContext)
        MetaScreenSettingsStorage.initialize(applicationContext)
        HomeCatalogSettingsStorage.initialize(applicationContext)
        PlayerSettingsStorage.initialize(applicationContext)
        PlayerTrackPreferenceStorage.initialize(applicationContext)
        P2pSettingsStorage.initialize(applicationContext)
        P2pStreamingEngine.initialize(applicationContext)
        ExternalPlayerPlatform.initialize(applicationContext)
        SubtitleFileCache.initialize(applicationContext)
        ProfileStorage.initialize(applicationContext)
        AvatarStorage.initialize(applicationContext)
        ProfilePinCacheStorage.initialize(applicationContext)
        MemberAssetStorage.initialize(applicationContext)
        DiscoverSelectionStorage.initialize(applicationContext)
        SearchHistoryStorage.initialize(applicationContext)
        SeasonViewModeStorage.initialize(applicationContext)
        PosterCardStyleStorage.initialize(applicationContext)
        CardDepthStyleStorage.initialize(applicationContext)
        DebridSettingsStorage.initialize(applicationContext)
        TmdbSettingsStorage.initialize(applicationContext)
        MdbListSettingsStorage.initialize(applicationContext)
        TraktAuthStorage.initialize(applicationContext)
        TraktCommentsStorage.initialize(applicationContext)
        TraktLibraryStorage.initialize(applicationContext)
        TraktSettingsStorage.initialize(applicationContext)
        SimklAuthStorage.initialize(applicationContext)
        SimklSyncStorage.initialize(applicationContext)
        LibraryDisplaySettingsStorage.initialize(applicationContext)
        ContinueWatchingPreferencesStorage.initialize(applicationContext)
        ResumePromptStorage.initialize(applicationContext)
        ContinueWatchingEnrichmentStorage.initialize(applicationContext)
        EpisodeReleaseNotificationsStorage.initialize(applicationContext)
        WatchProgressStorage.initialize(applicationContext)
        StreamLinkCacheStorage.initialize(applicationContext)
        StreamBadgeSettingsStorage.initialize(applicationContext)
        BingeGroupCacheStorage.initialize(applicationContext)
        PluginStorage.initialize(applicationContext)
        CollectionMobileSettingsStorage.initialize(applicationContext)
        CollectionStorage.initialize(applicationContext)
        DownloadsStorage.initialize(applicationContext)
        DownloadsPlatformDownloader.initialize(applicationContext)
        DownloadsLiveStatusPlatform.initialize(applicationContext)
        AndroidAppUpdaterPlatform.initialize(applicationContext)
        PlatformLocalAccountDataCleaner.initialize(applicationContext)
        EpisodeReleaseNotificationPlatform.initialize(applicationContext)
        EpisodeReleaseNotificationPlatform.bindActivity(this)
        handleIncomingAppIntent(intent)

        setContent {
            App()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingAppIntent(intent)
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        PlayerPictureInPictureManager.onUserLeaveHint(this)
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration,
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        PlayerPictureInPictureManager.onPictureInPictureModeChanged(this, isInPictureInPictureMode)
    }

    override fun onDestroy() {
        EpisodeReleaseNotificationPlatform.unbindActivity(this)
        val receiver = pipRemoteActionReceiver
        if (receiver != null) {
            runCatching { unregisterReceiver(receiver) }
            pipRemoteActionReceiver = null
        }
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray,
    ) {
        if (EpisodeReleaseNotificationPlatform.handlePermissionRequestResult(requestCode, grantResults)) {
            return
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }

    private fun handleIncomingAppIntent(intent: Intent?) {
        val appUrl = intent?.dataString?.trim().orEmpty()
        if (appUrl.isBlank()) return
        handleAppUrl(appUrl)
    }
}
