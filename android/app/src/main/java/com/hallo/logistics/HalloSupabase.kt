package com.hallo.logistics

import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.storage.Storage

object HalloSupabase {
    val isConfigured = BuildConfig.SUPABASE_URL.isNotBlank() && BuildConfig.SUPABASE_ANON_KEY.isNotBlank()
    val client by lazy {
        createSupabaseClient(BuildConfig.SUPABASE_URL.ifBlank { "https://invalid.supabase.co" }, BuildConfig.SUPABASE_ANON_KEY.ifBlank { "missing-anon-key" }) {
            install(Auth)
            install(Postgrest)
            install(Functions)
            install(Storage)
            install(Realtime)
        }
    }
}
