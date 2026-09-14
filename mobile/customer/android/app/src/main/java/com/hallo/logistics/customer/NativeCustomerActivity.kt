package com.hallo.logistics.customer

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
import android.os.Looper
import android.provider.OpenableColumns
import android.text.InputFilter
import android.text.InputType
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.webkit.MimeTypeMap
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.os.LocaleListCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.textfield.TextInputLayout
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.handleDeeplinks
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.NumberFormat
import java.util.Locale

/**
 * Clean native Customer Android portal-parity workspace.
 *
 * The production Customer Portal remains the functional source of truth. This Activity reuses
 * the existing CustomerViewModel/Repository/RPC/storage contracts and owns Android presentation
 * only. It stays off the launcher until the complete parity smoke gate passes.
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
    private lateinit var nativeHeader: LinearLayout
    private lateinit var shellProgress: View
    private lateinit var pageHost: FrameLayout
    private lateinit var bottomNavigation: View
    private lateinit var navHome: MaterialButton
    private lateinit var navOrders: MaterialButton
    private lateinit var navBook: MaterialButton
    private lateinit var navTrack: MaterialButton
    private lateinit var navPayments: MaterialButton
    private lateinit var navProfile: MaterialButton
    private lateinit var notificationsButton: MaterialButton

    private var language = CustomerLanguage.EN
    private var authMode = AuthMode.LOGIN
    private var renderedPage: CustomerPage? = null
    private var fieldMutation = false
    private var sharedLocation: CustomerPlace? = null
    private var bookController: NativeCustomerBookController? = null
    private var ordersController: NativeCustomerOrdersController? = null
    private var trackingController: NativeCustomerTrackingController? = null
    private var paymentsController: NativeCustomerPaymentsController? = null
    private var profileController: NativeCustomerProfileController? = null
    private var notificationsController: NativeCustomerNotificationsController? = null
    private var lastSuccessMessage: String? = null

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) captureCurrentLocation() else showLocationError()
    }

    private val receiptPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) {
            paymentsController?.clearPendingReceipt()
            return@registerForActivityResult
        }
        consumeReceipt(uri)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

        val callbackUri = intent?.dataString.orEmpty()
        if (HalloSupabase.configured && intent != null) HalloSupabase.client.handleDeeplinks(intent)
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
        configureHeaderNotifications()
        configureInsets()
        configureActions()
        renderAuthMode(clearSecrets = false)

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.state.collect(::render)
            }
        }
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.events.collect { event ->
                    when (event) {
                        is CustomerUiEvent.OpenUrl -> openSecureUrl(event.url)
                    }
                }
            }
        }
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (isActive) {
                    delay(8_000)
                    if (viewModel.state.value.page == CustomerPage.TRACKING && !viewModel.state.value.busy) {
                        viewModel.refreshTracking()
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (HalloSupabase.configured) HalloSupabase.client.handleDeeplinks(intent)
        if (prefs.getBoolean(KEY_AWAITING_RECOVERY, false) && !intent.dataString.isNullOrBlank()) {
            authMode = AuthMode.UPDATE_RESET
            renderAuthMode(clearSecrets = true)
        }
        viewModel.restoreSession()
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
        nativeHeader = findViewById(R.id.nativeHeader)
        shellProgress = findViewById(R.id.nativeShellProgress)
        pageHost = findViewById(R.id.nativePageHost)
        bottomNavigation = findViewById(R.id.nativeBottomNavigation)
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

    private fun configureHeaderNotifications() {
        notificationsButton = MaterialButton(this).apply {
            minWidth = dp(48)
            minimumWidth = 0
            minHeight = dp(48)
            text = "0"
            textSize = 10f
            setTextColor(getColor(R.color.hallo_navy))
            icon = ContextCompat.getDrawable(this@NativeCustomerActivity, R.drawable.ic_notifications)
            iconTint = ColorStateList.valueOf(getColor(R.color.hallo_navy))
            iconGravity = MaterialButton.ICON_GRAVITY_TOP
            iconPadding = 0
            contentDescription = getString(R.string.notifications)
            setOnClickListener { navigate(CustomerPage.NOTIFICATIONS) }
        }
        nativeHeader.addView(notificationsButton, nativeHeader.childCount - 1)
    }

    private fun configureInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(customerShell) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            nativeHeader.updatePadding(top = bars.top, left = dp(16), right = dp(12))
            nativeHeader.layoutParams = nativeHeader.layoutParams.apply { height = dp(68) + bars.top }
            bottomNavigation.updatePadding(bottom = bars.bottom)
            bottomNavigation.layoutParams = bottomNavigation.layoutParams.apply { height = dp(64) + bars.bottom }
            insets
        }
        ViewCompat.requestApplyInsets(customerShell)
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

        navHome.setOnClickListener { navigate(CustomerPage.HOME) }
        navOrders.setOnClickListener { navigate(CustomerPage.ORDERS) }
        navBook.setOnClickListener { navigate(CustomerPage.BOOK) }
        navTrack.setOnClickListener {
            hideKeyboard()
            openTracking()
        }
        navPayments.setOnClickListener { navigate(CustomerPage.PAYMENTS) }
        navProfile.setOnClickListener { navigate(CustomerPage.PROFILE) }
    }

    private fun navigate(page: CustomerPage) {
        hideKeyboard()
        viewModel.show(page)
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
                "የCustomer ኢሜይልዎን ያስገቡ። የደህነት መልሶ ማግኛ ሊንክ እንልካለን።",
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

        val unread = state.notifications.count { it.readAt == null }
        notificationsButton.text = if (unread > 99) "99+" else unread.toString()
        renderPage(state)
        highlightNavigation(state.page)
        maybeShowOrderSuccess(state)
    }

    private fun renderPage(state: CustomerUiState) {
        if (renderedPage != state.page || pageHost.childCount == 0) {
            pageHost.removeAllViews()
            resetControllers()
            val layout = when (state.page) {
                CustomerPage.HOME -> R.layout.page_customer_home_native
                CustomerPage.BOOK -> R.layout.page_customer_book_native
                CustomerPage.ORDERS -> R.layout.page_customer_orders_native
                CustomerPage.TRACKING -> R.layout.page_customer_tracking_native
                CustomerPage.PAYMENTS -> R.layout.page_customer_payments_native
                CustomerPage.PROFILE -> R.layout.page_customer_profile_native
                CustomerPage.NOTIFICATIONS -> R.layout.page_customer_notifications_native
            }
            val page = layoutInflater.inflate(layout, pageHost, false)
            pageHost.addView(page)
            renderedPage = state.page
            when (state.page) {
                CustomerPage.HOME -> bindHomeActions()
                CustomerPage.BOOK -> bookController = NativeCustomerBookController(this, page, viewModel, ::requestCurrentLocation)
                CustomerPage.ORDERS -> ordersController = NativeCustomerOrdersController(this, page, viewModel)
                CustomerPage.TRACKING -> trackingController = NativeCustomerTrackingController(this, page, viewModel)
                CustomerPage.PAYMENTS -> paymentsController = NativeCustomerPaymentsController(
                    activity = this,
                    root = page,
                    viewModel = viewModel,
                    requestReceipt = {
                        receiptPicker.launch(arrayOf("image/jpeg", "image/png", "image/webp", "application/pdf"))
                    },
                )
                CustomerPage.PROFILE -> profileController = NativeCustomerProfileController(this, page, viewModel, ::requestCurrentLocation, ::clearSharedLocation)
                CustomerPage.NOTIFICATIONS -> notificationsController = NativeCustomerNotificationsController(this, page, viewModel)
            }
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

        when (state.page) {
            CustomerPage.HOME -> renderHome(state)
            CustomerPage.BOOK -> bookController?.render(state)
            CustomerPage.ORDERS -> ordersController?.render(state)
            CustomerPage.TRACKING -> trackingController?.render(state)
            CustomerPage.PAYMENTS -> paymentsController?.render(state)
            CustomerPage.PROFILE -> profileController?.render(state, sharedLocation)
            CustomerPage.NOTIFICATIONS -> notificationsController?.render(state)
        }
    }

    private fun resetControllers() {
        bookController = null
        ordersController = null
        trackingController = null
        paymentsController = null
        profileController = null
        notificationsController = null
    }

    private fun bindHomeActions() {
        pageHost.findViewById<MaterialButton>(R.id.nativeHomeBook)?.setOnClickListener { navigate(CustomerPage.BOOK) }
        pageHost.findViewById<MaterialButton>(R.id.nativeQuickOrders)?.setOnClickListener { navigate(CustomerPage.ORDERS) }
        pageHost.findViewById<MaterialButton>(R.id.nativeQuickTrack)?.setOnClickListener {
            hideKeyboard()
            openTracking()
        }
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

    private fun maybeShowOrderSuccess(state: CustomerUiState) {
        val message = state.message
        if (!message.startsWith("Order ") || !message.endsWith(" created") || message == lastSuccessMessage) return
        lastSuccessMessage = message
        val tracking = message.removePrefix("Order ").removeSuffix(" created")
        AlertDialog.Builder(this)
            .setTitle(copy("Order created", "Order uumame", "ትዕዛዝ ተፈጥሯል"))
            .setMessage(copy(
                "$tracking was created successfully. You can open your orders or create another delivery.",
                "$tracking milkaa'inaan uumameera. Ajajoota kee ilaali ykn geessinsa biraa uumi.",
                "$tracking በተሳካ ሁኔታ ተፈጥሯል። ትዕዛዞችዎን ይመልከቱ ወይም ሌላ ማድረሻ ይፍጠሩ።",
            ))
            .setNegativeButton(copy("Create another", "Kan biraa uumi", "ሌላ ፍጠር")) { _, _ -> navigate(CustomerPage.BOOK) }
            .setPositiveButton(copy("View order", "Order ilaali", "ትዕዛዝ ይመልከቱ")) { _, _ -> navigate(CustomerPage.ORDERS) }
            .show()
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

    private fun requestCurrentLocation() {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) {
            locationPermissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
            return
        }
        captureCurrentLocation()
    }

    @SuppressLint("MissingPermission")
    private fun captureCurrentLocation() {
        val manager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val providers = manager.getProviders(true)
        val best = providers.mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
            .maxByOrNull(Location::getTime)
        if (best != null) {
            acceptLocation(best)
            return
        }
        val provider = providers.firstOrNull { it == LocationManager.GPS_PROVIDER }
            ?: providers.firstOrNull { it == LocationManager.NETWORK_PROVIDER }
            ?: providers.firstOrNull()
        if (provider == null) {
            showLocationError()
            return
        }
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                runCatching { manager.removeUpdates(this) }
                acceptLocation(location)
            }
            override fun onProviderEnabled(provider: String) = Unit
            override fun onProviderDisabled(provider: String) = Unit
            @Deprecated("Deprecated in API 29")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        }
        runCatching { manager.requestSingleUpdate(provider, listener, Looper.getMainLooper()) }
            .onFailure { showLocationError() }
    }

    private fun acceptLocation(location: Location) {
        sharedLocation = CustomerPlace(
            label = copy("My location", "Bakka ani jiru", "ያለሁበት ቦታ"),
            longitude = location.longitude,
            latitude = location.latitude,
        )
        bookController?.setCurrentPickup(sharedLocation!!)
        profileController?.render(viewModel.state.value, sharedLocation)
    }

    private fun clearSharedLocation() {
        sharedLocation = null
        profileController?.render(viewModel.state.value, null)
    }

    private fun showLocationError() {
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.my_location))
            .setMessage(getString(R.string.location_unavailable))
            .setPositiveButton(android.R.string.ok, null)
            .show()
    }

    private fun consumeReceipt(uri: Uri) {
        lifecycleScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val size = contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) cursor.getLong(0) else null
                    }
                    require(size == null || size <= 10L * 1024L * 1024L) { "Receipt must be 10 MB or smaller" }
                    val mime = contentResolver.getType(uri) ?: "application/octet-stream"
                    require(mime in CustomerPaymentSubmissionRepository.allowedTypes) { "Receipt must be JPG, PNG, WebP or PDF" }
                    val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)
                        ?: if (mime == "application/pdf") "pdf" else "jpg"
                    val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error("Receipt could not be read")
                    Triple(bytes, mime, extension)
                }
            }.onSuccess { (bytes, mime, extension) ->
                paymentsController?.consumeReceipt(bytes, mime, extension)
            }.onFailure {
                paymentsController?.clearPendingReceipt()
                AlertDialog.Builder(this@NativeCustomerActivity)
                    .setTitle(getString(R.string.payments_title))
                    .setMessage(it.message ?: getString(R.string.receipt_unavailable))
                    .setPositiveButton(android.R.string.ok, null)
                    .show()
            }
        }
    }

    private fun openSecureUrl(url: String) {
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return
        if (uri.scheme != "https") return
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            .onFailure {
                AlertDialog.Builder(this).setMessage(getString(R.string.receipt_unavailable)).setPositiveButton(android.R.string.ok, null).show()
            }
    }

    private fun hideKeyboard() {
        currentFocus?.let { focused ->
            (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
                .hideSoftInputFromWindow(focused.windowToken, 0)
            focused.clearFocus()
        }
    }

    private fun replaceText(field: EditText, value: String) {
        fieldMutation = true
        field.setText(value)
        field.setSelection(value.length)
        fieldMutation = false
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

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val KEY_AUTH_MODE = "native_auth_mode"
        private const val KEY_AWAITING_RECOVERY = "awaiting_password_recovery"
    }
}
