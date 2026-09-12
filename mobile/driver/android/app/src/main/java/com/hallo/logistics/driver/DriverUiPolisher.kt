package com.hallo.logistics.driver

import android.content.res.ColorStateList
import android.graphics.Typeface
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.hallo.logistics.driver.databinding.ActivityMainBinding
import kotlin.math.roundToInt

object DriverUiPolisher {
    private const val PROFILE_AVATAR_TAG = "driver-profile-avatar"

    fun install(binding: ActivityMainBinding) {
        polishHeader(binding)
        polishTripMap(binding)
        ensureProfileAvatar(binding)
    }

    fun renderProfileAvatar(binding: ActivityMainBinding, name: String?) {
        val avatar = binding.pageProfile.findViewWithTag<TextView>(PROFILE_AVATAR_TAG) ?: ensureProfileAvatar(binding)
        val safeName = name?.trim().orEmpty()
        avatar.text = safeName.firstOrNull()?.uppercaseChar()?.toString() ?: "D"
        avatar.contentDescription = if (safeName.isBlank()) {
            binding.root.context.getString(R.string.profile)
        } else {
            safeName
        }
    }

    private fun polishHeader(binding: ActivityMainBinding) {
        val root = binding.root as? ViewGroup ?: return
        val header = root.getChildAt(0) as? ViewGroup ?: return
        val logo = header.getChildAt(0) as? ImageView ?: return
        logo.apply {
            setImageResource(R.drawable.hallo_logistics_logo)
            imageTintList = null
            scaleType = ImageView.ScaleType.FIT_CENTER
            setPadding(0, 0, 0, 0)
            layoutParams = layoutParams.apply {
                width = dp(58)
                height = dp(44)
            }
        }
    }

    private fun polishTripMap(binding: ActivityMainBinding) {
        val context = binding.root.context
        val metrics = context.resources.displayMetrics
        val target = (metrics.heightPixels * 0.44f).roundToInt().coerceIn(dp(context, 290), dp(context, 430))
        binding.liveTripMap.apply {
            setBackgroundResource(R.drawable.bg_map)
            layoutParams = layoutParams.apply { height = target }
            elevation = 0f
            clipToOutline = true
        }
    }

    private fun ensureProfileAvatar(binding: ActivityMainBinding): TextView {
        binding.pageProfile.findViewWithTag<TextView>(PROFILE_AVATAR_TAG)?.let { return it }
        val context = binding.root.context
        return TextView(context).apply {
            tag = PROFILE_AVATAR_TAG
            gravity = Gravity.CENTER
            text = "D"
            textSize = 28f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(ContextCompat.getColor(context, R.color.hallo_navy))
            background = ContextCompat.getDrawable(context, R.drawable.bg_profile_avatar)
            layoutParams = LinearLayout.LayoutParams(dp(88), dp(88)).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                topMargin = dp(18)
                bottomMargin = dp(4)
            }
            binding.pageProfile.addView(this, 2)
        }
    }

    private fun ViewGroup.dp(value: Int): Int = dp(context, value)
    private fun ImageView.dp(value: Int): Int = dp(context, value)
    private fun TextView.dp(value: Int): Int = dp(context, value)
    private fun dp(context: android.content.Context, value: Int): Int =
        (value * context.resources.displayMetrics.density).roundToInt()
}
