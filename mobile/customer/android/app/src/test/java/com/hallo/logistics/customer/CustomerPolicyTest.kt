package com.hallo.logistics.customer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

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

    @Test fun cancellationMatchesRootCustomerPortalLifecycle() {
        listOf("quoted", "placed", "accepted", "in_transit").forEach {
            assertTrue(CustomerPolicy.canCancel(it))
        }
        listOf("assigned", "delivered", "cancelled", null).forEach {
            assertFalse(CustomerPolicy.canCancel(it))
        }
    }

    @Test fun assignmentAndTrackingVisibilityFollowCustomerLifecycle() {
        listOf("assigned", "accepted", "in_transit").forEach {
            assertTrue(CustomerPolicy.showAssignment(it))
            assertTrue(CustomerPolicy.canTrack(it))
        }
        assertTrue(CustomerPolicy.canTrack("delivered"))
        assertFalse(CustomerPolicy.showAssignment("delivered"))
        listOf("quoted", "placed", "cancelled", null).forEach { assertFalse(CustomerPolicy.canTrack(it)) }
    }

    @Test fun trackingNeverLabelsOldOrMissingGpsAsLive() {
        val now = Instant.parse("2026-09-07T12:00:00Z")
        assertEquals("LIVE", CustomerPolicy.trackingFreshness("2026-09-07T11:59:20Z", true, now))
        assertEquals("STALE", CustomerPolicy.trackingFreshness("2026-09-07T11:55:00Z", true, now))
        assertEquals("OFFLINE", CustomerPolicy.trackingFreshness("2026-09-07T11:00:00Z", true, now))
        assertEquals("OFFLINE", CustomerPolicy.trackingFreshness(null, false, now))
    }

    @Test fun cargoUnitsConvertWithoutChangingBackendQuoteRules() {
        assertEquals(2.5, CustomerBookingPolicy.cargoToTons(2.5, "ton"), 0.0)
        assertEquals(2.5, CustomerBookingPolicy.cargoToTons(25.0, "quintal"), 0.0)
        assertEquals(0.0, CustomerBookingPolicy.cargoToTons(0.0, "ton"), 0.0)
    }

    @Test fun selectedTruckCapacityMatchesRootCustomerPortal() {
        val expected = mapOf(
            "Pickup" to 3.0,
            "Van" to 5.0,
            "Isuzu 5 Ton" to 5.0,
            "Dry Cargo" to 10.0,
            "Refrigerated" to 15.0,
            "Truck 22 Ton" to 22.0,
            "Truck 25 Ton" to 25.0,
            "Truck 30 Ton" to 30.0,
            "Trailer" to 45.0,
        )
        expected.forEach { (vehicle, capacity) ->
            assertEquals(capacity, CustomerBookingPolicy.truckCapacityTons(vehicle) ?: 0.0, 0.0)
        }
        CustomerBookingPolicy.requireWithinCapacity(5.0, "Isuzu 5 Ton")
        val failure = runCatching { CustomerBookingPolicy.requireWithinCapacity(5.01, "Isuzu 5 Ton") }.exceptionOrNull()
        assertTrue(failure is IllegalArgumentException)
    }

    @Test fun cargoDescriptionKeepsStructuredExistingOrderFieldsReadable() {
        assertEquals(
            "General goods · Bagged · 25 quintal · Keep dry",
            CustomerBookingPolicy.cargoDescription("General goods", "Bagged", 25.0, "quintal", "Keep dry"),
        )
    }
}
