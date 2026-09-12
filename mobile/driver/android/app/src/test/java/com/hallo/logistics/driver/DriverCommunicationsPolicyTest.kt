package com.hallo.logistics.driver

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DriverCommunicationsPolicyTest {
    @Test fun messageLengthMustStayWithinContract(){
        assertFalse(DriverCommunicationsPolicy.validMessage(""))
        assertTrue(DriverCommunicationsPolicy.validMessage("Hello"))
        assertTrue(DriverCommunicationsPolicy.validMessage("x".repeat(4000)))
        assertFalse(DriverCommunicationsPolicy.validMessage("x".repeat(4001)))
    }

    @Test fun disputeDetailsMustStayWithinContract(){
        assertFalse(DriverCommunicationsPolicy.validDispute("short"))
        assertTrue(DriverCommunicationsPolicy.validDispute("Payment was not received at delivery."))
        assertTrue(DriverCommunicationsPolicy.validDispute("x".repeat(2000)))
        assertFalse(DriverCommunicationsPolicy.validDispute("x".repeat(2001)))
    }

    @Test fun disputeStatusIsLimitedToAssignedTripLifecycle(){
        assertTrue(DriverCommunicationsPolicy.canDispute("accepted"))
        assertTrue(DriverCommunicationsPolicy.canDispute("in_transit"))
        assertTrue(DriverCommunicationsPolicy.canDispute("delivered"))
        assertFalse(DriverCommunicationsPolicy.canDispute("placed"))
        assertFalse(DriverCommunicationsPolicy.canDispute("cancelled"))
        assertFalse(DriverCommunicationsPolicy.canDispute(null))
    }

    @Test fun disputeCategoriesMatchBackendContract(){
        assertTrue(DriverCommunicationsPolicy.disputeCategories == listOf("payment","delivery","assignment","customer","safety","other"))
    }
}
