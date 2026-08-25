package com.hallo.logistics

import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth

object HalloSupabase {
    val isConfigured: Boolean = BuildConfig.SUPABASE_URL.isNotBlank() && BuildConfig.SUPABASE_ANON_KEY.isNotBlank()

    val client by lazy {
        createSupabaseClient(
            supabaseUrl = BuildConfig.SUPABASE_URL.ifBlank { "https://invalid.supabase.co" },
            supabaseKey = BuildConfig.SUPABASE_ANON_KEY.ifBlank { "missing-anon-key" },
        ) {
            install(Auth)
        }
    }
}
