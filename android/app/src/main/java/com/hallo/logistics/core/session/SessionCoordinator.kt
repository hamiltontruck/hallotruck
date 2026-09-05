package com.hallo.logistics.core.session

import com.hallo.logistics.domain.model.MobileAccess
import com.hallo.logistics.domain.model.MobileAccessPolicy
import com.hallo.logistics.domain.repository.SessionRepository

class SessionCoordinator(private val repository: SessionRepository) {
    suspend fun restore(): MobileAccess {
        val id = repository.currentUserId() ?: return MobileAccess.SIGNED_OUT
        return runCatching { MobileAccessPolicy.resolve(repository.profile(id)) }.getOrElse { MobileAccess.FORBIDDEN }
    }
    suspend fun login(email: String, password: String): MobileAccess { repository.signIn(email, password); return restore() }
    suspend fun logout() { repository.signOut() }
}
