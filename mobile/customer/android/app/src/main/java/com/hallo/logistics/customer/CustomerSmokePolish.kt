package com.hallo.logistics.customer

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.BitmapDrawable
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
    private val installed = WeakHashMap<View, Boolean>()
    private val cleanedLogos = WeakHashMap<ImageView, Boolean>()

    fun install(root: View) {
        if (installed.put(root, true) == true) return
        root.post { CustomerUnifiedChrome.refresh(root) }
    }

    internal fun refresh(root: View) {
        polishTopChrome(root)
        polishBottomBook(root)
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
