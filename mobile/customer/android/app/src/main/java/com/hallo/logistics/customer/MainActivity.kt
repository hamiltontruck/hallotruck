package com.hallo.logistics.customer

import android.content.Intent
import android.graphics.BitmapFactory
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.hallo.logistics.customer.databinding.ActivityMainBinding
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (HalloSupabase.configured) HalloSupabase.client.handleDeeplinks(intent)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        configureSpinners()
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
        super.onNewIntent(intent); setIntent(intent)
        if (HalloSupabase.configured) HalloSupabase.client.handleDeeplinks(intent)
        viewModel.restoreSession()
    }

    private fun configureSpinners() {
        binding.vehicleType.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, listOf("Pickup", "Van", "Isuzu 5 Ton", "Dry Cargo", "Refrigerated", "Truck 22 Ton", "Truck 25 Ton", "Truck 30 Ton", "Trailer"))
        binding.paymentMethod.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, listOf("Cash on delivery", "Bank / Telebirr"))
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
                pickupAddress.text.toString(), dropoffAddress.text.toString(),
                vehicleType.selectedItem.toString(), cargoTons.text.toString().toDoubleOrNull() ?: 0.0,
            )
        }
        createOrder.setOnClickListener { createCurrentOrder() }
    }

    private fun openActiveTracking() {
        val order = viewModel.state.value.orders.firstOrNull { it.status in setOf("accepted", "in_transit") }
        if (order == null) viewModel.show(CustomerPage.TRACKING) else viewModel.track(order)
    }

    private fun renderAuthMode() = with(binding) {
        signupFields.visibility = visible(signupMode)
        confirmPinLayout.visibility = visible(signupMode)
        authTitle.text = if (signupMode) "Create Customer account" else "Customer sign in"
        authSubmit.text = if (signupMode) "Create account" else "Sign in"
        authMode.text = if (signupMode) "Sign in instead" else "Create a Customer account"
        password.inputType = if (signupMode) InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD else InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        password.filters = arrayOf(InputFilter.LengthFilter(if (signupMode) 6 else 128))
        password.setText(""); confirmPin.setText("")
    }

    private fun render(state: CustomerUiState) = with(binding) {
        progress.visibility = visible(state.loading || state.busy)
        status.text = state.message
        authPanel.visibility = visible(!state.authorized && !state.loading)
        customerShell.visibility = visible(state.authorized)
        bottomNavigation.visibility = visible(state.authorized)
        navNotifications.visibility = visible(state.authorized)
        listOf(pageHome, pageBook, pageOrders, pageTracking, pagePayments, pageNotifications, pageProfile).forEach { it.visibility = View.GONE }
        if (!state.authorized) return@with
        val shown = when (state.page) {
            CustomerPage.HOME -> pageHome; CustomerPage.BOOK -> pageBook; CustomerPage.ORDERS -> pageOrders
            CustomerPage.TRACKING -> pageTracking; CustomerPage.PAYMENTS -> pagePayments
            CustomerPage.NOTIFICATIONS -> pageNotifications; CustomerPage.PROFILE -> pageProfile
        }
        shown.visibility = View.VISIBLE
        headerTitle.text = when (state.page) { CustomerPage.HOME -> "Move smarter"; CustomerPage.BOOK -> "Plan delivery"; CustomerPage.ORDERS -> "Your orders"; CustomerPage.TRACKING -> "Track live"; CustomerPage.PAYMENTS -> "Payment status"; CustomerPage.NOTIFICATIONS -> "Alerts"; CustomerPage.PROFILE -> "Your account" }
        highlightNavigation(state.page)
        welcome.text = "Welcome, ${state.profile?.fullName?.substringBefore(' ') ?: "Customer"}"
        homeSummary.text = "${state.orders.size} orders · ${state.notifications.count { it.readAt == null }} unread alerts"
        val active = state.orders.firstOrNull { it.status in setOf("accepted", "in_transit") }
        homeActiveOrder.text = active?.let { "${it.trackingId ?: "Active order"}\n${it.pickupAddress.orEmpty()} → ${it.dropoffAddress.orEmpty()}\n${label(it.status)}" } ?: "No active delivery\nCreate an order when you are ready to move cargo."
        homeTrack.visibility = visible(active != null)
        quoteResult.text = state.quote?.let { quote -> state.route?.let { "${it.pickup.label}\n→ ${it.dropoff.label}\n${quote.vehicleType} · ${quote.distanceKm} km · ${it.durationMinutes} min\n${quote.cargoTons} ton · ${money(quote.totalEtb)}" } ?: money(quote.totalEtb) } ?: "Route and quote will appear here."
        bookingMap.showRoute(state.route)
        createOrder.isEnabled = state.quote != null && state.route != null && !state.busy
        profileDetails.text = state.profile?.let { "${it.fullName.orEmpty()}\n${it.phone.orEmpty()}\n${it.email.orEmpty()}\n${it.homeAddress.orEmpty()}\n\nCustomer access only · HALLO shared backend" }.orEmpty()
        renderOrders(state.orders)
        renderPayments(state.payments, state.orders)
        renderNotifications(state.notifications)
        renderTracking(state)
    }

    private fun highlightNavigation(page: CustomerPage) {
        val active = getColor(R.color.hallo_gold); val idle = android.graphics.Color.TRANSPARENT
        binding.navHome.setBackgroundColor(if (page == CustomerPage.HOME) active else idle)
        binding.navBook.setBackgroundColor(if (page == CustomerPage.BOOK) active else idle)
        binding.navOrders.setBackgroundColor(if (page == CustomerPage.ORDERS || page == CustomerPage.PAYMENTS) active else idle)
        binding.navTrack.setBackgroundColor(if (page == CustomerPage.TRACKING) active else idle)
        binding.navProfile.setBackgroundColor(if (page == CustomerPage.PROFILE) active else idle)
    }

    private fun renderTracking(state: CustomerUiState) = with(binding) {
        val order = state.trackingOrder ?: state.orders.firstOrNull { it.status in setOf("accepted", "in_transit") }
        val assignment = order?.let { selected -> state.assignments.firstOrNull { it.orderId == selected.id } }
        driverDetails.text = assignment?.let { "Assigned driver: ${it.driverName ?: "—"}\n${it.driverPhone ?: "Phone unavailable"}\nTruck: ${it.vehicleType ?: "—"} · Plate: ${it.plateNumber ?: "—"}\nCapacity: ${it.capacityTons ?: "—"} ton · ${if (it.driverVerified == true) "Verified" else "Verification pending"}" } ?: "Waiting for secure driver assignment"
        trackingMap.showTrip(state.liveTrip)
        trackingFreshness.text = trackingFreshness(state.liveTrip)
        trackingResult.text = state.liveTrip?.let { "Status: ${label(it.status)}\nSpeed: ${it.speedKmh?.toInt() ?: "—"} km/h · Heading: ${it.heading?.toInt() ?: "—"}°\nLast GPS update: ${it.recordedAt ?: "—"}" } ?: "Choose an accepted or in-transit order. Real GPS appears when the assigned driver sends a location."
        loadDriverPhoto(state.driverPhotoUrl)
    }

    private fun trackingFreshness(trip: CustomerLiveTrip?): String {
        if (trip?.truckLatitude == null || trip.truckLongitude == null || trip.recordedAt == null) return "GPS OFFLINE"
        return when (CustomerPolicy.trackingFreshness(trip.recordedAt, true)) {
            "LIVE" -> "GPS LIVE"; "STALE" -> "GPS STALE · last known position"; else -> "GPS OFFLINE · last known position"
        }
    }

    private fun loadDriverPhoto(url: String?) {
        if (url.isNullOrBlank()) { binding.driverPhoto.visibility = View.GONE; return }
        binding.driverPhoto.tag = url
        lifecycleScope.launch {
            val bitmap = withContext(Dispatchers.IO) { runCatching { URI(url).toURL().openStream().use(BitmapFactory::decodeStream) }.getOrNull() }
            if (binding.driverPhoto.tag == url && bitmap != null) { binding.driverPhoto.setImageBitmap(bitmap); binding.driverPhoto.visibility = View.VISIBLE }
        }
    }

    private fun createCurrentOrder() = with(binding) {
        val quote = viewModel.state.value.quote ?: return@with
        val route = viewModel.state.value.route ?: return@with
        viewModel.createOrder(CreateOrderInput(
            route.pickup.label, route.pickup.longitude, route.pickup.latitude, route.dropoff.label, route.dropoff.longitude, route.dropoff.latitude,
            route.vehicleType, route.distanceKm, quote.cargoTons, cargoDescription.text.toString().trim(),
            if (paymentMethod.selectedItemPosition == 0) "cash" else "bank_telebirr", quote.totalEtb,
        ))
    }

    private fun renderOrders(items: List<CustomerOrder>) {
        binding.ordersList.removeAllViews()
        if (items.isEmpty()) { binding.ordersList.addView(text("No orders yet")); return }
        items.forEach { order ->
            val card = card(); val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(16.dp, 14.dp, 16.dp, 14.dp) }
            box.addView(text("${order.trackingId ?: "Order"} · ${label(order.status)}\n${order.pickupAddress.orEmpty()} → ${order.dropoffAddress.orEmpty()}\n${order.vehicleType ?: "Truck"} · ${order.distanceKm ?: "—"} km\n${money(order.priceEtb)} · Payment: ${label(order.paymentStatus)}"))
            if (order.status in setOf("accepted", "in_transit")) box.addView(button("Track driver") { viewModel.track(order) })
            if (order.paymentStatus != null) box.addView(button("View payment status") { viewModel.show(CustomerPage.PAYMENTS) })
            if (CustomerPolicy.canCancel(order.status)) box.addView(button("Cancel order") { cancellationDialog(order) })
            card.addView(box); binding.ordersList.addView(card, marginParams())
        }
    }

    private fun renderPayments(items: List<CustomerPayment>, orders: List<CustomerOrder>) {
        binding.paymentsList.removeAllViews(); val tracking = orders.associate { it.id to it.trackingId }
        if (items.isEmpty()) { binding.paymentsList.addView(text("No payment records yet. Order payment status remains visible in My orders.")); return }
        items.forEach { item -> val card = card(); card.addView(text("${tracking[item.orderId] ?: "Order"} · ${label(item.event)}\n${money(item.amountEtb)} · ${item.provider ?: "—"}\nReference: ${item.providerRef ?: "—"}")); binding.paymentsList.addView(card, marginParams()) }
    }

    private fun renderNotifications(items: List<CustomerNotification>) {
        binding.notificationsList.removeAllViews(); if (items.isEmpty()) { binding.notificationsList.addView(text("No notifications")); return }
        items.forEach { item -> binding.notificationsList.addView(button("${if (item.readAt == null) "● " else ""}${item.title}\n${item.body}") { viewModel.markNotificationRead(item) }, marginParams()) }
    }

    private fun cancellationDialog(order: CustomerOrder) {
        val input = EditText(this).apply { hint = "Cancellation reason (5–500 characters)"; minLines = 2 }
        AlertDialog.Builder(this).setTitle("Cancel ${order.trackingId ?: "order"}").setView(input).setNegativeButton("Keep order", null).setPositiveButton("Cancel order") { _, _ -> viewModel.cancelOrder(order, input.text.toString()) }.show()
    }

    private fun card() = MaterialCardView(this).apply { radius = 20.dp.toFloat(); cardElevation = 2.dp.toFloat(); setCardBackgroundColor(android.graphics.Color.WHITE) }
    private fun text(value: String) = TextView(this).apply { text = value; textSize = 15f; setTextColor(getColor(R.color.hallo_text)); setPadding(14.dp, 12.dp, 14.dp, 12.dp); setLineSpacing(4.dp.toFloat(), 1f) }
    private fun button(value: String, action: () -> Unit) = MaterialButton(this).apply { text = value; isAllCaps = false; setOnClickListener { action() } }
    private fun marginParams() = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = 10.dp }
    private val Int.dp get() = (this * resources.displayMetrics.density).toInt()
    private fun visible(value: Boolean) = if (value) View.VISIBLE else View.GONE
    private fun label(value: String?) = value?.replace('_', ' ')?.replaceFirstChar { it.uppercase() } ?: "Pending"
    private fun money(value: Double?) = if (value == null) "—" else "ETB ${NumberFormat.getIntegerInstance().format(value)}"
}
