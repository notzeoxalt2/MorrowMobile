package com.streamvault.app.features.downloads

import android.content.Context
import android.net.Uri
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.offline.DefaultDownloaderFactory
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.hls.playlist.HlsPlaylistParser
import androidx.media3.exoplayer.hls.playlist.HlsMediaPlaylist
import androidx.media3.exoplayer.hls.playlist.HlsMultivariantPlaylist
import androidx.media3.exoplayer.dash.manifest.DashManifestParser
import java.io.File
import java.io.IOException
import java.net.URI
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.ensureActive
import org.json.JSONObject
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Call

internal data class AdaptivePlayback(val sourceUrl: String, val mimeType: String, val marker: File)

// Each episode has its own durable, non-evicting cache. Partial spans survive pause/process death.
@androidx.annotation.OptIn(UnstableApi::class)
internal object AdaptiveDownloadStorage {
    private val caches = mutableMapOf<String, SimpleCache>()

    @Synchronized
    private fun cache(context: Context, marker: File): SimpleCache {
        val folder = File(marker.parentFile, marker.name + ".cache")
        return caches.getOrPut(folder.canonicalPath) {
            SimpleCache(folder, NoOpCacheEvictor(), StandaloneDatabaseProvider(context.applicationContext))
        }
    }

    fun resolve(context: Context, uri: String): AdaptivePlayback? {
        if (!uri.startsWith("file:") || !uri.substringBefore('?').endsWith(".morrowoffline")) return null
        return runCatching {
            val marker = File(URI(uri)).canonicalFile
            val root = File(context.filesDir, "downloads").canonicalFile
            require(marker.parentFile == root && marker.isFile)
            val data = JSONObject(marker.readText())
            require(data.getInt("version") == 1)
            val url = data.getString("sourceUrl")
            require(url.startsWith("https://") || url.startsWith("http://"))
            val mime = data.getString("mimeType")
            require(mime == MimeTypes.APPLICATION_M3U8 || mime == MimeTypes.APPLICATION_MPD)
            require(File(root, marker.name + ".cache").isDirectory)
            AdaptivePlayback(url, mime, marker)
        }.getOrNull()
    }

    fun playbackFactory(context: Context, playback: AdaptivePlayback): DataSource.Factory {
        val cached = CacheDataSource.Factory().setCache(cache(context, playback.marker))
            .setUpstreamDataSourceFactory(null).setCacheWriteDataSinkFactory(null)
        // Local subtitle files still use Android's file source. HTTP cache misses fail offline.
        val local = DefaultDataSource.Factory(context, DataSource.Factory { OfflineMissDataSource() })
        return DataSource.Factory { SchemeDataSource(cached.createDataSource(), local.createDataSource()) }
    }

    suspend fun download(
        context: Context, item: DownloadItem, directory: File, client: OkHttpClient,
        onProgress: (Long, Long?) -> Unit,
    ): File = coroutineScope {
        require(File(item.fileName).name == item.fileName && item.fileName.endsWith(".morrowoffline"))
        check(directory.isDirectory || directory.mkdirs())
        val marker = File(directory, item.fileName)
        val mime = when (adaptiveDownloadType(item.sourceUrl, item.sourceStreamType)) {
            "hls" -> MimeTypes.APPLICATION_M3U8
            "dash" -> MimeTypes.APPLICATION_MPD
            else -> throw IOException("Unknown adaptive download format")
        }
        val headers = item.sourceHeaders.filterKeys {
            !it.equals("Range", true) && !it.equals("If-Range", true) && !it.equals("Accept-Encoding", true)
        }
        val factory = CacheDataSource.Factory().setCache(cache(context, marker))
            .setUpstreamDataSourceFactory(OkHttpDataSource.Factory(client).setDefaultRequestProperties(headers))
        val request = DownloadRequest.Builder(item.id, Uri.parse(item.sourceUrl)).setMimeType(mime).build()
        val downloader = DefaultDownloaderFactory(factory, Executor { it.run() }).createDownloader(request)
        val active = AtomicReference(downloader)
        val validationCall = AtomicReference<Call?>()
        val work = async(Dispatchers.IO) {
            val visited = mutableSetOf<String>()
            suspend fun validateManifest(url: String, depth: Int = 0) {
                ensureActive()
                if (!visited.add(url)) return
                require(depth < 6) { "Too many nested download playlists" }
                val call = client.newCall(Request.Builder().url(url).apply {
                    headers.forEach { (key, value) -> header(key, value) }
                }.build())
                validationCall.set(call)
                val children = call.execute().use { response ->
                    if (!response.isSuccessful) throw DownloadHttpException(response.code)
                    val body = response.body ?: throw IOException("Download manifest is empty")
                    val uri = Uri.parse(response.request.url.toString())
                    body.byteStream().use { input ->
                        if (mime == MimeTypes.APPLICATION_M3U8) {
                            when (val parsed = HlsPlaylistParser().parse(uri, input)) {
                                is HlsMediaPlaylist -> {
                                    require(parsed.hasEndTag) { "Live streams cannot be saved as completed episodes" }
                                    require(parsed.protectionSchemes == null) { "Offline DRM licenses are not supported" }
                                    emptyList()
                                }
                                is HlsMultivariantPlaylist -> parsed.mediaPlaylistUrls.map { it.toString() }
                                else -> throw IOException("Unsupported HLS playlist")
                            }
                        } else {
                            val parsed = DashManifestParser().parse(uri, input)
                            require(!parsed.dynamic) { "Live streams cannot be saved as completed episodes" }
                            for (index in 0 until parsed.periodCount) {
                                require(parsed.getPeriod(index).adaptationSets.flatMap { it.representations }
                                    .none { it.format.drmInitData != null }) { "Offline DRM licenses are not supported" }
                            }
                            emptyList()
                        }
                    }
                }
                validationCall.set(null)
                children.forEach { validateManifest(it, depth + 1) }
            }
            validateManifest(item.sourceUrl)
            downloader.download { length, bytes, _ ->
                ensureActive()
                onProgress(bytes, length.takeIf { it >= 0 })
            }
            ensureActive()
            val partial = File(directory, item.fileName + ".part")
            partial.writeText(JSONObject().put("version", 1).put("sourceUrl", item.sourceUrl)
                .put("mimeType", mime).toString())
            partial
        }
        try { work.await() } finally { validationCall.get()?.cancel(); active.get()?.cancel() }
    }

    fun bytes(context: Context, marker: File): Long = cache(context, marker).cacheSpace

    @Synchronized
    fun close(marker: File) {
        val folder = File(marker.parentFile, marker.name + ".cache")
        caches.remove(folder.canonicalPath)?.release()
    }

    @Synchronized
    fun remove(marker: File) {
        val folder = File(marker.parentFile, marker.name + ".cache")
        close(marker)
        // The sibling path is derived from a validated application-owned download file name.
        if (folder.isDirectory) folder.deleteRecursively()
    }
}

private class OfflineMissDataSource : DataSource {
    override fun addTransferListener(listener: TransferListener) = Unit
    override fun open(dataSpec: DataSpec): Long = throw IOException("Downloaded media is missing from the offline cache")
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int = -1
    override fun getUri(): Uri? = null
    override fun close() = Unit
}

private class SchemeDataSource(private val cached: DataSource, private val local: DataSource) : DataSource {
    private var active: DataSource? = null
    override fun addTransferListener(listener: TransferListener) {
        cached.addTransferListener(listener); local.addTransferListener(listener)
    }
    override fun open(dataSpec: DataSpec): Long {
        active = if (dataSpec.uri.scheme in listOf("http", "https")) cached else local
        return checkNotNull(active).open(dataSpec)
    }
    override fun read(buffer: ByteArray, offset: Int, length: Int) = checkNotNull(active).read(buffer, offset, length)
    override fun getUri(): Uri? = active?.uri
    override fun getResponseHeaders(): Map<String, List<String>> = active?.responseHeaders.orEmpty()
    override fun close() { active?.close(); active = null }
}
