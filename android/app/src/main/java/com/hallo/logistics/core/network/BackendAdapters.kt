package com.hallo.logistics.core.network

import com.hallo.logistics.HalloSupabase
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.realtime.realtime
import io.github.jan.supabase.storage.storage

/** Authenticated client adapters only. PostgreSQL/RLS/RPC/Edge Functions remain authoritative. */
object BackendAdapters {
    val rpc get() = HalloSupabase.client.postgrest
    val functions get() = HalloSupabase.client.functions
    val storage get() = HalloSupabase.client.storage
    val realtime get() = HalloSupabase.client.realtime
}
