package com.hallo.logistics.customer

import android.content.Context
import android.util.AttributeSet
import androidx.appcompat.widget.AppCompatAutoCompleteTextView

/**
 * Read-only native dropdown that always opens its adapter on tap.
 * Keeps booking option fields predictable on physical Android devices.
 */
class HalloDropdownView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = android.R.attr.autoCompleteTextViewStyle,
) : AppCompatAutoCompleteTextView(context, attrs, defStyleAttr) {

    init {
        threshold = 0
        keyListener = null
        isCursorVisible = false
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
