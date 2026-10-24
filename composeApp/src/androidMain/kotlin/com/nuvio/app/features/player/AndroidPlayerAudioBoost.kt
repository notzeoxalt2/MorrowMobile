package com.streamvault.app.features.player

import android.media.audiofx.LoudnessEnhancer
import android.util.Log
import kotlin.math.log10
import kotlin.math.roundToInt

/** Gain belongs to the active player, never Android's deprecated global session zero. */
internal object AndroidPlayerAudioBoost {
    private var owner: Any? = null
    private var enhancer: LoudnessEnhancer? = null
    private var mpvGain: ((Float) -> Unit)? = null
    private var sessionId = 0
    private var requested = 1f
    private var applied = 1f

    fun multiplier(): Float = applied

    fun attachExo(player: Any, audioSessionId: Int) {
        if (owner === player && sessionId == audioSessionId) return
        clearBackend()
        owner = player
        sessionId = audioSessionId
        applyRequested()
    }

    fun attachMpv(player: Any, apply: (Float) -> Unit) {
        clearBackend()
        owner = player
        mpvGain = apply
        applyRequested()
    }

    fun detach(player: Any) {
        if (owner !== player) return
        clearBackend()
        owner = null
    }

    fun refresh(player: Any) {
        if (owner === player) applyRequested()
    }

    fun setMultiplier(multiplier: Float): Float {
        requested = if (multiplier.isFinite()) multiplier.coerceIn(1f, 3f) else 1f
        applyRequested()
        return applied
    }

    private fun applyRequested() {
        applied = try {
            val nativeGain = mpvGain
            if (nativeGain != null) {
                nativeGain(requested)
                requested
            } else if (sessionId > 0) {
                if (requested <= 1f) {
                    enhancer?.enabled = false
                    1f
                } else {
                    val effect = enhancer ?: LoudnessEnhancer(sessionId).also { enhancer = it }
                    check(effect.hasControl())
                    effect.setTargetGain((2000.0 * log10(requested.toDouble())).roundToInt())
                    effect.enabled = true
                    if (effect.enabled) requested else 1f
                }
            } else 1f
        } catch (error: Exception) {
            Log.w("MorrowAudioBoost", "Gain unavailable for active playback session", error)
            runCatching { enhancer?.enabled = false }
            1f
        }
    }

    private fun clearBackend() {
        runCatching { enhancer?.release() }
        enhancer = null
        mpvGain = null
        sessionId = 0
        applied = 1f
    }
}
