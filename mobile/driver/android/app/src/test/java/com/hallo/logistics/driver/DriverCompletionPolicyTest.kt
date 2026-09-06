package com.hallo.logistics.driver
import org.junit.Assert.assertEquals
import org.junit.Test

class DriverCompletionPolicyTest {
 @Test fun documentChecklistRequiresFiveIdentityAndFourVehicleFiles(){val docs=DriverDocumentPolicy.identityKeys.mapIndexed{i,k->DriverDocument("i$i",k,null,"p") }+DriverDocumentPolicy.vehicleKeys.mapIndexed{i,k->DriverDocument("v$i",k,"truck-1","p")};assertEquals(9,DriverDocumentPolicy.completion(docs,"truck-1").first);assertEquals(5,DriverDocumentPolicy.completion(docs,null).first)}
 @Test fun cashRequiresExactInvoiceAmount(){DriverDeliveryPolicy.validate("in_transit","cash","cash_received",12000.0,12000.0)}
 @Test(expected=IllegalArgumentException::class) fun cashMismatchFails(){DriverDeliveryPolicy.validate("in_transit","cash","cash_received",12000.0,11999.0)}
 @Test(expected=IllegalArgumentException::class) fun acceptedTripCannotComplete(){DriverDeliveryPolicy.validate("accepted","cash","cash_received",12000.0,12000.0)}
 @Test fun platformPaymentAllowsConfirmedResult(){DriverDeliveryPolicy.validate("in_transit","bank_telebirr","bank_telebirr_confirmed",12000.0,null)}
}
