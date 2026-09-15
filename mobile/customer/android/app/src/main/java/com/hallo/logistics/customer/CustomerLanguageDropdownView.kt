package com.hallo.logistics.customer

import android.content.Context
import android.util.AttributeSet
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.google.android.material.button.MaterialButton

/** Compact top-bar language selector matching the approved EN/OR/AM dropdown design. */
class CustomerLanguageDropdownView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = com.google.android.material.R.attr.materialButtonStyle,
) : MaterialButton(context, attrs, defStyleAttr) {

    private val languages = listOf(CustomerLanguage.EN, CustomerLanguage.OR, CustomerLanguage.AM)

    init {
        setAllCaps(false)
        setOnClickListener { showLanguageDialog() }
        refreshLabel()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        refreshLabel()
    }

    private fun currentLanguage(): CustomerLanguage = CustomerLanguage.fromTag(
        AppCompatDelegate.getApplicationLocales().get(0)?.toLanguageTag(),
    )

    private fun refreshLabel(language: CustomerLanguage = currentLanguage()) {
        text = "${language.name}  ▾"
        contentDescription = context.getString(R.string.language)
    }

    private fun showLanguageDialog() {
        val selected = languages.indexOf(currentLanguage()).coerceAtLeast(0)
        val labels = languages.map(CustomerLanguage::name).toTypedArray()

        AlertDialog.Builder(context)
            .setTitle(R.string.language)
            .setSingleChoiceItems(labels, selected) { dialog, which ->
                val language = languages[which]
                refreshLabel(language)
                dialog.dismiss()
                AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(language.tag))
            }
            .show()
    }
}
