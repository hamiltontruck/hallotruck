package com.hallo.logistics.customer

import android.content.res.ColorStateList
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import com.google.android.material.button.MaterialButton
import java.util.WeakHashMap

/**
 * Keeps the approved Customer navigation shell consistent without changing MainActivity's
 * existing page/business handlers. The legacy navBook continues to own Payments while this
 * adapter adds the distinct central Book action required by the approved six-destination UI.
 */
object CustomerUnifiedChrome {
    private const val TAG_BOOK = "customer-unified-nav-book"
    private val installed = WeakHashMap<View, Boolean>()
    private val busy = WeakHashMap<View, Boolean>()

    fun install(root: View) {
        if (installed.put(root, true) == true) return
        CustomerAuthRepair.install(root)
        CustomerParityUiV2.install(root)
        CustomerParityActions.install(root)
        CustomerSmokePolish.install(root)
        root.post { refresh(root) }
        root.addOnLayoutChangeListener { _, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
            if (right - left != oldRight - oldLeft || bottom - top != oldBottom - oldTop) {
                root.post { refresh(root) }
            }
        }
    }

    /** Apply legacy structure before final presentation, once per state/size change. */
    internal fun refresh(root: View) {
        if (busy[root] == true) return
        busy[root] = true
        try {
            CustomerReferenceUi.apply(root)
            CustomerApprovedScreens.refresh(root)
            ensureBottomNavigation(root)
            CustomerParityUiV2.refresh(root)
            CustomerParityActions.refresh(root)
            updateSelection(root)
            CustomerSmokePolish.refresh(root)
            // Auth is refreshed last because MainActivity's localized state render may update
            // TextInputLayout hints after the one-time reference styling pass.
            CustomerAuthRepair.refresh(root)
        } finally {
            busy[root] = false
        }
    }

    private fun ensureBottomNavigation(root: View) {
        val navigation = root.findViewById<LinearLayout>(R.id.bottomNavigation) ?: return
        navigation.clipChildren = false
        navigation.clipToPadding = false
        navigation.weightSum = 6f

        val book = root.findViewWithTag<MaterialButton>(TAG_BOOK) ?: MaterialButton(root.context).apply {
            tag = TAG_BOOK
            text = root.context.getString(R.string.nav_book)
            setIconResource(R.drawable.ic_hallo_truck)
            iconGravity = MaterialButton.ICON_GRAVITY_TEXT_TOP
            iconSize = dp(root, 22)
            iconPadding = dp(root, 2)
            isAllCaps = false
            maxLines = 1
            setPadding(0, 0, 0, 0)
            textSize = 10f
            minWidth = 0
            minimumWidth = 0
            minHeight = dp(root, 60)
            cornerRadius = dp(root, 18)
            insetTop = 0
            insetBottom = 0
            backgroundTintList = ColorStateList.valueOf(root.context.getColor(R.color.hallo_blue))
            setTextColor(Color.WHITE)
            iconTint = ColorStateList.valueOf(Color.WHITE)
            strokeWidth = 0
            elevation = dp(root, 3).toFloat()
            translationY = -dp(root, 4).toFloat()
            contentDescription = root.context.getString(R.string.nav_book)
            setOnClickListener {
                root.findViewById<MaterialButton>(R.id.startBooking)?.performClick()
            }
        }

        // Locale recreation creates a new root; keep the label synchronized even after runtime
        // layout passes within the same Activity instance.
        book.text = root.context.getString(R.string.nav_book)
        book.contentDescription = root.context.getString(R.string.nav_book)
        book.visibility = View.VISIBLE
        book.backgroundTintList = ColorStateList.valueOf(root.context.getColor(R.color.hallo_blue))
        book.setTextColor(Color.WHITE)
        book.iconTint = ColorStateList.valueOf(Color.WHITE)

        val ordered = listOfNotNull(
            root.findViewById<View>(R.id.navHome),
            root.findViewById<View>(R.id.navOrders),
            book,
            root.findViewById<View>(R.id.navTrack),
            root.findViewById<View>(R.id.navBook),
            root.findViewById<View>(R.id.navProfile),
        )
        if (ordered.size != 6) return
        val alreadyOrdered = navigation.childCount == ordered.size && ordered.indices.all { index ->
            navigation.getChildAt(index) === ordered[index]
        }
        if (!alreadyOrdered) {
            ordered.forEach { child -> (child.parent as? ViewGroup)?.removeView(child) }
            ordered.forEach { child ->
                navigation.addView(
                    child,
                    LinearLayout.LayoutParams(0, dp(root, 60), 1f).apply {
                        marginStart = dp(root, 1)
                        marginEnd = dp(root, 1)
                    },
                )
            }
        }
    }

    private fun updateSelection(root: View) {
        val book = root.findViewWithTag<MaterialButton>(TAG_BOOK) ?: return
        val homeVisible = root.findViewById<View>(R.id.pageHome)?.visibility == View.VISIBLE
        val bookingVisible = root.findViewById<View>(R.id.pageBook)?.visibility == View.VISIBLE
        val ordersVisible = root.findViewById<View>(R.id.pageOrders)?.visibility == View.VISIBLE
        val trackingVisible = root.findViewById<View>(R.id.pageTracking)?.visibility == View.VISIBLE
        val paymentsVisible = root.findViewById<View>(R.id.pagePayments)?.visibility == View.VISIBLE
        val profileVisible = root.findViewById<View>(R.id.pageProfile)?.visibility == View.VISIBLE
        val selectedMarker = root.context.getColor(R.color.hallo_gold)

        root.findViewById<CustomerNavButton>(R.id.navHome)?.setBackgroundColor(if (homeVisible) selectedMarker else Color.TRANSPARENT)
        root.findViewById<CustomerNavButton>(R.id.navOrders)?.setBackgroundColor(if (ordersVisible) selectedMarker else Color.TRANSPARENT)
        root.findViewById<CustomerNavButton>(R.id.navTrack)?.setBackgroundColor(if (trackingVisible) selectedMarker else Color.TRANSPARENT)
        root.findViewById<CustomerNavButton>(R.id.navBook)?.setBackgroundColor(if (paymentsVisible) selectedMarker else Color.TRANSPARENT)
        root.findViewById<CustomerNavButton>(R.id.navProfile)?.setBackgroundColor(if (profileVisible) selectedMarker else Color.TRANSPARENT)

        // Book remains the blue central CTA on every authenticated page. Its gold outline and
        // selected semantics make the active booking page unambiguous without hiding the CTA.
        book.visibility = View.VISIBLE
        book.isSelected = bookingVisible
        book.alpha = 1f
        book.scaleX = if (bookingVisible) 1.04f else 1f
        book.scaleY = if (bookingVisible) 1.04f else 1f
        book.elevation = dp(root, if (bookingVisible) 6 else 3).toFloat()
        book.strokeWidth = if (bookingVisible) dp(root, 2) else 0
        book.strokeColor = ColorStateList.valueOf(selectedMarker)
    }

    private fun dp(view: View, value: Int): Int =
        (value * view.resources.displayMetrics.density).toInt()
}
