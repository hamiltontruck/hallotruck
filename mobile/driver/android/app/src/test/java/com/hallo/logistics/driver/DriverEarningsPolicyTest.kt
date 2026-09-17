package com.hallo.logistics.driver

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DriverEarningsPolicyTest {
    private val order=DriverJob(
        id="order-1",
        trackingId="HT-TEST",
        pickup="Addis Ababa",
        dropoff="Adama",
        priceEtb=10_000.0,
        status="delivered",
        deliveredAt="2026-09-13T01:00:00Z",
    )

    @Test fun authoritativeTripValuesAreCopiedWithoutCommissionFormula(){
        val result=DriverTripPaymentResult(
            id="result-1",
            orderId="order-1",
            assignedDriverId="driver-1",
            resultType="cash_received",
            amountCollected=10_000.0,
            completedAt="2026-09-13T01:01:00Z",
            commissionEtb=253.5,
            driverGrossEtb=9_000.0,
            driverNetEtb=8_746.5,
            depositConsumedEtb=253.5,
            depositAfterEtb=7_465.0,
            commissionDueAfterEtb=0.0,
        )
        val summary=DriverEarningsPresentationPolicy.combine(
            FinancialSummary(
                completedTrips=7,
                grossReleased=55_000.0,
                commissionCharged=1_100.0,
                commissionPaid=900.0,
                commissionDue=200.0,
                adminDeposit=10_000.0,
                availableDeposit=7_465.0,
            ),
            listOf(result),
            listOf(order),
        )
        val trip=summary.trips.single()
        assertEquals(253.5,trip.commissionEtb!!,0.001)
        assertEquals(8_746.5,trip.driverNetEtb!!,0.001)
        assertEquals(7_465.0,trip.depositAfterEtb!!,0.001)
        assertEquals(55_000.0,summary.releasedEarningsEtb,0.001)
        assertEquals(1_100.0,summary.commissionChargedEtb,0.001)
    }

    @Test fun missingAuthoritativeFinanceFieldsRemainMissingInsteadOfCalculated(){
        val result=DriverTripPaymentResult(
            id="result-1",
            orderId="order-1",
            assignedDriverId="driver-1",
            resultType="payment_not_received",
            amountCollected=null,
            commissionEtb=null,
            driverGrossEtb=null,
            driverNetEtb=null,
        )
        val trip=DriverEarningsPresentationPolicy.combine(FinancialSummary(),listOf(result),listOf(order)).trips.single()
        assertNull(trip.commissionEtb)
        assertNull(trip.driverGrossEtb)
        assertNull(trip.driverNetEtb)
    }
}
