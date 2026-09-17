package com.hallo.logistics.driver

import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DriverCompletionPolicyTest {
    private val today=LocalDate.of(2026,9,17)

    @Test fun documentChecklistMatchesCurrentFiveDriverAndThreeVehicleFiles(){
        val docs=DriverDocumentPolicy.identityKeys.mapIndexed{i,k->
            DriverDocument("i$i",k,null,"p",status="verified",expiryDate=if(k in DriverDocumentPolicy.expiryRequiredKeys)"2027-09-17" else null)
        }+DriverDocumentPolicy.vehicleKeys.mapIndexed{i,k->DriverDocument("v$i",k,"truck-1","p",status="verified")}
        assertEquals(8,DriverDocumentPolicy.completion(docs,"truck-1",today).first)
        assertEquals(8,DriverDocumentPolicy.completion(docs,"truck-1",today).second)
        assertEquals(5 to 5,DriverDocumentPolicy.identityCompletion(docs,today))
        assertEquals(3 to 3,DriverDocumentPolicy.vehicleCompletion(docs,"truck-1",today))
    }

    @Test fun historicalVehicleFilesDoNotCountAsCurrentRequirements(){
        val historical=DriverDocumentPolicy.historicalVehicleKeys.mapIndexed{i,k->DriverDocument("h$i",k,"truck-1","p",status="verified")}
        assertEquals(0 to 8,DriverDocumentPolicy.completion(historical,"truck-1",today))
    }

    @Test fun pendingOrRejectedRequiredFileIsNotVerifiedCompletion(){
        val docs=listOf(
            DriverDocument("pending","driver_photo",null,"p",status="pending",createdAt="2026-09-01T00:00:00Z"),
            DriverDocument("rejected","license_back",null,"p",status="rejected",createdAt="2026-09-01T00:00:00Z"),
        )
        assertEquals(0 to 5,DriverDocumentPolicy.identityCompletion(docs,today))
    }

    @Test fun expiredFrontIdentityDocumentDoesNotCount(){
        val docs=listOf(DriverDocument("license","license_front",null,"p",status="verified",expiryDate="2026-09-16"))
        assertEquals(0 to 5,DriverDocumentPolicy.identityCompletion(docs,today))
    }

    @Test fun cashRequiresExactInvoiceAmount(){DriverDeliveryPolicy.validate("in_transit","cash","cash_received",12000.0,12000.0)}
    @Test(expected=IllegalArgumentException::class) fun cashMismatchFails(){DriverDeliveryPolicy.validate("in_transit","cash","cash_received",12000.0,11999.0)}
    @Test(expected=IllegalArgumentException::class) fun acceptedTripCannotComplete(){DriverDeliveryPolicy.validate("accepted","cash","cash_received",12000.0,12000.0)}
    @Test fun platformPaymentUsesCurrentBackendResult(){DriverDeliveryPolicy.validate("in_transit","bank_telebirr","bank_telebirr",12000.0,null)}
    @Test fun paymentNotReceivedIsValidForEitherMethod(){DriverDeliveryPolicy.validate("in_transit","cash","payment_not_received",12000.0,null);DriverDeliveryPolicy.validate("in_transit","bank_telebirr","payment_not_received",12000.0,null)}
    @Test fun jobLockOnlyWhenCommissionDueRemains(){assertFalse(DriverAccessPolicy.jobsLocked(DriverAccess.APPROVED,0.0));assertTrue(DriverAccessPolicy.jobsLocked(DriverAccess.APPROVED,0.01))}
    @Test fun financeBlockedPrefersAuthoritativeCommissionSummary(){assertTrue(DriverFinancePresentationPolicy.blocked(DriverCommissionSummary(blocked=true),FinancialSummary(commissionDue=0.0)));assertFalse(DriverFinancePresentationPolicy.blocked(DriverCommissionSummary(blocked=false),FinancialSummary(commissionDue=99.0)))}
}
