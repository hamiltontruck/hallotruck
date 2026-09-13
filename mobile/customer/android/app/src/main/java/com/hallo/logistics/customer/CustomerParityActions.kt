package com.hallo.logistics.customer

import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import java.util.WeakHashMap

/** Keeps parity-only success actions connected to the real Customer navigation state. */
object CustomerParityActions {
    private const val TAG_SUCCESS = "customer-parity-book-success"
    private val installed = WeakHashMap<View, Boolean>()
    private val busy = WeakHashMap<View, Boolean>()

    fun install(root: View) {
        if (installed.put(root, true) == true) return
        root.post { wire(root) }
        root.viewTreeObserver.addOnGlobalLayoutListener {
            if (busy[root] == true) return@addOnGlobalLayoutListener
            busy[root] = true
            try {
                wire(root)
            } finally {
                busy[root] = false
            }
        }
    }

    private fun wire(root: View) {
        val success = root.findViewWithTag<MaterialCardView>(TAG_SUCCESS) ?: return
        val activity = root.context as? AppCompatActivity ?: return
        val viewModel = ViewModelProvider(activity)[CustomerViewModel::class.java]
        val viewOrder = findButton(success, root.context.getString(R.string.booking_view_orders))
        val createAnother = findButton(success, root.context.getString(R.string.booking_create_another))

        viewOrder?.setOnClickListener {
            viewModel.show(CustomerPage.ORDERS)
            success.visibility = View.GONE
            root.findViewById<View>(R.id.ordersTitle)?.visibility = View.VISIBLE
            root.findViewById<View>(R.id.ordersSubtitle)?.visibility = View.VISIBLE
            root.findViewById<View>(R.id.ordersList)?.visibility = View.VISIBLE
        }
        createAnother?.setOnClickListener {
            viewModel.show(CustomerPage.BOOK)
            success.visibility = View.GONE
        }
    }

    private fun findButton(root: View, expected: String): MaterialButton? {
        if (root is MaterialButton && root.text?.toString() == expected) return root
        if (root is ViewGroup) {
            for (index in 0 until root.childCount) {
                findButton(root.getChildAt(index), expected)?.let { return it }
            }
        }
        return null
    }
}
