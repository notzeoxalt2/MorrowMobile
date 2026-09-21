package com.streamvault.app.features.addons

/**
 * Pre-bundled Stremio addon URLs for StreamVault.
 * These are loaded automatically on first launch so users have streams immediately.
 *
 * All URLs point to community-maintained, publicly-available Stremio addons.
 * Users can remove or add more addons via Settings → Addons.
 */
object DefaultAddons {

    /**
     * Check that we haven't seeded addons before (one-time operation per install).
     */
    private const val PREFS_KEY_SEEDED = "streamvault_default_addons_seeded"

    val defaultAddonUrls: List<String> = listOf(
        // Cinemeta - main catalog metadata addon (movies & TV)
        "https://v3-cinemeta.strem.io/manifest.json",

        // AIOMetadata - multi-source anime, series & movie catalog/metadata (MAL, TMDB, TVDB, TVMaze)
        "https://aiometadata.elfhosted.com/stremio/68638a9b-71bd-4b0a-aa34-c9e6c7667906/manifest.json",

        // OpenSubtitles v3 - subtitle source
        "https://opensubtitles-v3.strem.io/manifest.json",
    )

    /**
     * Returns addons to seed if this is the first launch.
     * Uses AddonStorage to check/write the seeded flag.
     */
    fun getAddonsToSeedIfNeeded(): List<String> {
        val alreadySeeded = DefaultAddonsSeedStorage.isSeeded()
        if (alreadySeeded) return emptyList()
        DefaultAddonsSeedStorage.markSeeded()
        return defaultAddonUrls
    }
}

/**
 * Platform-specific storage for the "default addons seeded" flag.
 */
internal expect object DefaultAddonsSeedStorage {
    fun isSeeded(): Boolean
    fun markSeeded()
}
