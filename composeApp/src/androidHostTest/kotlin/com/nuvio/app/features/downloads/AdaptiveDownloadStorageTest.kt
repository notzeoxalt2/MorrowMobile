package com.streamvault.app.features.downloads

import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import android.net.Uri
import java.io.File
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@androidx.annotation.OptIn(UnstableApi::class)
class AdaptiveDownloadStorageTest {
    @Test
    fun hlsKeepsManifestSegmentsAndKeyAfterServerStops(): Unit = runBlocking {
        verifyOffline("hls", "/master.m3u8", mapOf(
            "/master.m3u8" to "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nmedia.m3u8\n",
            "/media.m3u8" to "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\n#EXTINF:4,\nsegment.ts\n#EXT-X-ENDLIST\n",
            "/key.bin" to "0123456789abcdef",
            "/segment.ts" to "offline-segment-bytes",
        ))
    }

    @Test
    fun dashKeepsManifestInitializationAndSegmentsAfterServerStops(): Unit = runBlocking {
        verifyOffline("dash", "/master.mpd", mapOf(
            "/master.mpd" to """<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT4S" minBufferTime="PT1S"><Period duration="PT4S"><AdaptationSet mimeType="video/mp4"><Representation id="v" bandwidth="1000" codecs="avc1.4d401e" width="640" height="360"><SegmentList duration="4" timescale="1"><Initialization sourceURL="init.mp4"/><SegmentURL media="segment.m4s"/></SegmentList></Representation></AdaptationSet></Period></MPD>""",
            "/init.mp4" to "offline-init-bytes",
            "/segment.m4s" to "offline-dash-bytes",
        ))
    }

    private suspend fun verifyOffline(type: String, manifest: String, resources: Map<String, String>) {
        val context = RuntimeEnvironment.getApplication()
        val directory = File(context.filesDir, "downloads").apply { mkdirs() }
        val marker = File(directory, "adaptive-$type-${System.nanoTime()}.morrowoffline")
        val server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                assertEquals("Bearer test", request.getHeader("Authorization"))
                val body = resources[request.path] ?: return MockResponse().setResponseCode(404)
                return MockResponse().setBody(body)
            }
        }
        server.start()
        val base = server.url("/").toString().trimEnd('/')
        try {
            val item = downloadItem(base + manifest).copy(fileName = marker.name, sourceStreamType = type)
            val partial = AdaptiveDownloadStorage.download(context, item, directory, downloadHttpClient) { _, _ -> }
            assertTrue(partial.renameTo(marker))
            assertTrue(AdaptiveDownloadStorage.bytes(context, marker) > resources.values.sumOf { it.length }.toLong() - 1)
            server.shutdown()
            AdaptiveDownloadStorage.close(marker)
            val playback = assertNotNull(AdaptiveDownloadStorage.resolve(context, marker.toURI().toString()))
            val factory = AdaptiveDownloadStorage.playbackFactory(context, playback)
            for ((path, content) in resources) {
                val source = factory.createDataSource()
                try {
                    source.open(DataSpec(Uri.parse(base + path)))
                    val output = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(256)
                    while (true) {
                        val count = source.read(buffer, 0, buffer.size)
                        if (count == -1) break
                        output.write(buffer, 0, count)
                    }
                    assertEquals(content, output.toString("UTF-8"))
                } finally { source.close() }
            }
            val missing = factory.createDataSource()
            try { assertFails { missing.open(DataSpec(Uri.parse(base + "/not-downloaded"))) } }
            finally { missing.close() }
        } finally {
            runCatching { server.shutdown() }
            AdaptiveDownloadStorage.remove(marker)
            marker.delete()
        }
    }

    @Test
    fun livePlaylistIsRejectedBeforeCompletion(): Unit = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nsegment.ts\n"))
            val context = RuntimeEnvironment.getApplication()
            val directory = File(context.filesDir, "downloads").apply { mkdirs() }
            val marker = File(directory, "live-${System.nanoTime()}.morrowoffline")
            try {
                assertFails {
                    AdaptiveDownloadStorage.download(context, downloadItem(server.url("/live.m3u8").toString())
                        .copy(fileName = marker.name), directory, downloadHttpClient) { _, _ -> }
                }
                assertTrue(!marker.exists() && !File(directory, marker.name + ".part").exists())
            } finally { AdaptiveDownloadStorage.remove(marker) }
        }
    }
}
