package com.hallo.logistics.customer

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.util.AttributeSet
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton

/**
 * V5 bottom-navigation item. MainActivity owns navigation state; this view only renders that state.
 * No screen-wide presentation controller is installed from attachment callbacks.
 */
class CustomerNavButton @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : MaterialButton(context, attrs) {

    override fun setBackgroundColor(color: Int) {
        val selected = color != Color.TRANSPARENT
        val primaryBook = id == R.id.navBook
        isSelected = selected

        val background = when {
            primaryBook -> R.color.auth_blue
            selected -> R.color.hallo_navy_soft
            else -> android.R.color.transparent
        }
        val foreground = when {
            primaryBook -> android.R.color.white
            selected -> R.color.hallo_navy
            else -> R.color.hallo_muted
        }
        backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(context, background))
        setTextColor(ContextCompat.getColor(context, foreground))
        iconTint = ColorStateList.valueOf(ContextCompat.getColor(context, foreground))

        strokeWidth = if (!primaryBook && selected) resources.displayMetrics.density.toInt().coerceAtLeast(1) else 0
        strokeColor = ColorStateList.valueOf(ContextCompat.getColor(context, R.color.auth_blue))
        alpha = if (selected || primaryBook) 1f else 0.86f
        elevation = if (primaryBook) 2f * resources.displayMetrics.density else 0f
    }
}
