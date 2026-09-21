package com.streamvault.aniyomi

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL

/**
 * Fetches the list of available Aniyomi extensions from the official index.
 * Compatible with aniyomiorg/aniyomi-extensions repo format.
 */
object ExtensionApi {

    // Aniyomi's official extension index - contains metadata for all available extensions
    private const val INDEX_URL = "https://raw.githubusercontent.com/aniyomiorg/aniyomi-extensions/repo/index.min.json"
    // Fallback mirror
    private const val INDEX_URL_FALLBACK = "https://raw.githubusercontent.com/aniyomiorg/aniyomi-extensions/repo/index.json"

    /**
     * Fetches all available extensions from the Aniyomi extension repository.
     */
    suspend fun fetchExtensions(): List<AvailableExtension> = withContext(Dispatchers.IO) {
        val jsonStr = try {
            URL(INDEX_URL).readText()
        } catch (e: Exception) {
            URL(INDEX_URL_FALLBACK).readText()
        }
        parseExtensionIndex(jsonStr)
    }

    private fun parseExtensionIndex(jsonStr: String): List<AvailableExtension> {
        return try {
            val array = JSONArray(jsonStr)
            (0 until array.length()).mapNotNull { i ->
                try {
                    val obj: JSONObject = array.getJSONObject(i)
                    AvailableExtension(
                        pkgName = obj.getString("pkg"),
                        name = obj.getString("name"),
                        lang = obj.getString("lang"),
                        versionName = obj.getString("version"),
                        versionCode = obj.getLong("code"),
                        apkName = obj.getString("apk"),
                        iconUrl = obj.optString("icon", ""),
                        sources = parseSourcesFromExtension(obj),
                        nsfw = obj.optInt("nsfw", 0) == 1,
                    )
                } catch (e: Exception) {
                    null
                }
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun parseSourcesFromExtension(obj: JSONObject): List<AvailableSource> {
        val sourcesArr = obj.optJSONArray("sources") ?: return emptyList()
        return (0 until sourcesArr.length()).mapNotNull { j ->
            try {
                val s = sourcesArr.getJSONObject(j)
                AvailableSource(
                    id = s.getLong("id"),
                    name = s.getString("name"),
                    lang = s.getString("lang"),
                    baseUrl = s.optString("baseUrl", ""),
                )
            } catch (e: Exception) { null }
        }
    }

    /**
     * Returns the download URL for a given extension APK.
     */
    fun getApkDownloadUrl(extension: AvailableExtension): String {
        return "https://raw.githubusercontent.com/aniyomiorg/aniyomi-extensions/repo/apk/${extension.apkName}"
    }
}

data class AvailableExtension(
    val pkgName: String,
    val name: String,
    val lang: String,
    val versionName: String,
    val versionCode: Long,
    val apkName: String,
    val iconUrl: String,
    val sources: List<AvailableSource>,
    val nsfw: Boolean,
)

data class AvailableSource(
    val id: Long,
    val name: String,
    val lang: String,
    val baseUrl: String,
)
