package com.hallo.logistics.domain.repository

import com.hallo.logistics.domain.model.ProfileAccess

interface SessionRepository {
    suspend fun currentUserId(): String?
    suspend fun signIn(email: String, password: String)
    suspend fun signOut()
    suspend fun profile(userId: String): ProfileAccess?
}
