package com.hallo.logistics.driver

import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import java.util.UUID
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class DriverCommunicationsRepository {
    private val client get()=HalloSupabase.client

    fun userId():String?=client.auth.currentUserOrNull()?.id

    suspend fun eligibleOrders():List<DriverJob>{
        val id=DriverRepository().profile().id
        return client.from("orders").select(Columns.list("id,driver_id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,price_etb,selected_payment_method,cargo_description,payment_terms,accepted_at,delivered_at,truck_id,status")){
            filter{eq("driver_id",id);isIn("status",listOf("accepted","in_transit","delivered"))};limit(50)
        }.decodeList<DriverJob>().sortedByDescending{it.deliveredAt?:it.acceptedAt.orEmpty()}
    }

    suspend fun customerContact(orderId:String):DriverCustomerContact{
        DriverRepository().profile()
        return client.postgrest.rpc("driver_order_contact",buildJsonObject{put("p_order_id",orderId)})
            .decodeList<DriverCustomerContact>().firstOrNull()?:error("Customer contact is unavailable for this order")
    }

    suspend fun openOperationsChat():String{
        DriverRepository().profile()
        return client.postgrest.rpc("driver_get_or_create_chat_thread").decodeAs<String>()
    }

    suspend fun operationsMessages(threadId:String):List<DriverOperationsChatMessage>{
        DriverRepository().profile()
        return client.from("driver_chat_messages").select(Columns.list("id,thread_id,sender_id,body,message_kind,order_id,client_message_id,created_at")){
            filter{eq("thread_id",threadId)};limit(300)
        }.decodeList<DriverOperationsChatMessage>().sortedBy{it.createdAt}
    }

    suspend fun sendOperationsMessage(threadId:String,body:String,orderId:String?){
        DriverRepository().profile();require(DriverCommunicationsPolicy.validMessage(body))
        client.postgrest.rpc("send_driver_chat_message",buildJsonObject{
            put("p_thread_id",threadId);put("p_body",body.trim());if(orderId==null)put("p_order_id",JsonNull) else put("p_order_id",orderId);put("p_client_message_id",UUID.randomUUID().toString());put("p_message_kind",if(orderId==null)"text" else "order_context")
        })
    }

    suspend fun markOperationsRead(threadId:String){
        DriverRepository().profile();client.postgrest.rpc("mark_driver_chat_read",buildJsonObject{put("p_thread_id",threadId)})
    }

    suspend fun openCustomerChat(orderId:String):String{
        DriverRepository().profile()
        return client.postgrest.rpc("open_customer_driver_order_chat",buildJsonObject{put("p_order_id",orderId)}).decodeAs<String>()
    }

    suspend fun customerMessages(threadId:String):List<DriverCustomerChatMessage>{
        DriverRepository().profile()
        return client.from("customer_driver_chat_messages").select(Columns.list("id,thread_id,sender_id,body,client_message_id,created_at")){
            filter{eq("thread_id",threadId)};limit(300)
        }.decodeList<DriverCustomerChatMessage>().sortedBy{it.createdAt}
    }

    suspend fun sendCustomerMessage(threadId:String,body:String){
        DriverRepository().profile();require(DriverCommunicationsPolicy.validMessage(body))
        client.postgrest.rpc("send_customer_driver_chat_message",buildJsonObject{
            put("p_thread_id",threadId);put("p_body",body.trim());put("p_client_message_id",UUID.randomUUID().toString())
        })
    }

    suspend fun markCustomerRead(threadId:String){
        DriverRepository().profile();client.postgrest.rpc("mark_customer_driver_chat_read",buildJsonObject{put("p_thread_id",threadId)})
    }

    suspend fun disputes():List<DriverTripDispute>{
        val id=DriverRepository().profile().id
        return client.from("driver_trip_disputes").select(Columns.list("id,order_id,driver_id,category,details,status,admin_note,reviewed_by,reviewed_at,created_at,updated_at")){
            filter{eq("driver_id",id)};limit(100)
        }.decodeList<DriverTripDispute>().sortedByDescending{it.createdAt.orEmpty()}
    }

    suspend fun createDispute(orderId:String,category:String,details:String):String{
        DriverRepository().profile();require(category in DriverCommunicationsPolicy.disputeCategories);require(DriverCommunicationsPolicy.validDispute(details))
        return client.postgrest.rpc("driver_create_trip_dispute",buildJsonObject{
            put("p_order_id",orderId);put("p_category",category);put("p_details",details.trim())
        }).decodeAs<String>()
    }
}
