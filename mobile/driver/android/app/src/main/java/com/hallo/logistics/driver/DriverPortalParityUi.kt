package com.hallo.logistics.driver

import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.material.card.MaterialCardView

/** View-only portal parity polish. Business actions remain owned by MainActivity/ViewModel. */
object DriverPortalParityUi {
    fun apply(root: View) {
        val context = root.context
        val ids = listOf("pageHome", "pageJobs", "pageTrip", "pageWallet", "pageProfile")
        ids.forEach { name ->
            val id = context.resources.getIdentifier(name, "id", context.packageName)
            if (id != 0) root.findViewById<View>(id)?.let(::polishTree)
        }
    }

    private fun polishTree(view: View) {
        when (view) {
            is MaterialCardView -> {
                view.radius = dp(view, 16f)
                view.cardElevation = dp(view, 0f)
            }
            is TextView -> if (view.textSize in 14f..18f) view.includeFontPadding = false
        }
        if (view is ViewGroup) for (i in 0 until view.childCount) polishTree(view.getChildAt(i))
    }

    private fun dp(view: View, value: Float) = value * view.resources.displayMetrics.density
}
