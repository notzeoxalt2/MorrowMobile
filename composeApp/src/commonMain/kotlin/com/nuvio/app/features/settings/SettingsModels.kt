package com.streamvault.app.features.settings

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.ui.graphics.vector.ImageVector
import streamvault.composeapp.generated.resources.Res
import streamvault.composeapp.generated.resources.compose_settings_category_about
import streamvault.composeapp.generated.resources.compose_settings_category_general
import streamvault.composeapp.generated.resources.compose_settings_page_account
import streamvault.composeapp.generated.resources.compose_settings_page_addons
import streamvault.composeapp.generated.resources.compose_settings_page_advanced
import streamvault.composeapp.generated.resources.compose_settings_page_appearance
import streamvault.composeapp.generated.resources.compose_settings_page_content_discovery
import streamvault.composeapp.generated.resources.compose_settings_page_debrid
import streamvault.composeapp.generated.resources.compose_settings_page_continue_watching
import streamvault.composeapp.generated.resources.compose_settings_page_homescreen
import streamvault.composeapp.generated.resources.compose_settings_page_integrations
import streamvault.composeapp.generated.resources.compose_settings_page_licenses_attributions
import streamvault.composeapp.generated.resources.compose_settings_page_mdblist_ratings
import streamvault.composeapp.generated.resources.compose_settings_page_meta_screen
import streamvault.composeapp.generated.resources.compose_settings_page_notifications
import streamvault.composeapp.generated.resources.compose_settings_page_playback
import streamvault.composeapp.generated.resources.compose_settings_page_plugins
import streamvault.composeapp.generated.resources.compose_settings_page_poster_customization
import streamvault.composeapp.generated.resources.compose_settings_page_root
import streamvault.composeapp.generated.resources.compose_settings_page_streams
import streamvault.composeapp.generated.resources.compose_settings_page_supporters_contributors
import streamvault.composeapp.generated.resources.compose_settings_page_tmdb_enrichment
import streamvault.composeapp.generated.resources.compose_settings_page_trakt
import streamvault.composeapp.generated.resources.compose_settings_page_tracking
import streamvault.composeapp.generated.resources.settings_account
import org.jetbrains.compose.resources.StringResource

internal enum class SettingsCategory(
    val labelRes: StringResource,
    val icon: ImageVector,
) {
    Account(Res.string.settings_account, Icons.Rounded.AccountCircle),
    General(Res.string.compose_settings_category_general, Icons.Rounded.Settings),
    About(Res.string.compose_settings_category_about, Icons.Rounded.Info),
    Advanced(Res.string.compose_settings_page_advanced, Icons.Rounded.Tune),
}

internal enum class SettingsPage(
    val titleRes: StringResource,
    val category: SettingsCategory,
    val parentPage: SettingsPage?,
) {
    Root(
        titleRes = Res.string.compose_settings_page_root,
        category = SettingsCategory.General,
        parentPage = null,
    ),
    Account(
        titleRes = Res.string.compose_settings_page_account,
        category = SettingsCategory.Account,
        parentPage = Root,
    ),
    SupportersContributors(
        titleRes = Res.string.compose_settings_page_supporters_contributors,
        category = SettingsCategory.About,
        parentPage = Root,
    ),
    LicensesAttributions(
        titleRes = Res.string.compose_settings_page_licenses_attributions,
        category = SettingsCategory.About,
        parentPage = Root,
    ),
    Playback(
        titleRes = Res.string.compose_settings_page_playback,
        category = SettingsCategory.General,
        parentPage = Root,
    ),
    Appearance(
        titleRes = Res.string.compose_settings_page_appearance,
        category = SettingsCategory.General,
        parentPage = Root,
    ),
    Streams(
        titleRes = Res.string.compose_settings_page_streams,
        category = SettingsCategory.General,
        parentPage = Appearance,
    ),
    Advanced(
        titleRes = Res.string.compose_settings_page_advanced,
        category = SettingsCategory.Advanced,
        parentPage = Root,
    ),
    Notifications(
        titleRes = Res.string.compose_settings_page_notifications,
        category = SettingsCategory.General,
        parentPage = Root,
    ),
    ContinueWatching(
        titleRes = Res.string.compose_settings_page_continue_watching,
        category = SettingsCategory.General,
        parentPage = Appearance,
    ),
    PosterCustomization(
        titleRes = Res.string.compose_settings_page_poster_customization,
        category = SettingsCategory.General,
        parentPage = Appearance,
    ),
    ContentDiscovery(
        titleRes = Res.string.compose_settings_page_content_discovery,
        category = SettingsCategory.General,
        parentPage = Root,
    ),
    Addons(
        titleRes = Res.string.compose_settings_page_addons,
        category = SettingsCategory.General,
        parentPage = ContentDiscovery,
    ),
    Plugins(
        titleRes = Res.string.compose_settings_page_plugins,
        category = SettingsCategory.General,
        parentPage = ContentDiscovery,
    ),
    Homescreen(
        titleRes = Res.string.compose_settings_page_homescreen,
        category = SettingsCategory.General,
        parentPage = Appearance,
    ),
    MetaScreen(
        titleRes = Res.string.compose_settings_page_meta_screen,
        category = SettingsCategory.General,
        parentPage = Appearance,
    ),
    Integrations(
        titleRes = Res.string.compose_settings_page_integrations,
        category = SettingsCategory.General,
        parentPage = Root,
    ),
    TmdbEnrichment(
        titleRes = Res.string.compose_settings_page_tmdb_enrichment,
        category = SettingsCategory.General,
        parentPage = Integrations,
    ),
    MdbListRatings(
        titleRes = Res.string.compose_settings_page_mdblist_ratings,
        category = SettingsCategory.General,
        parentPage = Integrations,
    ),
    Debrid(
        titleRes = Res.string.compose_settings_page_debrid,
        category = SettingsCategory.General,
        parentPage = Integrations,
    ),
    TraktAuthentication(
        // Keep the enum name for saved navigation-state compatibility.
        titleRes = Res.string.compose_settings_page_tracking,
        category = SettingsCategory.Account,
        parentPage = Root,
    ),
}

internal val SettingsPage.opensInlineOnTablet: Boolean
    get() = parentPage != null

internal fun SettingsPage.previousPage(): SettingsPage? = parentPage
