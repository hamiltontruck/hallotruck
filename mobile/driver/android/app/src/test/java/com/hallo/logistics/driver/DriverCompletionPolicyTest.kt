package com.hallo.logistics.driver

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DriverCompletionPolicyTest {
    @Test fun documentChecklistMatchesCurrentFiveDriverAndThreeVehicleFiles(){
        val docs=DriverDocumentPolicy.identityKeys.mapIndexed{i,k->DriverDocument("i$i",k,null,"p",status="verified") }+
            DriverDocumentPolicy.vehicleKeys.mapIndexed{i,k->DriverDocument("v$i",k,"truck-1","p",status="verified")}
        assertEquals(8,DriverDocumentPolicy.completion(docs,"truck-1").first)
        assertEquals(8,DriverDocumentPolicy.completion(docs,"truck-1").second)
        assertEquals(5 to 5,DriverDocumentPolicy.identityCompletion(docs))
        assertEquals(3 to 3,DriverDocumentPolicy.vehicleCompletion(docs,"truck-1"))
    }

    @Test fun historicalVehicleFilesDoNotCountAsCurrentRequirements(){
        val historical=DriverDocumentPolicy.historicalVehicleKeys.mapIndexed{i,k->DriverDocument("h$i",k,"truck-1","p",status="verified")}
        assertEquals(0 to 8,DriverDocumentPolicy.completion(historical,"truck-1"))
    }

    @Test fun rejectedLatestRequiredFileNeedsResubmission(){
        val docs=listOf(
            DriverDocument("old","driver_photo",null,"old",status="verified",createdAt="2026-09-01T00:00:00Z"),
            DriverDocument("new","driver_photo",null,"new",status="rejected",createdAt="2026-09-02T00:00:00Z"),
        )
        assertEquals(0 to 5,DriverDocumentPolicy.identityCompletion(docs))
    }

    @Test fun cashRequiresExactInvoiceAmount(){DriverDeliveryPolicy.validate("in_transit","cash","cash_received",12000.0,12000.0)}
    @Test(expected=IllegalArgumentException::class) fun cashMismatchFails(){DriverDeliveryPolicy.validate("in_transit","cash","cash_received",12000.0,11999.0)}
    @Test(expected=IllegalArgumentException::class) fun acceptedTripCannotComplete(){DriverDeliveryPolicy.validate("accepted","cash","cash_received",12000.0,12000.0)}
    @Test fun platformPaymentUsesCurrentBackendResult(){DriverDeliveryPolicy.validate("in_transit","bank_telebirr","bank_telebirr",12000.0,null)}
    @Test fun paymentNotReceivedIsValidForEitherMethod(){DriverDeliveryPolicy.validate("in_transit","cash","payment_not_received",12000.0,null);DriverDeliveryPolicy.validate("in_transit","bank_telebirr","payment_not_received",12000.0,null)}
    @Test fun jobLockOnlyWhenCommissionDueRemains(){assertFalse(DriverAccessPolicy.jobsLocked(DriverAccess.APPROVED,0.0));assertTrue(DriverAccessPolicy.jobsLocked(DriverAccess.APPROVED,0.01))}
    @Test fun financeBlockedPrefersAuthoritativeCommissionSummary(){assertTrue(DriverFinancePresentationPolicy.blocked(DriverCommissionSummary(blocked=true),FinancialSummary(commissionDue=0.0)));assertFalse(DriverFinancePresentationPolicy.blocked(DriverCommissionSummary(blocked=false),FinancialSummary(commissionDue=99.0)))}
}
