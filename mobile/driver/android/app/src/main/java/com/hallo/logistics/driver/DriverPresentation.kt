package com.hallo.logistics.driver

import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

enum class DriverTrackingFreshness { LIVE, STALE, OFFLINE }

object DriverPresentation {
    const val TRACKING_LIVE_MAX_AGE_MS = 2 * 60 * 1000L
    const val TRACKING_OFFLINE_AFTER_MS = 30 * 60 * 1000L

    fun trackingFreshness(recordedAt: String?, now: Instant = Instant.now()): DriverTrackingFreshness {
        val recorded = parseInstant(recordedAt) ?: return DriverTrackingFreshness.OFFLINE
        val age = Duration.between(recorded, now).toMillis().coerceAtLeast(0L)
        return when {
            age <= TRACKING_LIVE_MAX_AGE_MS -> DriverTrackingFreshness.LIVE
            age < TRACKING_OFFLINE_AFTER_MS -> DriverTrackingFreshness.STALE
            else -> DriverTrackingFreshness.OFFLINE
        }
    }

    fun formatDateTime(value: String?, locale: Locale, zoneId: ZoneId): String? {
        val instant = parseInstant(value) ?: return null
        return DateTimeFormatter.ofPattern("dd MMM yyyy, h:mm a", locale)
            .withZone(zoneId)
            .format(instant)
    }

    fun formatDate(value: String?, locale: Locale): String? {
        if (value.isNullOrBlank()) return null
        return runCatching {
            val parsed = java.time.LocalDate.parse(value)
            DateTimeFormatter.ofPattern("dd MMM yyyy", locale).format(parsed)
        }.getOrNull()
    }

    fun humanizeToken(value: String?): String? = value
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?.replace('_', ' ')
        ?.split(Regex("\\s+"))
        ?.joinToString(" ") { word -> word.replaceFirstChar { char -> char.uppercase() } }

    private fun parseInstant(value: String?): Instant? {
        if (value.isNullOrBlank()) return null
        return runCatching { Instant.parse(value) }
            .recoverCatching { OffsetDateTime.parse(value).toInstant() }
            .getOrNull()
    }
}
