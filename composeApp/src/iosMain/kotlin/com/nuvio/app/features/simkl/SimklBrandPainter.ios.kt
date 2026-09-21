package com.streamvault.app.features.simkl

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.painter.Painter
import streamvault.composeapp.generated.resources.Res
import streamvault.composeapp.generated.resources.simkl_logo_glyph
import streamvault.composeapp.generated.resources.simkl_logo_wordmark
import org.jetbrains.compose.resources.painterResource

@Composable
actual fun simklBrandPainter(asset: SimklBrandAsset): Painter =
    when (asset) {
        SimklBrandAsset.Glyph -> painterResource(Res.drawable.simkl_logo_glyph)
        SimklBrandAsset.Wordmark -> painterResource(Res.drawable.simkl_logo_wordmark)
    }
