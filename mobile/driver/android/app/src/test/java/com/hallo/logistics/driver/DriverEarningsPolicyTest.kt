package com.hallo.logistics.driver

import org.junit.Assert.assertEquals
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

    @Test fun fullyReleasedTripUsesTwoPercentCommission(){
        val result=DriverEarningsPolicy.summarize(
            listOf(order),
            listOf(DriverPaymentEvent("order-1","CBE",10_000.0,"released","2026-09-13T01:01:00Z")),
        )
        assertEquals(10_000.0,result.totalReleasedEtb,0.001)
        assertEquals(200.0,result.totalCommissionEtb,0.001)
        assertEquals(9_800.0,result.totalDriverNetEtb,0.001)
        assertEquals("released",result.trips.single().payoutStatus)
    }

    @Test fun refundReducesReleasedAmount(){
        val trip=DriverEarningsPolicy.calculate(
            order,
            listOf(
                DriverPaymentEvent("order-1","CBE",10_000.0,"released","2026-09-13T01:01:00Z"),
                DriverPaymentEvent("order-1","CBE",2_000.0,"refunded","2026-09-13T01:02:00Z"),
            ),
        )
        assertEquals("partial",trip.payoutStatus)
        assertEquals(8_000.0,trip.partialReleasedEtb,0.001)
        assertEquals(160.0,trip.commissionEtb,0.001)
        assertEquals(7_840.0,trip.driverNetEtb,0.001)
    }

    @Test fun verifiedEscrowCreatesPendingDriverBalance(){
        val result=DriverEarningsPolicy.summarize(
            listOf(order),
            listOf(DriverPaymentEvent("order-1","Telebirr",4_000.0,"held_escrow","2026-09-13T01:01:00Z")),
        )
        assertEquals("held_escrow",result.trips.single().payoutStatus)
        assertEquals(4_000.0,result.pendingBalanceEtb,0.001)
        assertEquals(3_920.0,result.pendingDriverBalanceEtb,0.001)
        assertEquals(0.0,result.totalReleasedEtb,0.001)
    }
}
