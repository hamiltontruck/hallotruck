package com.hallo.logistics.customer

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Year
import java.util.UUID

class CustomerRepository {
    private val client get() = HalloSupabase.client

    @Serializable private data class RoleRow(val role: String? = null)
    @Serializable private data class QuoteRow(
        @SerialName("distance_km") val distanceKm: Double,
        @SerialName("vehicle_type") val vehicleType: String,
        @SerialName("cargo_tons") val cargoTons: Double,
        @SerialName("total_quote_etb") val totalQuoteEtb: Double,
    )
    @Serializable private data class OrderInsert(
        @SerialName("tracking_id") val trackingId: String,
        @SerialName("customer_id") val customerId: String,
        @SerialName("customer_name") val customerName: String,
        @SerialName("customer_phone") val customerPhone: String,
        @SerialName("pickup_address") val pickupAddress: String,
        val pickup: String,
        @SerialName("dropoff_address") val dropoffAddress: String,
        val dropoff: String,
        @SerialName("vehicle_type") val vehicleType: String,
        @SerialName("distance_km") val distanceKm: Double,
        @SerialName("cargo_quantity") val cargoQuantity: Double,
        @SerialName("cargo_unit") val cargoUnit: String = "ton",
        @SerialName("cargo_category") val cargoCategory: String = "general_goods",
        @SerialName("packaging_type") val packagingType: String = "loose_bulk",
        @SerialName("cargo_description") val cargoDescription: String,
        @SerialName("price_etb") val priceEtb: Double,
        @SerialName("selected_payment_method") val selectedPaymentMethod: String,
        @SerialName("payment_terms") val paymentTerms: String = "pay_driver_on_delivery",
        val status: String = "placed",
    )
    @Serializable private data class CreatedOrder(val id: String, @SerialName("tracking_id") val trackingId: String)

    suspend fun signUp(fullName: String, phone: String, email: String, pin: String) {
        require(CustomerPolicy.isSixDigitPin(pin)) { "PIN must be exactly 6 digits" }
        val cleanName = fullName.trim().replace(Regex("\\s+"), " ")
        require(cleanName.length in 2..120) { "Enter your full name" }
        val normalizedPhone = CustomerPolicy.normalizePhone(phone)
        client.auth.signUpWith(Email) {
            this.email = email.trim().lowercase()
            password = pin
            data = buildJsonObject {
                put("full_name", cleanName)
                put("phone", normalizedPhone)
                put("role", "customer")
            }
        }
    }

    suspend fun signIn(email: String, password: String) {
        client.auth.signInWith(Email) { this.email = email.trim().lowercase(); this.password = password }
    }

    suspend fun signOut() = client.auth.signOut()
    fun userId() = client.auth.currentUserOrNull()?.id

    suspend fun requireCustomer(): String {
        val id = userId() ?: error("Customer session expired")
        val role = client.from("profiles").select(Columns.list("role")) { filter { eq("id", id) } }.decodeSingleOrNull<RoleRow>()
        if (!CustomerPolicy.isCustomer(role?.role)) { client.auth.signOut(); error("This account is not authorized for HALLO Customer") }
        return id
    }

    suspend fun profile(): CustomerProfile {
        val id = requireCustomer()
        val row = client.postgrest.rpc("customer_get_profile").decodeList<CustomerProfile>().firstOrNull() ?: error("Customer profile was not found")
        require(row.id == id) { "Customer profile ownership mismatch" }
        return row
    }

    suspend fun orders(): List<CustomerOrder> {
        val id = requireCustomer()
        return client.from("orders").select(Columns.list("id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,price_etb,status,payment_status,selected_payment_method,created_at")) {
            filter { eq("customer_id", id) }; order("created_at", io.github.jan.supabase.postgrest.query.Order.DESCENDING)
        }.decodeList()
    }

    suspend fun payments(orderIds: List<String>): List<CustomerPayment> {
        requireCustomer()
        if (orderIds.isEmpty()) return emptyList()
        return client.from("payments").select(Columns.list("id,order_id,provider,provider_ref,amount_etb,event,created_at")) {
            filter { isIn("order_id", orderIds) }; order("created_at", io.github.jan.supabase.postgrest.query.Order.DESCENDING)
        }.decodeList()
    }

    suspend fun notifications(): List<CustomerNotification> {
        requireCustomer()
        return client.postgrest.rpc("my_notifications", buildJsonObject { put("p_limit", 100) }).decodeList()
    }

    suspend fun markNotificationRead(id: String) {
        requireCustomer(); client.postgrest.rpc("mark_notification_read", buildJsonObject { put("p_notification_id", id) })
    }

    suspend fun quote(input: QuoteInput): QuoteResult {
        requireCustomer(); require(input.distanceKm > 0 && input.cargoTons > 0) { "Distance and cargo must be greater than zero" }
        val row = client.postgrest.rpc("calculate_transport_quote_v2", buildJsonObject {
            put("p_distance_km", input.distanceKm); put("p_vehicle_type", input.vehicleType); put("p_cargo_tons", input.cargoTons)
        }).decodeList<QuoteRow>().firstOrNull() ?: error("Quote calculation returned no result")
        require(row.totalQuoteEtb > 0) { "Quote total is invalid" }
        return QuoteResult(row.distanceKm, row.vehicleType, row.cargoTons, row.totalQuoteEtb)
    }

    suspend fun createOrder(input: CreateOrderInput): String {
        val id = requireCustomer(); val customer = profile()
        require(input.quoteEtb > 0 && input.distanceKm > 0 && input.cargoTons > 0) { "Calculate a valid quote first" }
        require(input.pickupAddress.length >= 2 && input.dropoffAddress.length >= 2) { "Enter pickup and drop-off addresses" }
        require(input.pickupLatitude.isFinite() && input.pickupLatitude in -90.0..90.0 && input.pickupLongitude.isFinite() && input.pickupLongitude in -180.0..180.0) { "Pickup coordinates are invalid" }
        require(input.dropoffLatitude.isFinite() && input.dropoffLatitude in -90.0..90.0 && input.dropoffLongitude.isFinite() && input.dropoffLongitude in -180.0..180.0) { "Drop-off coordinates are invalid" }
        require(input.cargoDescription.length in 3..500) { "Describe the cargo using 3–500 characters" }
        require(input.paymentMethod in setOf("cash", "bank_telebirr")) { "Choose a valid payment method" }
        val verifiedQuote = quote(QuoteInput(input.distanceKm, input.vehicleType, input.cargoTons))
        require(kotlin.math.abs(verifiedQuote.totalEtb - input.quoteEtb) < 0.01) { "Quote changed. Calculate it again" }
        val tracking = "HT-${Year.now().value}-${UUID.randomUUID().toString().replace("-", "").take(6).uppercase()}"
        val row = client.from("orders").insert(OrderInsert(
            tracking, id, customer.fullName ?: "Customer", customer.phone.orEmpty(), input.pickupAddress,
            "POINT(${input.pickupLongitude} ${input.pickupLatitude})", input.dropoffAddress,
            "POINT(${input.dropoffLongitude} ${input.dropoffLatitude})", input.vehicleType, input.distanceKm,
            input.cargoTons, cargoDescription = input.cargoDescription, priceEtb = verifiedQuote.totalEtb,
            selectedPaymentMethod = input.paymentMethod,
        )) { select(Columns.list("id,tracking_id")) }.decodeSingle<CreatedOrder>()
        return row.trackingId
    }

    suspend fun cancelOrder(orderId: String, reason: String) {
        requireCustomer(); val clean = reason.trim(); require(clean.length in 5..500) { "Cancellation reason must contain 5–500 characters" }
        client.postgrest.rpc("customer_cancel_order", buildJsonObject { put("p_order_id", orderId); put("p_reason", clean) })
    }

    suspend fun liveTrip(orderId: String): CustomerLiveTrip? {
        requireCustomer()
        return client.postgrest.rpc("customer_get_live_trip", buildJsonObject { put("p_order_id", orderId) }).decodeList<CustomerLiveTrip>().firstOrNull()
    }
}
