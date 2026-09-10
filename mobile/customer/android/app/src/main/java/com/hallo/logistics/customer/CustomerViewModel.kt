package com.hallo.logistics.customer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface CustomerUiEvent {
    data class OpenUrl(val url: String) : CustomerUiEvent
}

class CustomerViewModel(
    private val repository: CustomerRepository = CustomerRepository(),
    private val parityService: CustomerParityService = CustomerParityService(repository),
) : ViewModel() {
    private val _state = MutableStateFlow(CustomerUiState())
    val state = _state.asStateFlow()
    private val _events = MutableSharedFlow<CustomerUiEvent>(extraBufferCapacity = 2)
    val events = _events.asSharedFlow()
    private var pickupSearch: Job? = null
    private var dropoffSearch: Job? = null

    init { restoreSession() }

    fun restoreSession() = execute("Sign in with your HALLO Customer account") {
        if (repository.userId() == null) signedOut("Sign in with your HALLO Customer account") else authorizeAndLoad()
    }

    fun signUp(name: String, phone: String, email: String, pin: String, confirmation: String) {
        if (pin != confirmation) {
            fail("PIN numbers do not match")
            return
        }
        execute("Creating Customer account…") {
            repository.signUp(name, phone, email, pin)
            if (repository.userId() == null) {
                signedOut("Account created. Confirm your email if requested, then sign in.")
            } else {
                authorizeAndLoad()
            }
        }
    }

    fun signIn(email: String, password: String) = execute("Signing in…") {
        repository.signIn(email, password)
        authorizeAndLoad()
    }

    fun signOut() = execute("Signing out…") {
        repository.signOut()
        signedOut("Signed out")
    }

    fun show(page: CustomerPage) {
        _state.value = _state.value.copy(page = page, message = "")
    }

    fun bookingInputChanged() {
        _state.value = _state.value.copy(route = null, quote = null)
    }

    fun placeInputChanged(value: String, pickup: Boolean) {
        val clean = value.trim()
        val current = _state.value
        _state.value = if (pickup) {
            current.copy(
                route = null,
                quote = null,
                selectedPickup = current.selectedPickup?.takeIf { it.label.equals(clean, ignoreCase = true) },
            )
        } else {
            current.copy(
                route = null,
                quote = null,
                selectedDropoff = current.selectedDropoff?.takeIf { it.label.equals(clean, ignoreCase = true) },
            )
        }
        searchPlaces(value, pickup)
    }

    fun selectPlace(place: CustomerPlace, pickup: Boolean) {
        if (pickup) pickupSearch?.cancel() else dropoffSearch?.cancel()
        val current = _state.value
        _state.value = if (pickup) {
            current.copy(
                route = null,
                quote = null,
                selectedPickup = place,
                pickupSuggestions = emptyList(),
                placeSearchMessage = "",
            )
        } else {
            current.copy(
                route = null,
                quote = null,
                selectedDropoff = place,
                dropoffSuggestions = emptyList(),
                placeSearchMessage = "",
            )
        }
    }

    fun searchPlaces(query: String, pickup: Boolean) {
        val previous = if (pickup) pickupSearch else dropoffSearch
        previous?.cancel()
        if (query.trim().length < 2) {
            _state.value = if (pickup) {
                _state.value.copy(pickupSuggestions = emptyList())
            } else {
                _state.value.copy(dropoffSuggestions = emptyList())
            }
            return
        }
        val job = viewModelScope.launch {
            delay(280)
            val result = runCatching { repository.searchPlaces(query) }
            val suggestions = result.getOrElse { emptyList() }
            val searchMessage = result.exceptionOrNull()?.message
                ?: if (suggestions.isEmpty()) "No matching places found in the HALLO operating region" else ""
            _state.value = if (pickup) {
                _state.value.copy(pickupSuggestions = suggestions, placeSearchMessage = searchMessage)
            } else {
                _state.value.copy(dropoffSuggestions = suggestions, placeSearchMessage = searchMessage)
            }
        }
        if (pickup) pickupSearch = job else dropoffSearch = job
    }

    fun refresh() = execute("Refreshing…") {
        authorizeAndLoad(preservePage = true)
    }

    fun calculateQuote(distanceKm: Double, vehicleType: String, cargoTons: Double) = execute("Calculating secure quote…") {
        val quote = repository.quote(QuoteInput(distanceKm, vehicleType, cargoTons))
        _state.value = _state.value.copy(
            busy = false,
            quote = quote,
            message = "Quote ready: ETB ${quote.totalQuoteEtbCompat()}",
        )
    }

    fun calculateAutomaticRoute(
        pickup: String,
        dropoff: String,
        vehicleType: String,
        cargoTons: Double,
    ) = execute("Finding places and calculating the truck route…") {
        require(cargoTons > 0) { "Enter cargo weight" }
        val current = _state.value
        val route = repository.route(
            pickup,
            dropoff,
            vehicleType,
            current.selectedPickup,
            current.selectedDropoff,
        )
        val quote = repository.quote(QuoteInput(route.distanceKm, vehicleType, cargoTons))
        _state.value = _state.value.copy(
            busy = false,
            route = route,
            quote = quote,
            message = "Route ready: ${route.distanceKm} km · ${route.durationMinutes} min · ETB ${quote.totalQuoteEtbCompat()}",
        )
    }

    fun createOrder(input: CreateOrderInput) = execute("Creating order…") {
        val tracking = repository.createOrder(input)
        authorizeAndLoad(preservePage = true)
        _state.value = _state.value.copy(page = CustomerPage.ORDERS, message = "Order $tracking created")
    }

    fun cancelOrder(order: CustomerOrder, reason: String) {
        if (!CustomerPolicy.canCancel(order.status)) {
            fail("This order can no longer be cancelled")
            return
        }
        execute("Cancelling order…") {
            repository.cancelOrder(order.id, reason)
            authorizeAndLoad(preservePage = true)
        }
    }

    fun updateProfile(input: CustomerProfileUpdateInput) = execute("Saving customer profile…") {
        parityService.updateProfile(input)
        authorizeAndLoad(preservePage = true)
        _state.value = _state.value.copy(page = CustomerPage.PROFILE, message = "Customer profile updated")
    }

    fun openReceipt(payment: CustomerPayment) = execute("Opening receipt…") {
        val url = parityService.signedReceipt(payment.receiptPath) ?: error("Payment receipt is not available")
        _events.emit(CustomerUiEvent.OpenUrl(url))
        _state.value = _state.value.copy(busy = false, message = "")
    }

    fun track(order: CustomerOrder) = execute("Loading live tracking…") {
        refreshTrackedOrder(order.id, openTracking = true)
    }

    fun refreshTracking() {
        val order = _state.value.trackingOrder
            ?: _state.value.orders.firstOrNull { CustomerPolicy.showAssignment(it.status) }
            ?: return
        execute("Refreshing live tracking…") {
            refreshTrackedOrder(order.id, openTracking = true)
        }
    }

    fun markNotificationRead(item: CustomerNotification) = execute("Updating notification…") {
        repository.markNotificationRead(item.id)
        authorizeAndLoad(preservePage = true)
    }

    private suspend fun refreshTrackedOrder(orderId: String, openTracking: Boolean) {
        val freshOrder = parityService.ownOrder(orderId) ?: error("Customer order was not found")
        val live = repository.liveTrip(orderId)
        val assignments = repository.assignments()
        val assignment = assignments.firstOrNull { it.orderId == orderId }
        val currentMedia = _state.value.assignmentMedia[orderId]
        val media = if (assignment != null && currentMedia == null) {
            parityService.assignmentMedia(listOf(assignment))[orderId]
        } else {
            currentMedia
        }

        val route = if (_state.value.trackingOrder?.id == orderId && _state.value.trackingRoute != null) {
            _state.value.trackingRoute
        } else {
            runCatching {
                parityService.roadRoute(
                    live?.pickupLongitude,
                    live?.pickupLatitude,
                    live?.dropoffLongitude,
                    live?.dropoffLatitude,
                    freshOrder.vehicleType,
                )
            }.getOrNull()
        }

        val hasTruck = live?.truckLongitude != null && live.truckLatitude != null
        val freshness = CustomerPolicy.trackingFreshness(live?.recordedAt, hasTruck)
        val remaining = if (freshness == "LIVE") {
            runCatching {
                parityService.roadRoute(
                    live?.truckLongitude,
                    live?.truckLatitude,
                    live?.dropoffLongitude,
                    live?.dropoffLatitude,
                    freshOrder.vehicleType,
                )
            }.getOrNull()
        } else {
            null
        }

        val updatedOrders = _state.value.orders.map { if (it.id == freshOrder.id) freshOrder else it }
        val updatedMedia = _state.value.assignmentMedia.toMutableMap().apply {
            if (media != null) put(orderId, media)
        }
        _state.value = _state.value.copy(
            busy = false,
            page = if (openTracking) CustomerPage.TRACKING else _state.value.page,
            orders = updatedOrders,
            trackingOrder = freshOrder,
            liveTrip = live,
            assignments = assignments,
            assignmentMedia = updatedMedia,
            trackingRoute = route,
            remainingRoute = remaining,
            message = if (live == null || !hasTruck) {
                "Waiting for the driver to share the first GPS location"
            } else {
                "Tracking updated"
            },
        )
    }

    private suspend fun authorizeAndLoad(preservePage: Boolean = false) {
        repository.requireCustomer()
        val profile = viewModelScope.async { repository.profile() }
        val orders = viewModelScope.async { parityService.orders() }
        val notifications = viewModelScope.async { repository.notifications() }
        val assignmentsDeferred = viewModelScope.async { repository.assignments() }
        val orderRows = orders.await()
        val payments = repository.payments(orderRows.map { it.id })
        val assignments = assignmentsDeferred.await()
        val media = parityService.assignmentMedia(assignments)
        val current = _state.value

        _state.value = CustomerUiState(
            loading = false,
            authorized = true,
            page = if (preservePage) current.page else CustomerPage.HOME,
            message = "Customer workspace",
            profile = profile.await(),
            orders = orderRows,
            payments = payments,
            notifications = notifications.await(),
            quote = current.quote,
            assignments = assignments,
            assignmentMedia = media,
            trackingOrder = current.trackingOrder?.let { tracked -> orderRows.firstOrNull { it.id == tracked.id } },
            liveTrip = current.liveTrip,
            trackingRoute = current.trackingRoute,
            remainingRoute = current.remainingRoute,
            route = current.route,
            selectedPickup = current.selectedPickup,
            selectedDropoff = current.selectedDropoff,
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

    private fun signedOut(message: String) {
        _state.value = CustomerUiState(loading = false, message = message)
    }

    private fun fail(message: String) {
        _state.value = _state.value.copy(loading = false, busy = false, message = message)
    }

    private fun QuoteResult.totalQuoteEtbCompat(): Long = totalEtb.toLong()
}
