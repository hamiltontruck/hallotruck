package com.hallo.logistics.tracking

import com.hallo.logistics.HalloSupabase
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.Serializable

@Serializable data class TrackingPingParams(val p_order_id: String, val p_latitude: Double, val p_longitude: Double, val p_accuracy_m: Double? = null, val p_heading: Double? = null)
class TrackingRemoteDataSource {
    suspend fun record(params: TrackingPingParams) {
        require(params.p_latitude in -90.0..90.0 && params.p_longitude in -180.0..180.0)
        HalloSupabase.client.postgrest.rpc("record_driver_tracking_ping", params)
    }
}
