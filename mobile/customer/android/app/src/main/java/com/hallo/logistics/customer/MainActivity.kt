package com.hallo.logistics.customer

import android.os.Bundle
import android.content.Intent
import android.text.InputType
import android.text.InputFilter
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
import com.hallo.logistics.customer.databinding.ActivityMainBinding
import kotlinx.coroutines.launch
import io.github.jan.supabase.auth.handleDeeplinks
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
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (HalloSupabase.configured) HalloSupabase.client.handleDeeplinks(intent)
        viewModel.restoreSession()
    }

    private fun configureSpinners() {
        binding.vehicleType.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, listOf("Pickup", "Van", "Isuzu 5 Ton", "Dry Cargo", "Refrigerated", "Truck 22 Ton", "Truck 25 Ton", "Truck 30 Ton", "Trailer"))
        binding.paymentMethod.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, listOf("Cash", "Bank / Telebirr"))
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
        navTrack.setOnClickListener { viewModel.show(CustomerPage.TRACKING) }
        navPayments.setOnClickListener { viewModel.show(CustomerPage.PAYMENTS) }
        navNotifications.setOnClickListener { viewModel.show(CustomerPage.NOTIFICATIONS) }
        navProfile.setOnClickListener { viewModel.show(CustomerPage.PROFILE) }
        startBooking.setOnClickListener { viewModel.show(CustomerPage.BOOK) }
        refresh.setOnClickListener { viewModel.refresh() }
        signOut.setOnClickListener { viewModel.signOut() }
        calculateQuote.setOnClickListener {
            val distance = distanceKm.text.toString().toDoubleOrNull() ?: 0.0
            val cargo = cargoTons.text.toString().toDoubleOrNull() ?: 0.0
            viewModel.calculateQuote(distance, vehicleType.selectedItem.toString(), cargo)
        }
        createOrder.setOnClickListener { createCurrentOrder() }
    }

    private fun renderAuthMode() = with(binding) {
        signupFields.visibility = visible(signupMode)
        confirmPin.visibility = visible(signupMode)
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
        listOf(pageHome, pageBook, pageOrders, pageTracking, pagePayments, pageNotifications, pageProfile).forEach { it.visibility = View.GONE }
        if (!state.authorized) return@with
        when (state.page) {
            CustomerPage.HOME -> pageHome
            CustomerPage.BOOK -> pageBook
            CustomerPage.ORDERS -> pageOrders
            CustomerPage.TRACKING -> pageTracking
            CustomerPage.PAYMENTS -> pagePayments
            CustomerPage.NOTIFICATIONS -> pageNotifications
            CustomerPage.PROFILE -> pageProfile
        }.visibility = View.VISIBLE
        welcome.text = "Welcome, ${state.profile?.fullName ?: "Customer"}"
        homeSummary.text = "${state.orders.size} orders · ${state.notifications.count { it.readAt == null }} unread notifications"
        quoteResult.text = state.quote?.let { "${it.vehicleType} · ${it.distanceKm} km · ${it.cargoTons} ton\n${money(it.totalEtb)}" } ?: "Calculate a backend-authoritative quote before ordering."
        createOrder.isEnabled = state.quote != null && !state.busy
        profileDetails.text = state.profile?.let { "${it.fullName.orEmpty()}\n${it.phone.orEmpty()}\n${it.email.orEmpty()}\n${it.homeAddress.orEmpty()}" }.orEmpty()
        renderOrders(state.orders)
        renderPayments(state.payments, state.orders)
        renderNotifications(state.notifications)
        trackingResult.text = state.liveTrip?.let { "Status: ${label(it.status)}\nTruck: ${it.truckLatitude ?: "—"}, ${it.truckLongitude ?: "—"}\nSpeed: ${it.speedKmh ?: "—"} km/h\nLast update: ${it.recordedAt ?: "—"}" } ?: "Choose Track on an active order."
    }

    private fun createCurrentOrder() = with(binding) {
        val quote = viewModel.state.value.quote ?: return@with
        fun number(field: EditText) = field.text.toString().toDoubleOrNull() ?: Double.NaN
        viewModel.createOrder(CreateOrderInput(
            pickupAddress.text.toString().trim(), number(pickupLongitude), number(pickupLatitude),
            dropoffAddress.text.toString().trim(), number(dropoffLongitude), number(dropoffLatitude),
            vehicleType.selectedItem.toString(), quote.distanceKm, quote.cargoTons,
            cargoDescription.text.toString().trim(), if (paymentMethod.selectedItemPosition == 0) "cash" else "bank_telebirr", quote.totalEtb,
        ))
    }

    private fun renderOrders(items: List<CustomerOrder>) {
        binding.ordersList.removeAllViews()
        if (items.isEmpty()) { binding.ordersList.addView(text("No orders yet")); return }
        items.forEach { order ->
            val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, 18, 0, 18) }
            box.addView(text("${order.trackingId ?: "Order"} · ${label(order.status)}\n${order.pickupAddress.orEmpty()} → ${order.dropoffAddress.orEmpty()}\n${money(order.priceEtb)} · Payment: ${label(order.paymentStatus)}"))
            if (order.status in setOf("accepted", "in_transit")) box.addView(button("Track driver") { viewModel.track(order) })
            if (CustomerPolicy.canCancel(order.status)) box.addView(button("Cancel order") { cancellationDialog(order) })
            binding.ordersList.addView(box)
        }
    }

    private fun renderPayments(items: List<CustomerPayment>, orders: List<CustomerOrder>) {
        binding.paymentsList.removeAllViews(); val tracking = orders.associate { it.id to it.trackingId }
        if (items.isEmpty()) { binding.paymentsList.addView(text("No payment records yet")); return }
        items.forEach { binding.paymentsList.addView(text("${tracking[it.orderId] ?: "Order"} · ${label(it.event)}\n${money(it.amountEtb)} · ${it.provider ?: "—"}\n${it.providerRef ?: "—"}")) }
    }

    private fun renderNotifications(items: List<CustomerNotification>) {
        binding.notificationsList.removeAllViews()
        if (items.isEmpty()) { binding.notificationsList.addView(text("No notifications")); return }
        items.forEach { item -> binding.notificationsList.addView(button("${if (item.readAt == null) "● " else ""}${item.title}\n${item.body}") { viewModel.markNotificationRead(item) }) }
    }

    private fun cancellationDialog(order: CustomerOrder) {
        val input = EditText(this).apply { hint = "Cancellation reason (5–500 characters)"; minLines = 2 }
        AlertDialog.Builder(this).setTitle("Cancel ${order.trackingId ?: "order"}").setView(input)
            .setNegativeButton("Keep order", null).setPositiveButton("Cancel order") { _, _ -> viewModel.cancelOrder(order, input.text.toString()) }.show()
    }

    private fun text(value: String) = TextView(this).apply { text = value; textSize = 15f; setPadding(4, 12, 4, 12) }
    private fun button(value: String, action: () -> Unit) = MaterialButton(this).apply { text = value; isAllCaps = false; setOnClickListener { action() } }
    private fun visible(value: Boolean) = if (value) View.VISIBLE else View.GONE
    private fun label(value: String?) = value?.replace('_', ' ')?.replaceFirstChar { it.uppercase() } ?: "Pending"
    private fun money(value: Double?) = if (value == null) "—" else "ETB ${NumberFormat.getIntegerInstance().format(value)}"
}
