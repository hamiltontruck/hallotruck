package com.hallo.logistics.customer

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.util.AttributeSet
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.google.android.material.textview.MaterialTextView
import kotlin.math.roundToInt

/** Colored status pill that also installs the page-level search control once order cards exist. */
class CustomerOrderStatusView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : MaterialTextView(context, attrs) {

    init {
        setPadding(px(10), px(5), px(10), px(5))
        minHeight = px(28)
        gravity = android.view.Gravity.CENTER
    }

    override fun setText(text: CharSequence?, type: TextView.BufferType?) {
        super.setText(text, type)
        applyStatusStyle(text?.toString().orEmpty())
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        post { ensureSearchControl() }
    }

    private fun applyStatusStyle(value: String) {
        val normalized = value.trim().lowercase()
        val (foreground, backgroundColor) = when {
            normalized.contains("deliver") || normalized.contains("complete") ->
                R.color.hallo_success to 0xFFE7F6EE.toInt()
            normalized.contains("cancel") || normalized.contains("reject") ->
                R.color.hallo_danger to 0xFFFDECEA.toInt()
            normalized.contains("transit") || normalized.contains("active") || normalized.contains("route") ->
                R.color.hallo_navy to 0xFFEAF0F8.toInt()
            normalized.contains("pending") || normalized.contains("wait") || normalized.contains("review") ->
                R.color.hallo_warning to 0xFFFFF3E8.toInt()
            else -> R.color.hallo_navy to 0xFFF0F4F9.toInt()
        }
        setTextColor(ContextCompat.getColor(context, foreground))
        background = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = px(14).toFloat()
            setColor(backgroundColor)
        }
    }

    private fun ensureSearchControl() {
        val list = findAncestor(R.id.ordersList) as? LinearLayout ?: return
        if (list.findViewWithTag<View>(CustomerOrderSearchView.SEARCH_TAG) != null) return
        val search = CustomerOrderSearchView(context)
        val params = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = px(4)
            bottomMargin = px(12)
        }
        list.addView(search, 0, params)
        search.bind(list)
    }

    private fun findAncestor(targetId: Int): View? {
        var current: View? = parent as? View
        while (current != null) {
            if (current.id == targetId) return current
            current = current.parent as? View
        }
        return null
    }

    private fun px(dp: Int): Int = (dp * resources.displayMetrics.density).roundToInt()
}
