package com.streamvault.app.features.player

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.LockOpen
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.streamvault.app.core.ui.AppIconResource
import com.streamvault.app.core.ui.NuvioBackButton
import com.streamvault.app.core.ui.appIconPainter
import com.streamvault.app.core.ui.nuvioTypeScale
import streamvault.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun PlayerToolbar(
    isLocked: Boolean,
    onLockToggle: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Spacer(Modifier.weight(1f))
        PlayerAction(
            description = stringResource(
                if (isLocked) Res.string.compose_player_unlock_controls else Res.string.compose_player_lock_controls,
            ),
            icon = if (isLocked) Icons.Rounded.LockOpen else Icons.Rounded.Lock,
            onClick = onLockToggle,
        )
        NuvioBackButton(
            onClick = onBack,
            containerColor = Color.Transparent,
            contentColor = Color.White,
            buttonSize = 48.dp,
            iconSize = 24.dp,
            contentDescription = stringResource(Res.string.compose_player_close),
        )
    }
}

@Composable
internal fun PlayerControlActions(
    videoQuality: VideoQuality,
    onQualityClick: (() -> Unit)?,
    playbackSnapshot: PlayerPlaybackSnapshot,
    displayedPositionMs: Long,
    showRemainingTime: Boolean,
    onRuntimeClick: () -> Unit,
    metrics: PlayerLayoutMetrics,
    resizeMode: PlayerResizeMode,
    onSubtitleClick: () -> Unit,
    onAudioClick: () -> Unit,
    onSourcesClick: (() -> Unit)?,
    onEpisodesClick: (() -> Unit)?,
    onNextEpisodeClick: (() -> Unit)?,
    onSpeedClick: () -> Unit,
    onResizeModeClick: () -> Unit,
    onVideoSettingsClick: (() -> Unit)?,
    onOpenInExternalPlayer: (() -> Unit)?,
    onSubmitIntroClick: (() -> Unit)?,
    onInteraction: () -> Unit,
) {
    val actions = listOfNotNull(
        onQualityClick?.let {
            PlayerControlAction("Quality: ${videoQuality.label}", it, icon = Icons.Rounded.Build, visibleLabel = "Quality ${videoQuality.label}")
        },
        onNextEpisodeClick?.let {
            PlayerControlAction(
                stringResource(Res.string.player_next_episode), it,
                icon = Icons.Rounded.SkipNext, iconSize = 24.dp,
            )
        },
        PlayerControlAction(
            stringResource(Res.string.compose_player_subtitles), onSubtitleClick,
            painter = appIconPainter(AppIconResource.PlayerSubtitles),
        ),
        PlayerControlAction(
            stringResource(Res.string.compose_player_audio), onAudioClick,
            painter = appIconPainter(AppIconResource.PlayerAudioFilled),
        ),
        onSourcesClick?.let {
            PlayerControlAction(
                stringResource(Res.string.compose_player_sources), it,
                painter = appIconPainter(AppIconResource.PlayerSource),
            )
        },
        onEpisodesClick?.let {
            PlayerControlAction(
                stringResource(Res.string.compose_player_episodes), it,
                painter = appIconPainter(AppIconResource.PlayerEpisodes),
            )
        },
        PlayerControlAction(
            "${stringResource(Res.string.compose_player_speed)} ${formatPlaybackSpeedLabel(playbackSnapshot.playbackSpeed)}",
            onSpeedClick, icon = Icons.Rounded.Speed,
        ),
        PlayerControlAction(
            stringResource(resizeMode.labelRes), onResizeModeClick,
            painter = appIconPainter(AppIconResource.PlayerAspectRatio),
        ),
        onOpenInExternalPlayer?.let {
            PlayerControlAction(
                stringResource(Res.string.streams_open_external_player), it,
                icon = Icons.AutoMirrored.Rounded.OpenInNew,
            )
        },
        onVideoSettingsClick?.let {
            PlayerControlAction(
                stringResource(Res.string.player_action_video_settings), it,
                icon = Icons.Rounded.Build,
            )
        },
        onSubmitIntroClick?.let {
            PlayerControlAction(
                stringResource(Res.string.submit_intro_action), it,
                icon = Icons.Rounded.Flag,
            )
        },
    )
    val visibleActions = actions.filter { it.onClick == onNextEpisodeClick || it.onClick == onSubtitleClick || it.onClick == onAudioClick || it.onClick == onSourcesClick }
    val menuActions = actions.filterNot { it in visibleActions }
    var menuOpen by remember { mutableStateOf(false) }
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = PlayerTimelineContentInset),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                visibleActions.forEach { action ->
                    PlayerAction(
                        description = action.description,
                        onClick = {
                            onInteraction()
                            action.onClick()
                        },
                        icon = action.icon,
                        painter = action.painter,
                        iconSize = action.iconSize,
                        visibleLabel = action.visibleLabel,
                    )
                }
                if (menuActions.isNotEmpty()) {
                    Box {
                        PlayerAction(
                            description = stringResource(Res.string.compose_player_more_actions),
                            onClick = { menuOpen = true; onInteraction() },
                            icon = Icons.Rounded.MoreVert,
                        )
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            menuActions.forEach { action ->
                                DropdownMenuItem(
                                    text = { Text(action.description) },
                                    onClick = { menuOpen = false; onInteraction(); action.onClick() },
                                )
                            }
                        }
                    }
                }
            }
            Box(
                modifier = Modifier.height(48.dp).widthIn(min = 48.dp).clickable(
                    role = Role.Button,
                    onClickLabel = stringResource(
                        if (showRemainingTime) Res.string.compose_player_show_elapsed_time else Res.string.compose_player_show_remaining_time,
                    ),
                    onClick = {
                        onRuntimeClick()
                        onInteraction()
                    },
                ),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Text(
                    text = formatPlaybackRuntime(displayedPositionMs, playbackSnapshot.durationMs, showRemainingTime),
                    style = MaterialTheme.nuvioTypeScale.bodyMd.copy(fontSize = metrics.timeSize),
                    color = Color.White.copy(alpha = 0.9f),
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun PlayerAction(
    description: String,
    onClick: () -> Unit,
    icon: ImageVector? = null,
    painter: Painter? = null,
    iconSize: Dp = 24.dp,
    visibleLabel: String? = null,
) {
    if (visibleLabel != null) {
        Column(
            modifier = Modifier.height(48.dp).widthIn(min = 76.dp).clickable(role = Role.Button, onClickLabel = description, onClick = onClick).padding(horizontal = 6.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (icon != null) Icon(icon, description, tint = Color.White, modifier = Modifier.size(20.dp))
            Text(visibleLabel, color = Color.White, fontSize = 10.sp, maxLines = 1)
        }
        return
    }
    IconButton(onClick = onClick, modifier = Modifier.size(48.dp)) {
        if (painter != null) {
            Icon(painter, description, tint = Color.White, modifier = Modifier.size(iconSize))
        } else if (icon != null) {
            Icon(icon, description, tint = Color.White, modifier = Modifier.size(iconSize))
        }
    }
}

private data class PlayerControlAction(
    val description: String,
    val onClick: () -> Unit,
    val icon: ImageVector? = null,
    val painter: Painter? = null,
    val iconSize: Dp = 24.dp,
    val visibleLabel: String? = null,
)
