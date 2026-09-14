package com.hallo.logistics.customer

import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.BitmapDrawable
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.ArrayDeque
import java.util.WeakHashMap

/**
 * Presentation-only fixes found during the PR #433 real-device smoke.
 * No backend, pricing, payment, RLS, tracking or order state is mutated here.
 */
object CustomerSmokePolish {
    private const val TAG_TOP_CHROME = "customer-parity-top-chrome"
    private const val TAG_BOTTOM_BOOK = "customer-unified-nav-book"
    private val installed = WeakHashMap<View, Boolean>()
    private val cleanedLogos = WeakHashMap<ImageView, Boolean>()

    fun install(root: View) {
        if (installed.put(root, true) == true) return
        val activity = root.context as? AppCompatActivity ?: return
        val viewModel = ViewModelProvider(activity)[CustomerViewModel::class.java]

        root.post { refresh(root, viewModel.state.value) }
        root.postDelayed({ refresh(root, viewModel.state.value) }, 350)

        activity.lifecycleScope.launch {
            activity.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.state.collect { state ->
                    root.post { refresh(root, state) }
                }
            }
        }
    }

    private fun refresh(root: View, state: CustomerUiState) {
        polishTopChrome(root)
        polishBottomBook(root)
        refreshHomeMetrics(root, state)
        polishTrackingFreshness(root)
        polishProfile(root)
    }

    private fun polishTopChrome(root: View) {
        val chrome = root.findViewWithTag<MaterialCardView>(TAG_TOP_CHROME) ?: return
        val row = chrome.getChildAt(0) as? LinearLayout ?: return
        if (row.childCount < 7) return

        val compact = root.resources.configuration.screenWidthDp <= 360
        chrome.setContentPadding(dp(root, 8), dp(root, 8), dp(root, 7), dp(root, 8))

        (row.getChildAt(0) as? ImageView)?.apply {
            layoutParams = LinearLayout.LayoutParams(dp(root, if (compact) 38 else 42), dp(root, if (compact) 38 else 42))
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            cleanOpaqueLogoEdge(this)
        }

        (row.getChildAt(1) as? LinearLayout)?.apply {
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(root, 7)
                marginEnd = dp(root, 2)
            }
            (getChildAt(0) as? TextView)?.apply {
                text = "HALLO\nLOGISTICS"
                textSize = if (compact) 11f else 12f
                maxLines = 2
                setLineSpacing(0f, 0.92f)
            }
            (getChildAt(1) as? TextView)?.apply {
                textSize = if (compact) 8f else 9f
                maxLines = 2
            }
        }

        (row.getChildAt(2) as? MaterialButton)?.apply {
            minWidth = 0
            minimumWidth = 0
            setPadding(0, 0, 0, 0)
            layoutParams = LinearLayout.LayoutParams(dp(root, if (compact) 38 else 40), dp(root, 40))
        }

        (row.getChildAt(3) as? TextView)?.apply {
            layoutParams = LinearLayout.LayoutParams(dp(root, 17), dp(root, 17)).apply {
                marginStart = -dp(root, 10)
                marginEnd = -dp(root, 5)
                topMargin = -dp(root, 18)
            }
            textSize = 8f
        }

        val checked = root.findViewById<com.google.android.material.button.MaterialButtonToggleGroup>(R.id.languageSelector)?.checkedButtonId
        val specs = listOf(
            Triple(row.getChildAt(4) as? MaterialButton, "EN", R.id.languageEn),
            Triple(row.getChildAt(5) as? MaterialButton, "OR", R.id.languageOr),
            Triple(row.getChildAt(6) as? MaterialButton, "አማ", R.id.languageAm),
        )
        specs.forEachIndexed { index, (button, label, target) ->
            button ?: return@forEachIndexed
            button.text = label
            button.minWidth = 0
            button.minimumWidth = 0
            button.minHeight = dp(root, 38)
            button.setPadding(0, 0, 0, 0)
            button.textSize = if (compact) 8f else 9f
            button.icon = null
            val width = when {
                compact && index == 2 -> 30
                compact -> 27
                index == 2 -> 33
                else -> 29
            }
            button.layoutParams = LinearLayout.LayoutParams(dp(root, width), dp(root, 38)).apply {
                if (index > 0) marginStart = dp(root, 2)
            }
            val active = checked == target
            button.backgroundTintList = ColorStateList.valueOf(color(root, if (active) R.color.hallo_blue else android.R.color.white))
            button.setTextColor(color(root, if (active) android.R.color.white else R.color.hallo_navy))
            button.strokeColor = ColorStateList.valueOf(color(root, if (active) R.color.hallo_blue else R.color.hallo_line))
        }
    }

    private fun polishBottomBook(root: View) {
        root.findViewWithTag<MaterialButton>(TAG_BOTTOM_BOOK)?.apply {
            text = root.context.getString(R.string.nav_book)
            contentDescription = root.context.getString(R.string.nav_book)
            minWidth = 0
            minimumWidth = 0
            minHeight = dp(root, 60)
            setPadding(0, 0, 0, 0)
            textSize = 9f
            maxLines = 1
            iconSize = dp(root, 20)
            iconPadding = dp(root, 1)
            insetTop = 0
            insetBottom = 0
        }
    }

    private fun refreshHomeMetrics(root: View, state: CustomerUiState) {
        val active = state.orders.count { CustomerPolicy.showAssignment(it.status) }
        val delivered = state.orders.count { it.status == "delivered" }
        val due = state.orders.filterNot { it.status == "cancelled" }.sumOf { order ->
            CustomerPaymentPolicy.summarize(order, state.payments.filter { it.orderId == order.id }).remainingToSubmit
        }
        root.findViewWithTag<TextView>("customer-metric-orders")?.text = state.orders.size.toString()
        root.findViewWithTag<TextView>("customer-metric-active")?.text = active.toString()
        root.findViewWithTag<TextView>("customer-metric-due")?.text = "ETB ${NumberFormat.getIntegerInstance().format(due)}"
        root.findViewWithTag<TextView>("customer-metric-delivered")?.text = delivered.toString()
    }

    private fun polishTrackingFreshness(root: View) {
        root.findViewById<TextView>(R.id.trackingFreshness)?.apply {
            val value = text?.toString().orEmpty()
            val offline = root.context.getString(R.string.gps_offline)
            val stale = root.context.getString(R.string.gps_stale).substringBefore('·').trim()
            val live = root.context.getString(R.string.gps_live)
            val backgroundColor = when {
                value.equals(offline, ignoreCase = true) -> color(root, R.color.hallo_danger)
                value.startsWith(stale, ignoreCase = true) -> color(root, R.color.hallo_warning)
                value.equals(live, ignoreCase = true) -> color(root, R.color.hallo_success)
                else -> color(root, R.color.hallo_muted)
            }
            backgroundTintList = null
            background = rounded(backgroundColor, dp(root, 18))
            setTextColor(Color.WHITE)
        }
    }

    private fun polishProfile(root: View) {
        val details = root.findViewById<TextView>(R.id.profileDetails) ?: return
        var value = details.text?.toString().orEmpty()
        if (value.isBlank()) return

        val iso = Regex("""\d{4}-\d{2}-\d{2}T[^\s]+""")
        value = iso.replace(value) { match -> formatJoinedDate(root, match.value) }

        val technical = root.context.getString(R.string.profile_avatar_initials)
        if (technical.isNotBlank() && value.contains(technical)) {
            value = value.replace(technical, root.context.getString(R.string.profile_photo_initials_simple))
        }
        if (details.text?.toString() != value) details.text = value
    }

    private fun formatJoinedDate(root: View, raw: String): String = try {
        val date = OffsetDateTime.parse(raw).toLocalDate()
        DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)
            .withLocale(root.resources.configuration.locales[0])
            .format(date)
    } catch (_: Exception) {
        raw
    }

    private fun cleanOpaqueLogoEdge(image: ImageView) {
        if (cleanedLogos.put(image, true) == true) return
        val source = (image.drawable as? BitmapDrawable)?.bitmap ?: return
        if (source.width <= 0 || source.height <= 0) return
        val bitmap = source.copy(Bitmap.Config.ARGB_8888, true) ?: return
        val width = bitmap.width
        val height = bitmap.height
        val visited = BooleanArray(width * height)
        val queue = ArrayDeque<Int>()

        fun enqueue(x: Int, y: Int) {
            if (x !in 0 until width || y !in 0 until height) return
            val index = y * width + x
            if (visited[index]) return
            val pixel = bitmap.getPixel(x, y)
            if (Color.alpha(pixel) >= 32 && maxOf(Color.red(pixel), Color.green(pixel), Color.blue(pixel)) > 65) return
            visited[index] = true
            queue.addLast(index)
        }

        for (x in 0 until width) {
            enqueue(x, 0)
            enqueue(x, height - 1)
        }
        for (y in 0 until height) {
            enqueue(0, y)
            enqueue(width - 1, y)
        }
        while (queue.isNotEmpty()) {
            val index = queue.removeFirst()
            val x = index % width
            val y = index / width
            bitmap.setPixel(x, y, Color.TRANSPARENT)
            enqueue(x - 1, y)
            enqueue(x + 1, y)
            enqueue(x, y - 1)
            enqueue(x, y + 1)
        }
        image.setImageBitmap(bitmap)
    }

    private fun rounded(color: Int, radius: Int) = android.graphics.drawable.GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius.toFloat()
    }

    private fun color(root: View, res: Int) = root.context.getColor(res)
    private fun dp(root: View, value: Int) = (value * root.resources.displayMetrics.density).toInt()
}
