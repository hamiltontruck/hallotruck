package com.hallo.logistics.customer

import android.graphics.Typeface
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

class NativeCustomerNotificationsController(
    private val activity: AppCompatActivity,
    private val root: View,
    private val viewModel: CustomerViewModel,
) {
    private val list = root.findViewById<LinearLayout>(R.id.nativeNotificationsList)
    private val empty = root.findViewById<TextView>(R.id.nativeNotificationsEmpty)
    private val summary = root.findViewById<TextView>(R.id.nativeNotificationsSummary)

    init {
        root.findViewById<MaterialButton>(R.id.nativeNotificationsRefresh).setOnClickListener { viewModel.refresh() }
    }

    fun render(state: CustomerUiState) {
        val unread = state.notifications.count { it.readAt == null }
        summary.text = when (language()) {
            CustomerLanguage.OR -> "Beeksisa ${state.notifications.size} · hin dubbifamne $unread"
            CustomerLanguage.AM -> "${state.notifications.size} ማሳወቂያዎች · $unread ያልተነበቡ"
            CustomerLanguage.EN -> "${state.notifications.size} notifications · $unread unread"
        }
        empty.visibility = if (state.notifications.isEmpty()) View.VISIBLE else View.GONE
        list.removeAllViews()
        state.notifications.forEach { notification -> list.addView(card(notification)) }
    }

    private fun card(item: CustomerNotification): View {
        val unread = item.readAt == null
        val card = MaterialCardView(activity).apply {
            radius = dp(18).toFloat()
            cardElevation = 0f
            strokeWidth = dp(if (unread) 2 else 1)
            strokeColor = activity.getColor(if (unread) R.color.auth_blue else R.color.hallo_line)
            setCardBackgroundColor(activity.getColor(android.R.color.white))
        }
        val content = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(15), dp(14), dp(15), dp(14))
        }
        content.addView(TextView(activity).apply {
            text = item.title
            setTextColor(activity.getColor(R.color.hallo_navy))
            textSize = 16f
            setTypeface(typeface, if (unread) Typeface.BOLD else Typeface.NORMAL)
        })
        content.addView(TextView(activity).apply {
            text = item.body
            setTextColor(activity.getColor(R.color.hallo_text))
            textSize = 13f
            setPadding(0, dp(6), 0, 0)
        })
        content.addView(TextView(activity).apply {
            text = formatDate(item.createdAt)
            setTextColor(activity.getColor(R.color.hallo_muted))
            textSize = 10f
            setPadding(0, dp(7), 0, 0)
        })
        if (unread) {
            content.addView(MaterialButton(activity, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
                text = when (language()) {
                    CustomerLanguage.OR -> "Akka dubbifameetti mallatteessi"
                    CustomerLanguage.AM -> "እንደተነበበ ምልክት ያድርጉ"
                    CustomerLanguage.EN -> "Mark as read"
                }
                isAllCaps = false
                setOnClickListener { viewModel.markNotificationRead(item) }
            })
        }
        card.addView(content)
        card.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(10)
        }
        return card
    }

    private fun formatDate(value: String): String = runCatching {
        DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)
            .withLocale(activity.resources.configuration.locales[0] ?: Locale.getDefault())
            .withZone(ZoneId.systemDefault())
            .format(Instant.parse(value))
    }.getOrDefault(value)

    private fun language() = CustomerLanguage.fromTag(activity.resources.configuration.locales[0]?.toLanguageTag())
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
}
