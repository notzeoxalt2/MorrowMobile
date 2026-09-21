package com.streamvault.aniyomi

import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val TAG = "ExtensionLoader"
private const val EXTENSION_FEATURE = "streamvault.extension"
private const val METADATA_SOURCE_CLASS = "streamvault.extension.class"

/**
 * Loads installed Aniyomi-compatible extension APKs via Android's PackageManager.
 * Compatible with the Aniyomi extension APK format (feature flag + metadata).
 */
object ExtensionLoader {

    /**
     * Scans installed packages for Aniyomi extensions and loads them.
     * Returns a list of LoadResult for each discovered extension.
     */
    suspend fun loadExtensions(context: Context): List<LoadResult> = withContext(Dispatchers.IO) {
        val pkgManager = context.packageManager
        val installedPackages = pkgManager.getInstalledPackages(PackageManager.GET_META_DATA)

        installedPackages.mapNotNull { pkgInfo ->
            try {
                // Aniyomi extensions declare this feature flag
                val hasExtFeature = pkgInfo.reqFeatures
                    ?.any { it.name == EXTENSION_FEATURE || it.name == "tachiyomi.extension" }
                    ?: false
                if (!hasExtFeature) return@mapNotNull null

                val appInfo = pkgInfo.applicationInfo ?: return@mapNotNull null
                val metadata = appInfo.metaData ?: return@mapNotNull null
                val sourceClass = metadata.getString(METADATA_SOURCE_CLASS)
                    ?: metadata.getString("tachiyomi.extension.class")
                    ?: return@mapNotNull null

                Log.d(TAG, "Found extension: ${pkgInfo.packageName} -> $sourceClass")

                // Load the class from the extension's classloader
                val classLoader = pkgManager.getResourcesForApplication(appInfo)
                val extClassLoader = android.content.pm.PackageInfo::class.java.classLoader

                // Use PathClassLoader to load the extension APK
                val pathClassLoader = dalvik.system.PathClassLoader(
                    appInfo.sourceDir,
                    extClassLoader
                )

                val classes = sourceClass.split(";").mapNotNull { className ->
                    try {
                        val clazz = pathClassLoader.loadClass(className.trim())
                        val instance = clazz.getDeclaredConstructor().newInstance()
                        instance as? AnimeSource
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to load class $className: ${e.message}")
                        null
                    }
                }

                if (classes.isEmpty()) return@mapNotNull null

                LoadResult.Success(
                    extension = InstalledExtension(
                        pkgName = pkgInfo.packageName,
                        name = pkgManager.getApplicationLabel(appInfo).toString(),
                        versionName = pkgInfo.versionName ?: "unknown",
                        versionCode = pkgInfo.longVersionCode,
                        sources = classes,
                        iconPath = appInfo.sourceDir,
                    )
                )
            } catch (e: Exception) {
                Log.e(TAG, "Error loading extension ${pkgInfo.packageName}: ${e.message}")
                LoadResult.Error(pkgInfo.packageName, e)
            }
        }
    }
}

data class InstalledExtension(
    val pkgName: String,
    val name: String,
    val versionName: String,
    val versionCode: Long,
    val sources: List<AnimeSource>,
    val iconPath: String,
)

sealed class LoadResult {
    data class Success(val extension: InstalledExtension) : LoadResult()
    data class Error(val pkgName: String, val exception: Exception) : LoadResult()
}
