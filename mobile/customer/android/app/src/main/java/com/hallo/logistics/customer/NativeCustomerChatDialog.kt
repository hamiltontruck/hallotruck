package com.hallo.logistics.customer

import android.app.Dialog
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

class NativeCustomerChatDialog(
    private val activity: AppCompatActivity,
    private val orderId: String,
    private val driverName: String,
    private val repository: CustomerDriverChatRepository = CustomerDriverChatRepository(),
) {
    private var pollingJob: Job? = null
    private var threadId: String? = null

    fun show() {
        val content = activity.layoutInflater.inflate(R.layout.dialog_customer_driver_chat_native, null, false)
        val dialog = Dialog(activity).apply {
            setContentView(content)
            setCanceledOnTouchOutside(true)
        }
        dialog.window?.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT)
        content.findViewById<TextView>(R.id.nativeChatDriverName).text = driverName
        val messages = content.findViewById<LinearLayout>(R.id.nativeChatMessages)
        val scroll = content.findViewById<ScrollView>(R.id.nativeChatScroll)
        val error = content.findViewById<TextView>(R.id.nativeChatError)
        val input = content.findViewById<EditText>(R.id.nativeChatInput)
        val send = content.findViewById<MaterialButton>(R.id.nativeChatSend)

        suspend fun reload() {
            val id = threadId ?: return
            runCatching { repository.messages(id) }
                .onSuccess { rows ->
                    renderMessages(messages, rows)
                    runCatching { repository.markRead(id) }
                    error.visibility = View.GONE
                    scroll.post { scroll.fullScroll(View.FOCUS_DOWN) }
                }
                .onFailure {
                    error.text = CustomerAuthPolicy.safeMessage(it)
                    error.visibility = View.VISIBLE
                }
        }

        fun sendMessage() {
            val text = input.text.toString().trim()
            val id = threadId ?: return
            if (text.isBlank()) return
            send.isEnabled = false
            activity.lifecycleScope.launch {
                runCatching {
                    repository.send(id, text)
                    input.setText("")
                    reload()
                }.onFailure {
                    error.text = CustomerAuthPolicy.safeMessage(it)
                    error.visibility = View.VISIBLE
                }
                send.isEnabled = true
            }
        }

        send.setOnClickListener { sendMessage() }
        input.setOnEditorActionListener { _, _, _ ->
            sendMessage()
            true
        }

        dialog.setOnDismissListener { pollingJob?.cancel() }
        dialog.show()
        dialog.window?.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT)

        pollingJob = activity.lifecycleScope.launch {
            runCatching { repository.open(orderId) }
                .onSuccess { threadId = it }
                .onFailure {
                    error.text = CustomerAuthPolicy.safeMessage(it)
                    error.visibility = View.VISIBLE
                    return@launch
                }
            reload()
            while (isActive && dialog.isShowing) {
                delay(3_000)
                reload()
            }
        }
    }

    private fun renderMessages(container: LinearLayout, rows: List<CustomerDriverChatMessage>) {
        val me = CustomerRepository().userId()
        container.removeAllViews()
        if (rows.isEmpty()) {
            container.addView(TextView(activity).apply {
                text = activity.getString(R.string.native_chat_empty)
                setTextColor(activity.getColor(R.color.hallo_muted))
                textSize = 13f
                gravity = Gravity.CENTER
                setPadding(dp(12), dp(28), dp(12), dp(28))
            })
            return
        }
        rows.forEach { row ->
            val mine = row.senderId == me
            val bubble = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = if (mine) Gravity.END else Gravity.START
                background = rounded(if (mine) activity.getColor(R.color.hallo_navy) else activity.getColor(R.color.hallo_navy_soft))
                setPadding(dp(12), dp(9), dp(12), dp(8))
            }
            bubble.addView(TextView(activity).apply {
                text = row.body
                setTextColor(activity.getColor(if (mine) android.R.color.white else R.color.hallo_text))
                textSize = 14f
            })
            bubble.addView(TextView(activity).apply {
                text = formatTime(row.createdAt)
                setTextColor(activity.getColor(if (mine) android.R.color.white else R.color.hallo_muted))
                alpha = 0.75f
                textSize = 9f
                gravity = Gravity.END
            })
            container.addView(bubble, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                gravity = if (mine) Gravity.END else Gravity.START
                topMargin = dp(6)
                leftMargin = if (mine) dp(44) else 0
                rightMargin = if (mine) 0 else dp(44)
            })
        }
    }

    private fun formatTime(value: String): String = runCatching {
        DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)
            .withLocale(activity.resources.configuration.locales[0])
            .withZone(ZoneId.systemDefault())
            .format(Instant.parse(value))
    }.getOrDefault(value)

    private fun rounded(color: Int) = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(color)
        cornerRadius = dp(14).toFloat()
    }

    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
}
