package com.hallo.logistics.customer

import java.math.BigDecimal
import java.math.RoundingMode

object CustomerBookingPolicy {
    fun cargoToTons(quantity: Double, unit: String): Double {
        if (!quantity.isFinite() || quantity <= 0) return 0.0
        return if (unit == "quintal") quantity / 10.0 else quantity
    }

    fun truckCapacityTons(vehicleType: String): Double? = when (vehicleType.trim()) {
        "Isuzu 5 Ton" -> 5.0
        "Dry Cargo" -> 10.0
        "Truck 22 Ton" -> 22.0
        "Truck 25 Ton" -> 25.0
        "Truck 30 Ton" -> 30.0
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