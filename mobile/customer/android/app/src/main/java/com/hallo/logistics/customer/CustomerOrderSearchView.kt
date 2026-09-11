package com.hallo.logistics.customer

import android.content.Context
import android.graphics.Color
import android.text.Editable
import android.text.TextWatcher
import android.util.AttributeSet
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import kotlin.math.roundToInt

/**
 * Lightweight, view-only order search used by the existing single-activity Customer Android UI.
 * It filters rendered order cards without changing backend queries, order policy, or navigation.
 */
class CustomerOrderSearchView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : TextInputLayout(context, attrs) {

    private val input = TextInputEditText(context)
    private var ordersList: ViewGroup? = null

    init {
        tag = SEARCH_TAG
        hint = context.getString(R.string.search_orders)
        boxBackgroundMode = BOX_BACKGROUND_OUTLINE
        boxBackgroundColor = Color.WHITE
        boxStrokeColor = ContextCompat.getColor(context, R.color.hallo_line)
        setBoxCornerRadii(px(12).toFloat(), px(12).toFloat(), px(12).toFloat(), px(12).toFloat())
        endIconMode = END_ICON_CLEAR_TEXT
        isHintEnabled = true

        input.setSingleLine(true)
        input.setText(lastQuery)
        input.setTextColor(ContextCompat.getColor(context, R.color.hallo_text))
        input.setHintTextColor(ContextCompat.getColor(context, R.color.hallo_muted))
        input.textSize = 14f
        input.setPadding(px(2), 0, px(2), 0)
        addView(input, LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))

        input.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                lastQuery = s?.toString().orEmpty()
                filterOrders(lastQuery)
            }
            override fun afterTextChanged(s: Editable?) = Unit
        })
    }

    fun bind(list: ViewGroup) {
        ordersList = list
        list.setOnHierarchyChangeListener(object : ViewGroup.OnHierarchyChangeListener {
            override fun onChildViewAdded(parent: View?, child: View?) {
                post { filterOrders(lastQuery) }
            }
            override fun onChildViewRemoved(parent: View?, child: View?) = Unit
        })
        post { filterOrders(lastQuery) }
    }

    private fun filterOrders(query: String) {
        val list = ordersList ?: return
        val needle = query.trim()
        for (index in 0 until list.childCount) {
            val child = list.getChildAt(index)
            if (child === this) continue
            val tracking = child.findViewById<TextView?>(R.id.orderTrackingId) ?: continue
            val route = child.findViewById<TextView?>(R.id.orderRoute)
            val meta = child.findViewById<TextView?>(R.id.orderMeta)
            val status = child.findViewById<TextView?>(R.id.orderStatus)
            val haystack = buildString {
                append(tracking.text).append(' ')
                append(route?.text.orEmpty()).append(' ')
                append(meta?.text.orEmpty()).append(' ')
                append(status?.text.orEmpty())
            }
            child.visibility = if (needle.isBlank() || haystack.contains(needle, ignoreCase = true)) View.VISIBLE else View.GONE
        }
    }

    private fun px(dp: Int): Int = (dp * resources.displayMetrics.density).roundToInt()

    companion object {
        const val SEARCH_TAG = "customer-order-search"
        private var lastQuery: String = ""
    }
}
