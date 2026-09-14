package com.hallo.logistics.customer

import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** User-facing dates only; missing or invalid timestamps never expose raw backend values. */
object CustomerUiDateFormatter {
    fun format(raw: String?, locale: Locale, zone: ZoneId = ZoneId.systemDefault()): String {
        val value = raw?.trim()?.takeIf { it.isNotEmpty() } ?: return "—"
        val date = runCatching { OffsetDateTime.parse(value).atZoneSameInstant(zone).toLocalDate() }
            .getOrElse { runCatching { LocalDate.parse(value) }.getOrNull() } ?: return "—"
        return DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(date)
    }
}
