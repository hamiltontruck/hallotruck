package com.hallo.logistics.driver
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.ExternalAuthAction
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.storage.Storage
object HalloSupabase { val configured get()=BuildConfig.SUPABASE_URL.isNotBlank()&&BuildConfig.SUPABASE_PUBLISHABLE_KEY.isNotBlank(); val client by lazy { require(configured) { "Configure the existing HALLO Supabase URL and publishable key" }; createSupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_PUBLISHABLE_KEY) { install(Auth){scheme="hallodriver";host="auth-callback";defaultExternalAuthAction=ExternalAuthAction.CustomTabs()}; install(Postgrest); install(Functions); install(Storage); install(Realtime) } } }
