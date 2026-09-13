package com.hallo.logistics.customer

import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView

/** Presentation-only visual parity with the approved Customer Android references. */
object CustomerReferenceUi {
    private var appliedRoot: View? = null

    fun apply(anchor: View) {
        val root = anchor.rootView ?: return
        if (appliedRoot === root) return
        appliedRoot = root
        val navy = Color.rgb(10, 35, 69)
        val blue = Color.rgb(31, 98, 218)
        val blueDark = Color.rgb(24, 75, 160)
        val surface = Color.rgb(239, 244, 250)
        val line = Color.rgb(222, 230, 241)
        val muted = Color.rgb(121, 139, 165)
        val green = Color.rgb(22, 169, 113)

        root.setBackgroundColor(surface)
        view(root, "customerShell")?.setBackgroundColor(surface)
        view(root, "bottomNavigation")?.setBackgroundColor(Color.WHITE)

        view(root, "appHeader")?.apply {
            layoutParams = layoutParams.apply { height = dp(root, 82) }
            background = gradient(blue, blueDark)
            setPadding(dp(root, 18), dp(root, 10), dp(root, 14), dp(root, 8))
        }
        view(root, "statusCard")?.apply {
            background = gradient(blueDark, blueDark)
            minimumHeight = dp(root, 44)
        }
        text(root, "status")?.setTextColor(Color.argb(220, 255, 255, 255))
        text(root, "headerTitle")?.apply { setTextColor(Color.WHITE); textSize = 20f; setTypeface(typeface, Typeface.BOLD) }

        card(root, "homeMapCard")?.apply {
            radius = dpF(root, 24)
            cardElevation = 0f
            strokeWidth = 0
            setCardBackgroundColor(Color.WHITE)
        }
        view(root, "homeMap")?.let { it.layoutParams = it.layoutParams.apply { height = dp(root, 220) } }
        text(root, "welcome")?.apply { textSize = 28f; setTextColor(navy); setTypeface(typeface, Typeface.BOLD) }
        text(root, "homeSummary")?.apply { textSize = 14f; setTextColor(muted) }

        listOf("dashOrders", "dashActive", "dashPayments", "dashProfile", "dashNotifications", "dashAllOrders").forEach { name ->
            button(root, name)?.apply {
                cornerRadius = dp(root, 18)
                minHeight = dp(root, 86)
                backgroundTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
                setTextColor(navy)
                strokeWidth = 0
                elevation = 0f
                insetTop = 0; insetBottom = 0
            }
        }
        button(root, "startBooking")?.referencePrimary(root, blue)
        button(root, "homeTrack")?.referencePrimary(root, blue)

        view(root, "bookingMap")?.let { it.layoutParams = it.layoutParams.apply { height = dp(root, 430) } }
        card(root, "bookingMapCard")?.referenceCard(root, line, 24)
        button(root, "calculateQuote")?.referencePrimary(root, blue)
        button(root, "createOrder")?.referencePrimary(root, blue)

        view(root, "trackingMap")?.let { it.layoutParams = it.layoutParams.apply { height = dp(root, 390) } }
        card(root, "trackingMapCard")?.referenceCard(root, line, 24)
        button(root, "refreshTracking")?.apply {
            cornerRadius = dp(root, 18)
            minHeight = dp(root, 54)
            backgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(245, 248, 253))
            setTextColor(blue)
            strokeWidth = 0
        }

        view(root, "pageProfile")?.setBackgroundColor(surface)
        listOf("profileCard", "profileSummaryCard", "profileAccountCard", "profilePreferencesCard", "profileSupportCard").forEach {
            card(root, it)?.referenceCard(root, line, 22)
        }
        button(root, "signOut")?.apply { minHeight = dp(root, 54); cornerRadius = dp(root, 18) }

        polishTree(root, navy, line)
        listOf("trackingStatus", "orderStatus", "profileVerified").forEach { name ->
            text(root, name)?.let {
                val value = it.text.toString()
                if (value.contains("deliver", true) || value.contains("route", true) || value.contains("verified", true)) it.setTextColor(green)
            }
        }
    }

    private fun polishTree(v: View, navy: Int, line: Int) {
        if (v is MaterialCardView) {
            if (v.radius < dpF(v, 16)) v.radius = dpF(v, 16)
            v.cardElevation = 0f
            if (v.strokeWidth > 0) v.strokeColor = line
        }
        if (v is TextView) {
            v.includeFontPadding = false
            if (v.textSize >= 18f) v.setTextColor(navy)
        }
        if (v is ImageView) v.clipToOutline = true
        if (v is ViewGroup) for (i in 0 until v.childCount) polishTree(v.getChildAt(i), navy, line)
    }

    private fun MaterialCardView.referenceCard(root: View, line: Int, radiusDp: Int) {
        radius = dpF(root, radiusDp)
        cardElevation = 0f
        strokeWidth = dp(root, 1)
        strokeColor = line
        setCardBackgroundColor(Color.WHITE)
    }

    private fun MaterialButton.referencePrimary(root: View, blue: Int) {
        minHeight = dp(root, 54)
        cornerRadius = dp(root, 16)
        backgroundTintList = android.content.res.ColorStateList.valueOf(blue)
        setTextColor(Color.WHITE)
        strokeWidth = 0
        insetTop = 0; insetBottom = 0
    }

    private fun view(root: View, name: String): View? {
        val id = root.resources.getIdentifier(name, "id", root.context.packageName)
        return if (id == 0) null else root.findViewById(id)
    }
    private fun text(root: View, name: String) = view(root, name) as? TextView
    private fun button(root: View, name: String) = view(root, name) as? MaterialButton
    private fun card(root: View, name: String) = view(root, name) as? MaterialCardView
    private fun gradient(start: Int, end: Int) = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(start, end))
    private fun dp(v: View, n: Int) = (n * v.resources.displayMetrics.density).toInt()
    private fun dpF(v: View, n: Int) = n * v.resources.displayMetrics.density
}
