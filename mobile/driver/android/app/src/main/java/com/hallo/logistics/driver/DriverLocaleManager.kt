package com.hallo.logistics.driver

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

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
     * Apply the persisted locale before AppCompat attaches the Activity context.
     * The equality guard is important because setApplicationLocales() owns the
     * Activity recreation when the locale actually changes.
     */
    fun applySaved(context: Context) {
        applyToDelegate(saved(context))
    }

    fun apply(context: Context, language: String) {
        val safe = language.takeIf { it in supported } ?: OR
        if (saved(context) != safe) {
            // Persist before AppCompat recreates the Activity so process death / force-stop
            // cannot race the preference write.
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY, safe)
                .commit()
        }
        applyToDelegate(safe)
    }

    private fun applyToDelegate(language: String) {
        val current = AppCompatDelegate.getApplicationLocales().toLanguageTags()
        if (current == language) return
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(language))
    }

    fun compactLabel(language: String) = when (language) {
        EN -> "EN"
        AM -> "አማ"
        else -> "OR"
    }
}
