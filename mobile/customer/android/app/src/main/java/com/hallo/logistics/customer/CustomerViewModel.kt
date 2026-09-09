package com.hallo.logistics.customer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay

class CustomerViewModel(private val repository: CustomerRepository = CustomerRepository()) : ViewModel() {
    private val _state = MutableStateFlow(CustomerUiState())
    val state = _state.asStateFlow()
    private var pickupSearch: Job? = null
    private var dropoffSearch: Job? = null

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
    fun bookingInputChanged() { _state.value = _state.value.copy(route = null, quote = null) }

    fun placeInputChanged(value: String, pickup: Boolean) {
        val clean = value.trim()
        val current = _state.value
        _state.value = if (pickup) current.copy(
            route = null,
            quote = null,
            selectedPickup = current.selectedPickup?.takeIf { it.label.equals(clean, ignoreCase = true) },
        ) else current.copy(
            route = null,
            quote = null,
            selectedDropoff = current.selectedDropoff?.takeIf { it.label.equals(clean, ignoreCase = true) },
        )
        searchPlaces(value, pickup)
    }

    fun selectPlace(place: CustomerPlace, pickup: Boolean) {
        if (pickup) pickupSearch?.cancel() else dropoffSearch?.cancel()
        val current = _state.value
        _state.value = if (pickup) current.copy(
            route = null, quote = null, selectedPickup = place,
            pickupSuggestions = emptyList(), placeSearchMessage = "",
        ) else current.copy(
            route = null, quote = null, selectedDropoff = place,
            dropoffSuggestions = emptyList(), placeSearchMessage = "",
        )
    }

    fun searchPlaces(query: String, pickup: Boolean) {
        val previous = if (pickup) pickupSearch else dropoffSearch
        previous?.cancel()
        if (query.trim().length < 2) {
            _state.value = if (pickup) _state.value.copy(pickupSuggestions = emptyList()) else _state.value.copy(dropoffSuggestions = emptyList())
            return
        }
        val job = viewModelScope.launch {
            delay(280)
            val result = runCatching { repository.searchPlaces(query) }
            val suggestions = result.getOrElse { emptyList() }
            val searchMessage = result.exceptionOrNull()?.message
                ?: if (suggestions.isEmpty()) "No matching places found in the HALLO operating region" else ""
            _state.value = if (pickup) _state.value.copy(pickupSuggestions = suggestions, placeSearchMessage = searchMessage)
            else _state.value.copy(dropoffSuggestions = suggestions, placeSearchMessage = searchMessage)
        }
        if (pickup) pickupSearch = job else dropoffSearch = job
    }
    fun refresh() = execute("Refreshing…") { authorizeAndLoad(preservePage = true) }

    fun calculateQuote(distanceKm: Double, vehicleType: String, cargoTons: Double) = execute("Calculating secure quote…") {
        val quote = repository.quote(QuoteInput(distanceKm, vehicleType, cargoTons))
        _state.value = _state.value.copy(busy = false, quote = quote, message = "Quote ready: ETB ${quote.totalEtb.toLong()}")
    }

    fun calculateAutomaticRoute(pickup: String, dropoff: String, vehicleType: String, cargoTons: Double) = execute("Finding places and calculating the truck route…") {
        require(cargoTons > 0) { "Enter cargo weight" }
        val current = _state.value
        val route = repository.route(pickup, dropoff, vehicleType, current.selectedPickup, current.selectedDropoff)
        val quote = repository.quote(QuoteInput(route.distanceKm, vehicleType, cargoTons))
        _state.value = _state.value.copy(
            busy = false,
            route = route,
            quote = quote,
            message = "Route ready: ${route.distanceKm} km · ${route.durationMinutes} min · ETB ${quote.totalEtb.toLong()}",
        )
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
        val assignment = _state.value.assignments.firstOrNull { it.orderId == order.id }
        val photo = runCatching { repository.signedDriverPhoto(assignment?.driverPhotoPath) }.getOrNull()
        _state.value = _state.value.copy(busy = false, page = CustomerPage.TRACKING, trackingOrder = order, liveTrip = live, driverPhotoUrl = photo, message = if (live == null) "Driver location is not available yet" else "Tracking updated")
    }

    fun refreshTracking() {
        val order = _state.value.trackingOrder ?: _state.value.orders.firstOrNull { it.status in setOf("accepted", "in_transit") } ?: return
        track(order)
    }

    fun markNotificationRead(item: CustomerNotification) = execute("Updating notification…") {
        repository.markNotificationRead(item.id); authorizeAndLoad(preservePage = true)
    }

    private suspend fun authorizeAndLoad(preservePage: Boolean = false) {
        repository.requireCustomer()
        val profile = viewModelScope.async { repository.profile() }
        val orders = viewModelScope.async { repository.orders() }
        val notifications = viewModelScope.async { repository.notifications() }
        val assignments = viewModelScope.async { repository.assignments() }
        val orderRows = orders.await()
        val payments = repository.payments(orderRows.map { it.id })
        _state.value = CustomerUiState(
            loading = false, authorized = true,
            page = if (preservePage) _state.value.page else CustomerPage.HOME,
            message = "Customer workspace", profile = profile.await(), orders = orderRows,
            payments = payments, notifications = notifications.await(), quote = _state.value.quote,
            assignments = assignments.await(), trackingOrder = _state.value.trackingOrder,
            liveTrip = _state.value.liveTrip, route = _state.value.route,
            driverPhotoUrl = _state.value.driverPhotoUrl,
            selectedPickup = _state.value.selectedPickup,
            selectedDropoff = _state.value.selectedDropoff,
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

