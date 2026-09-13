package com.hallo.logistics.customer

import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView

/**
 * Applies the compact blue/white visual language from the approved Customer Android references.
 * This is presentation-only: existing booking, tracking, payment, profile and Supabase behavior stays authoritative.
 */
object CustomerReferenceUi {
    private var appliedRoot: View? = null

    fun apply(anchor: View) {
        val root = anchor.rootView ?: return
        if (appliedRoot === root) return
        appliedRoot = root
        val c = root.context
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
            layoutParams = layoutParams.apply { height = dp(this@apply, 82) }
            background = gradient(blue, blueDark, 0f)
            setPadding(dp(this@apply, 18), dp(this@apply, 10), dp(this@apply, 14), dp(this@apply, 8))
        }
        view(root, "statusCard")?.apply {
            background = gradient(blueDark, blueDark, 0f)
            minimumHeight = dp(this@apply, 44)
        }
        text(root, "status")?.setTextColor(Color.argb(220, 255, 255, 255))
        text(root, "headerTitle")?.apply { setTextColor(Color.WHITE); textSize = 20f; setTypeface(typeface, Typeface.BOLD) }

        // Dashboard: compact hero, then action/metric cards like the supplied reference.
        card(root, "homeMapCard")?.apply {
            radius = dpF(this@apply, 24)
            cardElevation = 0f
            strokeWidth = 0
            setCardBackgroundColor(Color.WHITE)
        }
        view(root, "homeMap")?.layoutParams = view(root, "homeMap")?.layoutParams?.apply { height = dp(root, 220) }
        text(root, "welcome")?.apply { textSize = 28f; setTextColor(navy); setTypeface(typeface, Typeface.BOLD) }
        text(root, "homeSummary")?.apply { textSize = 14f; setTextColor(muted) }

        listOf("dashOrders", "dashActive", "dashPayments", "dashProfile", "dashNotifications", "dashAllOrders").forEach { name ->
            button(root, name)?.apply {
                cornerRadius = dp(this, 18)
                minHeight = dp(this, 86)
                backgroundTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
                setTextColor(navy)
                strokeWidth = 0
                elevation = 0f
                insetTop = 0; insetBottom = 0
            }
        }
        button(root, "startBooking")?.referencePrimary(blue)
        button(root, "homeTrack")?.referencePrimary(blue)

        // Booking reference: map-first, generous rounded map and one dominant CTA.
        view(root, "bookingMap")?.layoutParams = view(root, "bookingMap")?.layoutParams?.apply { height = dp(root, 430) }
        card(root, "bookingMapCard")?.referenceCard(line, 24)
        button(root, "calculateQuote")?.referencePrimary(blue)
        button(root, "createOrder")?.referencePrimary(blue)

        // Live tracking reference: route map + assignment card + status row.
        view(root, "trackingMap")?.layoutParams = view(root, "trackingMap")?.layoutParams?.apply { height = dp(root, 390) }
        card(root, "trackingMapCard")?.referenceCard(line, 24)
        button(root, "refreshTracking")?.apply {
            cornerRadius = dp(this, 18)
            minHeight = dp(this, 54)
            backgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(245, 248, 253))
            setTextColor(blue)
            strokeWidth = 0
        }

        // Profile reference: blue identity area, white grouped account/preference/support cards.
        view(root, "pageProfile")?.setBackgroundColor(surface)
        listOf("profileCard", "profileSummaryCard", "profileAccountCard", "profilePreferencesCard", "profileSupportCard").forEach {
            card(root, it)?.referenceCard(line, 22)
        }
        button(root, "signOut")?.apply {
            minHeight = dp(this, 54)
            cornerRadius = dp(this, 18)
        }

        polishTree(root, navy, line)
        // Keep state/status semantics visible; only use green for existing positive status chips.
        listOf("trackingStatus", "orderStatus", "profileVerified").forEach { name ->
            text(root, name)?.let { if (it.text.toString().contains("deliver", true) || it.text.toString().contains("route", true) || it.text.toString().contains("verified", true)) it.setTextColor(green) }
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

    private fun MaterialCardView.referenceCard(line: Int, radiusDp: Int) {
        radius = dpF(this, radiusDp)
        cardElevation = 0f
        strokeWidth = dp(this, 1)
        strokeColor = line
        setCardBackgroundColor(Color.WHITE)
    }

    private fun MaterialButton.referencePrimary(blue: Int) {
        minHeight = dp(this, 54)
        cornerRadius = dp(this, 16)
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
    private fun gradient(start: Int, end: Int, radius: Float) = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(start, end)).apply { cornerRadius = radius }
    private fun dp(v: View, n: Int) = (n * v.resources.displayMetrics.density).toInt()
    private fun dpF(v: View, n: Int) = n * v.resources.displayMetrics.density
}
