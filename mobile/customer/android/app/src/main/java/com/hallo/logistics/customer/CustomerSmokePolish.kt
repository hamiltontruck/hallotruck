package com.hallo.logistics.customer

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.BitmapDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.inputmethod.InputMethodManager
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
    private val watchedTruckContainers = WeakHashMap<View, Boolean>()

    fun install(root: View) {
        if (installed.put(root, true) == true) return
        root.post { CustomerUnifiedChrome.refresh(root) }
    }

    internal fun refresh(root: View) {
        polishTopChrome(root)
        polishBottomBook(root)
        polishBottomNavigation(root)
        polishKeyboardDismissal(root)
        polishRouteActions(root)
        polishTruckSelection(root)
        enforceKeyboardAfterPageRender(root)
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
     * Keep an immediate touch fallback for navigation, then enforce the same rule again after the
     * authoritative MainActivity render. The second pass is what closes an IME whose focused Book
     * field survives while pageBook is switched to GONE.
     */
    private fun polishKeyboardDismissal(root: View) {
        val targets = mutableListOf<View>()
        intArrayOf(
            R.id.navHome,
            R.id.navOrders,
            R.id.navTrack,
            R.id.navBook,
            R.id.navProfile,
            R.id.navNotifications,
            R.id.dashOrders,
            R.id.dashAllOrders,
            R.id.dashActive,
            R.id.dashPayments,
            R.id.dashNotifications,
            R.id.dashProfile,
            R.id.startBooking,
            R.id.homeTrack,
            R.id.calculateQuote,
            R.id.createOrder,
            R.id.signOut,
        ).forEach { id -> root.findViewById<View>(id)?.let(targets::add) }
        root.findViewWithTag<View>(TAG_BOTTOM_BOOK)?.let(targets::add)
        targets.distinct().forEach { target -> installKeyboardDismissOnTouch(target, root) }
    }

    /**
     * MainActivity always calls CustomerUnifiedChrome.refresh after an authorized page render.
     * If the focus still belongs to a Book descendant after leaving Book, clear that exact focus
     * and hide the IME. This avoids touching legitimate editable fields on other pages.
     */
    private fun enforceKeyboardAfterPageRender(root: View) {
        val bookPage = root.findViewById<View>(R.id.pageBook) ?: return
        if (bookPage.visibility == View.VISIBLE) return
        val focused = root.findFocus() ?: return
        if (!isDescendantOf(focused, bookPage)) return
        focused.clearFocus()
        root.post { dismissKeyboard(root) }
    }

    private fun isDescendantOf(child: View, ancestor: View): Boolean {
        var current: Any? = child
        while (current is View) {
            if (current === ancestor) return true
            current = current.parent
        }
        return false
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
            installKeyboardDismissOnTouch(button, root)
        }
    }

    /**
     * MainActivity rebuilds every truck card after each selection. Watch that container so every
     * newly-created set gets the same semantic selected-state treatment after layout, rather than
     * falling back to the older gold styling until another unrelated render happens.
     */
    private fun polishTruckSelection(root: View) {
        val trucks = root.findViewById<LinearLayout>(R.id.truckOptions) ?: return
        if (watchedTruckContainers.put(trucks, true) != true) {
            trucks.addOnLayoutChangeListener { container, _, _, _, _, _, _, _, _ ->
                container.post { polishTruckSelection(root) }
            }
        }

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
            installKeyboardDismissOnTouch(card, root) {
                root.post { polishTruckSelection(root) }
                root.postOnAnimation { polishTruckSelection(root) }
            }
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

    @SuppressLint("ClickableViewAccessibility")
    private fun installKeyboardDismissOnTouch(view: View, root: View, afterTap: (() -> Unit)? = null) {
        view.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> dismissKeyboard(root)
                MotionEvent.ACTION_UP -> afterTap?.let { callback -> root.post { callback() } }
            }
            false
        }
    }

    private fun dismissKeyboard(root: View) {
        val focused = root.findFocus()
        focused?.clearFocus()
        val input = root.context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        input?.hideSoftInputFromWindow((focused ?: root).windowToken, 0)
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
