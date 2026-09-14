package com.hallo.logistics.customer

import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.BitmapDrawable
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import java.util.ArrayDeque
import java.util.WeakHashMap

/**
 * Presentation-only fixes found during the PR #433 real-device smoke.
 * No backend, pricing, payment, RLS, tracking or order state is mutated here.
 */
object CustomerSmokePolish {
    private const val TAG_TOP_CHROME = "customer-parity-top-chrome"
    private const val TAG_BOTTOM_BOOK = "customer-unified-nav-book"
    private const val TAG_ROUTE_ACTIONS = "customer-route-actions"
    private val installed = WeakHashMap<View, Boolean>()
    private val cleanedLogos = WeakHashMap<ImageView, Boolean>()

    fun install(root: View) {
        if (installed.put(root, true) == true) return
        root.post { CustomerUnifiedChrome.refresh(root) }
    }

    internal fun refresh(root: View) {
        polishTopChrome(root)
        polishBottomBook(root)
        polishBottomNavigation(root)
        polishRouteActions(root)
        polishTruckSelection(root)
        polishTrackingHeader(root)
        polishProfileHeader(root)
    }

    private fun polishTopChrome(root: View) {
        val chrome = root.findViewWithTag<MaterialCardView>(TAG_TOP_CHROME) ?: return
        val column = chrome.getChildAt(0) as? LinearLayout ?: return
        val brandRow = column.getChildAt(0) as? LinearLayout ?: return
        (brandRow.getChildAt(0) as? ImageView)?.let(::cleanOpaqueLogoEdge)
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

    /** Keep all six destinations readable at 320-412dp without changing navigation behavior. */
    private fun polishBottomNavigation(root: View) {
        listOf(R.id.navHome, R.id.navOrders, R.id.navTrack, R.id.navBook, R.id.navProfile).forEach { id ->
            root.findViewById<MaterialButton>(id)?.apply {
                minWidth = 0
                minimumWidth = 0
                minHeight = dp(root, 58)
                setPadding(0, 0, 0, 0)
                textSize = 9f
                maxLines = 1
                iconSize = dp(root, 20)
                iconPadding = dp(root, 1)
                insetTop = 0
                insetBottom = 0
            }
        }
    }

    /**
     * The older approved-screen adapter collapsed My location / Swap / Reset into one emoji.
     * Restore all three existing actions as compact localized controls; handlers remain owned by
     * MainActivity.
     */
    private fun polishRouteActions(root: View) {
        val row = root.findViewWithTag<LinearLayout>(TAG_ROUTE_ACTIONS) ?: return
        row.gravity = Gravity.CENTER_VERTICAL
        val labels = intArrayOf(R.string.my_location, R.string.swap_route, R.string.reset_route)
        val blue = root.context.getColor(R.color.hallo_blue)
        val navy = root.context.getColor(R.color.hallo_navy)
        val line = root.context.getColor(R.color.hallo_line)
        val blueSoft = root.context.getColor(R.color.hallo_blue_soft)

        for (index in 0 until minOf(row.childCount, labels.size)) {
            val button = row.getChildAt(index) as? MaterialButton ?: continue
            button.visibility = View.VISIBLE
            button.text = root.context.getString(labels[index])
            button.contentDescription = button.text
            button.isAllCaps = false
            button.minWidth = 0
            button.minimumWidth = 0
            button.minHeight = dp(root, 48)
            button.maxLines = 2
            button.textSize = 9f
            button.gravity = Gravity.CENTER
            button.setPadding(dp(root, 4), 0, dp(root, 4), 0)
            button.cornerRadius = dp(root, 14)
            button.insetTop = 0
            button.insetBottom = 0
            button.backgroundTintList = ColorStateList.valueOf(if (index == 0) blueSoft else Color.WHITE)
            button.setTextColor(if (index == 0) blue else navy)
            button.strokeWidth = dp(root, 1)
            button.strokeColor = ColorStateList.valueOf(line)
            button.layoutParams = LinearLayout.LayoutParams(0, dp(root, 48), 1f).apply {
                marginStart = if (index == 0) 0 else dp(root, 3)
                marginEnd = if (index == labels.lastIndex) 0 else dp(root, 3)
            }
        }
    }

    /**
     * On high-density devices 1dp is several px, so using `strokeWidth > 1` made every truck look
     * selected. MainActivity already exposes the selected state in the card content description;
     * use that semantic signal and render exactly one selected truck.
     */
    private fun polishTruckSelection(root: View) {
        val trucks = root.findViewById<LinearLayout>(R.id.truckOptions) ?: return
        val selectedSuffix = ", ${root.context.getString(R.string.selected)}"
        val blue = root.context.getColor(R.color.hallo_blue)
        val line = root.context.getColor(R.color.hallo_line)
        val blueSoft = root.context.getColor(R.color.hallo_blue_soft)

        for (index in 0 until trucks.childCount) {
            val card = trucks.getChildAt(index) as? MaterialCardView ?: continue
            val selected = card.contentDescription?.toString()?.endsWith(selectedSuffix) == true
            card.isSelected = selected
            card.radius = dp(root, 18).toFloat()
            card.cardElevation = 0f
            card.strokeWidth = dp(root, if (selected) 2 else 1)
            card.strokeColor = if (selected) blue else line
            card.setCardBackgroundColor(if (selected) blueSoft else Color.WHITE)
        }
    }

    /** Reduce the oversized multi-line tracking hero while preserving the full live route text. */
    private fun polishTrackingHeader(root: View) {
        root.findViewById<TextView>(R.id.trackingTitle)?.apply {
            textSize = 18f
            maxLines = 5
            setLineSpacing(dp(root, 2).toFloat(), 1.02f)
            setPadding(dp(root, 16), dp(root, 14), dp(root, 16), dp(root, 14))
        }
    }

    /** Keep the profile hero intentional without the large empty blue block seen in device smoke. */
    private fun polishProfileHeader(root: View) {
        root.findViewById<TextView>(R.id.profileTitle)?.apply {
            setPadding(dp(root, 18), dp(root, 14), dp(root, 18), dp(root, 56))
        }
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

    private fun dp(root: View, value: Int) = (value * root.resources.displayMetrics.density).toInt()
}
