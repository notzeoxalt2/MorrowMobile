package com.streamvault.aniyomi

/**
 * Base interface for all anime sources (adapted from Aniyomi's source API).
 * Implementations scrape specific websites/services to return anime content.
 */
interface AnimeSource {
    val id: Long
    val name: String
    val lang: String

    /**
     * Returns an Observable with a page list for an anime.
     */
    suspend fun fetchAnimeDetails(anime: SAnime): SAnime

    /**
     * Returns a list of episodes for an anime.
     */
    suspend fun fetchEpisodeList(anime: SAnime): List<SEpisode>

    /**
     * Returns a list of video sources/streams for an episode.
     */
    suspend fun fetchVideoList(episode: SEpisode): List<Video>

    /**
     * Returns search results for a given query.
     */
    suspend fun fetchSearchAnime(page: Int, query: String, filters: AnimeFilterList): AnimesPage
}

/**
 * Represents an anime entry.
 */
data class SAnime(
    var url: String = "",
    var title: String = "",
    var thumbnailUrl: String? = null,
    var description: String? = null,
    var genre: String? = null,
    var status: Int = UNKNOWN,
    var initialized: Boolean = false,
) {
    companion object {
        const val UNKNOWN = 0
        const val ONGOING = 1
        const val COMPLETED = 2
        const val LICENSED = 3
        const val PUBLISHING_FINISHED = 4
        const val CANCELLED = 5
        const val ON_HIATUS = 6
    }
}

/**
 * Represents an episode of an anime.
 */
data class SEpisode(
    var url: String = "",
    var name: String = "",
    var dateUpload: Long = 0L,
    var episodeNumber: Float = -1f,
    var scanlator: String? = null,
)

/**
 * Represents a playable video stream.
 */
data class Video(
    val url: String,
    val quality: String,
    val videoUrl: String?,
    val headers: okhttp3.Headers? = null,
    val subtitleTracks: List<Track> = emptyList(),
    val audioTracks: List<Track> = emptyList(),
)

data class Track(val url: String, val lang: String)

/**
 * Represents a page of anime results.
 */
data class AnimesPage(
    val animes: List<SAnime>,
    val hasNextPage: Boolean,
)

/**
 * Empty filter list placeholder.
 */
class AnimeFilterList(private val filters: List<AnimeFilter<*>> = emptyList()) :
    List<AnimeFilter<*>> by filters

abstract class AnimeFilter<T>(val name: String, var state: T) {
    class Text(name: String, state: String = "") : AnimeFilter<String>(name, state)
    class Select(name: String, val values: Array<String>, state: Int = 0) : AnimeFilter<Int>(name, state)
}
