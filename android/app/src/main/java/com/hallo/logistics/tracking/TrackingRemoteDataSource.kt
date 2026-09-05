package com.hallo.logistics.tracking

import com.hallo.logistics.HalloSupabase
import io.github.jan.supabase.functions.functions
import kotlinx.serialization.Serializable

@Serializable data class TrackingPingRequest(
    val orderId: String,
    val lng: Double,
    val lat: Double,
    val heading: Double? = null,
    val speedKmh: Double? = null,
    val accuracyM: Double? = null,
    val recordedAt: String? = null,
    val androidDeviceId: String? = null,
)

class TrackingRemoteDataSource {
    suspend fun record(request: TrackingPingRequest) {
        require(request.lat in -90.0..90.0 && request.lng in -180.0..180.0)
        // Authenticated Edge Function validates the JWT, then invokes record_driver_tracking_ping server-side.
        HalloSupabase.client.functions.invoke("tracking", body = request)
    }
}
