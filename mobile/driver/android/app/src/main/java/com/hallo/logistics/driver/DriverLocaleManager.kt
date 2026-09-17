package com.hallo.logistics.driver

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import java.util.Locale

object DriverLocaleManager {
    private const val PREFS = "hallo_driver_language"
    private const val KEY = "language"

    const val EN = "en"
    const val OR = "om"
    const val AM = "am"

    val supported = setOf(EN, OR, AM)

    fun saved(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, OR)
            .orEmpty()
            .takeIf { it in supported }
            ?: OR

    /**
     * Wrap every Driver Activity with the persisted locale before resources are inflated.
     * This avoids a split state where the signed-out auth surface changes language but the
     * authenticated shell keeps the process/default resources.
     */
    fun wrap(context: Context): Context {
        val language = saved(context)
        val locale = Locale.forLanguageTag(language)
        Locale.setDefault(locale)
        val configuration = Configuration(context.resources.configuration).apply {
            setLocale(locale)
            setLayoutDirection(locale)
        }
        return context.createConfigurationContext(configuration)
    }

    fun apply(context: Context, language: String) {
        val safe = language.takeIf { it in supported } ?: OR
        val changed = saved(context) != safe
        if (changed) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY, safe)
                .commit()
        }
        // Recreate the current screen so all XML resources, dynamic getString() calls,
        // menus, dialogs and authenticated pages are inflated from one locale context.
        if (changed && context is Activity && !context.isFinishing && !context.isDestroyed) {
            context.recreate()
        }
    }

    fun compactLabel(language: String) = when (language) {
        EN -> "EN"
        AM -> "አማ"
        else -> "OR"
    }
}
