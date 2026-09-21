package com.streamvault.app

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import com.streamvault.app.features.player.OpeningOverlay
import com.streamvault.app.features.player.subtitleLoadingStatusMessage
import com.streamvault.app.features.streams.StreamLaunch
import com.streamvault.app.features.streams.StreamsUiState
import streamvault.composeapp.generated.resources.Res
import streamvault.composeapp.generated.resources.debrid_resolving_stream
import streamvault.composeapp.generated.resources.player_loading_preparing
import streamvault.composeapp.generated.resources.streams_finding_source
import streamvault.composeapp.generated.resources.streams_loading_subtitles
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun StreamLoadingScreen(
    launch: StreamLaunch,
    state: StreamsUiState,
    showStatus: Boolean,
    resolvingDebridStream: Boolean,
    onBack: () -> Unit,
) {
    val message = when {
        !showStatus -> null
        resolvingDebridStream -> stringResource(Res.string.debrid_resolving_stream)
        state.overlayMessage == stringResource(Res.string.streams_loading_subtitles) -> subtitleLoadingStatusMessage()
        state.overlayMessage != null -> state.overlayMessage
        state.autoPlayStream != null -> stringResource(Res.string.player_loading_preparing)
        else -> stringResource(Res.string.streams_finding_source)
    }
    OpeningOverlay(
        artwork = launch.background ?: launch.poster,
        logo = launch.logo,
        title = launch.title,
        onBack = onBack,
        horizontalSafePadding = 0.dp,
        message = message,
    )
}
