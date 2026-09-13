package com.hallo.logistics.customer

import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.card.MaterialCardView
import java.util.WeakHashMap

/**
 * Presentation-only adapter for the four approved Customer Android reference screens.
 * It deliberately reuses the existing bound views and click handlers so booking,
 * tracking, payments, notifications and profile behavior remain authoritative.
 */
object CustomerApprovedScreens {
    private val installed = WeakHashMap<View, Boolean>()
    private val busy = WeakHashMap<View, Boolean>()

    fun install(root: View) {
        if (installed.put(root, true) == true) return
        root.post {
            transformOnce(root)
            restyle(root)
        }
        root.viewTreeObserver.addOnGlobalLayoutListener {
            if (busy[root] == true) return@addOnGlobalLayoutListener
            busy[root] = true
            try {
                transformOnce(root)
                restyle(root)
            } finally {
                busy[root] = false
            }
        }
    }

    private fun transformOnce(root: View) {
        transformHome(root)
        transformBooking(root)
    }

    private fun restyle(root: View) {
        val shell = root.findViewById<View>(R.id.customerShell)
        if (shell?.visibility == View.VISIBLE) {
            root.findViewById<View>(R.id.appHeader)?.visibility = View.GONE
            root.findViewById<View>(R.id.statusCard)?.visibility = View.GONE
        }
        styleHome(root)
        styleBooking(root)
        styleTracking(root)
        styleProfile(root)
        styleBottomNavigation(root)
    }

    private fun transformHome(root: View) {
        val page = root.findViewById<LinearLayout>(R.id.pageHome) ?: return
        val hero = root.findViewById<MaterialCardView>(R.id.homeMapCard) ?: return
        val welcome = root.findViewById<TextView>(R.id.welcome) ?: return
        val welcomeRow = (welcome.parent as? View)?.parent as? View ?: return
        if (welcomeRow.parent === page && page.indexOfChild(welcomeRow) != 0) {
            page.removeView(welcomeRow)
            page.addView(welcomeRow, 0)
        }
        if (hero.parent === page && page.indexOfChild(hero) != 1) {
            page.removeView(hero)
            page.addView(hero, 1)
        }

        root.findViewById<View>(R.id.homeMap)?.visibility = View.GONE
        val heroColumn = hero.getChildAt(0) as? LinearLayout ?: return
        if (heroColumn.findViewWithTag<View>(TAG_HOME_TRUCK) == null) {
            val truck = ImageView(root.context).apply {
                tag = TAG_HOME_TRUCK
                setImageResource(R.drawable.truck_isuzu_5)
                scaleType = ImageView.ScaleType.CENTER_INSIDE
                setPadding(dp(root, 24), dp(root, 12), dp(root, 24), dp(root, 8))
                background = rounded(Color.rgb(221, 235, 253), dp(root, 0))
                contentDescription = "Assigned truck"
            }
            heroColumn.addView(truck, 0, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(root, 176)))
        }

        val heroContent = heroColumn.getChildAt(heroColumn.childCount - 1) as? LinearLayout ?: return
        (heroContent.getChildAt(0) as? TextView)?.visibility = View.GONE
        root.findViewById<View>(R.id.startBooking)?.visibility = View.GONE

        val activeLabel = root.findViewById<View>(R.id.homeActiveLabel)
        val activeStatus = root.findViewById<View>(R.id.dashActiveStatus)
        val activeOrder = root.findViewById<View>(R.id.homeActiveOrder)
        val track = root.findViewById<View>(R.id.homeTrack)
        val oldActiveCard = activeLabel?.let { findAncestorCard(it) }
        listOf(activeLabel, activeStatus, activeOrder, track).filterNotNull().forEach { moveTo(heroContent, it) }
        oldActiveCard?.visibility = View.GONE

        if (heroContent.findViewWithTag<View>(TAG_HOME_DRIVER) == null) {
            val driverCard = MaterialCardView(root.context).apply {
                tag = TAG_HOME_DRIVER
                radius = dp(root, 18).toFloat()
                cardElevation = 0f
                strokeWidth = 0
                setCardBackgroundColor(Color.WHITE)
                setContentPadding(dp(root, 12), dp(root, 10), dp(root, 12), dp(root, 10))
            }
            val row = LinearLayout(root.context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            val avatar = ImageView(root.context).apply {
                tag = TAG_HOME_DRIVER_AVATAR
                scaleType = ImageView.ScaleType.CENTER_CROP
                background = rounded(Color.rgb(237, 243, 252), dp(root, 16))
                contentDescription = "Assigned driver"
            }
            row.addView(avatar, LinearLayout.LayoutParams(dp(root, 52), dp(root, 52)))
            val detail = TextView(root.context).apply {
                tag = TAG_HOME_DRIVER_TEXT
                setTextColor(NAVY)
                textSize = 14f
                setTypeface(typeface, Typeface.BOLD)
                maxLines = 3
                setPadding(dp(root, 12), 0, dp(root, 8), 0)
            }
            row.addView(detail, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            row.addView(iconAction(root, "☎", R.id.callDriver), LinearLayout.LayoutParams(dp(root, 48), dp(root, 48)))
            row.addView(iconAction(root, "💬", R.id.messageDriver), LinearLayout.LayoutParams(dp(root, 48), dp(root, 48)).apply { marginStart = dp(root, 6) })
            driverCard.addView(row)
            val trackIndex = heroContent.indexOfChild(track).takeIf { it >= 0 } ?: heroContent.childCount
            heroContent.addView(driverCard, trackIndex, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(root, 8)
                bottomMargin = dp(root, 8)
            })
        }

        if (page.findViewWithTag<View>(TAG_QUICK_ACTIONS) == null) {
            val quick = LinearLayout(root.context).apply {
                tag = TAG_QUICK_ACTIONS
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
                setPadding(0, dp(root, 12), 0, 0)
            }
            quick.addView(quickButton(root, "🚚", root.context.getString(R.string.book_truck), R.id.startBooking), weight())
            quick.addView(quickButton(root, "📍", root.context.getString(R.string.nav_track), R.id.navTrack), weight(dp(root, 6)))
            quick.addView(quickButton(root, "📋", root.context.getString(R.string.nav_orders), R.id.navOrders), weight(dp(root, 6)))
            quick.addView(quickButton(root, "💳", root.context.getString(R.string.nav_payments), R.id.navBook), weight(dp(root, 6)))
            page.addView(quick, 2)
        }

        hideOldDashboardMetrics(root)
    }

    private fun styleHome(root: View) {
        val page = root.findViewById<LinearLayout>(R.id.pageHome) ?: return
        page.setPadding(0, 0, 0, dp(root, 8))
        val welcome = root.findViewById<TextView>(R.id.welcome)
        val summary = root.findViewById<TextView>(R.id.homeSummary)
        val welcomeRow = (welcome?.parent as? View)?.parent as? View
        welcomeRow?.apply {
            background = gradient(BLUE, BLUE_DARK, dp(root, 24))
            setPadding(dp(root, 20), dp(root, 18), dp(root, 14), dp(root, 18))
        }
        welcome?.apply { setTextColor(Color.WHITE); textSize = 26f }
        summary?.apply { setTextColor(Color.argb(220, 255, 255, 255)); textSize = 13f }
        root.findViewById<MaterialButton>(R.id.refresh)?.apply {
            backgroundTintList = ColorStateList.valueOf(Color.argb(35, 255, 255, 255))
            iconTint = ColorStateList.valueOf(GOLD)
        }
        root.findViewById<MaterialCardView>(R.id.homeMapCard)?.apply {
            radius = dp(root, 22).toFloat()
            cardElevation = 0f
            strokeWidth = 0
        }
        root.findViewById<MaterialButton>(R.id.homeTrack)?.apply {
            minHeight = dp(root, 54)
            cornerRadius = dp(root, 15)
            backgroundTintList = ColorStateList.valueOf(BLUE)
            setTextColor(Color.WHITE)
            iconTint = ColorStateList.valueOf(Color.WHITE)
        }
        root.findViewWithTag<TextView>(TAG_HOME_DRIVER_TEXT)?.text = root.findViewById<TextView>(R.id.driverDetails)?.text
        val sourcePhoto = root.findViewById<ImageView>(R.id.driverPhoto)
        root.findViewWithTag<ImageView>(TAG_HOME_DRIVER_AVATAR)?.apply {
            if (sourcePhoto?.drawable != null) {
                setImageDrawable(sourcePhoto.drawable)
                visibility = View.VISIBLE
            } else {
                setImageResource(R.drawable.hallo_logistics_logo)
                visibility = View.VISIBLE
            }
        }
    }

    private fun hideOldDashboardMetrics(root: View) {
        listOf(R.id.dashOrders, R.id.dashActive, R.id.dashPayments, R.id.dashNotifications, R.id.dashAllOrders, R.id.dashProfile).forEach { id ->
            root.findViewById<View>(id)?.visibility = View.GONE
        }
        val page = root.findViewById<LinearLayout>(R.id.pageHome) ?: return
        for (i in 0 until page.childCount) {
            val child = page.getChildAt(i)
            if (child is TextView && child.text == root.context.getString(R.string.dash_overview)) child.visibility = View.GONE
        }
    }

    private fun transformBooking(root: View) {
        val page = root.findViewById<LinearLayout>(R.id.pageBook) ?: return
        val selector = root.findViewById<MaterialButtonToggleGroup>(R.id.languageSelector) ?: return
        var brandRow = page.findViewWithTag<LinearLayout>(TAG_BOOK_BRAND)
        if (brandRow == null) {
            brandRow = LinearLayout(root.context).apply {
                tag = TAG_BOOK_BRAND
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 0, 0, dp(root, 10))
            }
            val brand = MaterialCardView(root.context).apply {
                radius = dp(root, 18).toFloat()
                cardElevation = 0f
                setCardBackgroundColor(Color.WHITE)
                setContentPadding(dp(root, 14), dp(root, 10), dp(root, 14), dp(root, 10))
            }
            val brandText = TextView(root.context).apply {
                text = "HALLOTRUCK\nCustomer  ·  Smart Logistics"
                setTextColor(BLUE)
                textSize = 16f
                setTypeface(typeface, Typeface.BOLD)
            }
            brand.addView(brandText)
            brandRow.addView(brand, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            page.addView(brandRow, 0)
        }
        if (selector.parent !== brandRow) {
            (selector.parent as? ViewGroup)?.removeView(selector)
            brandRow.addView(selector, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(root, 44)).apply { marginStart = dp(root, 8) })
        }
        selector.visibility = View.VISIBLE
    }

    private fun styleBooking(root: View) {
        val page = root.findViewById<LinearLayout>(R.id.pageBook) ?: return
        page.setPadding(0, 0, 0, dp(root, 10))
        root.findViewById<View>(R.id.bookTitle)?.visibility = View.GONE
        root.findViewById<View>(R.id.bookSubtitle)?.visibility = View.GONE
        val stepRoute = root.findViewById<View>(R.id.stepRoute)
        ((stepRoute?.parent as? View)?.parent as? View)?.visibility = View.GONE
        root.findViewById<View>(R.id.routeSectionTitle)?.visibility = View.GONE
        root.findViewById<View>(R.id.bookingMap)?.layoutParams = root.findViewById<View>(R.id.bookingMap)?.layoutParams?.apply { height = dp(root, 500) }
        findAncestorCard(root.findViewById(R.id.bookingMap))?.apply {
            radius = dp(root, 26).toFloat()
            cardElevation = 0f
            strokeWidth = 0
        }
        listOf(R.id.pickupLayout, R.id.dropoffLayout).forEach { id ->
            root.findViewById<View>(id)?.let { view ->
                findAncestorCard(view)?.apply {
                    radius = dp(root, 20).toFloat()
                    cardElevation = 0f
                    strokeWidth = 0
                }
            }
        }
        root.findViewById<MaterialButton>(R.id.calculateQuote)?.apply {
            minHeight = dp(root, 54)
            cornerRadius = dp(root, 17)
            backgroundTintList = ColorStateList.valueOf(BLUE)
            setTextColor(Color.WHITE)
        }
        val actions = root.findViewWithTag<LinearLayout>("customer-route-actions")
        actions?.let { row ->
            row.gravity = Gravity.END
            if (row.childCount > 1) for (i in 1 until row.childCount) row.getChildAt(i).visibility = View.GONE
            (row.getChildAt(0) as? MaterialButton)?.apply {
                val old = text.toString()
                contentDescription = old
                text = "📍"
                minWidth = dp(root, 56)
                minimumWidth = dp(root, 56)
                minHeight = dp(root, 56)
                cornerRadius = dp(root, 28)
                backgroundTintList = ColorStateList.valueOf(BLUE)
                setTextColor(Color.WHITE)
                layoutParams = LinearLayout.LayoutParams(dp(root, 56), dp(root, 56))
            }
        }
    }

    private fun styleTracking(root: View) {
        val page = root.findViewById<LinearLayout>(R.id.pageTracking) ?: return
        page.setPadding(0, 0, 0, dp(root, 10))
        root.findViewById<TextView>(R.id.trackingTitle)?.apply {
            background = gradient(BLUE, BLUE_DARK, dp(root, 24))
            setTextColor(Color.WHITE)
            textSize = 22f
            setPadding(dp(root, 18), dp(root, 16), dp(root, 18), dp(root, 16))
        }
        root.findViewById<TextView>(R.id.trackingFreshness)?.apply {
            background = rounded(Color.rgb(30, 181, 122), dp(root, 18))
            setTextColor(Color.WHITE)
            setPadding(dp(root, 12), dp(root, 7), dp(root, 12), dp(root, 7))
        }
        root.findViewById<View>(R.id.trackingMap)?.layoutParams = root.findViewById<View>(R.id.trackingMap)?.layoutParams?.apply { height = dp(root, 340) }
        findAncestorCard(root.findViewById(R.id.trackingMap))?.apply {
            radius = dp(root, 22).toFloat()
            cardElevation = 0f
            strokeWidth = 0
        }
        val driverDetails = root.findViewById<TextView>(R.id.driverDetails)
        findAncestorCard(driverDetails)?.apply {
            radius = dp(root, 22).toFloat()
            cardElevation = 0f
            strokeWidth = 0
        }
        root.findViewById<ImageView>(R.id.driverPhoto)?.apply {
            clipToOutline = true
            background = rounded(Color.rgb(236, 243, 252), dp(root, 18))
        }
        root.findViewById<MaterialButton>(R.id.callDriver)?.referenceAction(root, true)
        root.findViewById<MaterialButton>(R.id.messageDriver)?.referenceAction(root, false)
        root.findViewById<MaterialButton>(R.id.refreshTracking)?.apply {
            minHeight = dp(root, 54)
            cornerRadius = dp(root, 16)
            backgroundTintList = ColorStateList.valueOf(Color.WHITE)
            setTextColor(BLUE)
            iconTint = ColorStateList.valueOf(BLUE)
        }

        val status = root.findViewById<TextView>(R.id.tripStatus)
        val eta = root.findViewById<TextView>(R.id.tripEta)
        val gps = root.findViewById<TextView>(R.id.tripVehicle)
        val statRow = status?.parent as? LinearLayout
        val remaining = root.findViewWithTag<TextView>("customer-tracking-remaining")
        if (statRow != null) {
            statRow.orientation = LinearLayout.HORIZONTAL
            statRow.weightSum = 3f
            gps?.visibility = if (remaining != null) View.GONE else View.VISIBLE
            listOfNotNull(status, eta, remaining ?: gps).forEachIndexed { index, view ->
                view.visibility = View.VISIBLE
                view.gravity = Gravity.CENTER
                view.textSize = 12f
                view.background = rounded(Color.WHITE, dp(root, 16))
                view.layoutParams = LinearLayout.LayoutParams(0, dp(root, 78), 1f).apply {
                    marginStart = if (index == 0) 0 else dp(root, 4)
                    marginEnd = if (index == 2) 0 else dp(root, 4)
                }
            }
        }
    }

    private fun styleProfile(root: View) {
        val page = root.findViewById<LinearLayout>(R.id.pageProfile) ?: return
        page.setPadding(0, 0, 0, dp(root, 12))
        root.findViewById<TextView>(R.id.profileTitle)?.apply {
            textSize = 14f
            setTextColor(Color.argb(230, 255, 255, 255))
            gravity = Gravity.CENTER
            background = gradient(BLUE, BLUE_DARK, dp(root, 24))
            setPadding(dp(root, 18), dp(root, 16), dp(root, 18), dp(root, 86))
        }
        page.findViewWithTag<TextView>("customer-profile-avatar")?.apply {
            background = rounded(Color.WHITE, dp(root, 100))
            setTextColor(NAVY)
            elevation = dp(root, 3).toFloat()
        }
        val details = root.findViewById<TextView>(R.id.profileDetails)
        findAncestorCard(details)?.apply {
            radius = dp(root, 22).toFloat()
            cardElevation = 0f
            strokeWidth = 0
            setCardBackgroundColor(Color.WHITE)
        }
        details?.apply {
            textSize = 14f
            setLineSpacing(dp(root, 6).toFloat(), 1.05f)
            setTextColor(NAVY)
        }
        page.findViewWithTag<MaterialButton>("customer-profile-edit")?.apply {
            minHeight = dp(root, 52)
            cornerRadius = dp(root, 16)
            backgroundTintList = ColorStateList.valueOf(Color.WHITE)
            setTextColor(BLUE)
        }
        root.findViewById<MaterialButton>(R.id.signOut)?.apply {
            minHeight = dp(root, 54)
            cornerRadius = dp(root, 18)
            backgroundTintList = ColorStateList.valueOf(Color.rgb(255, 239, 239))
            setTextColor(Color.rgb(190, 48, 48))
        }
    }

    private fun styleBottomNavigation(root: View) {
        root.findViewById<View>(R.id.bottomNavigation)?.apply {
            background = rounded(Color.WHITE, 0)
            elevation = dp(root, 10).toFloat()
            minimumHeight = dp(root, 72)
        }
        listOf(R.id.navHome, R.id.navOrders, R.id.navTrack, R.id.navBook, R.id.navProfile).forEach { id ->
            root.findViewById<MaterialButton>(id)?.apply {
                minWidth = 0
                minimumWidth = 0
                minHeight = dp(root, 58)
                textSize = 10f
                iconSize = dp(root, 22)
                setTextColor(Color.rgb(113, 132, 157))
                iconTint = ColorStateList.valueOf(Color.rgb(113, 132, 157))
            }
        }
    }

    private fun MaterialButton.referenceAction(root: View, primary: Boolean) {
        minHeight = dp(root, 50)
        cornerRadius = dp(root, 14)
        backgroundTintList = ColorStateList.valueOf(if (primary) BLUE else Color.rgb(242, 246, 252))
        setTextColor(if (primary) Color.WHITE else NAVY)
        iconTint = ColorStateList.valueOf(if (primary) Color.WHITE else NAVY)
    }

    private fun quickButton(root: View, icon: String, label: String, targetId: Int) = MaterialButton(root.context).apply {
        text = "$icon\n$label"
        gravity = Gravity.CENTER
        textSize = 11f
        isAllCaps = false
        minWidth = 0
        minimumWidth = 0
        minHeight = dp(root, 92)
        cornerRadius = dp(root, 18)
        backgroundTintList = ColorStateList.valueOf(Color.WHITE)
        setTextColor(NAVY)
        setOnClickListener { root.findViewById<View>(targetId)?.performClick() }
    }

    private fun iconAction(root: View, icon: String, targetId: Int) = MaterialButton(root.context).apply {
        text = icon
        isAllCaps = false
        minWidth = 0
        minimumWidth = 0
        minHeight = dp(root, 48)
        cornerRadius = dp(root, 14)
        backgroundTintList = ColorStateList.valueOf(Color.rgb(242, 246, 252))
        setTextColor(NAVY)
        setOnClickListener { root.findViewById<View>(targetId)?.performClick() }
    }

    private fun moveTo(parent: ViewGroup, child: View) {
        if (child.parent === parent) return
        (child.parent as? ViewGroup)?.removeView(child)
        parent.addView(child)
    }

    private fun findAncestorCard(view: View?): MaterialCardView? {
        var node = view?.parent
        while (node is View) {
            if (node is MaterialCardView) return node
            node = node.parent
        }
        return null
    }

    private fun weight(start: Int = 0) = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = start }

    private fun rounded(color: Int, radius: Int) = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(color)
        cornerRadius = radius.toFloat()
    }

    private fun gradient(start: Int, end: Int, radius: Int) = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(start, end)).apply {
        cornerRadius = radius.toFloat()
    }

    private fun dp(view: View, value: Int) = (value * view.resources.displayMetrics.density).toInt()

    private const val TAG_HOME_TRUCK = "approved-home-truck"
    private const val TAG_HOME_DRIVER = "approved-home-driver"
    private const val TAG_HOME_DRIVER_AVATAR = "approved-home-driver-avatar"
    private const val TAG_HOME_DRIVER_TEXT = "approved-home-driver-text"
    private const val TAG_QUICK_ACTIONS = "approved-home-quick-actions"
    private const val TAG_BOOK_BRAND = "approved-book-brand"

    private val NAVY = Color.rgb(10, 35, 69)
    private val BLUE = Color.rgb(25, 99, 220)
    private val BLUE_DARK = Color.rgb(18, 67, 153)
    private val GOLD = Color.rgb(238, 183, 28)
}
