package com.hallo.logistics.driver

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

object DriverLocaleManager {
    private const val PREFS="hallo_driver_language"
    private const val KEY="language"
    const val EN="en"
    const val OR="om"
    const val AM="am"
    val supported=setOf(EN,OR,AM)

    fun saved(context:Context):String=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString(KEY,OR).orEmpty().takeIf{it in supported}?:OR
    fun applySaved(context:Context)=apply(context,saved(context))
    fun apply(context:Context,language:String){
        val safe=language.takeIf{it in supported}?:OR
        context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString(KEY,safe).apply()
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(safe))
    }
    fun compactLabel(language:String)=when(language){EN->"EN";AM->"አማ";else->"OR"}
}
