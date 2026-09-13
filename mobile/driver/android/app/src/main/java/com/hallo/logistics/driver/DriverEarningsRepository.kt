package com.hallo.logistics.driver

import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns

class DriverEarningsRepository {
    private val client get()=HalloSupabase.client

    suspend fun summary():DriverEarningsSummary{
        val orders=DriverRepository().completedTrips()
        if(orders.isEmpty())return DriverEarningsPolicy.summarize(emptyList(),emptyList())
        val payments=client.from("payments").select(Columns.list("order_id,provider,amount_etb,event,created_at")){
            filter{isIn("order_id",orders.map{it.id})}
        }.decodeList<DriverPaymentEvent>()
        return DriverEarningsPolicy.summarize(orders,payments)
    }
}
