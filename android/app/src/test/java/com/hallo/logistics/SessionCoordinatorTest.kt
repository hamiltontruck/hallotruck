package com.hallo.logistics

import com.hallo.logistics.core.session.SessionCoordinator
import com.hallo.logistics.domain.model.*
import com.hallo.logistics.domain.repository.SessionRepository
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class SessionCoordinatorTest {
    private class Fake(var id: String? = "u", var profile: ProfileAccess? = ProfileAccess("customer", null)) : SessionRepository {
        var signedOut = false
        override suspend fun currentUserId() = id
        override suspend fun signIn(email: String, password: String) { id = "u" }
        override suspend fun signOut() { signedOut = true; id = null }
        override suspend fun profile(userId: String) = profile
    }
    @Test fun restoresCustomerSession() = runTest { assertEquals(MobileAccess.CUSTOMER, SessionCoordinator(Fake()).restore()) }
    @Test fun expiredSessionBecomesSignedOut() = runTest { assertEquals(MobileAccess.SIGNED_OUT, SessionCoordinator(Fake(id=null)).restore()) }
    @Test fun logoutClearsRepositorySession() = runTest { val f=Fake(); SessionCoordinator(f).logout(); assertTrue(f.signedOut); assertNull(f.id) }
}
