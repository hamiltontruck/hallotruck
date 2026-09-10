package com.hallo.logistics.customer

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

class CustomerParityService(
    private val repository: CustomerRepository = CustomerRepository(),
) {
    private val client get() = HalloSupabase.client
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun orders(): List<CustomerOrder> {
        val customerId = repository.requireCustomer()
        return client.from("orders").select(
            Columns.list(
                "id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,price_etb,status," +
                    "payment_status,payment_provider,payment_ref,payment_terms,selected_payment_method," +
                    "cargo_quantity,cargo_unit,cargo_description,cancellation_reason,cancellation_source,cancelled_at,created_at",
            ),
        ) {
            filter { eq("customer_id", customerId) }
            order("created_at", io.github.jan.supabase.postgrest.query.Order.DESCENDING)
        }.decodeList()
    }

    suspend fun ownOrder(orderId: String): CustomerOrder? {
        val customerId = repository.requireCustomer()
        return client.from("orders").select(
            Columns.list(
                "id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,price_etb,status," +
                    "payment_status,payment_provider,payment_ref,payment_terms,selected_payment_method," +
                    "cargo_quantity,cargo_unit,cargo_description,cancellation_reason,cancellation_source,cancelled_at,created_at",
            ),
        ) {
            filter {
                eq("id", orderId)
                eq("customer_id", customerId)
            }
            limit(1)
        }.decodeSingleOrNull()
    }

    suspend fun updateProfile(input: CustomerProfileUpdateInput) {
        repository.requireCustomer()
        val clean = CustomerProfilePolicy.validate(input)
        client.postgrest.rpc("customer_update_profile", buildJsonObject {
            put("p_full_name", clean.fullName)
            put("p_phone", clean.phone)
            put("p_email", clean.email.takeIf { it.isNotBlank() })
            put("p_home_address", clean.homeAddress.takeIf { it.isNotBlank() })
            put("p_customer_type", clean.customerType)
            put("p_company_name", clean.companyName.takeIf { clean.customerType == "business" && it.isNotBlank() })
        })
    }

    suspend fun assignmentMedia(assignments: List<CustomerAssignment>): Map<String, CustomerAssignmentMedia> = coroutineScope {
        assignments.map { assignment ->
            async {
                val driverPhoto = if (assignment.driverVerified == true) {
                    runCatching { signedObject("driver-verification", assignment.driverPhotoPath, 3600) }.getOrNull()
                } else null
                val truckPhoto = runCatching { signedObject("driver-verification", assignment.truckPhotoPath, 3600) }.getOrNull()
                assignment.orderId to CustomerAssignmentMedia(driverPhoto, truckPhoto)
            }
        }.awaitAll().toMap()
    }

    suspend fun signedReceipt(path: String?): String? = signedObject("payment-receipts", path, 300)

    suspend fun roadRoute(
        fromLongitude: Double?,
        fromLatitude: Double?,
        toLongitude: Double?,
        toLatitude: Double?,
    ): CustomerRoadRoute? {
        repository.requireCustomer()
        if (fromLongitude == null || fromLatitude == null || toLongitude == null || toLatitude == null) return null
        if (!fromLongitude.isFinite() || !fromLatitude.isFinite() || !toLongitude.isFinite() || !toLatitude.isFinite()) return null
        val body = request(
            "https://router.project-osrm.org/route/v1/driving/$fromLongitude,$fromLatitude;$toLongitude,$toLatitude?overview=full&geometries=geojson&steps=false",
            "GET",
            null,
            emptyMap(),
        )
        val route = json.parseToJsonElement(body).jsonObject["routes"]?.jsonArray?.firstOrNull()?.jsonObject ?: return null
        val distanceMeters = route["distance"]?.jsonPrimitive?.doubleOrNull ?: return null
        val durationSeconds = route["duration"]?.jsonPrimitive?.doubleOrNull ?: return null
        val coordinates = route["geometry"]?.jsonObject?.get("coordinates")?.jsonArray.orEmpty().mapNotNull { point ->
            val pair = point as? JsonArray ?: return@mapNotNull null
            val longitude = pair.getOrNull(0)?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            val latitude = pair.getOrNull(1)?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            longitude to latitude
        }
        if (coordinates.size < 2) return null
        return CustomerRoadRoute(
            distanceKm = distanceMeters / 1000.0,
            durationSeconds = durationSeconds,
            coordinates = coordinates,
        )
    }

    private suspend fun signedObject(bucket: String, path: String?, expiresInSeconds: Int): String? {
        val clean = path?.trim().orEmpty()
        if (clean.isBlank()) return null
        repository.requireCustomer()
        val session = client.auth.currentSessionOrNull() ?: error("Customer session expired")
        val encodedPath = clean.split('/').joinToString("/") {
            URLEncoder.encode(it, StandardCharsets.UTF_8.name()).replace("+", "%20")
        }
        val response = request(
            "${BuildConfig.SUPABASE_URL.trimEnd('/')}/storage/v1/object/sign/$bucket/$encodedPath",
            "POST",
            "{\"expiresIn\":$expiresInSeconds}",
            mapOf(
                "Authorization" to "Bearer ${session.accessToken}",
                "apikey" to BuildConfig.SUPABASE_PUBLISHABLE_KEY,
            ),
        )
        val root = json.parseToJsonElement(response).jsonObject
        val signed = root["signedURL"]?.jsonPrimitive?.contentOrNull
            ?: root["signedUrl"]?.jsonPrimitive?.contentOrNull
            ?: return null
        return if (signed.startsWith("http")) signed else "${BuildConfig.SUPABASE_URL.trimEnd('/')}/storage/v1$signed"
    }

    private suspend fun request(
        url: String,
        method: String,
        body: String?,
        headers: Map<String, String>,
    ): String = withContext(Dispatchers.IO) {
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
                val message = runCatching {
                    json.parseToJsonElement(result).jsonObject["error"]?.jsonPrimitive?.contentOrNull
                }.getOrNull()
                error(message ?: "Customer network request failed (${connection.responseCode})")
            }
            result
        } finally {
            connection.disconnect()
        }
    }
}
