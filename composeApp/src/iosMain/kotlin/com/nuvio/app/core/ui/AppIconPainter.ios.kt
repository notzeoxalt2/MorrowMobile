package com.streamvault.app.core.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.painter.Painter
import streamvault.composeapp.generated.resources.Res
import streamvault.composeapp.generated.resources.ic_player_aspect_ratio
import streamvault.composeapp.generated.resources.ic_player_audio_filled
import streamvault.composeapp.generated.resources.ic_player_episodes
import streamvault.composeapp.generated.resources.ic_player_pause
import streamvault.composeapp.generated.resources.ic_player_play
import streamvault.composeapp.generated.resources.ic_player_source
import streamvault.composeapp.generated.resources.ic_player_subtitles
import streamvault.composeapp.generated.resources.library_add_plus
import org.jetbrains.compose.resources.painterResource

@Composable
actual fun appIconPainter(icon: AppIconResource): Painter =
    painterResource(
        when (icon) {
            AppIconResource.PlayerPlay -> Res.drawable.ic_player_play
            AppIconResource.PlayerPause -> Res.drawable.ic_player_pause
            AppIconResource.PlayerAspectRatio -> Res.drawable.ic_player_aspect_ratio
            AppIconResource.PlayerSubtitles -> Res.drawable.ic_player_subtitles
            AppIconResource.PlayerAudioFilled -> Res.drawable.ic_player_audio_filled
            AppIconResource.PlayerSource -> Res.drawable.ic_player_source
            AppIconResource.PlayerEpisodes -> Res.drawable.ic_player_episodes
            AppIconResource.LibraryAddPlus -> Res.drawable.library_add_plus
        }
    )
