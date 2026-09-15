package com.hallo.logistics.driver

import android.content.res.ColorStateList
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView

/** View-only portal parity polish. Business actions remain owned by MainActivity/ViewModel. */
object DriverPortalParityUi {
    fun apply(root: View) {
        val context = root.context
        listOf("pageHome", "pageOnboarding", "pageJobs", "pageTrip", "pageWallet", "pageAlerts", "pageProfile").forEach { name ->
            val id = context.resources.getIdentifier(name, "id", context.packageName)
            if (id != 0) root.findViewById<View>(id)?.let(::polishTree)
        }
    }

    private fun polishTree(view: View) {
        when (view) {
            is MaterialCardView -> {
                view.radius = dp(view, 16f)
                view.cardElevation = 0f
                view.strokeWidth = dp(view, 1f).toInt()
                view.strokeColor = ContextCompat.getColor(view.context, R.color.hallo_border)
            }
            is MaterialButton -> {
                view.isAllCaps = false
                view.minimumHeight = dp(view, 48f).toInt()
                view.cornerRadius = dp(view, 14f).toInt()
                if (view.backgroundTintList == null) {
                    view.backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(view.context, R.color.hallo_card))
                }
            }
            is TextView -> {
                view.includeFontPadding = false
                if (view.textSize in 12f..20f) view.setLineSpacing(0f, 1.06f)
            }
            is LinearLayout -> view.clipToPadding = false
        }
        if (view is ViewGroup) {
            view.clipChildren = false
            for (i in 0 until view.childCount) polishTree(view.getChildAt(i))
        }
    }

    private fun dp(view: View, value: Float) = value * view.resources.displayMetrics.density
}
