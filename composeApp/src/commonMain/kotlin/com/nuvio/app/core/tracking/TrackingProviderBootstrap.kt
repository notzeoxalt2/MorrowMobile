package com.streamvault.app.core.tracking

import com.streamvault.app.features.simkl.SimklAuthRepository
import com.streamvault.app.features.simkl.SimklMutationRepository
import com.streamvault.app.features.simkl.SimklLibraryRepository
import com.streamvault.app.features.simkl.SimklProgressRepository
import com.streamvault.app.features.simkl.SimklTrackingLibraryProvider
import com.streamvault.app.features.simkl.SimklTrackingProgressProvider
import com.streamvault.app.features.simkl.SimklWatchedSyncAdapter
import com.streamvault.app.features.simkl.SimklSyncRepository
import com.streamvault.app.features.tracking.TrackingProviderRegistry
import com.streamvault.app.features.trakt.TraktAuthRepository
import com.streamvault.app.features.trakt.TraktScrobbleRepository
import com.streamvault.app.features.trakt.TraktTrackingLibraryProvider
import com.streamvault.app.features.trakt.TraktTrackingProgressProvider
import com.streamvault.app.features.watching.sync.TraktWatchedSyncAdapter

fun ensureTrackingProvidersRegistered() {
    TraktAuthRepository.descriptor
    TraktScrobbleRepository.ensureRegistered()
    SimklAuthRepository.descriptor
    SimklSyncRepository.state
    SimklLibraryRepository.uiState
    SimklProgressRepository.uiState
    SimklMutationRepository.ensureRegistered()
    TrackingProviderRegistry.registerLibraryProvider(TraktTrackingLibraryProvider)
    TrackingProviderRegistry.registerLibraryProvider(SimklTrackingLibraryProvider)
    TrackingProviderRegistry.registerWatchedProvider(TraktWatchedSyncAdapter)
    TrackingProviderRegistry.registerWatchedProvider(SimklWatchedSyncAdapter)
    TrackingProviderRegistry.registerProgressProvider(TraktTrackingProgressProvider)
    TrackingProviderRegistry.registerProgressProvider(SimklTrackingProgressProvider)
}
