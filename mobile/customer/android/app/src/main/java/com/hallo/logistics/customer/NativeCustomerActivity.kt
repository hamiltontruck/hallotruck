package com.hallo.logistics.customer

import android.content.res.ColorStateList
import android.graphics.Color
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.view.View
import android.view.WindowManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.textfield.TextInputLayout
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.handleDeeplinks
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

/**
 * Clean native Customer Android parity workbench.
 *
 * This Activity intentionally stays off the launcher until every Customer Portal capability
 * required by NATIVE_PARITY_AUDIT.md is implemented and device-smoked. It reuses the existing
 * CustomerViewModel/Repository backend contracts and owns presentation only.
 */
class NativeCustomerActivity : AppCompatActivity() {
    private enum class AuthMode { LOGIN, SIGNUP, REQUEST_RESET, UPDATE_RESET }

    private val viewModel: CustomerViewModel by viewModels()
    private val recovery = CustomerPasswordRecovery()
    private val prefs by lazy { getSharedPreferences("hallo_customer_auth", MODE_PRIVATE) }

    private lateinit var authScroll: View
    private lateinit var customerShell: View
    private lateinit var authLanguages: MaterialButtonToggleGroup
    private lateinit var authEn: MaterialButton
    private lateinit var authOr: MaterialButton
    private lateinit var authAm: MaterialButton
    private lateinit var authTitle: TextView
    private lateinit var authSubtitle: TextView
    private lateinit var signupFields: View
    private lateinit var fullName: EditText
    private lateinit var phone: EditText
    private lateinit var emailLayout: TextInputLayout
    private lateinit var email: EditText
    private lateinit var passwordLayout: TextInputLayout
    private lateinit var password: EditText
    private lateinit var confirmLayout: TextInputLayout
    private lateinit var confirmPin: EditText
    private lateinit var authFeedback: TextView
    private lateinit var authProgress: View
    private lateinit var authSubmit: MaterialButton
    private lateinit var forgotPassword: MaterialButton
    private lateinit var authPrompt: TextView
    private lateinit var authModeButton: MaterialButton
    private lateinit var headerTitle: TextView
    private lateinit var shellProgress: View
    private lateinit var pageHost: FrameLayout
    private lateinit var navHome: MaterialButton
    private lateinit var navOrders: MaterialButton
    private lateinit var navBook: MaterialButton
    private lateinit var navTrack: MaterialButton
    private lateinit var navPayments: MaterialButton
    private lateinit var navProfile: MaterialButton

    private var language = CustomerLanguage.EN
    private var authMode = AuthMode.LOGIN
    private var renderedPage: CustomerPage? = null
    private var fieldMutation = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

        val callbackUri = intent?.dataString.orEmpty()
        if (HalloSupabase.configured && intent != null) {
            HalloSupabase.client.handleDeeplinks(intent)
        }
        val awaitingRecovery = prefs.getBoolean(KEY_AWAITING_RECOVERY, false)
        authMode = when {
            savedInstanceState != null -> runCatching {
                AuthMode.valueOf(savedInstanceState.getString(KEY_AUTH_MODE).orEmpty())
            }.getOrDefault(AuthMode.LOGIN)
            awaitingRecovery && callbackUri.isNotBlank() -> AuthMode.UPDATE_RESET
            else -> AuthMode.LOGIN
        }

        setContentView(R.layout.activity_native_customer)
        bindViews()
        language = CustomerLanguage.fromTag(AppCompatDelegate.getApplicationLocales().get(0)?.toLanguageTag())
        configureLanguages()
        configureInputSanitizers()
        configureActions()
        renderAuthMode(clearSecrets = false)

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.state.collect(::render)
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString(KEY_AUTH_MODE, authMode.name)
        super.onSaveInstanceState(outState)
    }

    private fun bindViews() {
        authScroll = findViewById(R.id.nativeAuthScroll)
        customerShell = findViewById(R.id.nativeCustomerShell)
        authLanguages = findViewById(R.id.nativeAuthLanguages)
        authEn = findViewById(R.id.nativeAuthEn)
        authOr = findViewById(R.id.nativeAuthOr)
        authAm = findViewById(R.id.nativeAuthAm)
        authTitle = findViewById(R.id.nativeAuthTitle)
        authSubtitle = findViewById(R.id.nativeAuthSubtitle)
        signupFields = findViewById(R.id.nativeSignupFields)
        fullName = findViewById(R.id.nativeFullName)
        phone = findViewById(R.id.nativePhone)
        emailLayout = findViewById(R.id.nativeEmailLayout)
        email = findViewById(R.id.nativeEmail)
        passwordLayout = findViewById(R.id.nativePasswordLayout)
        password = findViewById(R.id.nativePassword)
        confirmLayout = findViewById(R.id.nativeConfirmLayout)
        confirmPin = findViewById(R.id.nativeConfirmPin)
        authFeedback = findViewById(R.id.nativeAuthFeedback)
        authProgress = findViewById(R.id.nativeAuthProgress)
        authSubmit = findViewById(R.id.nativeAuthSubmit)
        forgotPassword = findViewById(R.id.nativeForgotPassword)
        authPrompt = findViewById(R.id.nativeAuthPrompt)
        authModeButton = findViewById(R.id.nativeAuthMode)
        headerTitle = findViewById(R.id.nativeHeaderTitle)
        shellProgress = findViewById(R.id.nativeShellProgress)
        pageHost = findViewById(R.id.nativePageHost)
        navHome = findViewById(R.id.nativeNavHome)
        navOrders = findViewById(R.id.nativeNavOrders)
        navBook = findViewById(R.id.nativeNavBook)
        navTrack = findViewById(R.id.nativeNavTrack)
        navPayments = findViewById(R.id.nativeNavPayments)
        navProfile = findViewById(R.id.nativeNavProfile)
    }

    private fun configureLanguages() {
        authLanguages.check(
            when (language) {
                CustomerLanguage.EN -> authEn.id
                CustomerLanguage.OR -> authOr.id
                CustomerLanguage.AM -> authAm.id
            },
        )
        authLanguages.addOnButtonCheckedListener { _, checkedId, checked ->
            if (!checked) return@addOnButtonCheckedListener
            val requested = when (checkedId) {
                authOr.id -> CustomerLanguage.OR
                authAm.id -> CustomerLanguage.AM
                else -> CustomerLanguage.EN
            }
            if (requested == language) return@addOnButtonCheckedListener
            language = requested
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(requested.tag))
        }
    }

    private fun configureInputSanitizers() {
        email.doAfterTextChanged { editable ->
            if (fieldMutation) return@doAfterTextChanged
            val original = editable?.toString().orEmpty()
            val cleaned = original.filterNot(Char::isWhitespace)
            if (original != cleaned) replaceText(email, cleaned)
        }
        phone.doAfterTextChanged { editable ->
            if (fieldMutation) return@doAfterTextChanged
            val original = editable?.toString().orEmpty()
            val cleaned = buildString {
                original.forEachIndexed { index, character ->
                    if (character.isDigit() || (character == '+' && index == 0)) append(character)
                }
            }
            if (original != cleaned) replaceText(phone, cleaned)
        }
    }

    private fun replaceText(field: EditText, value: String) {
        fieldMutation = true
        field.setText(value)
        field.setSelection(value.length)
        fieldMutation = false
    }

    private fun configureActions() {
        authModeButton.setOnClickListener {
            authMode = when (authMode) {
                AuthMode.LOGIN -> AuthMode.SIGNUP
                else -> AuthMode.LOGIN
            }
            renderAuthMode(clearSecrets = true)
        }
        forgotPassword.setOnClickListener {
            authMode = AuthMode.REQUEST_RESET
            renderAuthMode(clearSecrets = true)
        }
        authSubmit.setOnClickListener { submitAuth() }
        listOf(password, confirmPin).forEach { field ->
            field.setOnEditorActionListener { _, _, _ ->
                authSubmit.performClick()
                true
            }
        }

        navHome.setOnClickListener { viewModel.show(CustomerPage.HOME) }
        navOrders.setOnClickListener { viewModel.show(CustomerPage.ORDERS) }
        navBook.setOnClickListener { viewModel.show(CustomerPage.BOOK) }
        navTrack.setOnClickListener { openTracking() }
        navPayments.setOnClickListener { viewModel.show(CustomerPage.PAYMENTS) }
        navProfile.setOnClickListener { viewModel.show(CustomerPage.PROFILE) }
    }

    private fun submitAuth() {
        authFeedback.visibility = View.GONE
        when (authMode) {
            AuthMode.LOGIN -> viewModel.signIn(email.text.toString(), password.text.toString())
            AuthMode.SIGNUP -> viewModel.signUp(
                fullName.text.toString(),
                phone.text.toString(),
                email.text.toString(),
                password.text.toString(),
                confirmPin.text.toString(),
            )
            AuthMode.REQUEST_RESET -> requestPasswordReset()
            AuthMode.UPDATE_RESET -> updateRecoveredPin()
        }
    }

    private fun requestPasswordReset() {
        setLocalBusy(true)
        lifecycleScope.launch {
            runCatching { recovery.sendRecoveryEmail(email.text.toString()) }
                .onSuccess {
                    prefs.edit().putBoolean(KEY_AWAITING_RECOVERY, true).apply()
                    showFeedback(copy(
                        "Password reset email sent. Open the link on this device to choose a new 6-digit PIN.",
                        "Imeeliin PIN haaromsu ergameera. Link sana device kana irratti baniitii PIN lakkoofsa 6 haaraa fili.",
                        "የይለፍ ቃል ማስጀመሪያ ኢሜይል ተልኳል። አዲስ 6-አሃዝ PIN ለመምረጥ ሊንኩን በዚህ መሣሪያ ይክፈቱ።",
                    ), error = false)
                }
                .onFailure { showFeedback(CustomerAuthPolicy.safeMessage(it), error = true) }
            setLocalBusy(false)
        }
    }

    private fun updateRecoveredPin() {
        val newPin = password.text.toString()
        val confirmation = confirmPin.text.toString()
        setLocalBusy(true)
        lifecycleScope.launch {
            runCatching { recovery.updateRecoveredPin(newPin, confirmation) }
                .onSuccess {
                    prefs.edit().putBoolean(KEY_AWAITING_RECOVERY, false).apply()
                    runCatching { HalloSupabase.client.auth.signOut() }
                    authMode = AuthMode.LOGIN
                    renderAuthMode(clearSecrets = true)
                    showFeedback(copy(
                        "PIN updated. Sign in with your new PIN.",
                        "PIN haaromfameera. PIN haaraa keetiin seeni.",
                        "PIN ተዘምኗል። በአዲሱ PIN ይግቡ።",
                    ), error = false)
                    viewModel.restoreSession()
                }
                .onFailure { showFeedback(CustomerAuthPolicy.safeMessage(it), error = true) }
            setLocalBusy(false)
        }
    }

    private fun setLocalBusy(busy: Boolean) {
        authProgress.visibility = if (busy) View.VISIBLE else View.GONE
        listOf(authSubmit, authModeButton, forgotPassword, fullName, phone, email, password, confirmPin).forEach {
            it.isEnabled = !busy
        }
    }

    private fun renderAuthMode(clearSecrets: Boolean) {
        val signup = authMode == AuthMode.SIGNUP
        val requestReset = authMode == AuthMode.REQUEST_RESET
        val updateReset = authMode == AuthMode.UPDATE_RESET

        signupFields.visibility = if (signup) View.VISIBLE else View.GONE
        emailLayout.visibility = if (updateReset) View.GONE else View.VISIBLE
        passwordLayout.visibility = if (requestReset) View.GONE else View.VISIBLE
        confirmLayout.visibility = if (signup || updateReset) View.VISIBLE else View.GONE
        forgotPassword.visibility = if (authMode == AuthMode.LOGIN) View.VISIBLE else View.GONE

        authTitle.text = when (authMode) {
            AuthMode.LOGIN -> copy("Welcome back", "Baga nagaan dhuftan", "እንኳን ደህና መጡ")
            AuthMode.SIGNUP -> copy("Create your account", "Account kee uumi", "መለያዎን ይፍጠሩ")
            AuthMode.REQUEST_RESET -> copy("Reset your PIN", "PIN kee haaromsi", "PINዎን ያድሱ")
            AuthMode.UPDATE_RESET -> copy("Choose a new PIN", "PIN haaraa fili", "አዲስ PIN ይምረጡ")
        }
        authSubtitle.text = when (authMode) {
            AuthMode.LOGIN -> copy(
                "Book your truck. Track every delivery.",
                "Konkolaataa ajaji. Geessinsa hunda hordofi.",
                "መኪና ይዘዙ። እያንዳንዱን ማድረሻ ይከታተሉ።",
            )
            AuthMode.SIGNUP -> copy(
                "Create a HALLO Customer account with your contact details and a 6-digit PIN.",
                "Odeeffannoo quunnamtii fi PIN lakkoofsa 6 fayyadamuun account HALLO Customer uumi.",
                "በመገናኛ መረጃዎ እና በ6-አሃዝ PIN የHALLO Customer መለያ ይፍጠሩ።",
            )
            AuthMode.REQUEST_RESET -> copy(
                "Enter your Customer email. We will send the existing secure recovery link.",
                "Imeelii Customer kee galchi. Link recovery nageenya qabu siif ergina.",
                "የCustomer ኢሜይልዎን ያስገቡ። የደህንነት መልሶ ማግኛ ሊንክ እንልካለን።",
            )
            AuthMode.UPDATE_RESET -> copy(
                "Use exactly 6 numeric digits, matching the Customer Portal recovery policy.",
                "Policy Customer Portal waliin wal-simuun lakkoofsa 6 qofa fayyadami.",
                "ከCustomer Portal ፖሊሲ ጋር እንዲዛመድ በትክክል 6 የቁጥር አሃዞችን ይጠቀሙ።",
            )
        }
        authSubmit.text = when (authMode) {
            AuthMode.LOGIN -> getString(R.string.sign_in)
            AuthMode.SIGNUP -> getString(R.string.create_customer_account)
            AuthMode.REQUEST_RESET -> copy("Send reset email", "Imeelii reset ergi", "የማስጀመሪያ ኢሜይል ላክ")
            AuthMode.UPDATE_RESET -> copy("Save new PIN", "PIN haaraa olkaa'i", "አዲስ PIN አስቀምጥ")
        }
        authPrompt.text = when (authMode) {
            AuthMode.LOGIN -> copy("New to HALLO?", "HALLO irratti haaraa?", "ለHALLO አዲስ ነዎት?")
            AuthMode.SIGNUP -> copy("Already have an account?", "Account duraan qabdaa?", "መለያ አለዎት?")
            else -> copy("Return to sign in", "Gara seensaa deebi'i", "ወደ መግቢያ ተመለስ")
        }
        authModeButton.text = when (authMode) {
            AuthMode.LOGIN -> copy("Create account", "Account uumi", "መለያ ፍጠር")
            AuthMode.SIGNUP -> copy("Sign in instead", "Bakka kanaa seeni", "በምትኩ ይግቡ")
            else -> copy("Back to sign in", "Gara seensaa deebi'i", "ወደ መግቢያ ተመለስ")
        }

        val pinMode = signup || updateReset
        password.inputType = if (pinMode) {
            InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        } else {
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        password.filters = arrayOf(InputFilter.LengthFilter(if (pinMode) 6 else 72))
        password.setAutofillHints(if (pinMode) "newPassword" else "password")
        passwordLayout.hint = if (pinMode) copy("6-digit PIN", "PIN lakkoofsa 6", "6-አሃዝ PIN") else copy("Password", "Jechi darbii", "የይለፍ ቃል")
        confirmLayout.hint = copy("Confirm 6-digit PIN", "PIN lakkoofsa 6 mirkaneessi", "6-አሃዝ PIN ያረጋግጡ")

        if (clearSecrets) {
            password.setText("")
            confirmPin.setText("")
        }
        authFeedback.visibility = View.GONE
    }

    private fun render(state: CustomerUiState) {
        val recoveryFlow = authMode == AuthMode.UPDATE_RESET || authMode == AuthMode.REQUEST_RESET
        val showShell = state.authorized && !recoveryFlow
        authScroll.visibility = if (showShell) View.GONE else View.VISIBLE
        customerShell.visibility = if (showShell) View.VISIBLE else View.GONE
        shellProgress.visibility = if (state.loading || state.busy) View.VISIBLE else View.GONE

        if (!showShell) {
            authProgress.visibility = if (state.loading || state.busy) View.VISIBLE else View.GONE
            if (!state.loading && state.message.isNotBlank() && state.message != "Sign in with your HALLO Customer account") {
                showFeedback(state.message, error = true)
            }
            return
        }

        renderPage(state)
        highlightNavigation(state.page)
    }

    private fun renderPage(state: CustomerUiState) {
        if (renderedPage != state.page || pageHost.childCount == 0) {
            pageHost.removeAllViews()
            val layout = if (state.page == CustomerPage.HOME) {
                R.layout.page_customer_home_native
            } else {
                R.layout.page_customer_placeholder_native
            }
            pageHost.addView(layoutInflater.inflate(layout, pageHost, false))
            renderedPage = state.page
            if (state.page == CustomerPage.HOME) bindHomeActions()
        }

        headerTitle.text = when (state.page) {
            CustomerPage.HOME -> getString(R.string.header_home)
            CustomerPage.ORDERS -> getString(R.string.header_orders)
            CustomerPage.BOOK -> getString(R.string.header_book)
            CustomerPage.TRACKING -> getString(R.string.header_tracking)
            CustomerPage.PAYMENTS -> getString(R.string.header_payments)
            CustomerPage.PROFILE -> getString(R.string.header_profile)
            CustomerPage.NOTIFICATIONS -> getString(R.string.header_notifications)
        }

        if (state.page == CustomerPage.HOME) renderHome(state) else renderPlaceholder(state.page)
    }

    private fun bindHomeActions() {
        pageHost.findViewById<MaterialButton>(R.id.nativeHomeBook)?.setOnClickListener { viewModel.show(CustomerPage.BOOK) }
        pageHost.findViewById<MaterialButton>(R.id.nativeQuickOrders)?.setOnClickListener { viewModel.show(CustomerPage.ORDERS) }
        pageHost.findViewById<MaterialButton>(R.id.nativeQuickTrack)?.setOnClickListener { openTracking() }
    }

    private fun renderHome(state: CustomerUiState) {
        val firstName = state.profile?.fullName?.trim()?.substringBefore(' ')?.takeIf(String::isNotBlank)
            ?: getString(R.string.customer_generic)
        val activeStatuses = setOf("assigned", "accepted", "in_transit")
        val activeOrders = state.orders.filter { it.status in activeStatuses }
        val delivered = state.orders.count { it.status == "delivered" }
        val unread = state.notifications.count { it.readAt == null }
        val toPay = state.orders.filterNot { it.status == "cancelled" }.sumOf { order ->
            CustomerPaymentPolicy.summarize(order, state.payments.filter { it.orderId == order.id }).remainingToSubmit
        }
        val active = activeOrders.firstOrNull()

        pageHost.findViewById<TextView>(R.id.nativeHomeWelcome)?.text = copy(
            "Welcome, $firstName",
            "Baga nagaan dhuftan, $firstName",
            "እንኳን ደህና መጡ, $firstName",
        )
        pageHost.findViewById<TextView>(R.id.nativeHomeSummary)?.text = copy(
            "${state.orders.size} orders · $unread unread alerts",
            "Ajaja ${state.orders.size} · beeksisa hin dubbifamne $unread",
            "${state.orders.size} ትዕዛዞች · $unread ያልተነበቡ ማሳወቂያዎች",
        )
        pageHost.findViewById<TextView>(R.id.nativeHomeActive)?.text = active?.let {
            "${it.trackingId.orEmpty()}\n${it.pickupAddress.orEmpty()} → ${it.dropoffAddress.orEmpty()}"
        } ?: copy(
            "No active delivery. Create an order when you are ready to move cargo.",
            "Geessinsi hojii irra jiru hin jiru. Fe'umsa erguuf qophooftu order uumi.",
            "ንቁ ማድረሻ የለም። ጭነት ለማንቀሳቀስ ሲዘጋጁ ትዕዛዝ ይፍጠሩ።",
        )
        pageHost.findViewById<TextView>(R.id.nativeMetricOrders)?.text = state.orders.size.toString()
        pageHost.findViewById<TextView>(R.id.nativeMetricActive)?.text = activeOrders.size.toString()
        pageHost.findViewById<TextView>(R.id.nativeMetricDelivered)?.text = delivered.toString()
        pageHost.findViewById<TextView>(R.id.nativeMetricToPay)?.text = "ETB ${NumberFormat.getNumberInstance(Locale.US).format(toPay.toLong())}"
    }

    private fun renderPlaceholder(page: CustomerPage) {
        pageHost.findViewById<TextView>(R.id.nativePlaceholderTitle)?.text = when (page) {
            CustomerPage.ORDERS -> getString(R.string.header_orders)
            CustomerPage.BOOK -> getString(R.string.header_book)
            CustomerPage.TRACKING -> getString(R.string.header_tracking)
            CustomerPage.PAYMENTS -> getString(R.string.header_payments)
            CustomerPage.PROFILE -> getString(R.string.header_profile)
            CustomerPage.NOTIFICATIONS -> getString(R.string.header_notifications)
            CustomerPage.HOME -> getString(R.string.header_home)
        }
    }

    private fun openTracking() {
        val order = viewModel.state.value.orders.firstOrNull { CustomerPolicy.showAssignment(it.status) }
            ?: viewModel.state.value.orders.firstOrNull { it.status == "delivered" }
        if (order == null) viewModel.show(CustomerPage.TRACKING) else viewModel.track(order)
    }

    private fun highlightNavigation(page: CustomerPage) {
        val selected = when (page) {
            CustomerPage.HOME -> navHome
            CustomerPage.ORDERS -> navOrders
            CustomerPage.BOOK -> navBook
            CustomerPage.TRACKING -> navTrack
            CustomerPage.PAYMENTS -> navPayments
            CustomerPage.PROFILE -> navProfile
            CustomerPage.NOTIFICATIONS -> null
        }
        listOf(navHome, navOrders, navBook, navTrack, navPayments, navProfile).forEach { button ->
            val active = button === selected
            val foreground = getColor(if (active) R.color.hallo_navy else R.color.hallo_muted)
            button.setTextColor(foreground)
            button.iconTint = ColorStateList.valueOf(foreground)
            button.backgroundTintList = ColorStateList.valueOf(if (active) getColor(R.color.hallo_navy_soft) else Color.TRANSPARENT)
        }
    }

    private fun showFeedback(message: String, error: Boolean) {
        authFeedback.text = message
        authFeedback.setTextColor(getColor(if (error) R.color.hallo_danger else R.color.hallo_success))
        authFeedback.visibility = View.VISIBLE
    }

    private fun copy(en: String, om: String, am: String): String = when (language) {
        CustomerLanguage.EN -> en
        CustomerLanguage.OR -> om
        CustomerLanguage.AM -> am
    }

    companion object {
        private const val KEY_AUTH_MODE = "native_auth_mode"
        private const val KEY_AWAITING_RECOVERY = "awaiting_password_recovery"
    }
}
