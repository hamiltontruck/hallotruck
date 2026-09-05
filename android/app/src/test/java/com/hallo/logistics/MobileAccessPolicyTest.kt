package com.hallo.logistics

import com.hallo.logistics.domain.model.*
import org.junit.Assert.assertEquals
import org.junit.Test

class MobileAccessPolicyTest {
    @Test fun customerRoutesToCustomer() = assertEquals(MobileAccess.CUSTOMER, MobileAccessPolicy.resolve(ProfileAccess("customer", null)))
    @Test fun approvedDriverRoutesToDriver() = assertEquals(MobileAccess.DRIVER, MobileAccessPolicy.resolve(ProfileAccess("driver", "approved")))
    @Test fun pendingDriverDoesNotEnterDriverGraph() = assertEquals(MobileAccess.DRIVER_PENDING, MobileAccessPolicy.resolve(ProfileAccess("driver", "pending")))
    @Test fun suspendedDriverFailsClosed() = assertEquals(MobileAccess.FORBIDDEN, MobileAccessPolicy.resolve(ProfileAccess("driver", "suspended")))
    @Test fun privilegedAndPartnerRolesDenied() { listOf("admin","ceo","partner").forEach { assertEquals(MobileAccess.FORBIDDEN, MobileAccessPolicy.resolve(ProfileAccess(it, null))) } }
    @Test fun missingProfileFailsClosed() = assertEquals(MobileAccess.FORBIDDEN, MobileAccessPolicy.resolve(null))
}
