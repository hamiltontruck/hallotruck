package com.hallo.logistics.customer

import android.content.Context
import android.util.AttributeSet
import com.google.android.material.textfield.MaterialAutoCompleteTextView

/**
 * Read-only Material exposed dropdown that always opens its adapter on tap.
 *
 * Using MaterialAutoCompleteTextView keeps TextInputLayout hint/notch geometry correct on
 * physical devices while preserving the existing adapter/value contract.
 */
class HalloDropdownView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = com.google.android.material.R.attr.autoCompleteTextViewStyle,
) : MaterialAutoCompleteTextView(context, attrs, defStyleAttr) {

    init {
        threshold = 0
        keyListener = null
        isCursorVisible = false
        isFocusable = true
        setOnClickListener { openOptions() }
        setOnFocusChangeListener { _, hasFocus ->
            if (hasFocus) post(::openOptions)
        }
    }

    override fun performClick(): Boolean {
        val handled = super.performClick()
        post(::openOptions)
        return handled
    }

    private fun openOptions() {
        if (adapter != null && adapter.count > 0 && !isPopupShowing) {
            showDropDown()
        }
    }
}
