package com.hallo.logistics

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DriverAccessTest {
    private fun isDriverRole(role: String?): Boolean = role.equals("driver", ignoreCase = true)

    @Test
    fun driverRoleIsAccepted() {
        assertTrue(isDriverRole("driver"))
        assertTrue(isDriverRole("DRIVER"))
    }

    @Test
    fun nonDriverRolesAreRejected() {
        assertFalse(isDriverRole("admin"))
        assertFalse(isDriverRole("customer"))
        assertFalse(isDriverRole(null))
    }
}
