package com.streamvault.app.features.updater

import com.streamvault.app.features.addons.httpRequestRaw
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import streamvault.composeapp.generated.resources.Res
import streamvault.composeapp.generated.resources.updates_github_api_error
import org.jetbrains.compose.resources.getString

@Serializable
internal data class GitHubReleaseDto(
    @SerialName("tag_name") val tagName: String? = null,
    val name: String? = null,
    val body: String? = null,
    val draft: Boolean = false,
    val prerelease: Boolean = false,
    @SerialName("html_url") val htmlUrl: String? = null,
    val assets: List<GitHubAssetDto> = emptyList(),
)

@Serializable
internal data class GitHubAssetDto(
    val name: String,
    @SerialName("browser_download_url") val browserDownloadUrl: String,
    val size: Long? = null,
    @SerialName("content_type") val contentType: String? = null,
)

internal class NoChannelReleaseException : IllegalStateException()

internal object AppUpdaterRepository {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    suspend fun getLatestChannelUpdate(channel: UpdateChannel): Result<AppUpdate> = runCatching {
        val repos = listOf("notzeoxalt2/MorrowMobile", "notzeoxalt2/Morrow")
        var lastResponse: com.streamvault.app.features.addons.RawHttpResponse? = null

        for (repo in repos) {
            val primaryUrl = "https://api.github.com/repos/$repo/${releasePath(channel)}"
            var response = httpRequestRaw(
                method = "GET",
                url = primaryUrl,
                headers = mapOf(
                    "Accept" to "application/vnd.github+json",
                    "User-Agent" to "MorrowMobile",
                ),
                body = "",
            )
            currentCoroutineContext().ensureActive()
            if (response.status == 404 && primaryUrl.contains("releases/latest")) {
                val fallbackUrl = "https://api.github.com/repos/$repo/releases?per_page=20"
                response = httpRequestRaw(
                    method = "GET",
                    url = fallbackUrl,
                    headers = mapOf(
                        "Accept" to "application/vnd.github+json",
                        "User-Agent" to "MorrowMobile",
                    ),
                    body = "",
                )
                currentCoroutineContext().ensureActive()
            }
            if (response.status in 200..299) {
                val update = selectUpdate(response.body, channel, AppUpdaterPlatform.getSupportedAbis())
                if (update != null) {
                    return@runCatching update
                }
            }
            lastResponse = response
        }

        if (lastResponse == null || lastResponse.status == 404) throw NoChannelReleaseException()
        error(getString(Res.string.updates_github_api_error, lastResponse.status))
    }

    internal fun releasePath(channel: UpdateChannel): String = when (channel) {
        UpdateChannel.STABLE -> "releases/latest"
        UpdateChannel.BETA -> "releases?per_page=100"
    }

    internal fun selectUpdate(
        responseBody: String,
        channel: UpdateChannel,
        supportedAbis: List<String>,
    ): AppUpdate? {
        val releases = try {
            json.decodeFromString<List<GitHubReleaseDto>>(responseBody)
        } catch (_: Exception) {
            try {
                listOf(json.decodeFromString<GitHubReleaseDto>(responseBody))
            } catch (_: Exception) {
                emptyList()
            }
        }
        return ReleaseSelector.eligibleReleases(releases, channel).firstNotNullOfOrNull { release ->
            val asset = chooseBestApkAsset(release.assets, supportedAbis) ?: return@firstNotNullOfOrNull null
            val tag = release.tagName?.takeIf { VersionUtils.parse(it) != null }
                ?: release.name.orEmpty()
            AppUpdate(
                tag = tag,
                title = release.name?.takeIf { it.isNotBlank() } ?: tag,
                notes = release.body.orEmpty(),
                releaseUrl = release.htmlUrl,
                assetName = asset.name,
                assetUrl = asset.browserDownloadUrl,
                assetSizeBytes = asset.size,
            )
        }
    }

    private fun chooseBestApkAsset(
        assets: List<GitHubAssetDto>,
        supportedAbis: List<String>,
    ): GitHubAssetDto? {
        val apkAssets = assets.filter { asset ->
            asset.name.endsWith(".apk", ignoreCase = true) ||
                asset.contentType == "application/vnd.android.package-archive"
        }
        for (abi in supportedAbis) {
            apkAssets.firstOrNull { it.name.contains(abi, ignoreCase = true) }?.let { return it }
        }
        return apkAssets.firstOrNull { asset ->
            val name = asset.name.lowercase()
            name.contains("universal") || name.contains("all")
        } ?: apkAssets.firstOrNull()
    }
}
