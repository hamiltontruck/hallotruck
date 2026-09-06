package com.hallo.logistics.customer

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable data class CustomerProfile(
    val id: String,
    @SerialName("full_name") val fullName: String? = null,
    val phone: String? = null,
    val email: String? = null,
    @SerialName("home_address") val homeAddress: String? = null,
    val role: String? = null,
)

@Serializable data class CustomerOrder(
    val id: String,
    @SerialName("tracking_id") val trackingId: String? = null,
    @SerialName("pickup_address") val pickupAddress: String? = null,
    @SerialName("dropoff_address") val dropoffAddress: String? = null,
    @SerialName("vehicle_type") val vehicleType: String? = null,
    @SerialName("distance_km") val distanceKm: Double? = null,
    @SerialName("price_etb") val priceEtb: Double? = null,
    val status: String? = null,
    @SerialName("payment_status") val paymentStatus: String? = null,
    @SerialName("selected_payment_method") val paymentMethod: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable data class CustomerPayment(
    val id: String,
    @SerialName("order_id") val orderId: String,
    val provider: String? = null,
    @SerialName("provider_ref") val providerRef: String? = null,
    @SerialName("amount_etb") val amountEtb: Double? = null,
    val event: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable data class CustomerNotification(
    val id: String,
    @SerialName("event_type") val eventType: String,
    val title: String,
    val body: String,
    @SerialName("read_at") val readAt: String? = null,
    @SerialName("created_at") val createdAt: String,
)

@Serializable data class CustomerLiveTrip(
    @SerialName("order_id") val orderId: String,
    val status: String? = null,
    @SerialName("truck_lng") val truckLongitude: Double? = null,
    @SerialName("truck_lat") val truckLatitude: Double? = null,
    @SerialName("speed_kmh") val speedKmh: Double? = null,
    @SerialName("recorded_at") val recordedAt: String? = null,
)

data class QuoteInput(val distanceKm: Double, val vehicleType: String, val cargoTons: Double)
data class QuoteResult(val distanceKm: Double, val vehicleType: String, val cargoTons: Double, val totalEtb: Double)
data class CreateOrderInput(
    val pickupAddress: String, val pickupLongitude: Double, val pickupLatitude: Double,
    val dropoffAddress: String, val dropoffLongitude: Double, val dropoffLatitude: Double,
    val vehicleType: String, val distanceKm: Double, val cargoTons: Double,
    val cargoDescription: String, val paymentMethod: String, val quoteEtb: Double,
)

enum class CustomerPage { HOME, BOOK, ORDERS, TRACKING, PAYMENTS, NOTIFICATIONS, PROFILE }

data class CustomerUiState(
    val loading: Boolean = true,
    val authorized: Boolean = false,
    val busy: Boolean = false,
    val page: CustomerPage = CustomerPage.HOME,
    val message: String = "Restoring session…",
    val profile: CustomerProfile? = null,
    val orders: List<CustomerOrder> = emptyList(),
    val payments: List<CustomerPayment> = emptyList(),
    val notifications: List<CustomerNotification> = emptyList(),
    val liveTrip: CustomerLiveTrip? = null,
    val quote: QuoteResult? = null,
)
