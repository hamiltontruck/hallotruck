package com.hallo.logistics.customer

import java.time.Duration
import java.time.Instant

object CustomerPolicy {
    private val cancellable = setOf("quoted", "placed", "accepted")
    fun isCustomer(role: String?) = role?.trim()?.lowercase() == "customer"
    fun isSixDigitPin(value: String) = value.matches(Regex("^[0-9]{6}$"))
    fun canCancel(status: String?) = status?.lowercase() in cancellable
    fun trackingFreshness(recordedAt: String?, hasCoordinates: Boolean, now: Instant = Instant.now()): String {
        if (!hasCoordinates || recordedAt.isNullOrBlank()) return "OFFLINE"
        val seconds = runCatching { Duration.between(Instant.parse(recordedAt), now).seconds }.getOrDefault(Long.MAX_VALUE)
        return when { seconds <= 90 -> "LIVE"; seconds <= 600 -> "STALE"; else -> "OFFLINE" }
    }
    fun normalizePhone(value: String): String {
        val compact = value.trim().replace(Regex("[\\s()-]"), "")
        require(compact.matches(Regex("^(\\+251|251|0)?[79][0-9]{8}$"))) { "Enter a valid Ethiopian 07/09 mobile number" }
        return when {
            compact.startsWith("+251") -> "0${compact.drop(4)}"
            compact.startsWith("251") -> "0${compact.drop(3)}"
            compact.startsWith("7") || compact.startsWith("9") -> "0$compact"
            else -> compact
        }
    }
}
