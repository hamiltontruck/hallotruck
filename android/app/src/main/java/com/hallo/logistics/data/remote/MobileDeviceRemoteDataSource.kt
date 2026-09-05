package com.hallo.logistics.data.remote

import com.hallo.logistics.HalloSupabase
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.Serializable

@Serializable data class RegisterAndroidDeviceParams(
    val p_android_device_id: String,
    val p_fcm_token: String?,
    val p_app_version: String,
)

class MobileDeviceRemoteDataSource {
    suspend fun register(androidDeviceId: String, fcmToken: String?, appVersion: String) {
        // Uses the existing SECURITY DEFINER contract; direct table writes are intentionally not granted to authenticated clients.
        HalloSupabase.client.postgrest.rpc(
            "register_android_device",
            RegisterAndroidDeviceParams(androidDeviceId, fcmToken, appVersion),
        )
    }
}
