package com.streamvault.app.features.player

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material.icons.automirrored.outlined.Chat
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
    title: String,
    seasonNumber: Int?,
    episodeNumber: Int?,
    episodeTitle: String?,
    metrics: PlayerLayoutMetrics,
    isLocked: Boolean,
    onLockToggle: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val heading = if (seasonNumber != null && episodeNumber != null) {
        val code = stringResource(Res.string.compose_player_episode_code, seasonNumber, episodeNumber)
        val name = episodeTitle?.takeIf(String::isNotBlank)
        if (name == null) code else "$code \"$name\""
    } else {
        title
    }
    Box(modifier = modifier.fillMaxWidth().height(56.dp)) {
        NuvioBackButton(
            onClick = onBack,
            containerColor = Color.Transparent,
            contentColor = Color.White,
            buttonSize = maxOf(metrics.headerIconSize + 24.dp, 56.dp),
            iconSize = maxOf(metrics.headerIconSize + 4.dp, 28.dp),
            contentDescription = stringResource(Res.string.compose_player_close),
            modifier = Modifier.align(Alignment.CenterStart),
        )
        Text(
            text = heading,
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .padding(horizontal = metrics.headerIconSize * 4),
            color = Color.White,
            style = MaterialTheme.nuvioTypeScale.titleMd.copy(
                fontSize = if (metrics.headerIconSize >= 22.dp) 24.sp else 20.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
            ),
            maxLines = 1,
            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        PlayerHeaderIconButton(
            icon = if (isLocked) Icons.Rounded.LockOpen else Icons.Rounded.Lock,
            contentDescription = stringResource(
                if (isLocked) Res.string.compose_player_unlock_controls else Res.string.compose_player_lock_controls,
            ),
            buttonSize = maxOf(metrics.headerIconSize + 24.dp, 56.dp),
            iconSize = maxOf(metrics.headerIconSize + 4.dp, 28.dp),
            onClick = onLockToggle,
            modifier = Modifier.align(Alignment.CenterEnd),
        )
    }
}

@Composable
internal fun PlayerControlActions(
    videoQuality: VideoQuality,
    onQualityClick: (() -> Unit)?,
    playbackSnapshot: PlayerPlaybackSnapshot,
    metrics: PlayerLayoutMetrics,
    resizeMode: PlayerResizeMode,
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
                icon = Icons.Rounded.SkipNext, iconSize = 28.dp,
                visibleLabel = stringResource(Res.string.player_next_episode),
            )
        },
        PlayerControlAction(
            stringResource(Res.string.compose_player_audio_subtitles), onAudioClick,
            icon = Icons.AutoMirrored.Outlined.Chat,
            visibleLabel = stringResource(Res.string.compose_player_audio_subtitles),
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
                visibleLabel = stringResource(Res.string.compose_player_episodes),
            )
        },
        PlayerControlAction(
            "${stringResource(Res.string.compose_player_speed)} ${formatPlaybackSpeedLabel(playbackSnapshot.playbackSpeed)}",
            onSpeedClick, icon = Icons.Rounded.Speed,
            visibleLabel = "${stringResource(Res.string.compose_player_speed)} (${formatPlaybackSpeedLabel(playbackSnapshot.playbackSpeed)})",
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
    val visibleActions = listOfNotNull(
        actions.firstOrNull { it.onClick == onSpeedClick },
        onEpisodesClick?.let { callback -> actions.firstOrNull { it.onClick == callback } },
        actions.firstOrNull { it.onClick == onAudioClick },
        onNextEpisodeClick?.let { callback -> actions.firstOrNull { it.onClick == callback } },
    )
    val menuActions = actions.filterNot { it in visibleActions || it.onClick == onAudioClick }
    var menuOpen by remember { mutableStateOf(false) }
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = PlayerTimelineContentInset),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                visibleActions.forEach { action ->
                    Box {
                        PlayerAction(
                            description = action.description,
                            onClick = {
                                onInteraction()
                                action.onClick()
                            },
                            icon = action.icon,
                            painter = action.painter,
                            iconSize = action.iconSize,
                            visibleLabel = action.visibleLabel.takeIf { metrics.centerGap >= 72.dp },
                        )

                    }
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
        Row(
            modifier = Modifier.height(64.dp).widthIn(min = 156.dp).clickable(role = Role.Button, onClickLabel = description, onClick = onClick).padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) Icon(icon, description, tint = Color.White, modifier = Modifier.size(28.dp))
            if (painter != null) Icon(painter, description, tint = Color.White, modifier = Modifier.size(28.dp))
            Text(
                visibleLabel,
                color = Color.White,
                fontSize = 16.sp,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                softWrap = false,
            )
        }
        return
    }
    IconButton(onClick = onClick, modifier = Modifier.size(56.dp)) {
        if (painter != null) {
            Icon(painter, description, tint = Color.White, modifier = Modifier.size(maxOf(iconSize, 28.dp)))
        } else if (icon != null) {
            Icon(icon, description, tint = Color.White, modifier = Modifier.size(maxOf(iconSize, 28.dp)))
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
