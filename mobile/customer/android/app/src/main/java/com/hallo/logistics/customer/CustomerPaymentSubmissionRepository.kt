package com.hallo.logistics.customer

import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.storage.storage
import java.util.UUID
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class CustomerPaymentSubmissionRepository(
    private val customerRepository: CustomerRepository = CustomerRepository(),
) {
    private val client get() = HalloSupabase.client

    data class Receipt(
        val bytes: ByteArray,
        val mimeType: String,
        val extension: String,
    )

    suspend fun submit(
        orderId: String,
        provider: String,
        providerRef: String,
        amountEtb: Double,
        receipt: Receipt,
    ) {
        val customerId = customerRepository.requireCustomer()
        require(orderId.isNotBlank()) { "Choose an order" }
        require(provider.isNotBlank()) { "Choose a payment provider" }
        require(providerRef.trim().isNotBlank()) { "Enter the payment reference" }
        require(amountEtb.isFinite() && amountEtb > 0) { "Enter a payment amount greater than zero" }
        require(receipt.mimeType in allowedTypes) { "Receipt must be JPG, PNG, WebP or PDF" }
        require(receipt.bytes.isNotEmpty()) { "Receipt file is empty" }
        require(receipt.bytes.size <= MAX_RECEIPT_BYTES) { "Receipt must be 10 MB or smaller" }

        val extension = receipt.extension.lowercase().replace(Regex("[^a-z0-9]"), "").takeIf { it.isNotBlank() }
            ?: defaultExtension(receipt.mimeType)
        val path = "$customerId/$orderId/${UUID.randomUUID()}.$extension"

        client.storage.from(RECEIPT_BUCKET).upload(path, receipt.bytes) {
            upsert = false
        }
        try {
            client.postgrest.rpc(
                "customer_submit_payment",
                buildJsonObject {
                    put("p_order_id", orderId)
                    put("p_provider", provider)
                    put("p_provider_ref", providerRef.trim())
                    put("p_amount_etb", amountEtb)
                    put("p_receipt_path", path)
                },
            )
        } catch (error: Throwable) {
            runCatching { client.storage.from(RECEIPT_BUCKET).delete(path) }
            throw error
        }
    }

    private fun defaultExtension(mimeType: String) = when (mimeType) {
        "application/pdf" -> "pdf"
        "image/png" -> "png"
        "image/webp" -> "webp"
        else -> "jpg"
    }

    companion object {
        private const val RECEIPT_BUCKET = "payment-receipts"
        private const val MAX_RECEIPT_BYTES = 10 * 1024 * 1024
        val allowedTypes = setOf("image/jpeg", "image/png", "image/webp", "application/pdf")
    }
}
