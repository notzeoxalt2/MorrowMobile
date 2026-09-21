package com.streamvault.app.features.trailer

expect object TrailerPlaybackResolver {
    suspend fun resolveFromYouTubeUrl(youtubeUrl: String): TrailerPlaybackSource?
}
