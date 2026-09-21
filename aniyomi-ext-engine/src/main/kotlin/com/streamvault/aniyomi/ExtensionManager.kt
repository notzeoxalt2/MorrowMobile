package com.streamvault.aniyomi

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Manages installed Aniyomi extensions — loading, refreshing, and providing access to sources.
 */
class ExtensionManager(private val context: Context) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val _state = MutableStateFlow<ExtensionManagerState>(ExtensionManagerState.Loading)
    val state: StateFlow<ExtensionManagerState> = _state.asStateFlow()

    /** All loaded anime sources from installed extensions */
    val sources: List<AnimeSource>
        get() = (_state.value as? ExtensionManagerState.Loaded)
            ?.extensions
            ?.flatMap { it.sources }
            ?: emptyList()

    init {
        refresh()
    }

    /**
     * Re-scans installed packages and reloads all extensions.
     */
    fun refresh() {
        scope.launch {
            _state.value = ExtensionManagerState.Loading
            try {
                val results = ExtensionLoader.loadExtensions(context)
                val loaded = results.filterIsInstance<LoadResult.Success>().map { it.extension }
                val errors = results.filterIsInstance<LoadResult.Error>()
                _state.value = ExtensionManagerState.Loaded(loaded, errors)
            } catch (e: Exception) {
                _state.value = ExtensionManagerState.Error(e)
            }
        }
    }

    /**
     * Get a source by its ID.
     */
    fun getSource(sourceId: Long): AnimeSource? {
        return sources.find { it.id == sourceId }
    }

    /**
     * Find a source by package name and source name.
     */
    fun getSource(pkgName: String, sourceName: String): AnimeSource? {
        return (_state.value as? ExtensionManagerState.Loaded)
            ?.extensions
            ?.find { it.pkgName == pkgName }
            ?.sources
            ?.find { it.name == sourceName }
    }
}

sealed class ExtensionManagerState {
    object Loading : ExtensionManagerState()
    data class Loaded(
        val extensions: List<InstalledExtension>,
        val errors: List<LoadResult.Error> = emptyList(),
    ) : ExtensionManagerState()
    data class Error(val exception: Exception) : ExtensionManagerState()
}
