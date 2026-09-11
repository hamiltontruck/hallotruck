package com.hallo.logistics.customer

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.annotation.StringRes
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
import com.google.android.material.card.MaterialCardView
import com.hallo.logistics.customer.databinding.ActivityMainBinding
import com.hallo.logistics.customer.databinding.ItemCustomerOrderBinding
import com.hallo.logistics.customer.databinding.ItemCustomerTruckBinding
import io.github.jan.supabase.auth.handleDeeplinks
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.NumberFormat

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private val viewModel: CustomerViewModel by viewModels()
    private val authBack: OnBackPressedCallback = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            signupMode = false
            renderAuthMode(resetSecrets = true)
        }
    }
    private var signupMode = false
    private var pickupLabels: List<String> = emptyList()
    private var dropoffLabels: List<String> = emptyList()
    private var language = CustomerLanguage.EN
    private var selectedVehicle = TRUCKS[1]
    private var selectedCategoryKey = "general_goods"
    private var selectedPackagingKey = "loose_bulk"
    private var selectedUnitKey = "ton"
    private var selectedPaymentKey = "cash"
    private var orderFilter = CustomerOrderFilter.ALL
    private val expandedOrders = mutableSetOf<String>()

    private val locationPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true || grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) requestCurrentPickup() else if (::binding.isInitialized) binding.status.text = getString(R.string.location_permission_required)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (HalloSupabase.configured) HalloSupabase.client.handleDeeplinks(intent)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        language = CustomerLanguage.fromTag(AppCompatDelegate.getApplicationLocales().get(0)?.toLanguageTag())
        signupMode = savedInstanceState?.getBoolean("authSignupMode") ?: false
        configureAuthLanguages()
        configureLanguageSelector()
        configureBottomInsets()
        configureBookingControls()
        bindActions()
        onBackPressedDispatcher.addCallback(this, authBack)
        applyLocalizedCopy(CustomerPage.HOME)

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

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean("authSignupMode", signupMode)
        super.onSaveInstanceState(outState)
    }

    private fun configureAuthLanguages() = with(binding) {
        authLanguages.check(when (language) {
            CustomerLanguage.EN -> authEn.id
            CustomerLanguage.OR -> authOr.id
            CustomerLanguage.AM -> authAm.id
        })
        authLanguages.addOnButtonCheckedListener { _, id, checked ->
            if (checked) {
                val requested = when (id) {
                    authOr.id -> CustomerLanguage.OR
                    authAm.id -> CustomerLanguage.AM
                    else -> CustomerLanguage.EN
                }
                if (requested != language) {
                    language = requested
                    AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(requested.tag))
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (HalloSupabase.configured) HalloSupabase.client.handleDeeplinks(intent)
        viewModel.restoreSession()
    }

    private fun configureLanguageSelector() = with(binding) {
        languageSelector.check(
            when (language) {
                CustomerLanguage.EN -> languageEn.id
                CustomerLanguage.OR -> languageOr.id
                CustomerLanguage.AM -> languageAm.id
            },
        )
        languageSelector.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (!isChecked) return@addOnButtonCheckedListener
            val requested = when (checkedId) {
                languageOr.id -> CustomerLanguage.OR
                languageAm.id -> CustomerLanguage.AM
                else -> CustomerLanguage.EN
            }
            if (requested == language) return@addOnButtonCheckedListener
            language = requested
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(requested.tag))
        }
    }

    private fun configureBottomInsets() {
        val buttons = listOf(binding.navHome, binding.navBook, binding.navOrders, binding.navTrack, binding.navProfile)
        buttons.forEach {
            it.minWidth = 0
            it.minimumWidth = 0
            it.setPadding(0, 0, 0, 0)
            it.textSize = 10f
            it.maxLines = 1
        }
        ViewCompat.setOnApplyWindowInsetsListener(binding.bottomNavigation) { view, insets ->
            val bottom = insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom
            view.updatePadding(bottom = bottom)
            view.layoutParams = view.layoutParams.apply { height = 64.dp + bottom }
            insets
        }
        ViewCompat.requestApplyInsets(binding.bottomNavigation)
    }

    private fun configureBookingControls() {
        renderTruckOptions()
        configureBookingDropdowns()
        installRouteActions()
        updateLoadSummary()
    }

    private fun configureBookingDropdowns() = with(binding) {
        setOptions(cargoCategory, CATEGORIES, selectedCategoryKey) { selectedCategoryKey = it }
        setOptions(packagingType, PACKAGING, selectedPackagingKey) { selectedPackagingKey = it }
        setOptions(cargoUnit, UNITS, selectedUnitKey) {
            selectedUnitKey = it
            viewModel.bookingInputChanged()
            updateLoadSummary()
        }
        setOptions(paymentMethod, PAYMENTS, selectedPaymentKey) { selectedPaymentKey = it }
    }

    private fun setOptions(
        view: AutoCompleteTextView,
        options: List<SelectOption>,
        selectedKey: String,
        onSelected: (String) -> Unit,
    ) {
        val labels = options.map { getString(it.labelRes) }
        view.setAdapter(ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, labels))
        view.setText(options.firstOrNull { it.key == selectedKey }?.let { getString(it.labelRes) }.orEmpty(), false)
        view.setOnItemClickListener { _, _, position, _ ->
            options.getOrNull(position)?.let { onSelected(it.key) }
            updateBookingSteps(viewModel.state.value)
        }
    }

    private fun renderTruckOptions(): Unit = with(binding) {
        truckOptions.removeAllViews()
        TRUCKS.forEach { truck ->
            val item = ItemCustomerTruckBinding.inflate(layoutInflater, truckOptions, false)
            val visibleName = getString(truck.labelRes)
            item.truckImage.setImageResource(truck.image)
            item.truckImage.contentDescription = visibleName
            item.truckName.text = visibleName
            item.truckCapacity.text = getString(R.string.up_to_tons, truck.capacity)
            val selected = truck.backendValue == selectedVehicle.backendValue
            item.root.strokeWidth = if (selected) 3.dp else 1.dp
            item.root.setStrokeColor(getColor(if (selected) R.color.hallo_gold else R.color.hallo_line))
            item.root.setCardBackgroundColor(getColor(if (selected) R.color.hallo_gold_soft else android.R.color.white))
            item.root.contentDescription = "$visibleName, ${getString(R.string.up_to_tons, truck.capacity)}${if (selected) ", ${getString(R.string.selected)}" else ""}"
            item.root.setOnClickListener {
                if (selectedVehicle.backendValue != truck.backendValue) {
                    selectedVehicle = truck
                    viewModel.bookingInputChanged()
                    renderTruckOptions()
                    updateBookingSteps(viewModel.state.value)
                }
            }
            truckOptions.addView(item.root)
        }
    }

    private fun bindActions() = with(binding) {
        authForgot.setOnClickListener {
            AlertDialog.Builder(this@MainActivity)
                .setTitle(R.string.auth_forgot)
                .setMessage(R.string.auth_recovery_help)
                .setPositiveButton(R.string.auth_open_portal) { _, _ ->
                    openSecureUrl("https://hamiltontruck.github.io/hallotruck/#/customer/login")
                }.setNegativeButton(android.R.string.cancel, null).show()
        }
        listOf(password, confirmPin).forEach { field ->
            field.setOnEditorActionListener { _, action, _ ->
                if (action == android.view.inputmethod.EditorInfo.IME_ACTION_DONE) {
                    authSubmit.performClick()
                    true
                } else false
            }
        }
        authMode.setOnClickListener {
            signupMode = !signupMode
            renderAuthMode(resetSecrets = true)
        }
        authSubmit.setOnClickListener {
            if (viewModel.state.value.busy || viewModel.state.value.loading) return@setOnClickListener
            if (signupMode) {
                viewModel.signUp(
                    fullName.text.toString(),
                    phone.text.toString(),
                    email.text.toString(),
                    password.text.toString(),
                    confirmPin.text.toString(),
                )
            } else {
                viewModel.signIn(email.text.toString(), password.text.toString())
            }
        }
        navHome.setOnClickListener { viewModel.show(CustomerPage.HOME) }
        navBook.setOnClickListener { viewModel.show(CustomerPage.PAYMENTS) }
        navOrders.setOnClickListener { viewModel.show(CustomerPage.ORDERS) }
        navTrack.setOnClickListener { openActiveTracking() }
        navProfile.setOnClickListener { viewModel.show(CustomerPage.PROFILE) }
        navNotifications.setOnClickListener { viewModel.show(CustomerPage.NOTIFICATIONS) }
        startBooking.setOnClickListener { viewModel.show(CustomerPage.BOOK) }
        homeTrack.setOnClickListener { openActiveTracking() }
        refresh.setOnClickListener { viewModel.refresh() }
        refreshTracking.setOnClickListener { viewModel.refreshTracking() }
        signOut.setOnClickListener { viewModel.signOut() }
        calculateQuote.setOnClickListener {
            viewModel.calculateAutomaticRoute(
                pickupAddress.text.toString(),
                dropoffAddress.text.toString(),
                selectedVehicle.backendValue,
                currentCargoTons(),
            )
        }
        createOrder.setOnClickListener { showBookingReview() }
        pickupAddress.doAfterTextChanged { value -> viewModel.placeInputChanged(value?.toString().orEmpty(), true) }
        dropoffAddress.doAfterTextChanged { value -> viewModel.placeInputChanged(value?.toString().orEmpty(), false) }
        cargoQuantity.doAfterTextChanged {
            viewModel.bookingInputChanged()
            updateLoadSummary()
            updateBookingSteps(viewModel.state.value)
        }
        pickupAddress.setOnItemClickListener { _, _, position, _ -> statePlace(position, true)?.let { viewModel.selectPlace(it, true) } }
        dropoffAddress.setOnItemClickListener { _, _, position, _ -> statePlace(position, false)?.let { viewModel.selectPlace(it, false) } }
    }

    private fun openActiveTracking() {
        val order = viewModel.state.value.orders.firstOrNull { CustomerPolicy.showAssignment(it.status) }
            ?: viewModel.state.value.orders.firstOrNull { it.status == "delivered" }
        if (order == null) viewModel.show(CustomerPage.TRACKING) else viewModel.track(order)
    }

    private fun renderAuthMode(resetSecrets: Boolean): Unit = with(binding) {
        authBack.isEnabled = signupMode && !viewModel.state.value.authorized && !viewModel.state.value.busy
        signupFields.visibility = visible(signupMode)
        confirmPinLayout.visibility = visible(signupMode)
        authTitle.text = getString(if (signupMode) R.string.auth_create_title else R.string.auth_welcome)
        authSubmit.text = getString(if (signupMode) R.string.create_account else R.string.sign_in)
        authMode.text = getString(if (signupMode) R.string.sign_in else R.string.create_account)
        authPrompt.text = getString(if (signupMode) R.string.auth_existing else R.string.auth_new)
        authSubtitle.text = getString(if (signupMode) R.string.auth_create_description else R.string.auth_login_description)
        authForgot.visibility = visible(!signupMode)
        authHero.layoutParams = authHero.layoutParams.apply { height = (if (signupMode) 100 else 144).dp }
        password.setAutofillHints(if (signupMode) "newPassword" else "password")
        val authInputType = if (signupMode) {
            InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        } else {
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        if (password.inputType != authInputType) password.inputType = authInputType
        password.filters = arrayOf(InputFilter.LengthFilter(if (signupMode) 6 else 128))
        if (resetSecrets) {
            password.setText("")
            confirmPin.setText("")
        }
    }

    private fun render(state: CustomerUiState) = with(binding) {
        progress.visibility = visible(state.loading || state.busy)
        status.text = localizedStatus(state)
        appHeader.visibility = visible(state.authorized || state.loading)
        statusCard.visibility = visible(state.authorized || state.loading)
        authPanel.visibility = visible(!state.authorized && !state.loading)
        authProgress.visibility = visible(state.busy)
        authFeedback.text = localizedStatus(state)
        authFeedback.visibility = visible(state.message.isNotBlank() && state.message != "Sign in with your HALLO Customer account")
        listOf(authSubmit, authMode, authForgot, fullName, phone, email, password, confirmPin, authEn, authOr, authAm).forEach {
            it.isEnabled = !state.busy && !state.loading
        }
        if (state.authorized) {
            password.text?.clear()
            confirmPin.text?.clear()
        }
        customerShell.visibility = visible(state.authorized)
        bottomNavigation.visibility = visible(state.authorized)
        navNotifications.visibility = visible(state.authorized)
        languageSelector.visibility = View.VISIBLE
        val unread = state.notifications.count { it.readAt == null }
        notificationBadge.visibility = visible(state.authorized && unread > 0)
        notificationBadge.text = if (unread > 99) "99+" else unread.toString()
        listOf(pageHome, pageBook, pageOrders, pageTracking, pagePayments, pageNotifications, pageProfile).forEach { it.visibility = View.GONE }
        applyLocalizedCopy(state.page)
        if (state.busy) authSubmit.text = getString(R.string.loading)
        if (!state.authorized) return@with
        val shown = when (state.page) {
            CustomerPage.HOME -> pageHome
            CustomerPage.BOOK -> pageBook
            CustomerPage.ORDERS -> pageOrders
            CustomerPage.TRACKING -> pageTracking
            CustomerPage.PAYMENTS -> pagePayments
            CustomerPage.NOTIFICATIONS -> pageNotifications
            CustomerPage.PROFILE -> pageProfile
        }
        shown.visibility = View.VISIBLE
        highlightNavigation(state.page)

        val firstName = state.profile?.fullName?.substringBefore(' ')?.takeIf { it.isNotBlank() } ?: getString(R.string.customer_generic)
        welcome.text = getString(R.string.welcome_name, firstName)
        homeSummary.text = getString(R.string.home_summary, state.orders.size, unread)
        val active = state.orders.firstOrNull { CustomerPolicy.showAssignment(it.status) }
        homeActiveOrder.text = active?.let {
            "${it.trackingId ?: getString(R.string.order_label)}\n${it.pickupAddress.orEmpty()} → ${it.dropoffAddress.orEmpty()}\n${label(it.status)}"
        } ?: getString(R.string.no_active_delivery)
        homeTrack.visibility = visible(active != null)
        renderHomeDashboard(state, unread)

        quoteResult.text = state.quote?.let { quote ->
            state.route?.let {
                "${it.pickup.label}\n→ ${it.dropoff.label}\n${getString(selectedVehicle.labelRes)} · ${formatDistance(quote.distanceKm)} · ${getString(R.string.minutes_short, it.durationMinutes)}\n${formatTons(quote.cargoTons)} · ${money(quote.totalEtb)}"
            } ?: money(quote.totalEtb)
        } ?: getString(R.string.secure_quote_placeholder)
        renderPlaceSuggestions(state)
        pickupLayout.error = state.placeSearchMessage.takeIf { pickupAddress.hasFocus() }
        dropoffLayout.error = state.placeSearchMessage.takeIf { dropoffAddress.hasFocus() }
        bookingMap.showBooking(state.selectedPickup, state.selectedDropoff, state.route)
        createOrder.isEnabled = state.quote != null && state.route != null && !state.busy
        updateBookingSteps(state)
        renderOrders(state)
        renderPayments(state)
        renderNotifications(state.notifications)
        renderTracking(state)
        renderProfile(state.profile)
    }

    private fun localizedStatus(state: CustomerUiState): String {
        if (state.loading || state.busy) {
            return when {
                state.message.startsWith("Finding places") -> getString(R.string.route_calculating)
                state.message.startsWith("Calculating secure quote") -> getString(R.string.quote_calculating)
                state.message.startsWith("Creating order") -> getString(R.string.creating_order)
                state.message.startsWith("Saving customer profile") -> getString(R.string.saving)
                else -> getString(R.string.loading)
            }
        }
        return when {
            state.message == "Customer workspace" || state.message.isBlank() -> getString(R.string.secure_customer_workspace)
            state.message == "Tracking updated" -> getString(R.string.tracking_updated)
            state.message == "Waiting for the driver to share the first GPS location" -> getString(R.string.waiting_gps)
            state.message == "Signed out" -> getString(R.string.sign_out)
            state.message.startsWith("Route ready:") -> getString(R.string.route_ready)
            state.message.startsWith("Quote ready:") -> getString(R.string.quote_ready)
            state.message.startsWith("Order ") && state.message.endsWith(" created") -> getString(R.string.order_created)
            state.message == "Customer profile updated" -> getString(R.string.profile_updated)
            state.message == "Enter cargo weight" -> getString(R.string.enter_valid_load)
            state.message == "Cargo load exceeds the selected truck capacity" -> getString(
                R.string.capacity_exceeded,
                formatTons(currentCargoTons()),
                formatTons(selectedVehicle.capacity.toDouble()),
            )
            else -> state.message
        }
    }

    private fun applyLocalizedCopy(page: CustomerPage) = with(binding) {
        headerTitle.text = getString(
            when (page) {
                CustomerPage.HOME -> R.string.header_home
                CustomerPage.BOOK -> R.string.header_book
                CustomerPage.ORDERS -> R.string.header_orders
                CustomerPage.TRACKING -> R.string.header_tracking
                CustomerPage.PAYMENTS -> R.string.header_payments
                CustomerPage.NOTIFICATIONS -> R.string.header_notifications
                CustomerPage.PROFILE -> R.string.header_profile
            },
        )
        authSubtitle.text = getString(R.string.auth_subtitle)
        navHome.text = getString(R.string.nav_home)
        navBook.text = getString(R.string.nav_payments)
        navOrders.text = getString(R.string.nav_orders)
        navTrack.text = getString(R.string.nav_track)
        navProfile.text = getString(R.string.nav_profile)
        navNotifications.contentDescription = getString(R.string.notifications)
        homeActiveLabel.text = getString(R.string.active_delivery)
        homeTrack.text = getString(R.string.open_live_tracking)
        startBooking.text = getString(R.string.create_delivery_order)
        refresh.text = ""
        refresh.contentDescription = getString(R.string.refresh_customer_data)
        bookTitle.text = getString(R.string.book_truck)
        bookSubtitle.text = getString(R.string.booking_steps)
        routeSectionTitle.text = getString(R.string.route_section)
        truckSectionTitle.text = getString(R.string.truck_section)
        truckSectionHelp.text = getString(R.string.truck_help)
        cargoSectionTitle.text = getString(R.string.cargo_load_section)
        quoteSectionTitle.text = getString(R.string.secure_quote_section)
        pickupLayout.hint = getString(R.string.pickup_place)
        dropoffLayout.hint = getString(R.string.dropoff_place)
        cargoCategoryLayout.hint = getString(R.string.cargo_category)
        packagingTypeLayout.hint = getString(R.string.packaging_type)
        cargoQuantityLayout.hint = getString(R.string.quantity)
        cargoUnitLayout.hint = getString(R.string.unit)
        additionalNotesLayout.hint = getString(R.string.additional_notes)
        paymentMethodLayout.hint = getString(R.string.payment_method)
        calculateQuote.text = getString(R.string.find_route_quote)
        createOrder.text = getString(R.string.confirm_create_order)
        ordersTitle.text = getString(R.string.orders_title)
        ordersSubtitle.text = getString(R.string.orders_subtitle)
        trackingTitle.text = getString(R.string.live_tracking)
        refreshTracking.text = getString(R.string.refresh_live_position)
        callDriver.text = getString(R.string.call)
        messageDriver.text = getString(R.string.message)
        profileTitle.text = getString(R.string.profile_title)
        signOut.text = getString(R.string.sign_out)
        (pagePayments.getChildAt(0) as? TextView)?.text = getString(R.string.payments_title)
        (pagePayments.getChildAt(1) as? TextView)?.text = getString(R.string.payments_subtitle)
        (pageNotifications.getChildAt(0) as? TextView)?.text = getString(R.string.notifications)
        inputLayout(fullName)?.hint = getString(R.string.full_name)
        inputLayout(phone)?.hint = getString(R.string.phone)
        inputLayout(email)?.hint = getString(R.string.email)
        inputLayout(password)?.hint = getString(R.string.password_pin)
        confirmPinLayout.hint = getString(R.string.confirm_pin)
        languageEn.text = getString(R.string.language_en)
        languageOr.text = getString(R.string.language_or)
        languageAm.text = getString(R.string.language_am)
        stepRoute.text = "1"
        stepTruck.text = "2"
        stepCargo.text = "3"
        stepLoad.text = "4"
        stepQuote.text = "5"
        stepConfirm.text = "6"
        renderAuthMode(resetSecrets = false)
        updateLoadSummary()
    }

    private fun inputLayout(view: View): com.google.android.material.textfield.TextInputLayout? {
        var parent = view.parent
        while (parent is View) {
            if (parent is com.google.android.material.textfield.TextInputLayout) return parent
            parent = parent.parent
        }
        return null
    }

    private fun installRouteActions() {
        val parent = binding.pickupLayout.parent as? LinearLayout ?: return
        if (parent.findViewWithTag<View>(ROUTE_ACTIONS_TAG) != null) return
        val row = LinearLayout(this).apply {
            tag = ROUTE_ACTIONS_TAG
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 6.dp, 0, 0)
        }
        row.addView(routeActionButton(getString(R.string.my_location)) { requestCurrentPickup() }, weightParams(end = 4.dp))
        row.addView(routeActionButton(getString(R.string.swap_route)) { swapBookingRoute() }, weightParams(start = 4.dp, end = 4.dp))
        row.addView(routeActionButton(getString(R.string.reset_route)) { resetBookingRoute() }, weightParams(start = 4.dp))
        val index = parent.indexOfChild(binding.dropoffLayout).takeIf { it >= 0 } ?: 1
        parent.addView(row, index + 1)
    }

    private fun routeActionButton(label: String, action: () -> Unit) = MaterialButton(this).apply {
        text = label
        isAllCaps = false
        minWidth = 0
        minimumWidth = 0
        minHeight = 48.dp
        maxLines = 1
        textSize = 11f
        insetTop = 0
        insetBottom = 0
        backgroundTintList = ColorStateList.valueOf(getColor(R.color.hallo_navy_soft))
        setTextColor(getColor(R.color.hallo_navy))
        setOnClickListener { action() }
    }

    private fun swapBookingRoute() = with(binding) {
        val pickup = pickupAddress.text?.toString().orEmpty()
        val dropoff = dropoffAddress.text?.toString().orEmpty()
        viewModel.swapRoute()
        pickupAddress.setText(dropoff, false)
        dropoffAddress.setText(pickup, false)
        updateBookingSteps(viewModel.state.value)
    }

    private fun resetBookingRoute() = with(binding) {
        viewModel.resetRoute()
        pickupAddress.setText("", false)
        dropoffAddress.setText("", false)
        updateBookingSteps(viewModel.state.value)
    }

    @SuppressLint("MissingPermission")
    private fun requestCurrentPickup() {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) {
            locationPermissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
            return
        }
        val manager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val provider = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
            .firstOrNull { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }
        if (provider == null) {
            binding.status.text = getString(R.string.location_unavailable)
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            runCatching {
                manager.getCurrentLocation(provider, null, mainExecutor) { applyCurrentPickup(it) }
            }.onFailure { binding.status.text = getString(R.string.location_unavailable) }
        } else {
            applyCurrentPickup(runCatching { manager.getLastKnownLocation(provider) }.getOrNull())
        }
    }

    private fun applyCurrentPickup(location: Location?) {
        if (location == null) {
            binding.status.text = getString(R.string.location_unavailable)
            return
        }
        val place = CustomerPlace(getString(R.string.my_location), location.longitude, location.latitude)
        viewModel.selectPlace(place, true)
        binding.pickupAddress.setText(place.label, false)
        binding.status.text = ""
        updateBookingSteps(viewModel.state.value)
    }

    private fun showBookingReview() = with(binding) {
        val state = viewModel.state.value
        val route = state.route ?: return@with
        val quote = state.quote ?: return@with
        val capacityCheck = runCatching { CustomerBookingPolicy.requireWithinCapacity(quote.cargoTons, selectedVehicle.backendValue) }
        if (capacityCheck.isFailure) {
            status.text = getString(R.string.capacity_exceeded, formatTons(quote.cargoTons), formatTons(selectedVehicle.capacity.toDouble()))
            return@with
        }
        val quantity = cargoQuantity.text?.toString()?.toDoubleOrNull() ?: 0.0
        val summary = buildString {
            append(route.pickup.label).append("\n→ ").append(route.dropoff.label).append("\n\n")
            append(getString(R.string.vehicle)).append(": ").append(getString(selectedVehicle.labelRes)).append("\n")
            append(getString(R.string.distance)).append(": ").append(formatDistance(route.distanceKm)).append("\n")
            append(getString(R.string.load)).append(": ").append(formatTons(quote.cargoTons)).append(" ( ").append(quantity).append(' ').append(getString(UNITS.first { it.key == selectedUnitKey }.labelRes)).append(" )\n")
            append(getString(R.string.quote)).append(": ").append(money(quote.totalEtb)).append("\n")
            append(getString(R.string.payment_method)).append(": ").append(paymentMethod(selectedPaymentKey))
        }
        val dialog = AlertDialog.Builder(this@MainActivity)
            .setTitle(getString(R.string.booking_review))
            .setMessage(summary)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(getString(R.string.confirm_order), null)
            .create()
        dialog.setOnShowListener {
            val button = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            button.setOnClickListener {
                if (viewModel.state.value.busy) return@setOnClickListener
                button.isEnabled = false
                createCurrentOrder()
                dialog.dismiss()
            }
        }
        dialog.show()
    }

    private fun renderPlaceSuggestions(state: CustomerUiState) {
        val pickup = state.pickupSuggestions.map { it.label }
        if (pickup != pickupLabels) {
            pickupLabels = pickup
            binding.pickupAddress.setAdapter(ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, pickup))
            if (pickup.isNotEmpty() && binding.pickupAddress.hasFocus()) binding.pickupAddress.showDropDown()
        }
        val dropoff = state.dropoffSuggestions.map { it.label }
        if (dropoff != dropoffLabels) {
            dropoffLabels = dropoff
            binding.dropoffAddress.setAdapter(ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, dropoff))
            if (dropoff.isNotEmpty() && binding.dropoffAddress.hasFocus()) binding.dropoffAddress.showDropDown()
        }
    }

    private fun statePlace(position: Int, pickup: Boolean): CustomerPlace? {
        val state = viewModel.state.value
        return (if (pickup) state.pickupSuggestions else state.dropoffSuggestions).getOrNull(position)
    }

    private fun updateBookingSteps(state: CustomerUiState) {
        val active = when {
            state.route == null -> 1
            selectedVehicle.backendValue.isBlank() -> 2
            selectedCategoryKey.isBlank() || selectedPackagingKey.isBlank() -> 3
            currentCargoTons() <= 0 -> 4
            state.quote == null -> 5
            else -> 6
        }
        listOf(binding.stepRoute, binding.stepTruck, binding.stepCargo, binding.stepLoad, binding.stepQuote, binding.stepConfirm).forEachIndexed { index, view ->
            val step = index + 1
            view.setBackgroundResource(if (step == active) R.drawable.bg_step_active else R.drawable.bg_step_idle)
            view.setTextColor(getColor(if (step == active) android.R.color.white else R.color.hallo_navy))
            view.alpha = if (step <= active) 1f else 0.68f
        }
    }

    private fun updateLoadSummary() {
        val quantity = binding.cargoQuantity.text?.toString()?.toDoubleOrNull() ?: 0.0
        val tons = CustomerBookingPolicy.cargoToTons(quantity, selectedUnitKey)
        binding.loadSummary.text = getString(R.string.load_equivalent, if (tons > 0) formatTons(tons) else "—")
    }

    private fun renderHomeDashboard(state: CustomerUiState, unread: Int) {
        binding.pageHome.findViewWithTag<View>(HOME_DASHBOARD_TAG)?.let(binding.pageHome::removeView)
        val activeCount = state.orders.count { CustomerPolicy.showAssignment(it.status) }
        val due = state.orders.filterNot { it.status == "cancelled" }.sumOf { order ->
            CustomerPaymentPolicy.summarize(order, paymentsFor(order, state)).remainingToSubmit
        }
        val card = card().apply { tag = HOME_DASHBOARD_TAG }
        val content = vertical(12.dp)
        content.addView(metricRow(getString(R.string.metric_orders) to state.orders.size.toString(), getString(R.string.metric_active) to activeCount.toString()))
        content.addView(metricRow(getString(R.string.metric_to_pay) to money(due), getString(R.string.notifications) to unread.toString()))
        card.addView(content)
        binding.pageHome.addView(card, 2, marginParams())
    }

    private fun highlightNavigation(page: CustomerPage) {
        val active = getColor(R.color.hallo_gold)
        val idle = Color.TRANSPARENT
        binding.navHome.setBackgroundColor(if (page == CustomerPage.HOME || page == CustomerPage.BOOK) active else idle)
        binding.navBook.setBackgroundColor(if (page == CustomerPage.PAYMENTS) active else idle)
        binding.navOrders.setBackgroundColor(if (page == CustomerPage.ORDERS) active else idle)
        binding.navTrack.setBackgroundColor(if (page == CustomerPage.TRACKING) active else idle)
        binding.navProfile.setBackgroundColor(if (page == CustomerPage.PROFILE) active else idle)
    }

    private fun renderOrders(state: CustomerUiState) {
        binding.ordersList.removeAllViews()
        binding.ordersList.addView(orderOverview(state), marginParams())
        val filtered = state.orders.filter { order ->
            val payments = paymentsFor(order, state)
            when (orderFilter) {
                CustomerOrderFilter.ALL -> true
                CustomerOrderFilter.ACTIVE -> CustomerPolicy.showAssignment(order.status)
                CustomerOrderFilter.PAYMENT -> CustomerPaymentPolicy.needsPayment(order, payments)
                CustomerOrderFilter.DELIVERED -> order.status == "delivered"
                CustomerOrderFilter.CANCELLED -> order.status == "cancelled"
            }
        }
        if (filtered.isEmpty()) {
            binding.ordersList.addView(text(if (state.orders.isEmpty()) getString(R.string.no_orders) else getString(R.string.no_matching_orders)))
            return
        }
        filtered.forEach { order ->
            val payments = paymentsFor(order, state)
            val summary = CustomerPaymentPolicy.summarize(order, payments)
            val assignment = state.assignments.firstOrNull { it.orderId == order.id }
            val media = state.assignmentMedia[order.id]
            val item = ItemCustomerOrderBinding.inflate(layoutInflater, binding.ordersList, false)
            item.orderTrackingId.text = order.trackingId ?: getString(R.string.order_label)
            item.orderStatus.text = label(order.status)
            item.orderRoute.text = "${order.pickupAddress.orEmpty()}\n→ ${order.dropoffAddress.orEmpty()}"
            val paymentLabel = if (summary.pendingVerification > 0) getString(R.string.pending_verification) else label(order.paymentStatus)
            item.orderMeta.text = buildString {
                append("${getString(R.string.quote)}: ${money(order.priceEtb)} · ${getString(R.string.distance)}: ${formatDistance(order.distanceKm)}\n")
                append("${getString(R.string.load)}: ${CustomerPaymentPolicy.formatLoad(order)}\n")
                append("${getString(R.string.payment)}: $paymentLabel · ${getString(R.string.vehicle)}: ${order.vehicleType ?: getString(R.string.pending)}\n")
                append(getString(R.string.payment_method)).append(": ").append(paymentMethod(order.paymentMethod))
            }
            if (CustomerPolicy.showAssignment(order.status)) {
                item.orderActions.addView(assignmentCard(order, assignment, media), marginParams())
            }
            if (CustomerPolicy.canTrack(order.status)) {
                item.orderActions.addView(actionButton(getString(R.string.track_driver)) { viewModel.track(order) })
            }
            item.orderActions.addView(actionButton(getString(R.string.invoice_receipt_pdf)) { openInvoice(order, payments) })
            item.orderActions.addView(actionButton(getString(if (expandedOrders.contains(order.id)) R.string.hide_details else R.string.view_details)) {
                if (!expandedOrders.add(order.id)) expandedOrders.remove(order.id)
                renderOrders(viewModel.state.value)
            })
            item.orderActions.addView(actionButton(getString(R.string.view_payment_status)) { viewModel.show(CustomerPage.PAYMENTS) })
            if (CustomerPolicy.canCancel(order.status)) {
                item.orderActions.addView(actionButton(getString(R.string.cancel_order)) { cancellationDialog(order) })
            }
            if (expandedOrders.contains(order.id)) {
                item.orderActions.addView(orderDetails(order, payments, summary), marginParams())
            }
            binding.ordersList.addView(item.root)
        }
    }

    private fun orderOverview(state: CustomerUiState): View {
        val card = card()
        val content = vertical(15.dp)
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        header.addView(textView(getString(R.string.logistics_overview), 20f, true), weightParams())
        header.addView(actionButton(getString(R.string.new_order)) { viewModel.show(CustomerPage.BOOK) })
        content.addView(header)
        val activeCount = state.orders.count { CustomerPolicy.showAssignment(it.status) }
        val deliveredCount = state.orders.count { it.status == "delivered" }
        val due = state.orders.filterNot { it.status == "cancelled" }.sumOf { order -> CustomerPaymentPolicy.summarize(order, paymentsFor(order, state)).remainingToSubmit }
        content.addView(metricRow(getString(R.string.metric_orders) to state.orders.size.toString(), getString(R.string.metric_active) to activeCount.toString()))
        content.addView(metricRow(getString(R.string.metric_to_pay) to money(due), getString(R.string.metric_delivered) to deliveredCount.toString()))
        content.addView(filterRow())
        val refresh = actionButton(getString(R.string.refresh)) { viewModel.refresh() }
        content.addView(refresh)
        card.addView(content)
        return card
    }

    private fun metricRow(first: Pair<String, String>, second: Pair<String, String>): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(0, 8.dp, 0, 0)
        addView(metric(first.first, first.second), weightParams(end = 4.dp))
        addView(metric(second.first, second.second), weightParams(start = 4.dp))
    }

    private fun metric(label: String, value: String): View = vertical(10.dp).apply {
        background = roundedBackground(getColor(R.color.hallo_navy_soft), 15.dp)
        minimumHeight = 70.dp
        addView(textView(label.uppercase(), 10f, true, getColor(R.color.hallo_muted)))
        addView(textView(value, 15f, true))
    }

    private fun filterRow(): View {
        val horizontal = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, 9.dp, 0, 3.dp) }
        val filters = listOf(
            CustomerOrderFilter.ALL to R.string.filter_all,
            CustomerOrderFilter.ACTIVE to R.string.filter_active,
            CustomerOrderFilter.PAYMENT to R.string.filter_payment,
            CustomerOrderFilter.DELIVERED to R.string.filter_delivered,
            CustomerOrderFilter.CANCELLED to R.string.filter_cancelled,
        )
        filters.forEach { (filter, label) ->
            horizontal.addView(MaterialButton(this).apply {
                text = getString(label)
                isAllCaps = false
                minWidth = 0
                minimumWidth = 0
                minHeight = 42.dp
                cornerRadius = 21.dp
                insetTop = 0
                insetBottom = 0
                setPadding(12.dp, 0, 12.dp, 0)
                backgroundTintList = ColorStateList.valueOf(getColor(if (orderFilter == filter) R.color.hallo_navy else R.color.hallo_navy_soft))
                setTextColor(getColor(if (orderFilter == filter) android.R.color.white else R.color.hallo_navy))
                setOnClickListener {
                    orderFilter = filter
                    renderOrders(viewModel.state.value)
                }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, 44.dp).apply { marginEnd = 6.dp })
        }
        return HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            addView(horizontal)
        }
    }

    private fun orderDetails(order: CustomerOrder, payments: List<CustomerPayment>, summary: CustomerPaymentSummary): View {
        val card = card()
        val content = vertical(13.dp)
        content.addView(textView("${getString(R.string.verified_paid)}: ${money(summary.verifiedPaid)}", 13f, true))
        content.addView(textView("${getString(R.string.pending_amount)}: ${money(summary.pendingVerification)}", 13f))
        content.addView(textView("${getString(R.string.to_pay)}: ${money(summary.balanceToPay)}", 13f, true))
        content.addView(textView(getString(R.string.payment_history), 11f, true, getColor(R.color.hallo_muted)))
        if (payments.isEmpty()) {
            content.addView(textView(getString(R.string.no_payment_history), 12f, false, getColor(R.color.hallo_muted)))
        } else {
            payments.forEach { payment ->
                content.addView(textView("${label(payment.provider)} · ${money(payment.amountEtb)} · ${label(payment.event)}", 12f))
                if (!payment.receiptPath.isNullOrBlank()) {
                    content.addView(actionButton(getString(R.string.view_receipt)) { viewModel.openReceipt(payment) })
                }
            }
        }
        if (order.status == "cancelled" && !order.cancellationReason.isNullOrBlank()) {
            content.addView(textView("${getString(R.string.cancel_reason)}: ${order.cancellationReason}", 12f))
        }
        card.addView(content)
        return card
    }

    private fun assignmentCard(order: CustomerOrder, assignment: CustomerAssignment?, media: CustomerAssignmentMedia?): View {
        val card = card()
        card.radius = 18.dp.toFloat()
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(13.dp, 10.dp, 13.dp, 10.dp)
            setBackgroundColor(getColor(R.color.hallo_navy))
        }
        header.addView(textView(getString(R.string.assigned_driver_truck), 10f, true, Color.WHITE), weightParams())
        val verified = assignment?.driverVerified == true
        header.addView(textView(if (verified) getString(R.string.verified_driver) else getString(R.string.verification_pending), 10f, true, if (verified) getColor(R.color.hallo_success) else getColor(R.color.hallo_gold)))
        content.addView(header)
        if (assignment == null) {
            val missing = vertical(13.dp)
            missing.addView(textView(getString(R.string.assignment_missing), 13f, false, getColor(R.color.hallo_muted)))
            missing.addView(actionButton(getString(R.string.retry)) { viewModel.refresh() })
            content.addView(missing)
            card.addView(content)
            return card
        }

        val truckRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(12.dp, 12.dp, 12.dp, 8.dp) }
        truckRow.addView(photoBox(CustomerDisplayPolicy.truckPhotoUrl(media), getString(R.string.truck), false), LinearLayout.LayoutParams(96.dp, 68.dp))
        truckRow.addView(vertical(0).apply {
            addView(textView(getString(R.string.truck_plate).uppercase(), 9f, true, getColor(R.color.hallo_muted)))
            addView(textView(assignment.plateNumber ?: getString(R.string.pending), 17f, true))
            val capacity = assignment.capacityTons?.let { " · ${formatTons(it)}" }.orEmpty()
            addView(textView("${assignment.vehicleType ?: order.vehicleType ?: getString(R.string.truck)}$capacity", 12f, false, getColor(R.color.hallo_muted)))
        }, weightParams(start = 11.dp))
        content.addView(truckRow)

        val driverRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(12.dp, 8.dp, 12.dp, 12.dp) }
        val driverUrl = CustomerDisplayPolicy.verifiedDriverPhotoUrl(assignment, media)
        driverRow.addView(photoBox(driverUrl, CustomerDisplayPolicy.initial(assignment.driverName, "D"), true), LinearLayout.LayoutParams(58.dp, 58.dp))
        driverRow.addView(vertical(0).apply {
            addView(textView(getString(R.string.driver).uppercase(), 9f, true, getColor(R.color.hallo_muted)))
            addView(textView(assignment.driverName ?: getString(R.string.assigned_driver), 15f, true))
            addView(textView(assignment.driverPhone ?: "—", 12f, false, getColor(R.color.hallo_success)))
        }, weightParams(start = 11.dp))
        driverRow.addView(actionButton(getString(R.string.call)) {
            assignment.driverPhone?.let { openContact(Intent.ACTION_DIAL, it) }
        }.apply { isEnabled = !assignment.driverPhone.isNullOrBlank() })
        content.addView(driverRow)
        content.addView(textView(getString(R.string.assignment_privacy), 9f, false, getColor(R.color.hallo_muted)).apply { setPadding(12.dp, 5.dp, 12.dp, 10.dp) })
        card.addView(content)
        return card
    }

    private fun photoBox(url: String?, fallback: String, circular: Boolean): View {
        val frame = FrameLayout(this)
        val background = roundedBackground(getColor(R.color.hallo_navy_soft), if (circular) 100.dp else 14.dp)
        frame.background = background
        frame.clipToOutline = circular
        val fallbackView = TextView(this).apply {
            text = fallback
            gravity = Gravity.CENTER
            textSize = if (circular) 18f else 10f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(getColor(R.color.hallo_navy))
            setPadding(5.dp, 5.dp, 5.dp, 5.dp)
        }
        val image = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            visibility = View.GONE
            contentDescription = fallback
            clipToOutline = circular
            this.background = background
        }
        frame.addView(fallbackView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        frame.addView(image, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        if (url != null) {
            image.tag = url
            lifecycleScope.launch {
                val bitmap = CustomerSecureImageLoader.load(url)
                if (image.tag == url && bitmap != null) {
                    image.setImageBitmap(bitmap)
                    image.visibility = View.VISIBLE
                    fallbackView.visibility = View.GONE
                }
            }
        }
        return frame
    }

    private fun renderTracking(state: CustomerUiState) = with(binding) {
        val order = state.trackingOrder ?: state.orders.firstOrNull { CustomerPolicy.showAssignment(it.status) }
        val assignment = order?.let { selected -> state.assignments.firstOrNull { it.orderId == selected.id } }
        val media = order?.let { state.assignmentMedia[it.id] }
        trackingTitle.text = order?.let { "${getString(R.string.live_tracking)}\n${it.trackingId ?: getString(R.string.order_label)} · ${it.pickupAddress.orEmpty()} → ${it.dropoffAddress.orEmpty()}" }
            ?: getString(R.string.live_tracking)
        ensureTrackingBackButton()
        renderTrackingTimeline(order?.status)
        renderTrackingAssignment(order, assignment, media)
        trackingMap.showTrip(state.liveTrip, state.trackingRoute?.coordinates.orEmpty())
        val hasTruck = state.liveTrip?.truckLatitude != null && state.liveTrip.truckLongitude != null
        val fresh = CustomerPolicy.trackingFreshness(state.liveTrip?.recordedAt, hasTruck)
        trackingFreshness.text = trackingFreshnessLabel(fresh, hasTruck)
        trackingFreshness.setTextColor(getColor(when (fresh) { "LIVE" -> R.color.hallo_success; "STALE" -> R.color.hallo_warning; else -> R.color.hallo_danger }))

        val statRow = tripStatus.parent as? LinearLayout
        statRow?.weightSum = 4f
        val remainingView = ensureRemainingStat(statRow)
        tripStatus.text = "${getString(R.string.trip_status)}\n${label(order?.status ?: state.liveTrip?.status)}"
        tripVehicle.text = "${getString(R.string.truck_gps)}\n${gpsValue(state.liveTrip, fresh, hasTruck)}"
        tripEta.text = "${getString(R.string.eta)}\n${etaValue(state, fresh, hasTruck)}"
        remainingView?.text = "${getString(R.string.remaining)}\n${remainingValue(state, fresh, hasTruck)}"

        trackingResult.text = when {
            state.liveTrip == null || !hasTruck -> getString(R.string.waiting_gps)
            fresh == "STALE" -> getString(R.string.gps_stale)
            fresh == "OFFLINE" -> getString(R.string.gps_offline)
            state.trackingRoute == null -> getString(R.string.route_unavailable)
            else -> "${getString(R.string.speed)}: ${state.liveTrip.speedKmh?.toInt()?.let(::formatSpeed) ?: "—"} · ${getString(R.string.heading)}: ${state.liveTrip.heading?.toInt()?.let { "$it°" } ?: "—"}\n${getString(R.string.last_gps_update)}: ${state.liveTrip.recordedAt ?: "—"}"
        }
        driverDetails.text = assignment?.let { "${it.driverName ?: getString(R.string.assigned_driver)}\n${it.plateNumber ?: "—"}" }
            ?: getString(R.string.driver_assignment_waiting)
        val phone = assignment?.driverPhone?.trim().orEmpty()
        callDriver.isEnabled = phone.isNotBlank()
        messageDriver.isEnabled = phone.isNotBlank()
        callDriver.setOnClickListener { openContact(Intent.ACTION_DIAL, phone) }
        messageDriver.setOnClickListener { openContact(Intent.ACTION_SENDTO, phone) }
        loadLegacyDriverPhoto(CustomerDisplayPolicy.verifiedDriverPhotoUrl(assignment, media), assignment?.driverName)
    }

    private fun ensureTrackingBackButton() {
        if (binding.pageTracking.findViewWithTag<View>(TRACKING_BACK_TAG) != null) return
        val back = actionButton(getString(R.string.back_orders)) { viewModel.show(CustomerPage.ORDERS) }.apply { tag = TRACKING_BACK_TAG }
        binding.pageTracking.addView(back, 1)
    }

    private fun renderTrackingTimeline(status: String?) {
        binding.pageTracking.findViewWithTag<View>(TRACKING_TIMELINE_TAG)?.let(binding.pageTracking::removeView)
        val row = LinearLayout(this).apply {
            tag = TRACKING_TIMELINE_TAG
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 8.dp, 0, 8.dp)
        }
        val active = timelinePosition(status)
        val labels = listOf(R.string.progress_assigned, R.string.progress_pickup, R.string.progress_on_route, R.string.progress_delivered)
        labels.forEachIndexed { index, label ->
            row.addView(TextView(this).apply {
                text = "${if (index < active) "✓" else index + 1}\n${getString(label)}"
                gravity = Gravity.CENTER
                textSize = 10f
                setTypeface(typeface, if (index == active) Typeface.BOLD else Typeface.NORMAL)
                setTextColor(getColor(if (index <= active) R.color.hallo_navy else R.color.hallo_muted))
                background = roundedBackground(getColor(if (index == active) R.color.hallo_gold_soft else R.color.hallo_navy_soft), 12.dp)
                setPadding(4.dp, 7.dp, 4.dp, 7.dp)
            }, weightParams(start = if (index == 0) 0 else 3.dp, end = if (index == labels.lastIndex) 0 else 3.dp))
        }
        val mapCard = binding.trackingMap.parent as? View
        val index = mapCard?.let(binding.pageTracking::indexOfChild)?.takeIf { it >= 0 } ?: 3
        binding.pageTracking.addView(row, index)
    }

    private fun renderTrackingAssignment(order: CustomerOrder?, assignment: CustomerAssignment?, media: CustomerAssignmentMedia?) {
        binding.pageTracking.findViewWithTag<View>(TRACKING_ASSIGNMENT_TAG)?.let(binding.pageTracking::removeView)
        if (order == null || !CustomerPolicy.showAssignment(order.status)) return
        val card = assignmentCard(order, assignment, media).apply { tag = TRACKING_ASSIGNMENT_TAG }
        val mapCard = binding.trackingMap.parent as? View
        val mapIndex = mapCard?.let(binding.pageTracking::indexOfChild)?.takeIf { it >= 0 } ?: return
        binding.pageTracking.addView(card, mapIndex + 1, marginParams())
    }

    private fun ensureRemainingStat(row: LinearLayout?): TextView? {
        if (row == null) return null
        row.findViewWithTag<TextView>(TRACKING_REMAINING_TAG)?.let { return it }
        return TextView(this).apply {
            tag = TRACKING_REMAINING_TAG
            gravity = Gravity.CENTER
            minHeight = 58.dp
            textSize = 11f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(getColor(R.color.hallo_navy))
            setPadding(4.dp, 6.dp, 4.dp, 6.dp)
            setBackgroundResource(R.drawable.bg_step_idle)
            row.addView(this, weightParams(start = 4.dp))
        }
    }

    private fun timelinePosition(status: String?): Int = when (status) {
        "delivered" -> 3
        "in_transit" -> 2
        "accepted", "assigned" -> 1
        else -> 0
    }

    private fun gpsValue(trip: CustomerLiveTrip?, freshness: String, hasTruck: Boolean): String = when {
        !hasTruck -> getString(R.string.gps_offline)
        freshness == "LIVE" && trip?.speedKmh != null -> "${getString(R.string.gps_live)} · ${formatSpeed(trip.speedKmh.toInt())}"
        freshness == "LIVE" -> getString(R.string.gps_live)
        freshness == "STALE" -> getString(R.string.gps_stale)
        else -> getString(R.string.gps_offline)
    }

    private fun etaValue(state: CustomerUiState, freshness: String, hasTruck: Boolean): String = when {
        !hasTruck -> getString(R.string.waiting_gps)
        freshness != "LIVE" -> getString(R.string.last_known_only)
        state.remainingRoute != null -> formatDuration(state.remainingRoute.durationSeconds)
        else -> "—"
    }

    private fun remainingValue(state: CustomerUiState, freshness: String, hasTruck: Boolean): String = when {
        !hasTruck -> getString(R.string.waiting_gps)
        freshness != "LIVE" -> getString(R.string.last_known_only)
        state.remainingRoute != null -> formatDistance(state.remainingRoute.distanceKm)
        else -> "—"
    }

    private fun trackingFreshnessLabel(freshness: String, hasTruck: Boolean): String = when {
        !hasTruck -> getString(R.string.gps_offline)
        freshness == "LIVE" -> getString(R.string.gps_live)
        freshness == "STALE" -> getString(R.string.gps_stale)
        else -> getString(R.string.gps_offline)
    }

    private fun loadLegacyDriverPhoto(url: String?, driverName: String?) {
        if (url == null) {
            binding.driverPhoto.setImageResource(R.drawable.hallo_logistics_logo)
            binding.driverPhoto.contentDescription = CustomerDisplayPolicy.initial(driverName, "D")
            binding.driverPhoto.visibility = View.VISIBLE
            return
        }
        binding.driverPhoto.tag = url
        lifecycleScope.launch {
            val bitmap = CustomerSecureImageLoader.load(url)
            if (binding.driverPhoto.tag == url) {
                if (bitmap != null) binding.driverPhoto.setImageBitmap(bitmap) else binding.driverPhoto.setImageResource(R.drawable.hallo_logistics_logo)
                binding.driverPhoto.visibility = View.VISIBLE
            }
        }
    }

    private fun renderPayments(state: CustomerUiState) {
        binding.paymentsList.removeAllViews()
        if (state.orders.isEmpty()) {
            binding.paymentsList.addView(text(getString(R.string.no_payments)))
            return
        }

        val summaries = state.orders.associateWith { order -> CustomerPaymentPolicy.summarize(order, paymentsFor(order, state)) }
        val overview = card()
        val overviewContent = vertical(14.dp)
        overviewContent.addView(metricRow(
            getString(R.string.invoice_total) to money(summaries.values.sumOf { it.invoiceTotal }),
            getString(R.string.verified_paid) to money(summaries.values.sumOf { it.verifiedPaid }),
        ))
        overviewContent.addView(metricRow(
            getString(R.string.pending_amount) to money(summaries.values.sumOf { it.pendingVerification }),
            getString(R.string.balance_to_pay) to money(summaries.values.sumOf { it.balanceToPay }),
        ))
        overview.addView(overviewContent)
        binding.paymentsList.addView(overview, marginParams())

        val groups = linkedMapOf(
            PAYMENT_ESCROW to mutableListOf<CustomerOrder>(),
            PAYMENT_PENDING to mutableListOf<CustomerOrder>(),
            PAYMENT_UNPAID to mutableListOf<CustomerOrder>(),
            PAYMENT_VERIFIED to mutableListOf<CustomerOrder>(),
        )
        state.orders.forEach { order ->
            val payments = paymentsFor(order, state)
            val summary = summaries.getValue(order)
            val bucket = when {
                order.paymentStatus == "held_escrow" || payments.any { it.event == "held_escrow" } -> PAYMENT_ESCROW
                summary.pendingVerification > 0.0 -> PAYMENT_PENDING
                summary.balanceToPay > 0.0 -> PAYMENT_UNPAID
                else -> PAYMENT_VERIFIED
            }
            groups.getValue(bucket).add(order)
        }

        groups.forEach { (bucket, orders) ->
            if (orders.isEmpty()) return@forEach
            binding.paymentsList.addView(textView(getString(paymentGroupLabel(bucket)), 12f, true, getColor(R.color.hallo_muted)).apply {
                setPadding(4.dp, 10.dp, 4.dp, 6.dp)
            })
            orders.forEach { order ->
                val payments = paymentsFor(order, state)
                val summary = summaries.getValue(order)
                val card = card()
                val content = vertical(14.dp)
                content.addView(textView(order.trackingId ?: getString(R.string.order_label), 16f, true))
                content.addView(textView("${getString(R.string.invoice_total)}: ${money(summary.invoiceTotal)}", 13f))
                content.addView(textView("${getString(R.string.verified_paid)}: ${money(summary.verifiedPaid)}", 13f))
                content.addView(textView("${getString(R.string.pending_amount)}: ${money(summary.pendingVerification)}", 13f))
                content.addView(textView("${getString(R.string.balance_to_pay)}: ${money(summary.balanceToPay)}", 13f, true))
                content.addView(textView("${getString(R.string.payment_method)}: ${paymentMethod(order.paymentMethod)}", 12f, false, getColor(R.color.hallo_muted)))
                payments.forEach { payment ->
                    content.addView(textView("${label(payment.event)} · ${money(payment.amountEtb)} · ${payment.provider ?: "—"}", 12f))
                    if (!payment.providerRef.isNullOrBlank()) content.addView(textView(getString(R.string.provider_reference, payment.providerRef), 11f, false, getColor(R.color.hallo_muted)))
                    if (!payment.receiptPath.isNullOrBlank()) content.addView(actionButton(getString(R.string.view_receipt)) { viewModel.openReceipt(payment) })
                }
                content.addView(actionButton(getString(R.string.invoice_receipt_pdf)) { openInvoice(order, payments) })
                card.addView(content)
                binding.paymentsList.addView(card, marginParams())
            }
        }
    }

    @StringRes
    private fun paymentGroupLabel(bucket: Int): Int = when (bucket) {
        PAYMENT_ESCROW -> R.string.payment_group_escrow
        PAYMENT_PENDING -> R.string.payment_group_pending
        PAYMENT_UNPAID -> R.string.payment_group_unpaid
        else -> R.string.payment_group_verified
    }

    private fun renderNotifications(items: List<CustomerNotification>) {
        binding.notificationsList.removeAllViews()
        if (items.isEmpty()) {
            binding.notificationsList.addView(text(getString(R.string.notifications_empty)))
            return
        }
        items.forEach { notification ->
            binding.notificationsList.addView(
                actionButton("${if (notification.readAt == null) "● " else ""}${notification.title}\n${notification.body}") {
                    viewModel.markNotificationRead(notification)
                },
                marginParams(),
            )
        }
    }

    private fun renderProfile(profile: CustomerProfile?) {
        binding.pageProfile.findViewWithTag<View>(PROFILE_AVATAR_TAG)?.let(binding.pageProfile::removeView)
        binding.pageProfile.findViewWithTag<View>(PROFILE_EDIT_TAG)?.let(binding.pageProfile::removeView)
        val initial = CustomerDisplayPolicy.initial(profile?.fullName, "C")
        val avatar = TextView(this).apply {
            tag = PROFILE_AVATAR_TAG
            text = initial
            gravity = Gravity.CENTER
            textSize = 26f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(getColor(R.color.hallo_navy))
            background = roundedBackground(getColor(R.color.hallo_gold_soft), 100.dp)
        }
        binding.pageProfile.addView(avatar, 1, LinearLayout.LayoutParams(76.dp, 76.dp).apply { topMargin = 12.dp; bottomMargin = 6.dp })
        binding.profileDetails.text = profile?.let {
            buildString {
                append("${getString(R.string.full_name)}: ${it.fullName ?: "—"}\n")
                append("${getString(R.string.phone)}: ${it.phone ?: "—"}\n")
                append("${getString(R.string.email)}: ${it.email ?: "—"}\n")
                append("${getString(R.string.home_address)}: ${it.homeAddress ?: "—"}\n")
                append("${getString(R.string.account_type)}: ${label(it.customerType)}\n")
                if (it.customerType == "business") append("${getString(R.string.company)}: ${it.companyName ?: "—"}\n")
                append("${getString(R.string.customer_status)}: ${getString(R.string.verified_customer)}\n")
                append("${getString(R.string.language)}: ${language.tag.uppercase()}\n")
                append("${getString(R.string.joined)}: ${it.createdAt ?: "—"}\n\n")
                append(getString(R.string.profile_avatar_initials))
            }
        }.orEmpty()
        val edit = actionButton(getString(R.string.edit_profile)) {
            profile?.let(::profileEditDialog)
        }.apply { tag = PROFILE_EDIT_TAG; isEnabled = profile != null }
        val signOutIndex = binding.pageProfile.indexOfChild(binding.signOut).takeIf { it >= 0 } ?: binding.pageProfile.childCount
        binding.pageProfile.addView(edit, signOutIndex, marginParams())
    }

    private fun profileEditDialog(profile: CustomerProfile) {
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(20.dp, 8.dp, 20.dp, 8.dp) }
        val error = textView("", 12f, true, getColor(R.color.hallo_danger)).apply { visibility = View.GONE }
        val name = dialogInput(getString(R.string.full_name), profile.fullName)
        val phone = dialogInput(getString(R.string.phone), profile.phone, InputType.TYPE_CLASS_PHONE)
        val email = dialogInput(getString(R.string.email), profile.email, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        val home = dialogInput(getString(R.string.home_address), profile.homeAddress)
        val typeLabel = textView(getString(R.string.account_type), 12f, true, getColor(R.color.hallo_muted))
        val type = Spinner(this).apply {
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, listOf(getString(R.string.individual), getString(R.string.business)))
            setSelection(if (profile.customerType == "business") 1 else 0)
            minimumHeight = 52.dp
        }
        val company = dialogInput(getString(R.string.company_name), profile.companyName)
        listOf(error, name, phone, email, home, typeLabel, type, company).forEach { content.addView(it, marginParams(6.dp)) }
        val scroll = ScrollView(this).apply { addView(content) }
        val dialog = AlertDialog.Builder(this)
            .setTitle(getString(R.string.edit_profile))
            .setView(scroll)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(getString(R.string.save_profile), null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val input = CustomerProfileUpdateInput(
                    fullName = name.text.toString(),
                    phone = phone.text.toString(),
                    email = email.text.toString(),
                    homeAddress = home.text.toString(),
                    customerType = if (type.selectedItemPosition == 1) "business" else "individual",
                    companyName = company.text.toString(),
                )
                val validated = runCatching { CustomerProfilePolicy.validate(input) }
                val failure = validated.exceptionOrNull()
                if (failure != null) {
                    error.text = failure.message ?: getString(R.string.request_failed, "validation")
                    error.visibility = View.VISIBLE
                    return@setOnClickListener
                }
                viewModel.updateProfile(validated.getOrThrow())
                dialog.dismiss()
            }
        }
        dialog.show()
    }

    private fun dialogInput(hint: String, value: String?, inputType: Int = InputType.TYPE_CLASS_TEXT): EditText = EditText(this).apply {
        this.hint = hint
        setText(value.orEmpty())
        this.inputType = inputType
        minHeight = 52.dp
        setPadding(10.dp, 8.dp, 10.dp, 8.dp)
    }

    private fun cancellationDialog(order: CustomerOrder) {
        if (!CustomerPolicy.canCancel(order.status)) {
            AlertDialog.Builder(this).setMessage(getString(R.string.cancel_locked)).setPositiveButton(android.R.string.ok, null).show()
            return
        }
        val content = vertical(16.dp)
        val help = textView(getString(R.string.cancel_reason_help), 12f, false, getColor(R.color.hallo_muted))
        val error = textView("", 12f, true, getColor(R.color.hallo_danger)).apply { visibility = View.GONE }
        val input = EditText(this).apply {
            hint = getString(R.string.cancel_reason)
            minLines = 3
            maxLines = 6
            filters = arrayOf(InputFilter.LengthFilter(500))
        }
        content.addView(help)
        content.addView(input)
        content.addView(error)
        val dialog = AlertDialog.Builder(this)
            .setTitle("${getString(R.string.cancel_order)} · ${order.trackingId ?: getString(R.string.order_label)}")
            .setView(content)
            .setNegativeButton(getString(R.string.keep_order), null)
            .setPositiveButton(getString(R.string.confirm_cancel), null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val reason = input.text.toString().trim()
                if (reason.length !in 5..500) {
                    error.text = getString(R.string.cancel_reason)
                    error.visibility = View.VISIBLE
                    return@setOnClickListener
                }
                viewModel.cancelOrder(order, reason)
                dialog.dismiss()
            }
        }
        dialog.show()
    }

    private fun openInvoice(order: CustomerOrder, payments: List<CustomerPayment>) {
        lifecycleScope.launch {
            val result = runCatching {
                val file = withContext(Dispatchers.IO) { CustomerInvoiceWriter.create(this@MainActivity, order, payments) }
                val uri = CustomerInvoiceWriter.uri(this@MainActivity, file)
                Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/pdf")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            }
            result.onSuccess { intent ->
                runCatching { startActivity(intent) }.onFailure { binding.status.text = getString(R.string.pdf_open_error) }
            }.onFailure { binding.status.text = getString(R.string.pdf_open_error) }
        }
    }

    private fun openSecureUrl(url: String) {
        val uri = runCatching { Uri.parse(url) }.getOrNull()
        if (uri?.scheme != "https") {
            binding.status.text = getString(R.string.receipt_unavailable)
            return
        }
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            .onFailure { binding.status.text = getString(R.string.receipt_unavailable) }
    }

    private fun openContact(action: String, phone: String) {
        if (phone.isBlank()) return
        val scheme = if (action == Intent.ACTION_DIAL) "tel" else "smsto"
        val contactIntent = Intent(action, Uri.fromParts(scheme, phone, null))
        runCatching { startActivity(contactIntent) }.onFailure { binding.status.text = getString(R.string.no_contact_app) }
    }

    private fun createCurrentOrder() = with(binding) {
        val quote = viewModel.state.value.quote ?: return@with
        val route = viewModel.state.value.route ?: return@with
        val quantity = cargoQuantity.text?.toString()?.toDoubleOrNull() ?: 0.0
        val category = CATEGORIES.first { it.key == selectedCategoryKey }
        val packaging = PACKAGING.first { it.key == selectedPackagingKey }
        val description = CustomerBookingPolicy.cargoDescription(
            category.backendLabel,
            packaging.backendLabel,
            quantity,
            selectedUnitKey,
            additionalNotes.text?.toString().orEmpty(),
        )
        viewModel.createOrder(
            CreateOrderInput(
                route.pickup.label,
                route.pickup.longitude,
                route.pickup.latitude,
                route.dropoff.label,
                route.dropoff.longitude,
                route.dropoff.latitude,
                selectedVehicle.backendValue,
                route.distanceKm,
                quote.cargoTons,
                quantity,
                selectedUnitKey,
                selectedCategoryKey,
                selectedPackagingKey,
                description,
                selectedPaymentKey,
                quote.totalEtb,
            ),
        )
    }

    private fun paymentsFor(order: CustomerOrder, state: CustomerUiState) = state.payments.filter { it.orderId == order.id }

    private fun paymentMethod(value: String?): String = when (value) {
        "cash" -> getString(R.string.cash)
        "bank_telebirr" -> getString(R.string.bank_telebirr)
        else -> getString(R.string.pending)
    }

    private fun label(value: String?): String = when (value?.trim()?.lowercase()) {
        null, "" -> getString(R.string.pending)
        "placed" -> getString(R.string.status_placed)
        "quoted" -> getString(R.string.status_quoted)
        "assigned" -> getString(R.string.status_assigned)
        "accepted" -> getString(R.string.status_accepted)
        "in_transit" -> getString(R.string.status_in_transit)
        "delivered" -> getString(R.string.status_delivered)
        "cancelled" -> getString(R.string.status_cancelled)
        "initiated" -> getString(R.string.status_initiated)
        "held_escrow" -> getString(R.string.status_held_escrow)
        "released" -> getString(R.string.status_released)
        "refunded" -> getString(R.string.status_refunded)
        "rejected" -> getString(R.string.status_rejected)
        "verified" -> getString(R.string.status_verified)
        "unpaid" -> getString(R.string.status_unpaid)
        "paid" -> getString(R.string.status_paid)
        "individual" -> getString(R.string.individual)
        "business" -> getString(R.string.business)
        else -> value.replace('_', ' ').replaceFirstChar { it.uppercase() }
    }

    private fun formatDuration(seconds: Double): String {
        val totalMinutes = (seconds / 60.0).toInt().coerceAtLeast(0)
        val hours = totalMinutes / 60
        val minutes = totalMinutes % 60
        return if (hours > 0) getString(R.string.hours_minutes_short, hours, minutes) else getString(R.string.minutes_only_short, minutes)
    }

    private fun currentCargoTons(): Double = CustomerBookingPolicy.cargoToTons(
        binding.cargoQuantity.text?.toString()?.toDoubleOrNull() ?: 0.0,
        selectedUnitKey,
    )

    private fun formatSpeed(value: Int): String = getString(R.string.speed_kmh, value)
    private fun formatTons(value: Double): String = getString(R.string.tons_short, NumberFormat.getNumberInstance().apply { maximumFractionDigits = 2 }.format(value))
    private fun formatDistance(value: Double?): String = value?.let { getString(R.string.distance_km, NumberFormat.getNumberInstance().apply { maximumFractionDigits = 1 }.format(it)) } ?: "—"
    private fun money(value: Double?) = if (value == null) "—" else "ETB ${NumberFormat.getIntegerInstance().format(value)}"

    private fun card() = MaterialCardView(this).apply {
        radius = 20.dp.toFloat()
        cardElevation = 2.dp.toFloat()
        setCardBackgroundColor(Color.WHITE)
    }

    private fun vertical(padding: Int) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(padding, padding, padding, padding)
    }

    private fun text(value: String) = textView(value, 15f).apply { setPadding(14.dp, 12.dp, 14.dp, 12.dp) }

    private fun textView(value: String, size: Float, bold: Boolean = false, color: Int = getColor(R.color.hallo_text)) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        setLineSpacing(3.dp.toFloat(), 1f)
    }

    private fun actionButton(value: String, action: () -> Unit) = MaterialButton(this).apply {
        text = value
        isAllCaps = false
        minWidth = 0
        minimumWidth = 0
        minHeight = 48.dp
        backgroundTintList = ColorStateList.valueOf(getColor(R.color.hallo_navy_soft))
        setTextColor(getColor(R.color.hallo_navy))
        setOnClickListener { action() }
    }

    private fun roundedBackground(color: Int, radius: Int) = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(color)
        cornerRadius = radius.toFloat()
    }

    private fun weightParams(start: Int = 0, end: Int = 0) = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
        marginStart = start
        marginEnd = end
    }

    private fun marginParams(bottom: Int = 10.dp) = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
        bottomMargin = bottom
    }

    private fun visible(value: Boolean) = if (value) View.VISIBLE else View.GONE
    private val Int.dp get() = (this * resources.displayMetrics.density).toInt()

    private data class SelectOption(
        val key: String,
        val backendLabel: String,
        @StringRes val labelRes: Int,
    )

    private data class TruckOption(
        val backendValue: String,
        val capacity: Int,
        val image: Int,
        @StringRes val labelRes: Int,
    )

    private companion object {
        const val TRACKING_BACK_TAG = "customer-tracking-back"
        const val TRACKING_TIMELINE_TAG = "customer-tracking-timeline"
        const val TRACKING_ASSIGNMENT_TAG = "customer-tracking-assignment"
        const val TRACKING_REMAINING_TAG = "customer-tracking-remaining"
        const val PROFILE_AVATAR_TAG = "customer-profile-avatar"
        const val PROFILE_EDIT_TAG = "customer-profile-edit"
        const val HOME_DASHBOARD_TAG = "customer-home-dashboard"
        const val ROUTE_ACTIONS_TAG = "customer-route-actions"
        const val PAYMENT_ESCROW = 0
        const val PAYMENT_PENDING = 1
        const val PAYMENT_UNPAID = 2
        const val PAYMENT_VERIFIED = 3

        val TRUCKS = listOf(
            TruckOption("Isuzu 5 Ton", 5, R.drawable.truck_isuzu_5, R.string.truck_isuzu_5),
            TruckOption("Dry Cargo", 10, R.drawable.truck_10_ton, R.string.truck_10_ton),
            TruckOption("Truck 22 Ton", 22, R.drawable.truck_22_ton, R.string.truck_22_ton),
            TruckOption("Truck 25 Ton", 25, R.drawable.truck_25_ton, R.string.truck_25_ton),
            TruckOption("Truck 30 Ton", 30, R.drawable.truck_30_ton, R.string.truck_30_ton),
        )
        val CATEGORIES = listOf(
            SelectOption("food", "Food", R.string.category_food),
            SelectOption("grain_rice", "Grain / rice", R.string.category_grain_rice),
            SelectOption("cooking_oil", "Cooking oil", R.string.category_cooking_oil),
            SelectOption("metal_steel", "Metal / steel", R.string.category_metal_steel),
            SelectOption("construction_materials", "Construction materials", R.string.category_construction),
            SelectOption("general_goods", "General goods", R.string.category_general_goods),
            SelectOption("other", "Other", R.string.option_other),
        )
        val PACKAGING = listOf(
            SelectOption("bagged", "Bagged", R.string.packaging_bagged),
            SelectOption("drum_tank", "Drum / tank", R.string.packaging_drum_tank),
            SelectOption("pallet", "Pallet", R.string.packaging_pallet),
            SelectOption("loose_bulk", "Loose / bulk", R.string.packaging_loose_bulk),
            SelectOption("container_20ft", "20 ft container", R.string.packaging_20ft),
            SelectOption("container_40ft", "40 ft container", R.string.packaging_40ft),
            SelectOption("other", "Other", R.string.option_other),
        )
        val UNITS = listOf(
            SelectOption("ton", "Ton", R.string.unit_ton),
            SelectOption("quintal", "Quintal", R.string.unit_quintal),
        )
        val PAYMENTS = listOf(
            SelectOption("cash", "Cash on delivery", R.string.cash_on_delivery),
            SelectOption("bank_telebirr", "Bank / Telebirr", R.string.bank_telebirr),
        )
    }
}
