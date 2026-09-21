package com.streamvault.aniyomi

import okhttp3.Headers
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.util.concurrent.TimeUnit

/**
 * Base class for HTTP-based anime sources.
 * Adapted from Aniyomi's AnimeHttpSource.
 */
abstract class AnimeHttpSource : AnimeSource {

    /**
     * Base URL of the source website (e.g. "https://gogoanime.cl")
     */
    abstract val baseUrl: String

    /**
     * Version ID used for stale cache busting.
     */
    open val versionId: Int = 1

    /**
     * Default HTTP headers to include in all requests.
     */
    open val headers: Headers = Headers.Builder()
        .add("User-Agent", "Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0")
        .build()

    protected val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    // ===================== Helpers =====================

    protected fun GET(url: String, headers: Headers = this.headers): Request {
        return Request.Builder()
            .url(url)
            .headers(headers)
            .build()
    }

    protected fun Response.asJsoup(): org.jsoup.nodes.Document {
        return org.jsoup.Jsoup.parse(body!!.string(), request.url.toString())
    }

    protected suspend fun <T> withIOContext(block: suspend () -> T): T {
        return kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { block() }
    }

    // ===================== Abstract helpers (implementors override) =====================

    /**
     * Returns the request for the anime details page.
     */
    protected abstract fun animeDetailsRequest(anime: SAnime): Request

    /**
     * Parses the anime details from the details page.
     */
    protected abstract fun animeDetailsParse(document: org.jsoup.nodes.Document): SAnime

    /**
     * Returns the request for the episode list of an anime.
     */
    protected abstract fun episodeListRequest(anime: SAnime): Request

    /**
     * Parses the episode list from the episode list page.
     */
    protected abstract fun episodeListParse(document: org.jsoup.nodes.Document): List<SEpisode>

    /**
     * Returns the request for the video list of an episode.
     */
    protected abstract fun videoListRequest(episode: SEpisode): Request

    /**
     * Parses the video list (stream URLs) from the video page.
     */
    protected abstract fun videoListParse(document: org.jsoup.nodes.Document): List<Video>

    /**
     * Returns the search request for a given query.
     */
    protected abstract fun searchAnimeRequest(page: Int, query: String, filters: AnimeFilterList): Request

    /**
     * Parses the search result page.
     */
    protected abstract fun searchAnimeParse(document: org.jsoup.nodes.Document): AnimesPage

    // ===================== AnimeSource implementation =====================

    override suspend fun fetchAnimeDetails(anime: SAnime): SAnime = withIOContext {
        val response = client.newCall(animeDetailsRequest(anime)).execute()
        val doc = response.asJsoup()
        animeDetailsParse(doc).also { it.initialized = true }
    }

    override suspend fun fetchEpisodeList(anime: SAnime): List<SEpisode> = withIOContext {
        val response = client.newCall(episodeListRequest(anime)).execute()
        episodeListParse(response.asJsoup())
    }

    override suspend fun fetchVideoList(episode: SEpisode): List<Video> = withIOContext {
        val response = client.newCall(videoListRequest(episode)).execute()
        videoListParse(response.asJsoup())
    }

    override suspend fun fetchSearchAnime(page: Int, query: String, filters: AnimeFilterList): AnimesPage = withIOContext {
        val response = client.newCall(searchAnimeRequest(page, query, filters)).execute()
        searchAnimeParse(response.asJsoup())
    }
}
