package com.hallo.logistics.customer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class CustomerViewModel(private val repository: CustomerRepository = CustomerRepository()) : ViewModel() {
    private val _state = MutableStateFlow(CustomerUiState())
    val state = _state.asStateFlow()

    init { restoreSession() }

    fun restoreSession() = execute("Sign in with your HALLO Customer account") {
        if (repository.userId() == null) signedOut("Sign in with your HALLO Customer account") else authorizeAndLoad()
    }

    fun signUp(name: String, phone: String, email: String, pin: String, confirmation: String) {
        if (pin != confirmation) { fail("PIN numbers do not match"); return }
        execute("Creating Customer account…") {
            repository.signUp(name, phone, email, pin)
            if (repository.userId() == null) signedOut("Account created. Confirm your email if requested, then sign in.") else authorizeAndLoad()
        }
    }

    fun signIn(email: String, password: String) = execute("Signing in…") { repository.signIn(email, password); authorizeAndLoad() }
    fun signOut() = execute("Signing out…") { repository.signOut(); signedOut("Signed out") }
    fun show(page: CustomerPage) { _state.value = _state.value.copy(page = page, message = "") }
    fun refresh() = execute("Refreshing…") { authorizeAndLoad(preservePage = true) }

    fun calculateQuote(distanceKm: Double, vehicleType: String, cargoTons: Double) = execute("Calculating secure quote…") {
        val quote = repository.quote(QuoteInput(distanceKm, vehicleType, cargoTons))
        _state.value = _state.value.copy(busy = false, quote = quote, message = "Quote ready: ETB ${quote.totalEtb.toLong()}")
    }

    fun createOrder(input: CreateOrderInput) = execute("Creating order…") {
        val tracking = repository.createOrder(input); authorizeAndLoad(preservePage = true)
        _state.value = _state.value.copy(page = CustomerPage.ORDERS, message = "Order $tracking created")
    }

    fun cancelOrder(order: CustomerOrder, reason: String) {
        if (!CustomerPolicy.canCancel(order.status)) { fail("This order can no longer be cancelled"); return }
        execute("Cancelling order…") { repository.cancelOrder(order.id, reason); authorizeAndLoad(preservePage = true) }
    }

    fun track(order: CustomerOrder) = execute("Loading live tracking…") {
        val live = repository.liveTrip(order.id)
        _state.value = _state.value.copy(busy = false, page = CustomerPage.TRACKING, liveTrip = live, message = if (live == null) "Driver location is not available yet" else "Tracking updated")
    }

    fun markNotificationRead(item: CustomerNotification) = execute("Updating notification…") {
        repository.markNotificationRead(item.id); authorizeAndLoad(preservePage = true)
    }

    private suspend fun authorizeAndLoad(preservePage: Boolean = false) {
        repository.requireCustomer()
        val profile = viewModelScope.async { repository.profile() }
        val orders = viewModelScope.async { repository.orders() }
        val notifications = viewModelScope.async { repository.notifications() }
        val orderRows = orders.await()
        val payments = repository.payments(orderRows.map { it.id })
        _state.value = CustomerUiState(
            loading = false, authorized = true,
            page = if (preservePage) _state.value.page else CustomerPage.HOME,
            message = "Customer workspace", profile = profile.await(), orders = orderRows,
            payments = payments, notifications = notifications.await(), quote = _state.value.quote,
        )
    }

    private fun execute(message: String, action: suspend () -> Unit) {
        if (_state.value.busy) return
        _state.value = _state.value.copy(loading = false, busy = true, message = message)
        viewModelScope.launch {
            runCatching { action() }.onFailure { fail(it.message ?: "Customer request failed") }
            if (_state.value.busy) _state.value = _state.value.copy(busy = false)
        }
    }

    private fun signedOut(message: String) { _state.value = CustomerUiState(loading = false, message = message) }
    private fun fail(message: String) { _state.value = _state.value.copy(loading = false, busy = false, message = message) }
}
