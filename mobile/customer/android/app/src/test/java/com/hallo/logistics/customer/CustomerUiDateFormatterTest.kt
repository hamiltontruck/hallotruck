package com.hallo.logistics.customer

import java.time.ZoneId
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class CustomerUiDateFormatterTest {
    private val zone = ZoneId.of("Africa/Addis_Ababa")

    @Test fun missingAndMalformedDatesUseFallbackInEverySupportedLocale() {
        listOf("en", "om", "am").forEach { tag ->
            listOf(null, "", "   ", "invalid", "2026-99-99T25:00:00Z").forEach { raw ->
                assertEquals("—", CustomerUiDateFormatter.format(raw, Locale.forLanguageTag(tag), zone))
            }
        }
    }

    @Test fun timestampUsesTheCustomersLocalDay() {
        assertEquals("Sep 14, 2026", CustomerUiDateFormatter.format("2026-09-13T22:30:00Z", Locale.US, zone))
        assertEquals("Sep 14, 2026", CustomerUiDateFormatter.format("2026-09-14", Locale.US, zone))
    }

    @Test fun localizedDatesDoNotExposeIsoTimestamps() {
        listOf("en", "om", "am").forEach { tag ->
            val result = CustomerUiDateFormatter.format("2026-09-14T01:30:00+03:00", Locale.forLanguageTag(tag), zone)
            assertFalse(result == "—" || result.contains("T01:30") || result.contains("+03:00"))
        }
    }
}
