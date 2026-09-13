package com.hallo.logistics.driver

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class DriverCustomerContact(
    @SerialName("customer_name") val customerName:String,
    @SerialName("customer_phone") val customerPhone:String?=null,
)

@Serializable
data class DriverOperationsChatMessage(
    val id:String,
    @SerialName("thread_id") val threadId:String,
    @SerialName("sender_id") val senderId:String,
    val body:String,
    @SerialName("message_kind") val messageKind:String="text",
    @SerialName("order_id") val orderId:String?=null,
    @SerialName("client_message_id") val clientMessageId:String,
    @SerialName("created_at") val createdAt:String,
)

@Serializable
data class DriverCustomerChatMessage(
    val id:String,
    @SerialName("thread_id") val threadId:String,
    @SerialName("sender_id") val senderId:String,
    val body:String,
    @SerialName("client_message_id") val clientMessageId:String,
    @SerialName("created_at") val createdAt:String,
)

@Serializable
data class DriverTripDispute(
    val id:String,
    @SerialName("order_id") val orderId:String,
    @SerialName("driver_id") val driverId:String,
    val category:String,
    val details:String,
    val status:String,
    @SerialName("admin_note") val adminNote:String?=null,
    @SerialName("reviewed_by") val reviewedBy:String?=null,
    @SerialName("reviewed_at") val reviewedAt:String?=null,
    @SerialName("created_at") val createdAt:String?=null,
    @SerialName("updated_at") val updatedAt:String?=null,
)

enum class DriverCommunicationMode { CUSTOMER, OPERATIONS }

object DriverCommunicationsPolicy {
    val disputeCategories=listOf("payment","delivery","assignment","customer","safety","other")
    fun validMessage(value:String)=value.trim().length in 1..4000
    fun validDispute(value:String)=value.trim().length in 10..2000
    fun canDispute(status:String?)=status in setOf("accepted","in_transit","delivered")
}
