package com.hallo.logistics.customer

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.util.AttributeSet
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton

/**
 * Five-way Customer navigation item. MainActivity still owns navigation state; this view
 * translates the legacy selected-color signal into the compact Mobile V4 visual language.
 */
class CustomerNavButton @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : MaterialButton(context, attrs) {

    override fun setBackgroundColor(color: Int) {
        val selected = color != Color.TRANSPARENT
        isSelected = selected
        backgroundTintList = ColorStateList.valueOf(
            ContextCompat.getColor(context, if (selected) R.color.hallo_navy_soft else android.R.color.transparent),
        )
        setTextColor(ContextCompat.getColor(context, if (selected) R.color.hallo_navy else R.color.hallo_muted))
        iconTint = ColorStateList.valueOf(
            ContextCompat.getColor(context, if (selected) R.color.hallo_navy else R.color.hallo_muted),
        )
        strokeWidth = if (selected) resources.displayMetrics.density.toInt().coerceAtLeast(1) else 0
        strokeColor = ColorStateList.valueOf(ContextCompat.getColor(context, R.color.hallo_gold))
        alpha = if (selected) 1f else 0.88f
    }
}
