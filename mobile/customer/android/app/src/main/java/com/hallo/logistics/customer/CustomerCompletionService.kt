package com.hallo.logistics.customer

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

@Serializable
data class CustomerDeliveryProofRecord(
    @SerialName("order_id") val orderId: String,
    @SerialName("recipient_name") val recipientName: String? = null,
    @SerialName("delivery_note") val deliveryNote: String? = null,
    @SerialName("photo_path") val photoPath: String? = null,
    @SerialName("signature_path") val signaturePath: String? = null,
    @SerialName("delivered_at") val deliveredAt: String? = null,
)

@Serializable
data class CustomerRatingRecord(
    val id: String,
    @SerialName("order_id") val orderId: String,
    val score: Int,
    val comment: String? = null,
)

data class CustomerCompletionSnapshot(
    val proofs: Map<String, CustomerDeliveryProofRecord> = emptyMap(),
    val ratings: Map<String, CustomerRatingRecord> = emptyMap(),
)

class CustomerCompletionService(
    private val repository: CustomerRepository = CustomerRepository(),
) {
    private val client get() = HalloSupabase.client
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun load(orderIds: List<String>): CustomerCompletionSnapshot = coroutineScope {
        repository.requireCustomer()
        val ids = orderIds.map(String::trim).filter(String::isNotBlank).distinct()
        if (ids.isEmpty()) return@coroutineScope CustomerCompletionSnapshot()

        val proofsDeferred = async {
            client.from("delivery_proofs").select(
                Columns.list("order_id,recipient_name,delivery_note,photo_path,signature_path,delivered_at"),
            ) {
                filter { isIn("order_id", ids) }
            }.decodeList<CustomerDeliveryProofRecord>()
        }
        val ratingsDeferred = async {
            client.from("ratings").select(Columns.list("id,order_id,score,comment")) {
                filter { isIn("order_id", ids) }
            }.decodeList<CustomerRatingRecord>()
        }

        CustomerCompletionSnapshot(
            proofs = proofsDeferred.await().associateBy { it.orderId },
            ratings = ratingsDeferred.await().associateBy { it.orderId },
        )
    }

    suspend fun submitRating(orderId: String, score: Int, comment: String) {
        repository.requireCustomer()
        require(orderId.isNotBlank()) { "Customer order is required" }
        val clean = CustomerCompletionPolicy.rating(score, comment)
        client.postgrest.rpc("customer_submit_rating", buildJsonObject {
            put("p_order_id", orderId)
            put("p_score", clean.score)
            if (clean.comment == null) put("p_comment", JsonNull) else put("p_comment", clean.comment)
        })
    }

    suspend fun signedDeliveryProof(path: String?): String? = signedObject("delivery-proofs", path, 300)

    private suspend fun signedObject(bucket: String, path: String?, expiresInSeconds: Int): String? {
        val clean = path?.trim().orEmpty()
        if (clean.isBlank()) return null
        require(!clean.contains("..")) { "Invalid delivery proof path" }
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
                error(message ?: "Customer delivery request failed (${connection.responseCode})")
            }
            result
        } finally {
            connection.disconnect()
        }
    }
}
