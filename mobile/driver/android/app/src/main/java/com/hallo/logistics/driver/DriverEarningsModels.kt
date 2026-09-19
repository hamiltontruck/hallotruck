package com.hallo.logistics.driver

data class DriverEarningsTrip(
    val orderId:String,
    val trackingId:String,
    val pickup:String,
    val dropoff:String,
    val orderStatus:String?,
    val resultType:String,
    val paymentMethod:String?,
    val fareEtb:Double?,
    val customerCollectedEtb:Double?,
    val driverGrossEtb:Double?,
    val commissionEtb:Double?,
    val driverNetEtb:Double?,
    val depositConsumedEtb:Double?,
    val depositAfterEtb:Double?,
    val commissionDueAfterEtb:Double?,
    val completedAt:String?,
)

data class DriverEarningsSummary(
    val completedTrips:Long,
    val releasedEarningsEtb:Double,
    val commissionChargedEtb:Double,
    val commissionPaidEtb:Double,
    val commissionDueEtb:Double,
    val availableDepositEtb:Double,
    val trips:List<DriverEarningsTrip>,
)

/**
 * Presentation mapper only. Financial values are copied from authoritative Driver RPC/table
 * results; this layer deliberately performs no commission, payout, deposit, or net formulas.
 */
object DriverEarningsPresentationPolicy {
    fun combine(
        financial:FinancialSummary,
        results:List<DriverTripPaymentResult>,
        orders:List<DriverJob>,
    ):DriverEarningsSummary {
        val ordersById=orders.associateBy { it.id }
        val trips=results.map { result ->
            val order=ordersById[result.orderId]
            DriverEarningsTrip(
                orderId=result.orderId,
                trackingId=order?.trackingId ?: "—",
                pickup=order?.pickup ?: "—",
                dropoff=order?.dropoff ?: "—",
                orderStatus=order?.status,
                resultType=result.resultType,
                paymentMethod=result.paymentMethod,
                fareEtb=order?.priceEtb,
                customerCollectedEtb=result.amountCollected,
                driverGrossEtb=result.driverGrossEtb,
                commissionEtb=result.commissionEtb,
                driverNetEtb=result.driverNetEtb,
                depositConsumedEtb=result.depositConsumedEtb,
                depositAfterEtb=result.depositAfterEtb,
                commissionDueAfterEtb=result.commissionDueAfterEtb,
                completedAt=result.completedAt ?: result.createdAt,
            )
        }.sortedByDescending { it.completedAt.orEmpty() }

        return DriverEarningsSummary(
            completedTrips=financial.completedTrips,
            releasedEarningsEtb=financial.grossReleased,
            commissionChargedEtb=financial.commissionCharged,
            commissionPaidEtb=financial.commissionPaid,
            commissionDueEtb=financial.commissionDue,
            availableDepositEtb=financial.availableDeposit,
            trips=trips,
        )
    }
}
