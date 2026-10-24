package com.streamvault.app.features.player

import android.app.Application
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class AndroidPlayerAudioBoostTest {
    private val player = Any()

    @After fun cleanup() {
        AndroidPlayerAudioBoost.setMultiplier(1f)
        AndroidPlayerAudioBoost.detach(player)
    }

    @Test fun boostIsSentToTheActiveEngineAndSurvivesSessionReplacement() {
        val first = mutableListOf<Float>()
        val second = mutableListOf<Float>()
        val oldPlayer = Any()
        AndroidPlayerAudioBoost.attachMpv(oldPlayer, first::add)
        assertEquals(2f, AndroidPlayerAudioBoost.setMultiplier(2f))
        assertEquals(2f, first.last())
        AndroidPlayerAudioBoost.attachMpv(player, second::add)
        AndroidPlayerAudioBoost.detach(oldPlayer)
        assertEquals(2f, AndroidPlayerAudioBoost.multiplier())
        assertEquals(2f, second.last())
        AndroidPlayerAudioBoost.setMultiplier(1f)
        assertEquals(1f, second.last())
    }

    @Test fun missingAudioSessionDoesNotReportAWorkingBoost() {
        AndroidPlayerAudioBoost.attachExo(player, 0)
        assertEquals(1f, AndroidPlayerAudioBoost.setMultiplier(2f))
        assertEquals(1f, AndroidPlayerAudioBoost.multiplier())
        val applied = mutableListOf<Float>()
        AndroidPlayerAudioBoost.attachMpv(player, applied::add)
        assertEquals(2f, applied.last())
    }
}
