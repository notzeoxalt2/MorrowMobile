package com.streamvault.app.features.player

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import streamvault.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun CombinedTracksModal(
    visible: Boolean,
    audioTracks: List<AudioTrack>,
    selectedAudioIndex: Int,
    subtitleTracks: List<SubtitleTrack>,
    selectedSubtitleIndex: Int,
    addonSubtitles: List<AddonSubtitle>,
    selectedAddonSubtitleId: String?,
    loading: Boolean,
    onAudioSelected: (Int) -> Unit,
    onSubtitleSelected: (Int) -> Unit,
    onAddonSelected: (AddonSubtitle) -> Unit,
    onFetch: () -> Unit,
    onSettings: () -> Unit,
    onDismiss: () -> Unit,
) {
    PlayerOverlayScaffold(visible = visible, onDismiss = onDismiss, contentPadding = PaddingValues(20.dp)) {
        Column(
            modifier = Modifier.align(Alignment.Center).widthIn(max = 700.dp).fillMaxWidth()
                .background(Color(0xFF181818), RoundedCornerShape(4.dp)).padding(20.dp),
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("${stringResource(Res.string.compose_player_audio)} & ${stringResource(Res.string.compose_player_subtitles)}", color = Color.White, fontSize = 18.sp)
                TextButton(onClick = onDismiss) { Text(stringResource(Res.string.compose_player_close), color = Color.White) }
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth().heightIn(max = 280.dp), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(Res.string.compose_player_audio), color = Color.White, fontSize = 20.sp)
                    LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false), contentPadding = PaddingValues(top = 8.dp)) {
                        if (audioTracks.isEmpty()) item { Text(stringResource(Res.string.compose_player_no_audio_tracks_available), color = Color.Gray, fontSize = 13.sp) }
                        items(audioTracks, key = { "${it.index}:${it.id}" }) { track ->
                            LanguageChoice(localizedTrackDisplayName(track.label, track.language, track.index), track.index == selectedAudioIndex) { onAudioSelected(track.index) }
                        }
                    }
                }
                Column(Modifier.weight(1f)) {
                    Text(stringResource(Res.string.compose_player_subtitles), color = Color.White, fontSize = 20.sp)
                    LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false), contentPadding = PaddingValues(top = 8.dp)) {
                        item { LanguageChoice(stringResource(Res.string.compose_player_none), selectedSubtitleIndex < 0 && selectedAddonSubtitleId == null) { onSubtitleSelected(-1) } }
                        items(subtitleTracks, key = { "internal:${it.index}:${it.id}" }) { track ->
                            LanguageChoice(localizedTrackDisplayName(track.label, track.language, track.index), selectedAddonSubtitleId == null && track.index == selectedSubtitleIndex) { onSubtitleSelected(track.index) }
                        }
                        items(addonSubtitles.withDuplicateSafeTrackKeys(), key = { it.first }) { (_, subtitle) ->
                            LanguageChoice(subtitle.display.ifBlank { languageLabelForCode(subtitle.language) }, subtitle.matchesSelection(selectedAddonSubtitleId)) { onAddonSelected(subtitle) }
                        }
                        if (loading) item { CircularProgressIndicator(Modifier.padding(12.dp).size(18.dp), color = Color.White, strokeWidth = 2.dp) }
                        else if (addonSubtitles.isEmpty()) item {
                            TextButton(onClick = onFetch) { Text(stringResource(Res.string.compose_player_fetch_subtitles), color = Color.LightGray, fontSize = 12.sp) }
                        }
                    }
                }
            }
            TextButton(onClick = onSettings, modifier = Modifier.align(Alignment.End)) {
                Text(stringResource(Res.string.compose_player_style), color = Color.LightGray, fontSize = 12.sp)
            }
        }
    }
}

private fun List<AddonSubtitle>.withDuplicateSafeTrackKeys() = mapIndexed { index, subtitle -> "${subtitle.selectionKey}:$index" to subtitle }

@Composable
private fun LanguageChoice(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(24.dp)) {
            if (selected) Icon(Icons.Rounded.Check, null, tint = Color.White, modifier = Modifier.size(18.dp))
        }
        Text(label, color = if (selected) Color.White else Color.LightGray, fontSize = 15.sp,
            fontWeight = if (selected) androidx.compose.ui.text.font.FontWeight.Bold else androidx.compose.ui.text.font.FontWeight.Normal)
    }
}
