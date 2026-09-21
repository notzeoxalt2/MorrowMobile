package com.streamvault.app.features.settings

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.painter.Painter
import com.streamvault.app.features.simkl.SimklBrandAsset
import com.streamvault.app.features.simkl.simklBrandPainter
import streamvault.composeapp.generated.resources.Res
import streamvault.composeapp.generated.resources.introdb_favicon
import streamvault.composeapp.generated.resources.mdblist_logo
import streamvault.composeapp.generated.resources.rating_tmdb
import streamvault.composeapp.generated.resources.trakt_tv_favicon
import org.jetbrains.compose.resources.painterResource

@Composable
internal actual fun integrationLogoPainter(logo: IntegrationLogo): Painter =
    when (logo) {
        IntegrationLogo.Tmdb -> painterResource(Res.drawable.rating_tmdb)
        IntegrationLogo.Trakt -> painterResource(Res.drawable.trakt_tv_favicon)
        IntegrationLogo.Simkl -> simklBrandPainter(SimklBrandAsset.Glyph)
        IntegrationLogo.MdbList -> painterResource(Res.drawable.mdblist_logo)
        IntegrationLogo.IntroDb -> painterResource(Res.drawable.introdb_favicon)
    }
