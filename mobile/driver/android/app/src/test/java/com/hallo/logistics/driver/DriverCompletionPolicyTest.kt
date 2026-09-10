package com.hallo.logistics.driver

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DriverCompletionPolicyTest {
    @Test fun documentChecklistMatchesCurrentPortalFiveIdentityAndSevenVehicleFiles(){
        val docs=DriverDocumentPolicy.identityKeys.mapIndexed{i,k->DriverDocument("i$i",k,null,"p") }+
            DriverDocumentPolicy.vehicleKeys.mapIndexed{i,k->DriverDocument("v$i",k,"truck-1","p")}
        assertEquals(12,DriverDocumentPolicy.completion(docs,"truck-1").first)
        assertEquals(5,DriverDocumentPolicy.completion(docs,null).first)
    }
    @Test fun cashRequiresExactInvoiceAmount(){DriverDeliveryPolicy.validate("in_transit","cash","cash_received",12000.0,12000.0)}
    @Test(expected=IllegalArgumentException::class) fun cashMismatchFails(){DriverDeliveryPolicy.validate("in_transit","cash","cash_received",12000.0,11999.0)}
    @Test(expected=IllegalArgumentException::class) fun acceptedTripCannotComplete(){DriverDeliveryPolicy.validate("accepted","cash","cash_received",12000.0,12000.0)}
    @Test fun platformPaymentUsesCurrentBackendResult(){DriverDeliveryPolicy.validate("in_transit","bank_telebirr","bank_telebirr",12000.0,null)}
    @Test fun paymentNotReceivedIsValidForEitherMethod(){DriverDeliveryPolicy.validate("in_transit","cash","payment_not_received",12000.0,null);DriverDeliveryPolicy.validate("in_transit","bank_telebirr","payment_not_received",12000.0,null)}
    @Test fun jobLockOnlyWhenCommissionDueRemains(){assertFalse(DriverAccessPolicy.jobsLocked(DriverAccess.APPROVED,0.0));assertTrue(DriverAccessPolicy.jobsLocked(DriverAccess.APPROVED,0.01))}
    @Test fun financeBlockedPrefersAuthoritativeCommissionSummary(){assertTrue(DriverFinancePresentationPolicy.blocked(DriverCommissionSummary(blocked=true),FinancialSummary(commissionDue=0.0)));assertFalse(DriverFinancePresentationPolicy.blocked(DriverCommissionSummary(blocked=false),FinancialSummary(commissionDue=99.0)))}
}
