package com.hallo.logistics.customer

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Year
import java.util.UUID

class CustomerRepository {
    private val client get() = HalloSupabase.client
    private val json = Json { ignoreUnknownKeys = true }

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
        return client.from("payments").select(Columns.list("id,order_id,provider,provider_ref,amount_etb,event,receipt_path,created_at")) {
            filter { isIn("order_id", orderIds) }; order("created_at", io.github.jan.supabase.postgrest.query.Order.DESCENDING)
        }.decodeList()
    }

    suspend fun assignments(): List<CustomerAssignment> {
        requireCustomer()
        return client.postgrest.rpc("customer_driver_assignment_cards").decodeList()
    }

    suspend fun route(
        pickupQuery: String,
        dropoffQuery: String,
        vehicleType: String,
        selectedPickup: CustomerPlace? = null,
        selectedDropoff: CustomerPlace? = null,
    ): CustomerRoute {
        requireCustomer()
        val pickup = selectedPickup?.takeIf { it.matches(pickupQuery) } ?: geocode(pickupQuery)
        val dropoff = selectedDropoff?.takeIf { it.matches(dropoffQuery) } ?: geocode(dropoffQuery)
        require(pickup.longitude != dropoff.longitude || pickup.latitude != dropoff.latitude) { "Pickup and drop-off must be different places" }
        val session = client.auth.currentSessionOrNull() ?: error("Customer session expired")
        val response = postJson(
            "${BuildConfig.SUPABASE_URL.trimEnd('/')}/functions/v1/quote-route",
            buildJsonObject {
                put("pickup", JsonArray(listOf(JsonPrimitive(pickup.longitude), JsonPrimitive(pickup.latitude))))
                put("dropoff", JsonArray(listOf(JsonPrimitive(dropoff.longitude), JsonPrimitive(dropoff.latitude))))
                put("vehicleType", vehicleType)
            }.toString(),
            mapOf("Authorization" to "Bearer ${session.accessToken}", "apikey" to BuildConfig.SUPABASE_PUBLISHABLE_KEY),
        )
        val root = json.parseToJsonElement(response).jsonObject
        require(root["provider"]?.jsonPrimitive?.contentOrNull == "openrouteservice") { "Truck routing returned an unexpected provider" }
        require(root["profile"]?.jsonPrimitive?.contentOrNull == "driving-hgv") { "Truck routing did not return an HGV route" }
        val distance = root["distanceKm"]?.jsonPrimitive?.doubleOrNull ?: error("Route distance was not returned")
        val duration = root["durationMinutes"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: error("Route duration was not returned")
        val points = root["coordinates"]?.jsonArray?.mapNotNull { element ->
            val pair = element as? JsonArray ?: return@mapNotNull null
            val lng = pair.getOrNull(0)?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            val lat = pair.getOrNull(1)?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            lng to lat
        }.orEmpty()
        require(distance > 0 && duration > 0 && points.size >= 2) { "Truck routing returned an invalid route" }
        return CustomerRoute(pickup, dropoff, vehicleType, distance, duration, points)
    }

    suspend fun signedDriverPhoto(path: String?): String? {
        val clean = path?.trim().orEmpty()
        if (clean.isBlank()) return null
        requireCustomer()
        val session = client.auth.currentSessionOrNull() ?: error("Customer session expired")
        val encodedPath = clean.split('/').joinToString("/") { URLEncoder.encode(it, StandardCharsets.UTF_8.name()).replace("+", "%20") }
        val body = postJson(
            "${BuildConfig.SUPABASE_URL.trimEnd('/')}/storage/v1/object/sign/driver-verification/$encodedPath",
            "{\"expiresIn\":300}",
            mapOf("Authorization" to "Bearer ${session.accessToken}", "apikey" to BuildConfig.SUPABASE_PUBLISHABLE_KEY),
        )
        val signed = json.parseToJsonElement(body).jsonObject["signedURL"]?.jsonPrimitive?.contentOrNull
            ?: json.parseToJsonElement(body).jsonObject["signedUrl"]?.jsonPrimitive?.contentOrNull
            ?: return null
        return if (signed.startsWith("http")) signed else "${BuildConfig.SUPABASE_URL.trimEnd('/')}/storage/v1$signed"
    }

    suspend fun searchPlaces(query: String): List<CustomerPlace> {
        val clean = query.trim()
        if (clean.length < 2) return emptyList()
        require(BuildConfig.MAPTILER_KEY.isNotBlank()) { "Configure MAPTILER_KEY to search places automatically" }
        val encoded = URLEncoder.encode(clean, StandardCharsets.UTF_8.name())
        val url = "https://api.maptiler.com/geocoding/$encoded.json?key=${URLEncoder.encode(BuildConfig.MAPTILER_KEY, StandardCharsets.UTF_8.name())}&limit=6&language=en&country=et,dj,so&autocomplete=true&types=continental_marine,country,major_landform&excludeTypes=true"
        val root = json.parseToJsonElement(get(url)).jsonObject
        return root["features"]?.jsonArray.orEmpty().mapNotNull { item ->
            val feature = item as? JsonObject ?: return@mapNotNull null
            val center = feature["center"] as? JsonArray ?: return@mapNotNull null
            val longitude = center.getOrNull(0)?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            val latitude = center.getOrNull(1)?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            if (!isOperatingCoordinate(longitude, latitude)) return@mapNotNull null
            val label = feature["place_name"]?.jsonPrimitive?.contentOrNull ?: feature["text"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            CustomerPlace(label.trim(), longitude, latitude)
        }.distinctBy { it.label.lowercase() }.take(6)
    }

    private suspend fun geocode(query: String): CustomerPlace = searchPlaces(query).firstOrNull()
        ?: error("Place was not found in the HALLO operating region")

    private fun CustomerPlace.matches(query: String): Boolean =
        label.equals(query.trim(), ignoreCase = true) && isOperatingCoordinate(longitude, latitude)

    private fun isOperatingCoordinate(longitude: Double, latitude: Double): Boolean =
        (longitude in 32.8..48.1 && latitude in 3.0..15.2) ||
            (longitude in 41.6..43.6 && latitude in 10.8..12.9) ||
            (longitude in 40.8..51.7 && latitude in -1.9..12.3)

    private suspend fun get(url: String) = request(url, "GET", null, emptyMap())

    private suspend fun postJson(url: String, body: String, headers: Map<String, String>) = request(url, "POST", body, headers)

    private suspend fun request(url: String, method: String, body: String?, headers: Map<String, String>): String = withContext(Dispatchers.IO) {
        val connection = URI(url).toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "HALLO-Customer-Android/1")
            headers.forEach(connection::setRequestProperty)
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
            }
            val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
            val result = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (connection.responseCode !in 200..299) {
                val message = runCatching { json.parseToJsonElement(result).jsonObject["error"]?.jsonPrimitive?.contentOrNull }.getOrNull()
                error(message ?: "Customer network request failed (${connection.responseCode})")
            }
            result
        } finally {
            connection.disconnect()
        }
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
        require(input.cargoQuantity > 0 && input.cargoUnit in setOf("ton", "quintal")) { "Enter a valid cargo quantity and unit" }
        require(input.cargoCategory.isNotBlank() && input.packagingType.isNotBlank()) { "Choose cargo category and packaging" }
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
            input.cargoQuantity, cargoUnit = input.cargoUnit, cargoCategory = input.cargoCategory,
            packagingType = input.packagingType, cargoDescription = input.cargoDescription,
            priceEtb = verifiedQuote.totalEtb,
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

