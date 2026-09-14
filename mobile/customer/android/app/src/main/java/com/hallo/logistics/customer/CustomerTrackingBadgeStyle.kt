package com.hallo.logistics.customer

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.widget.TextView
import java.util.WeakHashMap

/** Retains the semantic GPS state across presentation adapters and localized labels. */
object CustomerTrackingBadgeStyle {
    private val freshness = WeakHashMap<TextView, String>()

    fun apply(view: TextView, value: String? = null) {
        if (value != null) freshness[view] = value
        val color = view.context.getColor(when (freshness[view]) {
            "LIVE" -> R.color.hallo_success
            "STALE" -> R.color.hallo_warning
            else -> R.color.hallo_danger
        })
        view.backgroundTintList = null
        view.background = GradientDrawable().apply {
            setColor(color)
            cornerRadius = 18 * view.resources.displayMetrics.density
        }
        view.setTextColor(Color.WHITE)
    }
}
