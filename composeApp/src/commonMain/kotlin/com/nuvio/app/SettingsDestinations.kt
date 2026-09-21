package com.streamvault.app

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.streamvault.app.features.collection.CollectionEditorPage
import com.streamvault.app.features.collection.CollectionEditorScreen
import com.streamvault.app.features.collection.CollectionManagementScreen
import com.streamvault.app.features.collection.CollectionRepository
import com.streamvault.app.features.collection.FolderDetailRepository
import com.streamvault.app.features.collection.FolderDetailScreen
import com.streamvault.app.features.downloads.DownloadItem
import com.streamvault.app.features.downloads.DownloadsScreen
import com.streamvault.app.features.home.HomeCatalogSection
import com.streamvault.app.features.home.MetaPreview
import com.streamvault.app.features.settings.SettingsScreen
import com.streamvault.app.navigation.AppRoute
import com.streamvault.app.navigation.CollectionEditorPageRoute
import com.streamvault.app.navigation.CollectionEditorRoute
import com.streamvault.app.navigation.CollectionsRoute
import com.streamvault.app.navigation.DetailRoute
import com.streamvault.app.navigation.DownloadShowRoute
import com.streamvault.app.navigation.DownloadsSettingsRoute
import com.streamvault.app.navigation.FolderDetailRoute
import com.streamvault.app.navigation.NuvioNavigator
import com.streamvault.app.navigation.SettingsPageRoute

@Composable
internal fun SettingsDestination(
    route: AppRoute,
    navController: NuvioNavigator,
    content: @Composable (onBack: () -> Unit) -> Unit,
) {
    val onBack = rememberGuardedPopBackStack(navController, route)
    content(onBack)
}

@Composable
internal fun SettingsRootDestination(
    route: SettingsPageRoute,
    navController: NuvioNavigator,
    useNativeNavigation: Boolean,
    downloadsTitle: String,
    collectionsTitle: String,
    onCheckForUpdates: (() -> Unit)?,
    onTestUpdateBanner: (() -> Unit)?,
) {
    val onBack = rememberGuardedPopBackStack(navController, route)
    SettingsScreen(
        modifier = Modifier.fillMaxSize(),
        initialPageName = route.pageName,
        rootActionsEnabled = false,
        onNavigatePage = { pageName, title ->
            navController.navigate(SettingsPageRoute(pageName, title))
        },
        onExternalBack = onBack,
        showInternalHeader = !useNativeNavigation,
        onDownloadsClick = {
            navController.navigate(DownloadsSettingsRoute(downloadsTitle))
        },
        onCollectionsClick = {
            navController.navigate(CollectionsRoute(collectionsTitle))
        },
        onCheckForUpdatesClick = onCheckForUpdates,
        onTestUpdateBannerClick = onTestUpdateBanner,
    )
}

@Composable
internal fun DownloadsDestination(
    route: DownloadsSettingsRoute,
    navController: NuvioNavigator,
    useNativeNavigation: Boolean,
    onOpenDownload: (DownloadItem) -> Unit,
) {
    val onBack = rememberGuardedPopBackStack(navController, route)
    DownloadsScreen(
        onBack = onBack,
        onOpenDownload = onOpenDownload,
        onNavigateToShow = if (useNativeNavigation) {
            { showId, title -> navController.navigate(DownloadShowRoute(showId, title)) }
        } else {
            null
        },
    )
}

@Composable
internal fun DownloadShowDestination(
    route: DownloadShowRoute,
    navController: NuvioNavigator,
    onOpenDownload: (DownloadItem) -> Unit,
) {
    val onBack = rememberGuardedPopBackStack(navController, route)
    DownloadsScreen(
        onBack = onBack,
        onOpenDownload = onOpenDownload,
        initialShowId = route.showId,
        onBackFromShow = onBack,
    )
}

@Composable
internal fun CollectionsDestination(
    route: CollectionsRoute,
    navController: NuvioNavigator,
    newCollectionTitle: String,
) {
    val onBack = rememberGuardedPopBackStack(navController, route)
    CollectionManagementScreen(
        onBack = onBack,
        onNavigateToEditor = { collectionId ->
            val editorTitle = collectionId
                ?.let { id ->
                    CollectionRepository.collections.value.firstOrNull { it.id == id }?.title
                }
                .orEmpty()
            navController.navigate(
                CollectionEditorRoute(
                    collectionId = collectionId,
                    title = editorTitle.ifBlank { newCollectionTitle },
                ),
            )
        },
    )
}

@Composable
internal fun CollectionEditorDestination(
    route: CollectionEditorRoute,
    navController: NuvioNavigator,
    useNativeNavigation: Boolean,
) {
    val onBack = rememberGuardedPopBackStack(navController, route)
    CollectionEditorScreen(
        collectionId = route.collectionId,
        onBack = onBack,
        initialPage = if (useNativeNavigation) CollectionEditorPage.Root else null,
        onNavigateToPage = if (useNativeNavigation) {
            { page, title ->
                navController.navigate(
                    CollectionEditorPageRoute(
                        collectionId = route.collectionId,
                        pageName = page.name,
                        title = title,
                    ),
                )
            }
        } else {
            null
        },
    )
}

@Composable
internal fun CollectionEditorPageDestination(
    route: CollectionEditorPageRoute,
    navController: NuvioNavigator,
) {
    val page = remember(route.pageName) {
        runCatching { CollectionEditorPage.valueOf(route.pageName) }.getOrNull()
    }
    val onBack = rememberGuardedPopBackStack(navController, route)
    if (page == null || page == CollectionEditorPage.Root) {
        LaunchedEffect(route) { onBack() }
        return
    }
    CollectionEditorScreen(
        collectionId = route.collectionId,
        initialPage = page,
        initializeRepository = false,
        onBack = onBack,
        onNavigateToPage = { nextPage, title ->
            navController.navigate(
                CollectionEditorPageRoute(
                    collectionId = route.collectionId,
                    pageName = nextPage.name,
                    title = title,
                ),
            )
        },
    )
}

@Composable
internal fun FolderDestination(
    route: FolderDetailRoute,
    navController: NuvioNavigator,
    onCatalogClick: (HomeCatalogSection) -> Unit,
) {
    val onBack = rememberGuardedPopBackStack(navController, route)
    LaunchedEffect(route.collectionId, route.folderId) {
        FolderDetailRepository.initialize(route.collectionId, route.folderId)
    }
    FolderDetailScreen(
        onBack = onBack,
        onCatalogClick = onCatalogClick,
        onPosterClick = { meta: MetaPreview ->
            navController.navigate(DetailRoute(type = meta.type, id = meta.id, title = meta.name))
        },
    )
}
