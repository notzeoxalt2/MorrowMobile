package com.streamvault.app.features.addons

import android.content.Context

/**
 * Android implementation of DefaultAddonsSeedStorage.
 * Tracks whether default addons have already been seeded on this device.
 */
actual object DefaultAddonsSeedStorage {
    private const val PREFS_NAME = "streamvault_first_launch"
    private const val KEY_ADDONS_SEEDED = "default_addons_seeded"

    private var context: Context? = null

    fun initialize(ctx: Context) {
        context = ctx.applicationContext
    }

    actual fun isSeeded(): Boolean {
        val ctx = context ?: return true // safety: don't re-seed if context missing
        return ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_ADDONS_SEEDED, false)
    }

    actual fun markSeeded() {
        val ctx = context ?: return
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ADDONS_SEEDED, true)
            .apply()
    }
}
