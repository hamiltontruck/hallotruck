package com.hallo.logistics.driver

import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.widget.addTextChangedListener
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.navigation.NavigationBarView
import kotlin.math.roundToInt

object DriverUiPolisher {
    private const val PROFILE_AVATAR_TAG = "driver-profile-avatar"
    private const val HOME_QUICK_ACTIONS_TAG = "driver-home-quick-actions"
    private const val TRIP_MESSAGES_TAG = "driver-trip-messages"
    private const val WALLET_SETTLEMENT_TAG = "driver-wallet-settlement"
    private const val WALLET_EARNINGS_TAG = "driver-wallet-earnings"
    private const val WALLET_SUPPORT_TAG = "driver-wallet-support"
    private const val PROFILE_OPERATIONS_TAG = "driver-profile-operations"

    fun install(activity: AppCompatActivity) {
        polishHeader(activity)
        polishAuthenticatedShell(activity)
        polishHome(activity)
        polishTripMap(activity)
        polishTrackingState(activity)
        polishProfile(activity)
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        val root = content?.getChildAt(0)
        if (root != null) DriverPortalParityUi.apply(root)
        installCommunicationsActions(activity)
    }

    private fun polishHeader(activity: AppCompatActivity) {
        val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
        val root = content.getChildAt(0) as? ViewGroup ?: return
        val header = root.getChildAt(0) as? ViewGroup ?: return
        val logo = header.getChildAt(0) as? ImageView ?: return
        logo.apply {
            setImageResource(R.drawable.hallo_logistics_logo)
            imageTintList = null
            scaleType = ImageView.ScaleType.FIT_CENTER
            setPadding(0, 0, 0, 0)
            layoutParams = layoutParams.apply {
                width = dp(activity, 58)
                height = dp(activity, 44)
            }
        }
    }

    private fun polishAuthenticatedShell(activity: AppCompatActivity) {
        val bottom = activity.findViewById<BottomNavigationView>(R.id.bottomNavigation) ?: return
        bottom.apply {
            setBackgroundColor(ContextCompat.getColor(activity, R.color.hallo_card))
            itemActiveIndicatorColor = ColorStateList.valueOf(ContextCompat.getColor(activity, R.color.hallo_blue_soft))
            itemIconTintList = ContextCompat.getColorStateList(activity, R.color.driver_nav_text)
            itemTextColor = ContextCompat.getColorStateList(activity, R.color.driver_nav_text)
            labelVisibilityMode = NavigationBarView.LABEL_VISIBILITY_LABELED
            elevation = dp(activity, 8).toFloat()
            minimumHeight = dp(activity, 70)
        }
        activity.findViewById<MaterialCardView>(R.id.statusCard)?.apply {
            radius = dp(activity, 14).toFloat()
            strokeWidth = dp(activity, 1)
            strokeColor = ContextCompat.getColor(activity, R.color.hallo_border)
            cardElevation = 0f
        }
        activity.findViewById<TextView>(R.id.status)?.apply {
            includeFontPadding = false
            setLineSpacing(0f, 1.08f)
        }
    }

    private fun polishHome(activity: AppCompatActivity) {
        val page = activity.findViewById<LinearLayout>(R.id.pageHome) ?: return
        ensureHomeQuickActions(activity, page)
        val widthDp = activity.resources.configuration.screenWidthDp
        for (index in 0 until page.childCount) {
            val child = page.getChildAt(index)
            if (child is LinearLayout && child.orientation == LinearLayout.HORIZONTAL && child.childCount == 3 && widthDp < 360) {
                child.orientation = LinearLayout.VERTICAL
                for (cardIndex in 0 until child.childCount) {
                    val card = child.getChildAt(cardIndex)
                    card.layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        dp(activity, 82),
                    ).apply {
                        topMargin = if (cardIndex == 0) 0 else dp(activity, 8)
                    }
                }
                break
            }
        }
    }

    private fun ensureHomeQuickActions(activity: AppCompatActivity, page: LinearLayout) {
        if (page.findViewWithTag<View>(HOME_QUICK_ACTIONS_TAG) != null) return
        val bottom = activity.findViewById<BottomNavigationView>(R.id.bottomNavigation)
        val host = LinearLayout(activity).apply {
            tag = HOME_QUICK_ACTIONS_TAG
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(activity, 12) }
        }
        host.addView(
            actionRow(
                activity,
                R.string.available_jobs to { bottom?.selectedItemId = R.id.nav_jobs },
                R.string.active_trip to { bottom?.selectedItemId = R.id.nav_trip },
            ),
        )
        host.addView(
            actionRow(
                activity,
                R.string.earnings to { bottom?.selectedItemId = R.id.nav_wallet },
                R.string.documents to { activity.findViewById<View>(R.id.documentsAction)?.performClick() },
            ).apply { (layoutParams as? LinearLayout.LayoutParams)?.topMargin = dp(activity, 8) },
        )
        val insertIndex = (0 until page.childCount).firstOrNull { page.getChildAt(it).id == R.id.homeSummary } ?: 2
        page.addView(host, insertIndex.coerceAtMost(page.childCount))
    }

    private fun actionRow(
        activity: AppCompatActivity,
        left: Pair<Int, () -> Unit>,
        right: Pair<Int, () -> Unit>,
    ): LinearLayout = LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL
        weightSum = 2f
        addView(quickAction(activity, left.first, left.second, endMargin = 4))
        addView(quickAction(activity, right.first, right.second, startMargin = 4))
    }

    private fun quickAction(
        activity: AppCompatActivity,
        label: Int,
        onClick: () -> Unit,
        startMargin: Int = 0,
        endMargin: Int = 0,
    ) = MaterialButton(activity, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
        setText(label)
        isAllCaps = false
        minHeight = dp(activity, 52)
        cornerRadius = dp(activity, 14)
        strokeWidth = dp(activity, 1)
        strokeColor = ColorStateList.valueOf(ContextCompat.getColor(activity, R.color.hallo_border))
        backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(activity, R.color.hallo_card))
        setTextColor(ContextCompat.getColor(activity, R.color.hallo_navy))
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(0, dp(activity, 52), 1f).apply {
            marginStart = dp(activity, startMargin)
            marginEnd = dp(activity, endMargin)
        }
    }

    private fun polishTripMap(activity: AppCompatActivity) {
        val map = activity.findViewById<LiveTripMapView>(R.id.liveTripMap) ?: return
        val metrics = activity.resources.displayMetrics
        val target = (metrics.heightPixels * 0.40f).roundToInt()
            .coerceIn(dp(activity, 260), dp(activity, 410))
        map.apply {
            setBackgroundResource(R.drawable.bg_map)
            layoutParams = layoutParams.apply { height = target }
            elevation = 0f
            clipToOutline = true
        }
    }

    private fun polishTrackingState(activity: AppCompatActivity) {
        activity.findViewById<TextView>(R.id.liveMapState)?.apply {
            includeFontPadding = false
            setLineSpacing(0f, 1.08f)
            setPadding(dp(activity, 12), dp(activity, 10), dp(activity, 12), dp(activity, 10))
            setTextColor(ContextCompat.getColor(activity, R.color.hallo_text))
            setBackgroundResource(R.drawable.bg_status_chip)
        }
    }

    private fun polishProfile(activity: AppCompatActivity) {
        val page = activity.findViewById<LinearLayout>(R.id.pageProfile) ?: return
        val details = activity.findViewById<TextView>(R.id.profileDetails) ?: return
        val avatar = ensureProfileAvatar(activity, page)
        updateAvatar(activity, avatar, details.text)
        details.addTextChangedListener { text -> updateAvatar(activity, avatar, text) }
        activity.findViewById<MaterialButton>(R.id.signOut)?.apply {
            minHeight = dp(activity, 52)
            cornerRadius = dp(activity, 14)
            backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(activity, R.color.hallo_danger))
            setTextColor(ContextCompat.getColor(activity, android.R.color.white))
        }
    }

    private fun installCommunicationsActions(activity: AppCompatActivity) {
        activity.findViewById<LinearLayout>(R.id.tripActions)?.let { host ->
            ensureAction(activity, host, TRIP_MESSAGES_TAG, R.string.comms_message_customer, null) {
                activity.startActivity(Intent(activity, DriverCommunicationsActivity::class.java).putExtra(DriverCommunicationsActivity.EXTRA_MODE, DriverCommunicationMode.CUSTOMER.name))
            }
        }
        activity.findViewById<LinearLayout>(R.id.pageWallet)?.let { host ->
            ensureAction(activity, host, WALLET_SETTLEMENT_TAG, R.string.settlement_pay_title, 2) {
                activity.startActivity(Intent(activity, DriverCommissionSettlementActivity::class.java))
            }
            ensureAction(activity, host, WALLET_EARNINGS_TAG, R.string.earnings_open_action, 3) {
                activity.startActivity(Intent(activity, DriverEarningsActivity::class.java))
            }
            ensureAction(activity, host, WALLET_SUPPORT_TAG, R.string.comms_open_messages, 4) {
                activity.startActivity(Intent(activity, DriverCommunicationsActivity::class.java).putExtra(DriverCommunicationsActivity.EXTRA_MODE, DriverCommunicationMode.CUSTOMER.name))
            }
        }
        activity.findViewById<LinearLayout>(R.id.pageProfile)?.let { host ->
            ensureAction(activity, host, PROFILE_OPERATIONS_TAG, R.string.comms_message_operations, 3) {
                activity.startActivity(Intent(activity, DriverCommunicationsActivity::class.java).putExtra(DriverCommunicationsActivity.EXTRA_MODE, DriverCommunicationMode.OPERATIONS.name))
            }
        }
    }

    private fun ensureAction(
        activity: AppCompatActivity,
        host: LinearLayout,
        tagValue: String,
        label: Int,
        index: Int?,
        onClick: () -> Unit,
    ) {
        if (host.findViewWithTag<MaterialButton>(tagValue) != null) return
        val button = MaterialButton(activity, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            tag = tagValue
            setText(label)
            isAllCaps = false
            minHeight = dp(activity, 52)
            cornerRadius = dp(activity, 14)
            strokeWidth = dp(activity, 1)
            strokeColor = ColorStateList.valueOf(ContextCompat.getColor(activity, R.color.hallo_border))
            backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(activity, R.color.hallo_card))
            setTextColor(ContextCompat.getColor(activity, R.color.hallo_navy))
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(activity, 52)).apply {
                topMargin = dp(activity, 10)
            }
        }
        if (index == null || index >= host.childCount) host.addView(button) else host.addView(button, index)
    }

    private fun ensureProfileAvatar(activity: AppCompatActivity, page: LinearLayout): TextView {
        page.findViewWithTag<TextView>(PROFILE_AVATAR_TAG)?.let { return it }
        return TextView(activity).apply {
            tag = PROFILE_AVATAR_TAG
            gravity = Gravity.CENTER
            text = "D"
            textSize = 28f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(ContextCompat.getColor(activity, R.color.hallo_navy))
            background = ContextCompat.getDrawable(activity, R.drawable.bg_profile_avatar)
            layoutParams = LinearLayout.LayoutParams(dp(activity, 88), dp(activity, 88)).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                topMargin = dp(activity, 18)
                bottomMargin = dp(activity, 4)
            }
            page.addView(this, 2.coerceAtMost(page.childCount))
        }
    }

    private fun updateAvatar(activity: AppCompatActivity, avatar: TextView, profileText: CharSequence?) {
        val firstLine = profileText?.toString()?.lineSequence()?.firstOrNull().orEmpty()
        val displayName = firstLine.substringAfter(':', firstLine).trim()
        avatar.text = displayName.firstOrNull()?.uppercaseChar()?.toString() ?: "D"
        avatar.contentDescription = displayName.ifBlank { activity.getString(R.string.profile) }
    }

    private fun dp(activity: AppCompatActivity, value: Int): Int =
        (value * activity.resources.displayMetrics.density).roundToInt()
}
