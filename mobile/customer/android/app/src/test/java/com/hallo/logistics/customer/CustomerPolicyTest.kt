package com.hallo.logistics.customer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerPolicyTest {
    @Test fun onlyCustomerRoleIsAccepted() {
        assertTrue(CustomerPolicy.isCustomer("customer"))
        listOf("driver", "partner", "admin", "ceo", null).forEach { assertFalse(CustomerPolicy.isCustomer(it)) }
    }

    @Test fun signupPinIsExactlySixNumericDigits() {
        assertTrue(CustomerPolicy.isSixDigitPin("012345"))
        listOf("12345", "1234567", "12a456", "").forEach { assertFalse(CustomerPolicy.isSixDigitPin(it)) }
    }

    @Test fun EthiopianPhonesNormalizeToNationalForm() {
        assertEquals("0912345678", CustomerPolicy.normalizePhone("+251 912 345 678"))
        assertEquals("0712345678", CustomerPolicy.normalizePhone("251-712-345-678"))
        assertEquals("0912345678", CustomerPolicy.normalizePhone("912345678"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun nonEthiopianPhoneFailsClosed() { CustomerPolicy.normalizePhone("123") }

    @Test fun cancellationMatchesExistingBackendLifecycle() {
        listOf("quoted", "placed", "accepted").forEach { assertTrue(CustomerPolicy.canCancel(it)) }
        listOf("in_transit", "delivered", "cancelled", null).forEach { assertFalse(CustomerPolicy.canCancel(it)) }
    }
}
