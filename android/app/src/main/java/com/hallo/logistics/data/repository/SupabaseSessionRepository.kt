package com.hallo.logistics.data.repository

import com.hallo.logistics.HalloSupabase
import com.hallo.logistics.data.model.ProfileDto
import com.hallo.logistics.domain.model.ProfileAccess
import com.hallo.logistics.domain.repository.SessionRepository
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns

class SupabaseSessionRepository : SessionRepository {
    override suspend fun currentUserId() = HalloSupabase.client.auth.currentUserOrNull()?.id
    override suspend fun signIn(email: String, password: String) { HalloSupabase.client.auth.signInWith(Email) { this.email = email; this.password = password } }
    override suspend fun signOut() { HalloSupabase.client.auth.signOut() }
    override suspend fun profile(userId: String): ProfileAccess? {
        val row = HalloSupabase.client.from("profiles").select(Columns.list("id,role,driver_status")) { filter { eq("id", userId) } }.decodeSingleOrNull<ProfileDto>()
        return row?.let { ProfileAccess(it.role, it.driverStatus) }
    }
}
