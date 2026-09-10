package com.hallo.logistics.customer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerParityPolicyTest {
    @Test fun paymentSummaryMatchesCustomerMobileV4Rules() {
        val order = CustomerOrder(id = "o1", priceEtb = 10000.0)
        val payments = listOf(
            CustomerPayment("p1", "o1", amountEtb = 1000.0, event = "initiated"),
            CustomerPayment("p2", "o1", amountEtb = 3000.0, event = "held_escrow"),
            CustomerPayment("p3", "o1", amountEtb = 2500.0, event = "released"),
            CustomerPayment("p4", "o1", amountEtb = 500.0, event = "refunded"),
        )
        val summary = CustomerPaymentPolicy.summarize(order, payments)
        assertEquals(10000.0, summary.invoiceTotal, 0.0)
        assertEquals(5000.0, summary.verifiedPaid, 0.0)
        assertEquals(1000.0, summary.pendingVerification, 0.0)
        assertEquals(4000.0, summary.remainingToSubmit, 0.0)
        assertEquals(5000.0, summary.balanceToPay, 0.0)
    }

    @Test fun cancelledOrderNeverAppearsInPaymentFilter() {
        val order = CustomerOrder(id = "o1", priceEtb = 1000.0, status = "cancelled")
        assertTrue(!CustomerPaymentPolicy.needsPayment(order, emptyList()))
    }

    @Test fun structuredLoadFallsBackSafely() {
        assertEquals("25 quintal", CustomerPaymentPolicy.formatLoad(CustomerOrder(id = "o1", cargoQuantity = 25.0, cargoUnit = "quintal")))
        assertEquals("Keep dry", CustomerPaymentPolicy.formatLoad(CustomerOrder(id = "o1", cargoDescription = "Keep dry")))
        assertEquals("—", CustomerPaymentPolicy.formatLoad(CustomerOrder(id = "o1")))
    }

    @Test fun profileUpdateAcceptsOnlyPortalSupportedBoundary() {
        val clean = CustomerProfilePolicy.validate(
            CustomerProfileUpdateInput(" Sofi  Abdi ", "0912345678", "sofi@example.com", "Addis Ababa", "business", "Sofi PLC"),
        )
        assertEquals("Sofi Abdi", clean.fullName)
        assertEquals("business", clean.customerType)
        assertEquals("Sofi PLC", clean.companyName)
    }

    @Test(expected = IllegalArgumentException::class)
    fun businessProfileRequiresCompanyName() {
        CustomerProfilePolicy.validate(
            CustomerProfileUpdateInput("Sofi", "0912345678", "", "", "business", ""),
        )
    }

    @Test fun languageTagsRoundTripForPersistence() {
        assertEquals(CustomerLanguage.EN, CustomerLanguage.fromTag("en"))
        assertEquals(CustomerLanguage.OR, CustomerLanguage.fromTag("om-ET"))
        assertEquals(CustomerLanguage.AM, CustomerLanguage.fromTag("am"))
    }

    @Test fun driverAndTruckPhotoFallbacksFailClosed() {
        val assignment = CustomerAssignment(orderId = "o1", driverVerified = true)
        assertNull(CustomerDisplayPolicy.verifiedDriverPhotoUrl(assignment, CustomerAssignmentMedia(driverPhotoUrl = "")))
        assertNull(CustomerDisplayPolicy.truckPhotoUrl(CustomerAssignmentMedia(truckPhotoUrl = "http://unsafe.example/truck.jpg")))
        assertEquals("D", CustomerDisplayPolicy.initial(null, "D"))
        assertEquals("S", CustomerDisplayPolicy.initial(" Sofi", "D"))
    }

    @Test fun unverifiedDriverPhotoIsNeverExposed() {
        val assignment = CustomerAssignment(orderId = "o1", driverVerified = false)
        assertNull(CustomerDisplayPolicy.verifiedDriverPhotoUrl(assignment, CustomerAssignmentMedia(driverPhotoUrl = "https://example.com/signed")))
    }
}
