package com.hallo.logistics.customer

import android.app.Activity
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.GradientDrawable
import android.text.InputFilter
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import androidx.core.view.WindowCompat
import androidx.core.widget.doAfterTextChanged
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.card.MaterialCardView
import com.google.android.material.textfield.TextInputLayout
import java.util.ArrayDeque

/** Presentation-only visual parity with the approved Customer Android references. */
object CustomerReferenceUi {
    private var appliedRoot: View? = null

    fun apply(anchor: View) {
        val root = anchor.rootView ?: return
        if (appliedRoot === root) return
        appliedRoot = root
        val navy = Color.rgb(16, 33, 61)
        val blue = Color.rgb(10, 111, 245)
        val blueDark = Color.rgb(9, 87, 201)
        val surface = Color.rgb(245, 248, 252)
        val line = Color.rgb(227, 234, 244)
        val muted = Color.rgb(109, 125, 145)
        val green = Color.rgb(2, 122, 72)

        styleSystemBars(root, surface)
        root.setBackgroundColor(surface)
        view(root, "customerShell")?.setBackgroundColor(surface)
        view(root, "bottomNavigation")?.setBackgroundColor(Color.WHITE)
        styleAuth(root, navy, blue, surface, line, muted)

        view(root, "appHeader")?.apply {
            layoutParams = layoutParams.apply { height = dp(root, 82) }
            background = gradient(blue, blueDark)
            setPadding(dp(root, 18), dp(root, 10), dp(root, 14), dp(root, 8))
        }
        view(root, "statusCard")?.apply {
            background = gradient(blueDark, blueDark)
            minimumHeight = dp(root, 44)
        }
        text(root, "status")?.setTextColor(Color.argb(220, 255, 255, 255))
        text(root, "headerTitle")?.apply { setTextColor(Color.WHITE); textSize = 20f; setTypeface(typeface, Typeface.BOLD) }

        limit(root, "fullName", 80)
        limit(root, "phone", 18)
        limit(root, "email", 254)
        limit(root, "password", 72)
        limit(root, "confirmPin", 6)

        card(root, "homeMapCard")?.apply {
            radius = dpF(root, 24)
            cardElevation = 0f
            strokeWidth = 0
            setCardBackgroundColor(Color.WHITE)
        }
        view(root, "homeMap")?.let { it.layoutParams = it.layoutParams.apply { height = dp(root, 220) } }
        text(root, "welcome")?.apply { textSize = 28f; setTextColor(navy); setTypeface(typeface, Typeface.BOLD) }
        text(root, "homeSummary")?.apply { textSize = 14f; setTextColor(muted) }

        listOf("dashOrders", "dashActive", "dashPayments", "dashProfile", "dashNotifications", "dashAllOrders").forEach { name ->
            button(root, name)?.apply {
                cornerRadius = dp(root, 18)
                minHeight = dp(root, 86)
                backgroundTintList = ColorStateList.valueOf(Color.WHITE)
                setTextColor(navy)
                strokeWidth = 0
                elevation = 0f
                insetTop = 0
                insetBottom = 0
            }
        }
        button(root, "startBooking")?.referencePrimary(root, blue)
        button(root, "homeTrack")?.referencePrimary(root, blue)
        button(root, "authSubmit")?.referencePrimary(root, blue)

        view(root, "bookingMap")?.let { it.layoutParams = it.layoutParams.apply { height = dp(root, 430) } }
        card(root, "bookingMapCard")?.referenceCard(root, line, 24)
        button(root, "calculateQuote")?.referencePrimary(root, blue)
        button(root, "createOrder")?.referencePrimary(root, blue)

        view(root, "trackingMap")?.let { it.layoutParams = it.layoutParams.apply { height = dp(root, 390) } }
        card(root, "trackingMapCard")?.referenceCard(root, line, 24)
        button(root, "refreshTracking")?.apply {
            cornerRadius = dp(root, 18)
            minHeight = dp(root, 54)
            backgroundTintList = ColorStateList.valueOf(Color.rgb(245, 248, 253))
            setTextColor(blue)
            strokeWidth = 0
        }

        view(root, "pageProfile")?.setBackgroundColor(surface)
        listOf("profileCard", "profileSummaryCard", "profileAccountCard", "profilePreferencesCard", "profileSupportCard").forEach {
            card(root, it)?.referenceCard(root, line, 22)
        }
        button(root, "signOut")?.apply { minHeight = dp(root, 54); cornerRadius = dp(root, 18) }

        polishTree(root, navy, line)
        button(root, "authSubmit")?.referencePrimary(root, blue)
        listOf("trackingStatus", "orderStatus", "profileVerified").forEach { name ->
            text(root, name)?.let {
                val value = it.text.toString()
                if (value.contains("deliver", true) || value.contains("route", true) || value.contains("verified", true)) it.setTextColor(green)
            }
        }
        CustomerApprovedScreens.install(root)
    }

    private fun styleAuth(root: View, navy: Int, blue: Int, surface: Int, line: Int, muted: Int) {
        val authPanel = view(root, "authPanel")
        authPanel?.apply {
            setBackgroundColor(surface)
            setPadding(dp(root, 20), dp(root, 18), dp(root, 20), dp(root, 26))
        }
        styleAuthLogo(root)
        view(root, "authHero")?.apply {
            layoutParams = layoutParams.apply { height = dp(root, 156) }
        }
        text(root, "authTitle")?.apply {
            setTextColor(navy)
            textSize = 30f
            setTypeface(typeface, Typeface.BOLD)
        }
        text(root, "authSubtitle")?.apply {
            setTextColor(muted)
            textSize = 15f
        }
        button(root, "authForgot")?.apply {
            minHeight = dp(root, 48)
            setTextColor(blue)
        }
        button(root, "authMode")?.apply {
            minHeight = dp(root, 54)
            cornerRadius = dp(root, 16)
            setTextColor(blue)
            strokeWidth = dp(root, 1)
            strokeColor = ColorStateList.valueOf(blue)
            backgroundTintList = ColorStateList.valueOf(Color.TRANSPARENT)
        }
        listOf("authEn", "authOr", "authAm").forEach { name ->
            button(root, name)?.apply {
                minHeight = dp(root, 44)
                cornerRadius = dp(root, 14)
                strokeWidth = dp(root, 1)
                strokeColor = ColorStateList.valueOf(line)
            }
        }
        val hintColors = ColorStateList(
            arrayOf(intArrayOf(android.R.attr.state_focused), intArrayOf()),
            intArrayOf(blue, muted),
        )
        listOf("fullName", "phone", "email", "password", "confirmPin").forEach { name ->
            inputLayout(root, name)?.apply {
                boxBackgroundColor = Color.WHITE
                boxStrokeColor = line
                boxStrokeWidth = dp(root, 1)
                boxStrokeWidthFocused = dp(root, 2)
                setBoxCornerRadii(dpF(root, 16), dpF(root, 16), dpF(root, 16), dpF(root, 16))
                setDefaultHintTextColor(ColorStateList.valueOf(muted))
                setHintTextColor(hintColors)
            }
        }
        updateAuthPasswordHint(root)
        ensurePasswordToggle(root, muted)
        authPanel?.post {
            updateAuthPasswordHint(root)
            ensurePasswordToggle(root, muted)
        }
        view(root, "signupFields")?.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            updateAuthPasswordHint(root)
            ensurePasswordToggle(root, muted)
        }
        (view(root, "authLanguages") as? MaterialButtonToggleGroup)?.addOnButtonCheckedListener { group, _, isChecked ->
            if (isChecked) group.post {
                updateAuthPasswordHint(root)
                ensurePasswordToggle(root, muted)
            }
        }
        findAncestorCard(button(root, "authSubmit"))?.referenceCard(root, line, 22)
    }

    private fun styleAuthLogo(root: View) {
        val panel = view(root, "authPanel") as? ViewGroup ?: return
        val header = panel.getChildAt(0) as? ViewGroup ?: return
        val logo = header.getChildAt(0) as? ImageView ?: return
        logo.apply {
            scaleType = ImageView.ScaleType.FIT_CENTER
            setPadding(dp(root, 4), dp(root, 4), dp(root, 4), dp(root, 4))
            imageTintList = null
            clearColorFilter()
        }
        removeOpaqueLogoEdgeBackground(logo)
    }

    /**
     * The shared WebP brand asset is opaque, so its formerly transparent corners render black.
     * Remove only near-black pixels connected to the bitmap edge; internal navy/black logo detail
     * is left untouched because it is not connected to the outer background.
     */
    private fun removeOpaqueLogoEdgeBackground(image: ImageView) {
        val drawable = image.drawable as? BitmapDrawable ?: return
        val source = drawable.bitmap ?: return
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
            if (!isOpaqueEdgeBackground(bitmap.getPixel(x, y))) return
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

    private fun isOpaqueEdgeBackground(pixel: Int): Boolean {
        if (Color.alpha(pixel) < 32) return true
        return maxOf(Color.red(pixel), Color.green(pixel), Color.blue(pixel)) <= 65
    }

    private fun updateAuthPasswordHint(root: View) {
        val signup = view(root, "signupFields")?.visibility == View.VISIBLE
        val layout = inputLayout(root, "password") ?: return
        val expected = root.context.getString(if (signup) R.string.auth_signup_pin else R.string.auth_password)
        if (layout.hint?.toString() != expected) layout.hint = expected
    }

    private fun ensurePasswordToggle(root: View, muted: Int) {
        inputLayout(root, "password")?.apply {
            if (endIconMode != TextInputLayout.END_ICON_PASSWORD_TOGGLE) {
                endIconMode = TextInputLayout.END_ICON_PASSWORD_TOGGLE
            }
            setEndIconTintList(ColorStateList.valueOf(muted))
            setEndIconVisible(true)
        }
    }

    @Suppress("DEPRECATION")
    private fun styleSystemBars(root: View, surface: Int) {
        val activity = root.context as? Activity ?: return
        activity.window.statusBarColor = surface
        activity.window.navigationBarColor = Color.WHITE
        WindowCompat.getInsetsController(activity.window, activity.window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }
    }

    private fun polishTree(v: View, navy: Int, line: Int) {
        if (v is MaterialCardView) {
            if (v.radius < dpF(v, 16)) v.radius = dpF(v, 16)
            v.cardElevation = 0f
            if (v.strokeWidth > 0) v.strokeColor = line
        }
        if (v is TextView) {
            v.includeFontPadding = false
            val textSizeSp = v.textSize / v.resources.displayMetrics.scaledDensity
            if (v !is MaterialButton && textSizeSp >= 18f) v.setTextColor(navy)
        }
        if (v is ImageView) v.clipToOutline = true
        if (v is ViewGroup) for (i in 0 until v.childCount) polishTree(v.getChildAt(i), navy, line)
    }

    private fun limit(root: View, name: String, max: Int) {
        val field = view(root, name) as? EditText ?: return
        val preserved = field.filters.filterNot { it is InputFilter.LengthFilter }
        field.filters = (preserved + InputFilter.LengthFilter(max)).toTypedArray()
        field.doAfterTextChanged { value ->
            if (value != null && value.length > max) {
                val truncated = value.subSequence(0, max).toString()
                field.setText(truncated)
                field.setSelection(truncated.length)
            }
        }
    }

    private fun MaterialCardView.referenceCard(root: View, line: Int, radiusDp: Int) {
        radius = dpF(root, radiusDp)
        cardElevation = 0f
        strokeWidth = dp(root, 1)
        strokeColor = line
        setCardBackgroundColor(Color.WHITE)
    }

    private fun MaterialButton.referencePrimary(root: View, blue: Int) {
        minHeight = dp(root, 54)
        cornerRadius = dp(root, 16)
        backgroundTintList = ColorStateList.valueOf(blue)
        setTextColor(Color.WHITE)
        iconTint = ColorStateList.valueOf(Color.WHITE)
        strokeWidth = 0
        insetTop = 0
        insetBottom = 0
    }

    private fun inputLayout(root: View, name: String): TextInputLayout? {
        val field = view(root, name) ?: return null
        var parent = field.parent
        while (parent is View) {
            if (parent is TextInputLayout) return parent
            parent = parent.parent
        }
        return null
    }

    private fun findAncestorCard(view: View?): MaterialCardView? {
        var parent = view?.parent
        while (parent is View) {
            if (parent is MaterialCardView) return parent
            parent = parent.parent
        }
        return null
    }

    private fun view(root: View, name: String): View? {
        val id = root.resources.getIdentifier(name, "id", root.context.packageName)
        return if (id == 0) null else root.findViewById(id)
    }
    private fun text(root: View, name: String) = view(root, name) as? TextView
    private fun button(root: View, name: String) = view(root, name) as? MaterialButton
    private fun card(root: View, name: String) = view(root, name) as? MaterialCardView
    private fun gradient(start: Int, end: Int) = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(start, end))
    private fun dp(v: View, n: Int) = (n * v.resources.displayMetrics.density).toInt()
    private fun dpF(v: View, n: Int) = n * v.resources.displayMetrics.density
}
