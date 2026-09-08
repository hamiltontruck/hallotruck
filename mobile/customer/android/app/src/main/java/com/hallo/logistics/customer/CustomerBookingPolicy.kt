package com.hallo.logistics.customer

import java.math.BigDecimal
import java.math.RoundingMode

object CustomerBookingPolicy {
    fun cargoToTons(quantity: Double, unit: String): Double {
        if (!quantity.isFinite() || quantity <= 0) return 0.0
        return if (unit == "quintal") quantity / 10.0 else quantity
    }

    fun cargoDescription(
        categoryLabel: String,
        packagingLabel: String,
        quantity: Double,
        unit: String,
        notes: String,
    ): String {
        val amount = BigDecimal.valueOf(quantity).setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()
        val load = "$amount ${if (unit == "quintal") "quintal" else "ton"}"
        return listOf(categoryLabel.trim(), packagingLabel.trim(), load, notes.trim())
            .filter { it.isNotBlank() }
            .joinToString(" · ")
            .take(500)
    }
}
