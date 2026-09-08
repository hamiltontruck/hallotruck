package com.hallo.logistics.customer

import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.view.View
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.viewModels
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
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
import java.net.URI
import java.text.NumberFormat

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private val viewModel: CustomerViewModel by viewModels()
    private var signupMode = false
    private var pickupLabels: List<String> = emptyList()
    private var dropoffLabels: List<String> = emptyList()
    private var language = AppLanguage.EN
    private var selectedVehicle = TRUCKS[1]
    private var selectedCategoryKey = "general_goods"
    private var selectedPackagingKey = "loose_bulk"
    private var selectedUnitKey = "ton"
    private var selectedPaymentKey = "cash"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (HalloSupabase.configured) HalloSupabase.client.handleDeeplinks(intent)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        language = runCatching {
            AppLanguage.valueOf(getSharedPreferences(PREFERENCES, MODE_PRIVATE).getString(LANGUAGE, AppLanguage.EN.name).orEmpty())
        }.getOrDefault(AppLanguage.EN)
        configureLanguageSelector()
        configureBookingControls()
        bindActions()
        lifecycleScope.launch { repeatOnLifecycle(Lifecycle.State.STARTED) { viewModel.state.collect(::render) } }
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (isActive) {
                    delay(8_000)
                    if (viewModel.state.value.page == CustomerPage.TRACKING && !viewModel.state.value.busy) viewModel.refreshTracking()
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
        languageSelector.check(when (language) {
            AppLanguage.EN -> languageEn.id
            AppLanguage.OR -> languageOr.id
            AppLanguage.AM -> languageAm.id
        })
        languageSelector.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (!isChecked) return@addOnButtonCheckedListener
            language = when (checkedId) {
                languageOr.id -> AppLanguage.OR
                languageAm.id -> AppLanguage.AM
                else -> AppLanguage.EN
            }
            getSharedPreferences(PREFERENCES, MODE_PRIVATE).edit().putString(LANGUAGE, language.name).apply()
            configureBookingDropdowns()
            applyLanguage(viewModel.state.value.page)
            render(viewModel.state.value)
        }
    }

    private fun configureBookingControls() {
        renderTruckOptions()
        configureBookingDropdowns()
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
        view: android.widget.AutoCompleteTextView,
        options: List<SelectOption>,
        selectedKey: String,
        onSelected: (String) -> Unit,
    ) {
        val labels = options.map { it.label(language) }
        view.setAdapter(ArrayAdapter(this, android.R.layout.simple_dropdown_item_1line, labels))
        view.setText(options.firstOrNull { it.key == selectedKey }?.label(language).orEmpty(), false)
        view.setOnItemClickListener { _, _, position, _ ->
            options.getOrNull(position)?.let { onSelected(it.key) }
            updateBookingSteps(viewModel.state.value)
        }
    }

    private fun renderTruckOptions(): Unit = with(binding) {
        truckOptions.removeAllViews()
        TRUCKS.forEach { truck ->
            val item = ItemCustomerTruckBinding.inflate(layoutInflater, truckOptions, false)
            item.truckImage.setImageResource(truck.image)
            item.truckImage.contentDescription = truck.label
            item.truckName.text = truck.label
            item.truckCapacity.text = tr("Up to ${truck.capacity} ton", "Hanga toonii ${truck.capacity}", "እስከ ${truck.capacity} ቶን")
            val selected = truck.backendValue == selectedVehicle.backendValue
            item.root.strokeWidth = if (selected) 3.dp else 1.dp
            item.root.setStrokeColor(getColor(if (selected) R.color.hallo_gold else R.color.hallo_line))
            item.root.setCardBackgroundColor(getColor(if (selected) R.color.hallo_gold_soft else android.R.color.white))
            item.root.contentDescription = "${truck.label}, ${truck.capacity} ton${if (selected) ", selected" else ""}"
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
        authMode.setOnClickListener { signupMode = !signupMode; renderAuthMode() }
        authSubmit.setOnClickListener {
            if (signupMode) viewModel.signUp(fullName.text.toString(), phone.text.toString(), email.text.toString(), password.text.toString(), confirmPin.text.toString())
            else viewModel.signIn(email.text.toString(), password.text.toString())
        }
        navHome.setOnClickListener { viewModel.show(CustomerPage.HOME) }
        navBook.setOnClickListener { viewModel.show(CustomerPage.BOOK) }
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
        createOrder.setOnClickListener { createCurrentOrder() }
        pickupAddress.doAfterTextChanged { value -> viewModel.bookingInputChanged(); viewModel.searchPlaces(value?.toString().orEmpty(), true) }
        dropoffAddress.doAfterTextChanged { value -> viewModel.bookingInputChanged(); viewModel.searchPlaces(value?.toString().orEmpty(), false) }
        cargoQuantity.doAfterTextChanged {
            viewModel.bookingInputChanged()
            updateLoadSummary()
            updateBookingSteps(viewModel.state.value)
        }
        pickupAddress.setOnItemClickListener { _, _, _, _ -> viewModel.bookingInputChanged() }
        dropoffAddress.setOnItemClickListener { _, _, _, _ -> viewModel.bookingInputChanged() }
    }

    private fun openActiveTracking() {
        val order = viewModel.state.value.orders.firstOrNull { it.status in setOf("accepted", "in_transit") }
        if (order == null) viewModel.show(CustomerPage.TRACKING) else viewModel.track(order)
    }

    private fun renderAuthMode() = with(binding) {
        signupFields.visibility = visible(signupMode)
        confirmPinLayout.visibility = visible(signupMode)
        authTitle.text = if (signupMode) tr("Create Customer account", "Akkaawuntii Customer bani", "የደንበኛ መለያ ይፍጠሩ") else tr("Customer sign in", "Customer seeni", "የደንበኛ መግቢያ")
        authSubmit.text = if (signupMode) tr("Create account", "Akkaawuntii bani", "መለያ ይፍጠሩ") else tr("Sign in", "Seeni", "ግባ")
        authMode.text = if (signupMode) tr("Sign in instead", "Bakka isaa seeni", "በምትኩ ይግቡ") else tr("Create a Customer account", "Akkaawuntii Customer bani", "የደንበኛ መለያ ይፍጠሩ")
        password.inputType = if (signupMode) InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD else InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        password.filters = arrayOf(InputFilter.LengthFilter(if (signupMode) 6 else 128))
        password.setText("")
        confirmPin.setText("")
    }

    private fun render(state: CustomerUiState) = with(binding) {
        progress.visibility = visible(state.loading || state.busy)
        val fallbackStatus = tr("Secure Customer workspace", "Iddoo hojii Customer nageenya qabu", "ደህነቱ የተጠበቀ የደንበኛ ቦታ")
        status.text = state.message.ifBlank { fallbackStatus }
        authPanel.visibility = visible(!state.authorized && !state.loading)
        customerShell.visibility = visible(state.authorized)
        bottomNavigation.visibility = visible(state.authorized)
        navNotifications.visibility = visible(state.authorized)
        languageSelector.visibility = View.VISIBLE
        val unread = state.notifications.count { it.readAt == null }
        notificationBadge.visibility = visible(state.authorized && unread > 0)
        notificationBadge.text = if (unread > 99) "99+" else unread.toString()
        listOf(pageHome, pageBook, pageOrders, pageTracking, pagePayments, pageNotifications, pageProfile).forEach { it.visibility = View.GONE }
        applyLanguage(state.page)
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
        welcome.text = tr("Welcome", "Baga nagaan dhuftan", "እንኳን ደህና መጡ") + ", ${state.profile?.fullName?.substringBefore(' ') ?: "Customer"}"
        homeSummary.text = tr("${state.orders.size} orders · $unread unread alerts", "Ajaja ${state.orders.size} · beeksisa hin dubbifamne $unread", "${state.orders.size} ትዕዛዞች · $unread ያልተነበቡ ማሳወቂያዎች")
        val active = state.orders.firstOrNull { it.status in setOf("accepted", "in_transit") }
        homeActiveOrder.text = active?.let { "${it.trackingId ?: "Active order"}\n${it.pickupAddress.orEmpty()} → ${it.dropoffAddress.orEmpty()}\n${label(it.status)}" }
            ?: tr("No active delivery\nCreate an order when you are ready to move cargo.", "Geejjibni hojjechaa jiru hin jiru\nYeroo qophooftu ajaja bani.", "ንቁ ማድረስ የለም\nሲዘጋጁ ትዕዛዝ ይፍጠሩ።")
        homeTrack.visibility = visible(active != null)
        quoteResult.text = state.quote?.let { quote ->
            state.route?.let { "${it.pickup.label}\n→ ${it.dropoff.label}\n${selectedVehicle.label} · ${quote.distanceKm} km · ${it.durationMinutes} min\n${formatTons(quote.cargoTons)} · ${money(quote.totalEtb)}" } ?: money(quote.totalEtb)
        } ?: tr("Route, distance and the secure backend quote will appear here.", "Daandiin, fageenyi fi gatiin backend nageenya qabu asitti mulʼata.", "መንገድ፣ ርቀት እና ደህነቱ የተጠበቀ ዋጋ እዚህ ይታያል።")
        renderPlaceSuggestions(state)
        bookingMap.showRoute(state.route)
        createOrder.isEnabled = state.quote != null && state.route != null && !state.busy
        profileDetails.text = state.profile?.let { "${it.fullName.orEmpty()}\n${it.phone.orEmpty()}\n${it.email.orEmpty()}\n${it.homeAddress.orEmpty()}\n\nCustomer access only · HALLO shared backend" }.orEmpty()
        updateBookingSteps(state)
        renderOrders(state.orders)
        renderPayments(state.payments, state.orders)
        renderNotifications(state.notifications)
        renderTracking(state)
    }

    private fun applyLanguage(page: CustomerPage) = with(binding) {
        headerTitle.text = when (page) {
            CustomerPage.HOME -> tr("Move smarter", "Ogeessaan geessi", "በብልህነት ያንቀሳቅሱ")
            CustomerPage.BOOK -> tr("Plan delivery", "Geejjiba karoorsi", "ማድረስ ያቅዱ")
            CustomerPage.ORDERS -> tr("Your orders", "Ajajawwan kee", "ትዕዛዞችዎ")
            CustomerPage.TRACKING -> tr("Track live", "Kallattiin hordofi", "በቀጥታ ይከታተሉ")
            CustomerPage.PAYMENTS -> tr("Payment status", "Haala kaffaltii", "የክፍያ ሁኔታ")
            CustomerPage.NOTIFICATIONS -> tr("Alerts", "Beeksisa", "ማሳወቂያዎች")
            CustomerPage.PROFILE -> tr("Your account", "Akkaawuntii kee", "መለያዎ")
        }
        authSubtitle.text = tr("Book, pay and follow every delivery securely.", "Nageenyaan ajaji, kaffali, geejjiba hordofi.", "በደህነት ይዘዙ፣ ይክፈሉ እና ይከታተሉ።")
        navHome.text = tr("Home", "Mana", "መነሻ")
        navBook.text = tr("Book", "Ajaji", "ይዘዙ")
        navOrders.text = tr("Orders", "Ajaja", "ትዕዛዝ")
        navTrack.text = tr("Track", "Hordofi", "ክትትል")
        navProfile.text = tr("Profile", "Eenyummaa", "መገለጫ")
        homeActiveLabel.text = tr("ACTIVE DELIVERY", "GEEJJIBA HOJJECHAA JIRU", "ንቁ ማድረስ")
        homeTrack.text = tr("Open live tracking", "Hordoffii kallattii bani", "የቀጥታ ክትትል ይክፈቱ")
        startBooking.text = tr("Create delivery order", "Ajaja geejjibaa bani", "የማድረስ ትዕዛዝ ይፍጠሩ")
        refresh.text = tr("Refresh customer data", "Odeeffannoo haaromsi", "የደንበኛ መረጃ ያድሱ")
        bookTitle.text = tr("Book a truck", "Konkolaataa ajaji", "የጭነት መኪና ይዘዙ")
        bookSubtitle.text = tr("Route → Truck → Cargo → Load → Quote → Confirm", "Daandii → Konkolaataa → Feʼumsa → Baayʼina → Gatii → Mirkaneessi", "መንገድ → መኪና → ጭነት → መጠን → ዋጋ → አረጋግጥ")
        routeSectionTitle.text = tr("1 · Route", "1 · Daandii", "1 · መንገድ")
        truckSectionTitle.text = tr("2 · Choose a truck", "2 · Konkolaataa filadhu", "2 · መኪና ይምረጡ")
        truckSectionHelp.text = tr("Swipe to compare capacity and select.", "Harkisi; baayʼina walbira qabii filadhu.", "አቅምን ለማወዳደር ያንሸራትቱ።")
        cargoSectionTitle.text = tr("3–4 · Cargo and load", "3–4 · Feʼumsaa fi baayʼina", "3–4 · ጭነት እና መጠን")
        quoteSectionTitle.text = tr("5 · Secure quote", "5 · Gatii nageenya qabu", "5 · ደህነቱ የተጠበቀ ዋጋ")
        pickupLayout.hint = tr("Pickup place", "Bakka feʼumsaa", "መነሻ ቦታ")
        dropoffLayout.hint = tr("Drop-off place", "Bakka buusaa", "መድረሻ ቦታ")
        cargoCategoryLayout.hint = tr("Cargo category", "Gosa feʼumsaa", "የጭነት ዓይነት")
        packagingTypeLayout.hint = tr("Packaging / load type", "Akkaataa kuusaa / feʼumsaa", "የማሸጊያ / ጭነት አይነት")
        cargoQuantityLayout.hint = tr("Quantity", "Baayʼina", "መጠን")
        cargoUnitLayout.hint = tr("Unit", "Safartuu", "መለኪያ")
        additionalNotesLayout.hint = tr("Additional notes (optional)", "Ibsa dabalataa (dirqama miti)", "ተጨማሪ ማስታወሻ (አማራጭ)")
        paymentMethodLayout.hint = tr("Payment method", "Mala kaffaltii", "የክፍያ ዘዴ")
        calculateQuote.text = tr("Find route & calculate quote", "Daandii barbaadi; gatii shallagi", "መንገድ ፈልግ እና ዋጋ አስላ")
        createOrder.text = tr("6 · Confirm & create order", "6 · Mirkaneessi; ajaja bani", "6 · አረጋግጥ እና ትዕዛዝ ፍጠር")
        ordersTitle.text = tr("My orders", "Ajajawwan koo", "ትዕዛዞቼ")
        ordersSubtitle.text = tr("Status, delivery and cancellation", "Haala, geejjibaa fi haqaa", "ሁኔታ፣ ማድረስ እና ስረዛ")
        trackingTitle.text = tr("Live tracking", "Hordoffii kallattii", "የቀጥታ ክትትል")
        callDriver.text = tr("Call", "Bilbili", "ይደውሉ")
        messageDriver.text = tr("Message", "Ergaa", "መልዕክት")
        refreshTracking.text = tr("Refresh live position", "Bakka jiru haaromsi", "የቀጥታ ቦታ ያድሱ")
        profileTitle.text = tr("Customer profile", "Piroofaayilii Customer", "የደንበኛ መገለጫ")
        signOut.text = tr("Sign out", "Baʼi", "ውጣ")
        renderAuthModeWithoutReset()
        updateLoadSummary()
    }

    private fun renderAuthModeWithoutReset() = with(binding) {
        authTitle.text = if (signupMode) tr("Create Customer account", "Akkaawuntii Customer bani", "የደንበኛ መለያ ይፍጠሩ") else tr("Customer sign in", "Customer seeni", "የደንበኛ መግቢያ")
        authSubmit.text = if (signupMode) tr("Create account", "Akkaawuntii bani", "መለያ ይፍጠሩ") else tr("Sign in", "Seeni", "ግባ")
        authMode.text = if (signupMode) tr("Sign in instead", "Bakka isaa seeni", "በምትኩ ይግቡ") else tr("Create a Customer account", "Akkaawuntii Customer bani", "የደንበኛ መለያ ይፍጠሩ")
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
        binding.loadSummary.text = if (tons > 0) {
            tr("Load equivalent: ${formatTons(tons)}", "Feʼumsa waliigalaa: ${formatTons(tons)}", "ተመጣጣኝ ጭነት፦ ${formatTons(tons)}")
        } else tr("Load equivalent: —", "Feʼumsa waliigalaa: —", "ተመጣጣኝ ጭነት፦ —")
    }

    private fun highlightNavigation(page: CustomerPage) {
        val active = getColor(R.color.hallo_gold)
        val idle = android.graphics.Color.TRANSPARENT
        binding.navHome.setBackgroundColor(if (page == CustomerPage.HOME) active else idle)
        binding.navBook.setBackgroundColor(if (page == CustomerPage.BOOK) active else idle)
        binding.navOrders.setBackgroundColor(if (page == CustomerPage.ORDERS || page == CustomerPage.PAYMENTS) active else idle)
        binding.navTrack.setBackgroundColor(if (page == CustomerPage.TRACKING) active else idle)
        binding.navProfile.setBackgroundColor(if (page == CustomerPage.PROFILE) active else idle)
    }

    private fun renderTracking(state: CustomerUiState) = with(binding) {
        val order = state.trackingOrder ?: state.orders.firstOrNull { it.status in setOf("accepted", "in_transit") }
        val assignment = order?.let { selected -> state.assignments.firstOrNull { it.orderId == selected.id } }
        driverDetails.text = assignment?.let {
            "${it.driverName ?: tr("Assigned driver", "Konkolaachisaa ramadame", "የተመደበ አሽከርካሪ")}\n${it.vehicleType ?: "—"} · ${it.plateNumber ?: "—"}\n${if (it.driverVerified == true) tr("✓ Verified driver", "Konkolaachisaa mirkanaaʼe", "✓ የተረጋገጠ አሽከርካሪ") else tr("Verification pending", "Mirkaneessi eegamaa jira", "ማረጋገጫ በመጠባበቅ ላይ")}"
        } ?: tr("Waiting for secure driver assignment", "Ramaddii konkolaachisaa nageenya qabu eegaa jira", "ደህነቱ የተጠበቀ የአሽከርካሪ ምደባ በመጠባበቅ ላይ")
        trackingMap.showTrip(state.liveTrip)
        trackingFreshness.text = trackingFreshness(state.liveTrip)
        val fresh = CustomerPolicy.trackingFreshness(state.liveTrip?.recordedAt, state.liveTrip?.truckLatitude != null)
        trackingFreshness.setTextColor(getColor(when (fresh) { "LIVE" -> R.color.hallo_success; "STALE" -> R.color.hallo_warning; else -> R.color.hallo_danger }))
        tripStatus.text = tr("STATUS", "HAALA", "ሁኔታ") + "\n${label(order?.status)}"
        tripEta.text = "ETA\n" + if (state.liveTrip?.truckLatitude == null) "—" else tr("Awaiting route", "Daandii eegaa", "መንገድ በመጠበቅ")
        tripVehicle.text = tr("VEHICLE", "KONKOLAATAA", "መኪና") + "\n${assignment?.plateNumber ?: "—"}"
        trackingResult.text = state.liveTrip?.let {
            tr("Speed", "Saffisa", "ፍጥነት") + ": ${it.speedKmh?.toInt() ?: "—"} km/h · " + tr("Heading", "Kallattii", "አቅጣጫ") + ": ${it.heading?.toInt() ?: "—"}°\n" + tr("Last GPS update", "GPS yeroo dhumaa", "የመጨረሻ GPS") + ": ${it.recordedAt ?: "—"}"
        } ?: tr("Real GPS appears when the assigned driver sends a location.", "Konkolaachisaan bakka jiru yeroo ergu GPS dhugaan mulʼata.", "አሽከርካሪው ቦታ ሲልክ እውነተኛ GPS ይታያል።")
        val phone = assignment?.driverPhone?.trim().orEmpty()
        callDriver.isEnabled = phone.isNotBlank()
        messageDriver.isEnabled = phone.isNotBlank()
        callDriver.setOnClickListener { openContact(Intent.ACTION_DIAL, phone) }
        messageDriver.setOnClickListener { openContact(Intent.ACTION_SENDTO, phone) }
        loadDriverPhoto(state.driverPhotoUrl)
    }

    private fun openContact(action: String, phone: String) {
        if (phone.isBlank()) return
        val scheme = if (action == Intent.ACTION_DIAL) "tel" else "smsto"
        val contactIntent = Intent(action, Uri.fromParts(scheme, phone, null))
        runCatching { startActivity(contactIntent) }.onFailure { binding.status.text = tr("No compatible contact app is available", "App bilbilaa/ergaa hin jiru", "ተስማሚ የመገናኛ መተግበሪያ የለም") }
    }

    private fun trackingFreshness(trip: CustomerLiveTrip?): String {
        if (trip?.truckLatitude == null || trip.truckLongitude == null || trip.recordedAt == null) return "GPS OFFLINE"
        return when (CustomerPolicy.trackingFreshness(trip.recordedAt, true)) {
            "LIVE" -> "GPS LIVE"
            "STALE" -> tr("GPS STALE · last known position", "GPS DULLOOME · bakka dhumaa", "GPS ዘግይቷል · የመጨረሻ ቦታ")
            else -> tr("GPS OFFLINE · last known position", "GPS OFFLINE · bakka dhumaa", "GPS ከመስመር ውጭ · የመጨረሻ ቦታ")
        }
    }

    private fun loadDriverPhoto(url: String?) {
        if (url.isNullOrBlank()) {
            binding.driverPhoto.setImageResource(R.drawable.hallo_logistics_logo)
            binding.driverPhoto.visibility = View.VISIBLE
            return
        }
        binding.driverPhoto.tag = url
        lifecycleScope.launch {
            val bitmap = withContext(Dispatchers.IO) { runCatching { URI(url).toURL().openStream().use(BitmapFactory::decodeStream) }.getOrNull() }
            if (binding.driverPhoto.tag == url && bitmap != null) {
                binding.driverPhoto.setImageBitmap(bitmap)
                binding.driverPhoto.visibility = View.VISIBLE
            }
        }
    }

    private fun createCurrentOrder() = with(binding) {
        val quote = viewModel.state.value.quote ?: return@with
        val route = viewModel.state.value.route ?: return@with
        val quantity = cargoQuantity.text?.toString()?.toDoubleOrNull() ?: 0.0
        val category = CATEGORIES.first { it.key == selectedCategoryKey }
        val packaging = PACKAGING.first { it.key == selectedPackagingKey }
        val description = CustomerBookingPolicy.cargoDescription(category.en, packaging.en, quantity, selectedUnitKey, additionalNotes.text?.toString().orEmpty())
        viewModel.createOrder(CreateOrderInput(
            route.pickup.label, route.pickup.longitude, route.pickup.latitude,
            route.dropoff.label, route.dropoff.longitude, route.dropoff.latitude,
            selectedVehicle.backendValue, route.distanceKm, quote.cargoTons,
            quantity, selectedUnitKey, selectedCategoryKey, selectedPackagingKey,
            description, selectedPaymentKey, quote.totalEtb,
        ))
    }

    private fun renderOrders(items: List<CustomerOrder>) {
        binding.ordersList.removeAllViews()
        if (items.isEmpty()) {
            binding.ordersList.addView(text(tr("No orders yet", "Ajajni ammallee hin jiru", "እስካሁን ትዕዛዝ የለም")))
            return
        }
        items.forEach { order ->
            val item = ItemCustomerOrderBinding.inflate(layoutInflater, binding.ordersList, false)
            item.orderTrackingId.text = order.trackingId ?: tr("Order", "Ajaja", "ትዕዛዝ")
            item.orderStatus.text = label(order.status)
            item.orderRoute.text = "${order.pickupAddress.orEmpty()}\n→ ${order.dropoffAddress.orEmpty()}"
            item.orderMeta.text = "${order.vehicleType ?: "Truck"} · ${order.distanceKm ?: "—"} km\n${money(order.priceEtb)} · ${tr("Payment", "Kaffaltii", "ክፍያ")}: ${label(order.paymentStatus)}"
            if (order.status in setOf("accepted", "in_transit")) item.orderActions.addView(button(tr("Track driver", "Konkolaachisaa hordofi", "አሽከርካሪን ይከታተሉ")) { viewModel.track(order) })
            if (order.paymentStatus != null) item.orderActions.addView(button(tr("View payment status", "Haala kaffaltii ilaali", "የክፍያ ሁኔታን ይመልከቱ")) { viewModel.show(CustomerPage.PAYMENTS) })
            if (CustomerPolicy.canCancel(order.status)) item.orderActions.addView(button(tr("Cancel order", "Ajaja haqi", "ትዕዛዝ ሰርዝ")) { cancellationDialog(order) })
            binding.ordersList.addView(item.root)
        }
    }

    private fun renderPayments(items: List<CustomerPayment>, orders: List<CustomerOrder>) {
        binding.paymentsList.removeAllViews()
        val tracking = orders.associate { it.id to it.trackingId }
        if (items.isEmpty()) {
            binding.paymentsList.addView(text(tr("No payment records yet. Order payment status remains visible in My orders.", "Galmeen kaffaltii hin jiru. Haalli isaa Ajajawwan koo keessatti mulʼata.", "የክፍያ መዝገብ ገና የለም።")))
            return
        }
        items.forEach { payment ->
            val card = card()
            card.addView(text("${tracking[payment.orderId] ?: "Order"} · ${label(payment.event)}\n${money(payment.amountEtb)} · ${payment.provider ?: "—"}\nReference: ${payment.providerRef ?: "—"}"))
            binding.paymentsList.addView(card, marginParams())
        }
    }

    private fun renderNotifications(items: List<CustomerNotification>) {
        binding.notificationsList.removeAllViews()
        if (items.isEmpty()) {
            binding.notificationsList.addView(text(tr("No notifications", "Beeksisni hin jiru", "ማሳወቂያ የለም")))
            return
        }
        items.forEach { notification ->
            binding.notificationsList.addView(button("${if (notification.readAt == null) "● " else ""}${notification.title}\n${notification.body}") { viewModel.markNotificationRead(notification) }, marginParams())
        }
    }

    private fun cancellationDialog(order: CustomerOrder) {
        val input = EditText(this).apply { hint = tr("Cancellation reason (5–500 characters)", "Sababa haqaa (qubee 5–500)", "የስረዛ ምክንያት (5–500 ቁምፊዎች)"); minLines = 2 }
        AlertDialog.Builder(this)
            .setTitle(tr("Cancel ${order.trackingId ?: "order"}", "${order.trackingId ?: "ajaja"} haqi", "${order.trackingId ?: "ትዕዛዝ"} ሰርዝ"))
            .setView(input)
            .setNegativeButton(tr("Keep order", "Ajaja tursiisi", "ትዕዛዙን አቆይ"), null)
            .setPositiveButton(tr("Cancel order", "Ajaja haqi", "ትዕዛዝ ሰርዝ")) { _, _ -> viewModel.cancelOrder(order, input.text.toString()) }
            .show()
    }

    private fun currentCargoTons(): Double = CustomerBookingPolicy.cargoToTons(binding.cargoQuantity.text?.toString()?.toDoubleOrNull() ?: 0.0, selectedUnitKey)
    private fun formatTons(value: Double): String = "${NumberFormat.getNumberInstance().apply { maximumFractionDigits = 2 }.format(value)} ton"
    private fun card() = MaterialCardView(this).apply { radius = 20.dp.toFloat(); cardElevation = 2.dp.toFloat(); setCardBackgroundColor(android.graphics.Color.WHITE) }
    private fun text(value: String) = TextView(this).apply { text = value; textSize = 15f; setTextColor(getColor(R.color.hallo_text)); setPadding(14.dp, 12.dp, 14.dp, 12.dp); setLineSpacing(4.dp.toFloat(), 1f) }
    private fun button(value: String, action: () -> Unit) = MaterialButton(this).apply {
        text = value
        isAllCaps = false
        backgroundTintList = ColorStateList.valueOf(getColor(R.color.hallo_navy_soft))
        setTextColor(getColor(R.color.hallo_navy))
        setOnClickListener { action() }
    }
    private fun marginParams() = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = 10.dp }
    private fun visible(value: Boolean) = if (value) View.VISIBLE else View.GONE
    private fun label(value: String?) = value?.replace('_', ' ')?.replaceFirstChar { it.uppercase() } ?: tr("Pending", "Eegamaa", "በመጠባበቅ ላይ")
    private fun money(value: Double?) = if (value == null) "—" else "ETB ${NumberFormat.getIntegerInstance().format(value)}"
    private fun tr(en: String, or: String, am: String) = when (language) { AppLanguage.EN -> en; AppLanguage.OR -> or; AppLanguage.AM -> am }
    private val Int.dp get() = (this * resources.displayMetrics.density).toInt()

    private enum class AppLanguage { EN, OR, AM }
    private data class SelectOption(val key: String, val en: String, val or: String, val am: String) {
        fun label(language: AppLanguage) = when (language) { AppLanguage.EN -> en; AppLanguage.OR -> or; AppLanguage.AM -> am }
    }
    private data class TruckOption(val backendValue: String, val label: String, val capacity: Int, val image: Int)

    private companion object {
        const val PREFERENCES = "hallo_customer_preferences"
        const val LANGUAGE = "language"
        val TRUCKS = listOf(
            TruckOption("Isuzu 5 Ton", "Isuzu 5 Ton", 5, R.drawable.truck_isuzu_5),
            TruckOption("Dry Cargo", "10 Ton", 10, R.drawable.truck_10_ton),
            TruckOption("Truck 22 Ton", "22 Ton", 22, R.drawable.truck_22_ton),
            TruckOption("Truck 25 Ton", "25 Ton", 25, R.drawable.truck_25_ton),
            TruckOption("Truck 30 Ton", "30 Ton", 30, R.drawable.truck_30_ton),
        )
        val CATEGORIES = listOf(
            SelectOption("food", "Food", "Nyaata", "ምግብ"),
            SelectOption("grain_rice", "Grain / rice", "Midhaan / ruuzii", "እህል / ሩዝ"),
            SelectOption("cooking_oil", "Cooking oil", "Zayita nyaataa", "የምግብ ዘይት"),
            SelectOption("metal_steel", "Metal / steel", "Sibiila / steel", "ብረት / ስቲል"),
            SelectOption("construction_materials", "Construction materials", "Meeshaa ijaarsaa", "የግንባታ እቃዎች"),
            SelectOption("general_goods", "General goods", "Meeshaa waliigalaa", "አጠቃላይ እቃዎች"),
            SelectOption("other", "Other", "Kan biraa", "ሌላ"),
        )
        val PACKAGING = listOf(
            SelectOption("bagged", "Bagged", "Korojoodhaan", "በከረጢት"),
            SelectOption("drum_tank", "Drum / tank", "Drum / taankii", "ድረም / ታንክ"),
            SelectOption("pallet", "Pallet", "Pallet", "ፓሌት"),
            SelectOption("loose_bulk", "Loose / bulk", "Laafaa / baayʼinaan", "ልቅ / በጅምላ"),
            SelectOption("container_20ft", "20 ft container", "Container 20 ft", "20 ጫማ ኮንቴነር"),
            SelectOption("container_40ft", "40 ft container", "Container 40 ft", "40 ጫማ ኮንቴነር"),
            SelectOption("other", "Other", "Kan biraa", "ሌላ"),
        )
        val UNITS = listOf(
            SelectOption("ton", "Ton", "Toonii", "ቶን"),
            SelectOption("quintal", "Quintal", "Kuntaala", "ኩንታል"),
        )
        val PAYMENTS = listOf(
            SelectOption("cash", "Cash on delivery", "Yeroo geessu maallaqa callaa", "በማድረስ ጊዜ ጥሬ ገንዘብ"),
            SelectOption("bank_telebirr", "Bank / Telebirr", "Baankii / Telebirr", "ባንክ / ቴሌብር"),
        )
    }
}