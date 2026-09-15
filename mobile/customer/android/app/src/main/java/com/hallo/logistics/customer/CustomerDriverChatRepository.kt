package com.hallo.logistics.customer

import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import java.util.UUID
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class CustomerDriverChatMessage(
    val id: String,
    @SerialName("thread_id") val threadId: String,
    @SerialName("sender_id") val senderId: String,
    val body: String,
    @SerialName("client_message_id") val clientMessageId: String,
    @SerialName("created_at") val createdAt: String,
)

class CustomerDriverChatRepository(
    private val customerRepository: CustomerRepository = CustomerRepository(),
) {
    private val client get() = HalloSupabase.client

    suspend fun open(orderId: String): String {
        customerRepository.requireCustomer()
        return client.postgrest.rpc(
            "open_customer_driver_order_chat",
            buildJsonObject { put("p_order_id", orderId) },
        ).decodeAs<String>()
    }

    suspend fun messages(threadId: String): List<CustomerDriverChatMessage> {
        customerRepository.requireCustomer()
        return client.from("customer_driver_chat_messages").select(
            Columns.list("id,thread_id,sender_id,body,client_message_id,created_at"),
        ) {
            filter { eq("thread_id", threadId) }
            limit(300)
        }.decodeList<CustomerDriverChatMessage>().sortedBy { it.createdAt }
    }

    suspend fun send(threadId: String, body: String) {
        customerRepository.requireCustomer()
        val clean = body.trim()
        require(clean.isNotBlank()) { "Write a message first" }
        require(clean.length <= 4000) { "Message must be 4000 characters or fewer" }
        client.postgrest.rpc(
            "send_customer_driver_chat_message",
            buildJsonObject {
                put("p_thread_id", threadId)
                put("p_body", clean)
                put("p_client_message_id", UUID.randomUUID().toString())
            },
        )
    }

    suspend fun markRead(threadId: String) {
        customerRepository.requireCustomer()
        client.postgrest.rpc(
            "mark_customer_driver_chat_read",
            buildJsonObject { put("p_thread_id", threadId) },
        )
    }
}
