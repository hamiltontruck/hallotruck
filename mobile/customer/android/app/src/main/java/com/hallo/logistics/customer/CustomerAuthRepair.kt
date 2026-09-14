package com.hallo.logistics.customer

import android.app.Activity
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.BitmapDrawable
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.core.view.WindowCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputLayout
import java.util.ArrayDeque
import java.util.WeakHashMap

/**
 * Deterministic auth-only repair for the PR #433 real-device regressions.
 *
 * The authenticated presentation adapters are intentionally kept separate. This repair owns only
 * the signed-out Login/Register chrome so MainActivity localization/state rendering cannot leave
 * stale signup hints, hidden password toggles, light system-bar icons, or opaque logo corners.
 */
object CustomerAuthRepair {
    private val installed = WeakHashMap<View, Boolean>()
    private val busy = WeakHashMap<View, Boolean>()

    fun install(root: View) {
        if (installed.put(root, true) == true) return
        val authPanel = root.findViewById<View>(R.id.authPanel) ?: return

        // Apply once immediately to avoid the first-frame visual mismatch seen before the posted
        // parity pass, then repeat after layout/locale recreation has settled.
        refresh(root)
        root.post { refresh(root) }
        authPanel.addOnLayoutChangeListener { _, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
            if (left != oldLeft || top != oldTop || right != oldRight || bottom != oldBottom) {
                authPanel.post { refresh(root) }
            }
        }
        root.findViewById<View>(R.id.signupFields)?.addOnLayoutChangeListener { field, _, _, _, _, _, _, _, _ ->
            field.post { refresh(root) }
        }
    }

    fun refresh(root: View) {
        if (busy[root] == true) return
        busy[root] = true
        try {
            styleSystemBars(root)
            styleLogo(root)
            styleAuthFieldIcons(root)
            stylePasswordFields(root)
            stylePrimaryAction(root)
            styleSessionPresentation(root)
            styleValidationCopy(root)
        } finally {
            busy[root] = false
        }
    }

    @Suppress("DEPRECATION")
    private fun styleSystemBars(root: View) {
        val activity = root.context as? Activity ?: return
        val surface = root.context.getColor(R.color.hallo_surface)
        activity.window.statusBarColor = surface
        activity.window.navigationBarColor = Color.WHITE
        WindowCompat.setDecorFitsSystemWindows(activity.window, true)
        WindowCompat.getInsetsController(activity.window, activity.window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }

        // Keep dark system-bar icons deterministic on API levels where locale recreation can
        // briefly restore decor flags before WindowInsetsControllerCompat is reapplied.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            var flags = activity.window.decorView.systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }
            activity.window.decorView.systemUiVisibility = flags
        }
    }

    private fun styleLogo(root: View) {
        val panel = root.findViewById<ViewGroup>(R.id.authPanel) ?: return
        val header = panel.getChildAt(0) as? ViewGroup ?: return
        val logo = header.getChildAt(0) as? ImageView ?: return
        logo.scaleType = ImageView.ScaleType.FIT_CENTER
        logo.imageTintList = null
        logo.clearColorFilter()
        cleanOpaqueEdgeBackground(logo)
        logo.post { cleanOpaqueEdgeBackground(logo) }
    }

    /** Keep Login/Register field affordances identical before and after locale recreation. */
    private fun styleAuthFieldIcons(root: View) {
        val muted = root.context.getColor(R.color.hallo_muted)
        inputLayout(root.findViewById(R.id.email))?.apply {
            setStartIconDrawable(R.drawable.ic_auth_email)
            setStartIconTintList(ColorStateList.valueOf(muted))
            setStartIconVisible(true)
        }
        inputLayout(root.findViewById(R.id.password))?.apply {
            setStartIconDrawable(R.drawable.ic_auth_lock)
            setStartIconTintList(ColorStateList.valueOf(muted))
            setStartIconVisible(true)
        }
        root.findViewById<TextInputLayout>(R.id.confirmPinLayout)?.apply {
            setStartIconDrawable(R.drawable.ic_auth_lock)
            setStartIconTintList(ColorStateList.valueOf(muted))
            setStartIconVisible(visibility == View.VISIBLE)
        }
    }

    private fun stylePasswordFields(root: View) {
        val signup = root.findViewById<View>(R.id.signupFields)?.visibility == View.VISIBLE
        val muted = root.context.getColor(R.color.hallo_muted)
        val password = root.findViewById<View>(R.id.password)
        inputLayout(password)?.apply {
            hint = root.context.getString(if (signup) R.string.auth_signup_pin else R.string.auth_password)
            if (endIconMode != TextInputLayout.END_ICON_PASSWORD_TOGGLE) {
                endIconMode = TextInputLayout.END_ICON_PASSWORD_TOGGLE
            }
            setEndIconTintList(ColorStateList.valueOf(muted))
            setEndIconVisible(true)
        }
        root.findViewById<TextInputLayout>(R.id.confirmPinLayout)?.apply {
            if (endIconMode != TextInputLayout.END_ICON_PASSWORD_TOGGLE) {
                endIconMode = TextInputLayout.END_ICON_PASSWORD_TOGGLE
            }
            setEndIconTintList(ColorStateList.valueOf(muted))
            setEndIconVisible(signup)
            setStartIconVisible(signup)
        }
    }

    private fun stylePrimaryAction(root: View) {
        root.findViewById<MaterialButton>(R.id.authSubmit)?.apply {
            backgroundTintList = ColorStateList.valueOf(root.context.getColor(R.color.hallo_blue))
            setTextColor(Color.WHITE)
            iconTint = ColorStateList.valueOf(Color.WHITE)
            isAllCaps = false
        }
    }

    /** Presentation guard only: auth/session ownership remains in MainActivity/ViewModel. */
    private fun styleSessionPresentation(root: View) {
        val loggedOut = root.findViewById<View>(R.id.authPanel)?.visibility == View.VISIBLE
        root.findViewById<View>(R.id.signOut)?.visibility = if (loggedOut) View.GONE else View.VISIBLE
    }

    /** Re-localize a retained validation message after AppCompat locale recreation. */
    private fun styleValidationCopy(root: View) {
        val feedback = root.findViewById<TextView>(R.id.authFeedback) ?: return
        val current = feedback.text?.toString().orEmpty()
        val localized = CustomerAuthPolicy.localizeKnownMessage(current)
        if (current != localized) feedback.text = localized
    }

    private fun inputLayout(view: View?): TextInputLayout? {
        var parent = view?.parent
        while (parent is View) {
            if (parent is TextInputLayout) return parent
            parent = parent.parent
        }
        return null
    }

    /** Remove only near-black pixels connected to the bitmap edge; internal logo detail is kept. */
    private fun cleanOpaqueEdgeBackground(image: ImageView) {
        val source = (image.drawable as? BitmapDrawable)?.bitmap ?: return
        if (source.width <= 0 || source.height <= 0) return
        if (Color.alpha(source.getPixel(0, 0)) < 32) return

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
            val edgeDark = Color.alpha(pixel) < 32 || maxOf(Color.red(pixel), Color.green(pixel), Color.blue(pixel)) <= 96
            if (!edgeDark) return
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
}
