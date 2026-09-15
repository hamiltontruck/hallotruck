package com.hallo.logistics.customer

import java.math.BigDecimal
import java.math.RoundingMode

object CustomerBookingPolicy {
    fun cargoToTons(quantity: Double, unit: String): Double {
        if (!quantity.isFinite() || quantity <= 0) return 0.0
        return if (unit == "quintal") quantity / 10.0 else quantity
    }

    /** Matches src/domain/cargo-load.ts in the production Customer Portal. */
    fun truckCapacityTons(vehicleType: String): Double? = when (vehicleType.trim().lowercase()) {
        "pickup" -> 3.0
        "van" -> 5.0
        "isuzu 5 ton" -> 5.0
        "dry cargo" -> 10.0
        "refrigerated" -> 15.0
        "truck 22 ton" -> 22.0
        "truck 25 ton" -> 25.0
        "truck 30 ton" -> 30.0
        "trailer" -> 45.0
        else -> null
    }

    fun requireWithinCapacity(cargoTons: Double, vehicleType: String) {
        require(cargoTons.isFinite() && cargoTons > 0) { "Enter cargo weight" }
        val capacity = truckCapacityTons(vehicleType) ?: return
        require(cargoTons <= capacity) { "Cargo load exceeds the selected truck capacity" }
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
