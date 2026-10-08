package com.streamvault.app.features.updater

internal object ReleaseSelector {
    private val prereleaseNamePattern = Regex(
        "(?:^|[\\s._-])(alpha|beta|rc|preview)(?:[\\s._-]|$)",
        RegexOption.IGNORE_CASE
    )

    fun eligibleReleases(
        releases: List<GitHubReleaseDto>,
        channel: UpdateChannel
    ): List<GitHubReleaseDto> {
        val candidates = releases
            .asSequence()
            .filterNot(GitHubReleaseDto::draft)
            .mapNotNull { release ->
                val version = releaseVersion(release) ?: return@mapNotNull null
                ReleaseCandidate(
                    release = release,
                    version = version,
                    prerelease = isPrerelease(release, version)
                )
            }
            .toList()

        val matching = if (channel == UpdateChannel.BETA) {
            candidates
        } else {
            val nonPre = candidates.filterNot { it.prerelease }
            nonPre
        }

        return matching
            .sortedByDescending(ReleaseCandidate::version)
            .map(ReleaseCandidate::release)
    }

    private fun releaseVersion(release: GitHubReleaseDto): SemanticVersion? =
        VersionUtils.parse(release.tagName) ?: VersionUtils.parse(release.name)

    private fun isPrerelease(
        release: GitHubReleaseDto,
        version: SemanticVersion
    ): Boolean = release.prerelease ||
        version.prerelease.isNotEmpty() ||
        prereleaseNamePattern.containsMatchIn(release.name.orEmpty())

    private data class ReleaseCandidate(
        val release: GitHubReleaseDto,
        val version: SemanticVersion,
        val prerelease: Boolean
    )
}
