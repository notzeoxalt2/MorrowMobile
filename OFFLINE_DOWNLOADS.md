# Android episode downloads

The Android build supports direct files and unprotected, finished HLS/DASH streams. Adaptive downloads retain manifests, media segments, audio/subtitle renditions and ordinary HLS encryption keys in a persistent per-episode cache.

- Use the existing Download action for the selected episode and source.
- Background transfers use the existing Android scheduler, with pause/resume and persisted transfer state.
- Open completed episodes in Morrow's built-in player. Adaptive downloads use ExoPlayer even when a different engine or external player is selected.
- Playback reads the download cache only. Missing media produces an error instead of downloading it silently.
- Removing an episode removes its cache and associated subtitle files.
- Live streams and streams requiring an offline DRM license are rejected.

Current adaptive downloads retain all renditions published by the selected manifest. They can use more storage than a single quality rendition. A quality selection screen remains to be implemented. iOS adaptive downloads are not enabled.

## Verification

Android host tests cover HLS manifests, segments and AES-128 keys; DASH manifests, initialization data and segments; reopening the persistent cache after closing it; reading all saved resources after the server stops; offline cache misses; and rejecting an unfinished live playlist. Existing direct-file resume tests also pass.

These tests validate storage and offline resource reads. They do not replace physical-device playback, background lifecycle and codec checks. Production Android updates still require the existing release signing configuration.
