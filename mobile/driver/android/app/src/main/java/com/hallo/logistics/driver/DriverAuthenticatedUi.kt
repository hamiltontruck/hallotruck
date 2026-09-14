package com.hallo.logistics.driver

import android.content.res.ColorStateList
import android.graphics.Typeface
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.navigation.NavigationBarView
import kotlin.math.roundToInt

/**
 * Presentation-only polish for authenticated Driver Android screens.
 *
 * This class deliberately does not own data, lifecycle transitions, finance calculations,
 * location collection, or repository calls. Existing MainActivity/ViewModel bindings remain
 * authoritative and this layer only improves visual hierarchy and responsive behavior.
 */
object DriverAuthenticatedUi {
    fun install(activity: AppCompatActivity) {
        polishHome(activity)
        polishJobs(activity)
        polishTripAndTracking(activity)
        polishWallet(activity)
        polishDocuments(activity)
        polishProfile(activity)
        polishNavigation(activity)
    }

    private fun polishHome(activity: AppCompatActivity) {
        val page = activity.findViewById<LinearLayout>(R.id.pageHome) ?: return
        page.clipChildren = false
        page.clipToPadding = false

        activity.findViewById<TextView>(R.id.accessState)?.apply {
            includeFontPadding = false
            setTypeface(typeface, Typeface.BOLD)
            minHeight = dp(activity, 32)
            gravity = android.view.Gravity.CENTER_VERTICAL
        }

        listOf(R.id.homeAvailableJobs, R.id.homeActiveTrip, R.id.homeDocuments).forEach { id ->
            activity.findViewById<TextView>(id)?.apply {
                includeFontPadding = false
                setLineSpacing(0f, 1.05f)
                setTextColor(ContextCompat.getColor(activity, R.color.hallo_navy))
                (parent as? MaterialCardView)?.apply {
                    radius = dp(activity, 16).toFloat()
                    cardElevation = 0f
                    strokeWidth = dp(activity, 1)
                    strokeColor = ContextCompat.getColor(activity, R.color.hallo_border)
                    setCardBackgroundColor(ContextCompat.getColor(activity, R.color.hallo_card))
                }
            }
        }

        activity.findViewById<TextView>(R.id.homeAssignment)?.apply {
            includeFontPadding = false
            setLineSpacing(dp(activity, 2).toFloat(), 1.08f)
            setPadding(dp(activity, 18), dp(activity, 18), dp(activity, 18), dp(activity, 18))
            (parent as? MaterialCardView)?.apply {
                radius = dp(activity, 20).toFloat()
                cardElevation = 0f
                strokeWidth = 0
                setCardBackgroundColor(ContextCompat.getColor(activity, R.color.hallo_navy))
            }
        }

        activity.findViewById<TextView>(R.id.homeEarnings)?.apply {
            includeFontPadding = false
            setLineSpacing(dp(activity, 2).toFloat(), 1.08f)
            setPadding(dp(activity, 18), dp(activity, 16), dp(activity, 18), dp(activity, 16))
            (parent as? MaterialCardView)?.apply {
                radius = dp(activity, 16).toFloat()
                cardElevation = 0f
                strokeWidth = dp(activity, 1)
                strokeColor = ContextCompat.getColor(activity, R.color.hallo_border)
            }
        }

        activity.findViewById<MaterialButton>(R.id.refresh)?.applyPrimaryOrOutline(activity, primary = false)
    }

    private fun polishJobs(activity: AppCompatActivity) {
        val list = activity.findViewById<LinearLayout>(R.id.jobsList) ?: return
        list.clipChildren = false
        list.clipToPadding = false
        installDynamicCardPolish(activity, list)
    }

    private fun polishTripAndTracking(activity: AppCompatActivity) {
        activity.findViewById<TextView>(R.id.tripDetails)?.apply {
            includeFontPadding = false
            setLineSpacing(dp(activity, 2).toFloat(), 1.08f)
        }
        activity.findViewById<TextView>(R.id.liveMapState)?.apply {
            includeFontPadding = false
            minHeight = dp(activity, 44)
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(dp(activity, 12), dp(activity, 10), dp(activity, 12), dp(activity, 10))
            setBackgroundResource(R.drawable.bg_status_chip)
        }
        activity.findViewById<LiveTripMapView>(R.id.liveTripMap)?.apply {
            val widthDp = resources.configuration.screenWidthDp
            val target = when {
                widthDp <= 320 -> 250
                widthDp <= 360 -> 275
                widthDp <= 390 -> 300
                else -> 320
            }
            layoutParams = layoutParams.apply { height = dp(activity, target) }
            setBackgroundResource(R.drawable.bg_map)
            clipToOutline = true
        }
        activity.findViewById<MaterialButton>(R.id.startTrip)?.applyPrimaryOrOutline(activity, primary = true)
        activity.findViewById<MaterialButton>(R.id.startTracking)?.applyPrimaryOrOutline(activity, primary = true)
        activity.findViewById<MaterialButton>(R.id.stopTracking)?.applyPrimaryOrOutline(activity, primary = false)
        activity.findViewById<MaterialButton>(R.id.openNavigation)?.applyPrimaryOrOutline(activity, primary = false)
        activity.findViewById<MaterialButton>(R.id.finishTrip)?.applyPrimaryOrOutline(activity, primary = true)
    }

    private fun polishWallet(activity: AppCompatActivity) {
        listOf(R.id.walletDetails, R.id.commissionDetails).forEach { id ->
            activity.findViewById<TextView>(id)?.apply {
                includeFontPadding = false
                setLineSpacing(dp(activity, 2).toFloat(), 1.08f)
                (parent as? MaterialCardView)?.apply {
                    radius = dp(activity, 16).toFloat()
                    cardElevation = 0f
                    strokeWidth = dp(activity, 1)
                    strokeColor = ContextCompat.getColor(activity, R.color.hallo_border)
                }
            }
        }
        listOf(R.id.tripHistoryList, R.id.depositHistoryList, R.id.commissionPaymentsList).forEach { id ->
            activity.findViewById<LinearLayout>(id)?.let { list ->
                list.clipChildren = false
                list.clipToPadding = false
                installDynamicCardPolish(activity, list)
            }
        }
    }

    private fun polishDocuments(activity: AppCompatActivity) {
        activity.findViewById<TextView>(R.id.documentState)?.apply {
            includeFontPadding = false
            setLineSpacing(dp(activity, 2).toFloat(), 1.08f)
            setPadding(dp(activity, 16), dp(activity, 16), dp(activity, 16), dp(activity, 16))
            (parent as? MaterialCardView)?.apply {
                radius = dp(activity, 16).toFloat()
                cardElevation = 0f
                strokeWidth = dp(activity, 1)
                strokeColor = ContextCompat.getColor(activity, R.color.hallo_border)
            }
        }
        activity.findViewById<MaterialButton>(R.id.saveVehicle)?.applyPrimaryOrOutline(activity, primary = true)
        activity.findViewById<MaterialButton>(R.id.chooseDocument)?.applyPrimaryOrOutline(activity, primary = false)
    }

    private fun polishProfile(activity: AppCompatActivity) {
        listOf(R.id.profileDetails, R.id.profileVehicle).forEach { id ->
            activity.findViewById<TextView>(id)?.apply {
                includeFontPadding = false
                setLineSpacing(dp(activity, 2).toFloat(), 1.08f)
                (parent as? MaterialCardView)?.apply {
                    radius = dp(activity, 16).toFloat()
                    cardElevation = 0f
                    strokeWidth = dp(activity, 1)
                    strokeColor = ContextCompat.getColor(activity, R.color.hallo_border)
                }
            }
        }
        activity.findViewById<MaterialButton>(R.id.profileDocuments)?.applyPrimaryOrOutline(activity, primary = false)
        activity.findViewById<MaterialButton>(R.id.signOut)?.apply {
            minHeight = dp(activity, 52)
            cornerRadius = dp(activity, 14)
            isAllCaps = false
            backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(activity, R.color.hallo_danger))
            setTextColor(ContextCompat.getColor(activity, android.R.color.white))
        }
    }

    private fun polishNavigation(activity: AppCompatActivity) {
        activity.findViewById<BottomNavigationView>(R.id.bottomNavigation)?.apply {
            setBackgroundColor(ContextCompat.getColor(activity, R.color.hallo_card))
            itemActiveIndicatorColor = ColorStateList.valueOf(ContextCompat.getColor(activity, R.color.hallo_blue_soft))
            itemIconTintList = ContextCompat.getColorStateList(activity, R.color.driver_nav_text)
            itemTextColor = ContextCompat.getColorStateList(activity, R.color.driver_nav_text)
            labelVisibilityMode = NavigationBarView.LABEL_VISIBILITY_LABELED
            minimumHeight = dp(activity, 68)
            elevation = dp(activity, 8).toFloat()
        }
    }

    private fun installDynamicCardPolish(activity: AppCompatActivity, host: LinearLayout) {
        fun polish(child: View) {
            when (child) {
                is MaterialCardView -> child.apply {
                    radius = dp(activity, 16).toFloat()
                    cardElevation = 0f
                    strokeWidth = dp(activity, 1)
                    strokeColor = ContextCompat.getColor(activity, R.color.hallo_border)
                    setCardBackgroundColor(ContextCompat.getColor(activity, R.color.hallo_card))
                    val lp = layoutParams as? LinearLayout.LayoutParams
                    if (lp != null) {
                        lp.topMargin = maxOf(lp.topMargin, dp(activity, 8))
                        layoutParams = lp
                    }
                }
                is MaterialButton -> child.applyPrimaryOrOutline(activity, primary = true)
            }
            if (child is ViewGroup) for (index in 0 until child.childCount) polish(child.getChildAt(index))
        }
        for (index in 0 until host.childCount) polish(host.getChildAt(index))
        host.setOnHierarchyChangeListener(object : ViewGroup.OnHierarchyChangeListener {
            override fun onChildViewAdded(parent: View?, child: View?) { child?.let(::polish) }
            override fun onChildViewRemoved(parent: View?, child: View?) = Unit
        })
    }

    private fun MaterialButton.applyPrimaryOrOutline(activity: AppCompatActivity, primary: Boolean) {
        minHeight = dp(activity, 52)
        cornerRadius = dp(activity, 14)
        isAllCaps = false
        if (primary) {
            backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(activity, R.color.hallo_blue))
            setTextColor(ContextCompat.getColor(activity, android.R.color.white))
        } else {
            backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(activity, R.color.hallo_card))
            strokeWidth = dp(activity, 1)
            strokeColor = ColorStateList.valueOf(ContextCompat.getColor(activity, R.color.hallo_blue))
            setTextColor(ContextCompat.getColor(activity, R.color.hallo_blue))
        }
    }

    private fun dp(activity: AppCompatActivity, value: Int): Int =
        (value * activity.resources.displayMetrics.density).roundToInt()
}
