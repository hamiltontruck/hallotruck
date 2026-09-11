package com.hallo.logistics.customer

import android.content.res.ColorStateList
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import java.util.WeakHashMap
import kotlin.math.roundToInt

/** Applies the modern profile treatment while preserving MainActivity's existing bindings/actions. */
object CustomerProfileUiPolisher {
    private const val AVATAR_TAG = "customer-profile-avatar"
    private const val EDIT_TAG = "customer-profile-edit"
    private val installed = WeakHashMap<View, Boolean>()

    fun install(root: View) {
        val page = root.findViewById<LinearLayout>(R.id.pageProfile) ?: return
        polishStatic(page)
        if (installed.put(page, true) == true) return

        page.setOnHierarchyChangeListener(object : ViewGroup.OnHierarchyChangeListener {
            override fun onChildViewAdded(parent: View?, child: View?) {
                child?.let(::polishChild)
                polishStatic(page)
            }

            override fun onChildViewRemoved(parent: View?, child: View?) = Unit
        })

        for (index in 0 until page.childCount) polishChild(page.getChildAt(index))
    }

    private fun polishStatic(page: LinearLayout) {
        page.findViewById<TextView>(R.id.profileTitle)?.apply {
            setTextColor(ContextCompat.getColor(context, R.color.hallo_navy))
            gravity = Gravity.CENTER_HORIZONTAL
        }

        page.findViewById<TextView>(R.id.profileDetails)?.let { details ->
            (details.parent as? MaterialCardView)?.apply {
                radius = px(this, 12).toFloat()
                cardElevation = 0f
                strokeWidth = px(this, 1)
                strokeColor = ContextCompat.getColor(context, R.color.hallo_line)
            }
        }

        page.findViewById<MaterialButton>(R.id.signOut)?.apply {
            minHeight = px(this, 52)
            cornerRadius = px(this, 8)
            strokeWidth = 0
            backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(context, R.color.hallo_danger))
            setTextColor(Color.WHITE)
        }
    }

    private fun polishChild(child: View) {
        when (child.tag) {
            AVATAR_TAG -> if (child is TextView) {
                child.gravity = Gravity.CENTER
                child.textSize = 28f
                val params = (child.layoutParams as? LinearLayout.LayoutParams)
                    ?: LinearLayout.LayoutParams(px(child, 88), px(child, 88))
                params.width = px(child, 88)
                params.height = px(child, 88)
                params.gravity = Gravity.CENTER_HORIZONTAL
                params.topMargin = px(child, 14)
                params.bottomMargin = px(child, 10)
                child.layoutParams = params
            }

            EDIT_TAG -> if (child is MaterialButton) {
                child.minHeight = px(child, 52)
                child.cornerRadius = px(child, 8)
                child.strokeWidth = px(child, 1)
                child.strokeColor = ColorStateList.valueOf(ContextCompat.getColor(child.context, R.color.hallo_line))
                child.backgroundTintList = ColorStateList.valueOf(Color.WHITE)
                child.setTextColor(ContextCompat.getColor(child.context, R.color.hallo_navy))
            }
        }
    }

    private fun px(view: View, dp: Int): Int = (dp * view.resources.displayMetrics.density).roundToInt()
}
