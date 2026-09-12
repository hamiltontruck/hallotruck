package com.hallo.logistics.driver

import android.graphics.Typeface
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.widget.addTextChangedListener
import kotlin.math.roundToInt

object DriverUiPolisher {
    private const val PROFILE_AVATAR_TAG = "driver-profile-avatar"

    fun install(activity: AppCompatActivity) {
        polishHeader(activity)
        polishTripMap(activity)
        polishProfile(activity)
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

    private fun polishTripMap(activity: AppCompatActivity) {
        val map = activity.findViewById<LiveTripMapView>(R.id.liveTripMap) ?: return
        val metrics = activity.resources.displayMetrics
        val target = (metrics.heightPixels * 0.44f).roundToInt()
            .coerceIn(dp(activity, 290), dp(activity, 430))
        map.apply {
            setBackgroundResource(R.drawable.bg_map)
            layoutParams = layoutParams.apply { height = target }
            elevation = 0f
            clipToOutline = true
        }
    }

    private fun polishProfile(activity: AppCompatActivity) {
        val page = activity.findViewById<LinearLayout>(R.id.pageProfile) ?: return
        val details = activity.findViewById<TextView>(R.id.profileDetails) ?: return
        val avatar = ensureProfileAvatar(activity, page)
        updateAvatar(activity, avatar, details.text)
        details.addTextChangedListener { text -> updateAvatar(activity, avatar, text) }
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
            page.addView(this, 2)
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
