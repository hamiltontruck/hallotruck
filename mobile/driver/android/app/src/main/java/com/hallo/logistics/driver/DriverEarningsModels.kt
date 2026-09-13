package com.hallo.logistics.driver

import kotlin.math.max
import kotlin.math.min
import kotlin.math.round
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class DriverPaymentEvent(
    @SerialName("order_id") val orderId:String,
    val provider:String?=null,
    @SerialName("amount_etb") val amountEtb:Double?=null,
    val event:String,
    @SerialName("created_at") val createdAt:String,
)

data class DriverEarningsTrip(
    val orderId:String,
    val trackingId:String,
    val pickup:String,
    val dropoff:String,
    val vehicleType:String,
    val distanceKm:Double,
    val cargoDescription:String?,
    val paymentTerms:String,
    val acceptedAt:String?,
    val deliveredAt:String?,
    val invoiceEtb:Double,
    val releasedEtb:Double,
    val partialReleasedEtb:Double,
    val commissionEtb:Double,
    val driverNetEtb:Double,
    val heldEtb:Double,
    val initiatedEtb:Double,
    val remainingEtb:Double,
    val remainingDriverNetEtb:Double,
    val payoutStatus:String,
    val paymentProvider:String?,
    val lastReleaseAt:String?,
)

data class DriverEarningsSummary(
    val completedTrips:Int,
    val releasedTrips:Int,
    val totalReleasedEtb:Double,
    val totalCommissionEtb:Double,
    val totalDriverNetEtb:Double,
    val partialReleasedEtb:Double,
    val pendingTrips:Int,
    val pendingBalanceEtb:Double,
    val pendingDriverBalanceEtb:Double,
    val trips:List<DriverEarningsTrip>,
)

object DriverEarningsPolicy {
    private const val COMMISSION_RATE=0.02

    fun summarize(orders:List<DriverJob>,payments:List<DriverPaymentEvent>):DriverEarningsSummary{
        val byOrder=payments.groupBy{it.orderId}
        val trips=orders.map{order->calculate(order,byOrder[order.id].orEmpty())}
            .sortedByDescending{it.deliveredAt.orEmpty()}
        val releasedTrips=trips.count{it.payoutStatus=="released"}
        val totalReleased=trips.sumOf{if(it.payoutStatus=="released")it.releasedEtb else it.partialReleasedEtb}
        val totalSplit=split(totalReleased)
        val pending=trips.filter{it.payoutStatus!="released"}
        return DriverEarningsSummary(
            completedTrips=trips.size,
            releasedTrips=releasedTrips,
            totalReleasedEtb=roundMoney(totalReleased),
            totalCommissionEtb=totalSplit.first,
            totalDriverNetEtb=totalSplit.second,
            partialReleasedEtb=roundMoney(pending.sumOf{it.partialReleasedEtb}),
            pendingTrips=pending.size,
            pendingBalanceEtb=roundMoney(pending.sumOf{min(it.remainingEtb,it.heldEtb)}),
            pendingDriverBalanceEtb=roundMoney(pending.sumOf{it.remainingDriverNetEtb}),
            trips=trips,
        )
    }

    fun calculate(order:DriverJob,payments:List<DriverPaymentEvent>):DriverEarningsTrip{
        val invoice=amount(order.priceEtb)
        val releasedGross=payments.filter{it.event=="released"}.sumOf{amount(it.amountEtb)}
        val refunded=payments.filter{it.event=="refunded"}.sumOf{amount(it.amountEtb)}
        val netReleased=max(0.0,releasedGross-refunded)
        val releasedToInvoice=min(invoice,netReleased)
        val held=payments.filter{it.event=="held_escrow"}.sumOf{amount(it.amountEtb)}
        val initiated=payments.filter{it.event=="initiated"}.sumOf{amount(it.amountEtb)}
        val remaining=max(0.0,invoice-releasedToInvoice)
        val fullyReleased=invoice>0.0&&remaining<=0.005
        val status=when{
            fullyReleased->"released"
            releasedToInvoice>0.0->"partial"
            held>0.0->"held_escrow"
            initiated>0.0->"initiated"
            else->"unpaid"
        }
        val paidGross=if(fullyReleased)invoice else releasedToInvoice
        val paidSplit=split(paidGross)
        val verifiedPendingGross=min(remaining,held)
        val pendingSplit=split(verifiedPendingGross)
        val currentPayment=payments.filter{it.event!="refunded"}.maxByOrNull{it.createdAt}
        val lastRelease=payments.filter{it.event=="released"}.maxByOrNull{it.createdAt}
        return DriverEarningsTrip(
            orderId=order.id,
            trackingId=order.trackingId?:"—",
            pickup=order.pickup?:"—",
            dropoff=order.dropoff?:"—",
            vehicleType=order.vehicleType?:"—",
            distanceKm=amount(order.distanceKm),
            cargoDescription=order.cargoDescription,
            paymentTerms=order.paymentTerms?:"—",
            acceptedAt=order.acceptedAt,
            deliveredAt=order.deliveredAt,
            invoiceEtb=roundMoney(invoice),
            releasedEtb=if(fullyReleased)roundMoney(invoice) else 0.0,
            partialReleasedEtb=if(fullyReleased)0.0 else roundMoney(releasedToInvoice),
            commissionEtb=paidSplit.first,
            driverNetEtb=paidSplit.second,
            heldEtb=roundMoney(held),
            initiatedEtb=roundMoney(initiated),
            remainingEtb=roundMoney(remaining),
            remainingDriverNetEtb=pendingSplit.second,
            payoutStatus=status,
            paymentProvider=currentPayment?.provider,
            lastReleaseAt=lastRelease?.createdAt,
        )
    }

    private fun split(gross:Double):Pair<Double,Double>{
        val normalized=amount(gross)
        val commission=roundMoney(normalized*COMMISSION_RATE)
        val net=roundMoney(max(0.0,normalized-commission))
        return commission to net
    }

    private fun amount(value:Double?)=max(0.0,value?:0.0)
    private fun roundMoney(value:Double)=round((value+1e-9)*100.0)/100.0
}
