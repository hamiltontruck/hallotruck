package com.hallo.logistics.customer

data class CustomerPaymentSummary(
    val invoiceTotal: Double,
    val verifiedPaid: Double,
    val pendingVerification: Double,
    val remainingToSubmit: Double,
    val balanceToPay: Double,
)

object CustomerPaymentPolicy {
    fun summarize(order: CustomerOrder, entries: List<CustomerPayment>): CustomerPaymentSummary {
        val invoiceTotal = (order.priceEtb ?: 0.0).coerceAtLeast(0.0)
        fun total(event: String) = entries.asSequence()
            .filter { it.event == event }
            .sumOf { it.amountEtb ?: 0.0 }

        val initiated = total("initiated")
        val heldEscrow = total("held_escrow")
        val releasedGross = total("released")
        val refunded = total("refunded")
        val verifiedPaid = (releasedGross + heldEscrow - refunded).coerceAtLeast(0.0)
        val pendingVerification = initiated.coerceAtLeast(0.0)
        val committed = (verifiedPaid + pendingVerification).coerceAtLeast(0.0)

        return CustomerPaymentSummary(
            invoiceTotal = invoiceTotal,
            verifiedPaid = verifiedPaid,
            pendingVerification = pendingVerification,
            remainingToSubmit = (invoiceTotal - committed).coerceAtLeast(0.0),
            balanceToPay = (invoiceTotal - verifiedPaid).coerceAtLeast(0.0),
        )
    }

    fun formatLoad(order: CustomerOrder): String {
        val quantity = order.cargoQuantity ?: 0.0
        val unit = order.cargoUnit?.trim()?.lowercase()
        if (quantity > 0 && !unit.isNullOrBlank()) {
            val display = if (quantity % 1.0 == 0.0) quantity.toLong().toString() else quantity.toString().trimEnd('0').trimEnd('.')
            return "$display $unit"
        }
        return order.cargoDescription?.trim().takeUnless { it.isNullOrBlank() } ?: "—"
    }

    fun needsPayment(order: CustomerOrder, entries: List<CustomerPayment>): Boolean {
        if (order.status == "cancelled") return false
        val summary = summarize(order, entries)
        return summary.remainingToSubmit > 0 || summary.pendingVerification > 0
    }
}
