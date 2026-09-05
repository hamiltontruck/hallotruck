package com.hallo.logistics.data.remote

import com.hallo.logistics.HalloSupabase
import io.github.jan.supabase.postgrest.from
import kotlinx.serialization.Serializable

@Serializable data class MobileDeviceUpsert(val user_id: String, val platform: String = "android", val push_token: String)
class MobileDeviceRemoteDataSource {
    suspend fun register(userId: String, pushToken: String) {
        // RLS remains authoritative; never register a token for an unauthenticated/other user.
        HalloSupabase.client.from("mobile_devices").upsert(MobileDeviceUpsert(userId, push_token = pushToken))
    }
}
