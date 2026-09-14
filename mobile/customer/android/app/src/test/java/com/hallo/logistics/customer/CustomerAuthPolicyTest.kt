package com.hallo.logistics.customer

import java.util.Locale
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class CustomerAuthPolicyTest {
    private lateinit var originalLocale: Locale

    @Before fun rememberLocale() {
        originalLocale = Locale.getDefault()
        Locale.setDefault(Locale.ENGLISH)
    }

    @After fun restoreLocale() {
        Locale.setDefault(originalLocale)
    }

    @Test fun signInRequiresValidEmailAndExactlySixNumericPin() {
        assertEquals("Enter a valid email address", CustomerAuthPolicy.validateSignIn("not-an-email", "123456"))
        listOf("12345", "1234567", "12a456", "abcdef", "").forEach { invalidPin ->
            assertEquals("PIN must be exactly 6 digits", CustomerAuthPolicy.validateSignIn("user@example.com", invalidPin))
        }
        assertNull(CustomerAuthPolicy.validateSignIn(" User @ Example.com ", "123456"))
        assertEquals("user@example.com", CustomerAuthPolicy.cleanEmail(" User @ Example.com "))
    }

    @Test fun signUpRequiresValidPhoneEmailAndSixDigitPin() {
        assertEquals(
            "Enter a valid Ethiopian 07/09 mobile number",
            CustomerAuthPolicy.validateSignUp("Abdi User", "177558+338880888", "user@example.com", "123456", "123456"),
        )
        assertEquals(
            "Enter a valid email address",
            CustomerAuthPolicy.validateSignUp("Abdi User", "0911223344", "bad-email", "123456", "123456"),
        )
        assertEquals(
            "PIN must be exactly 6 digits",
            CustomerAuthPolicy.validateSignUp("Abdi User", "0911223344", "user@example.com", "1234567", "1234567"),
        )
        assertNull(CustomerAuthPolicy.validateSignUp("Abdi User", "+251911223344", "user@example.com", "123456", "123456"))
    }

    @Test fun backendErrorsNeverExposeUrlsHeadersOrKeys() {
        val raw = IllegalStateException(
            "invalid_credentials URL: https://project.supabase.co/auth/v1/token Headers: Authorization=[Bearer sb_publishable_secret] X-Client-Info=supabase-kt",
        )
        val safe = CustomerAuthPolicy.safeMessage(raw)
        assertEquals("Email or password is incorrect", safe)
        assertTrue("supabase" !in safe.lowercase())
        assertTrue("bearer" !in safe.lowercase())
        assertTrue("http" !in safe.lowercase())
    }

    @Test fun unknownBackendErrorIsGeneric() {
        val safe = CustomerAuthPolicy.safeMessage(IllegalStateException("URL: https://secret.example Headers: Authorization=Bearer abc123"))
        assertEquals("Customer request failed. Please try again", safe)
    }

    @Test fun authValidationFollowsOromoLocale() {
        Locale.setDefault(Locale.forLanguageTag("om"))
        assertEquals("Teessoo imeelii sirrii galchi", CustomerAuthPolicy.validateSignIn("bad-email", "123456"))
        assertEquals("PIN lakkoofsa 6 qofa ta'uu qaba", CustomerAuthPolicy.validateSignIn("user@example.com", "12a456"))
        assertEquals(
            "Imeeliin ykn PIN sirrii miti",
            CustomerAuthPolicy.safeMessage(IllegalStateException("invalid_credentials URL: https://secret.supabase.co")),
        )
    }

    @Test fun authValidationFollowsAmharicLocale() {
        Locale.setDefault(Locale.forLanguageTag("am"))
        assertEquals("ትክክለኛ የኢሜይል አድራሻ ያስገቡ", CustomerAuthPolicy.validateSignIn("bad-email", "123456"))
        assertEquals("PIN በትክክል 6 አሃዞች መሆን አለበት", CustomerAuthPolicy.validateSignIn("user@example.com", "12a456"))
        assertEquals(
            "ኢሜይሉ ወይም PIN ትክክል አይደለም",
            CustomerAuthPolicy.safeMessage(IllegalStateException("invalid_credentials Authorization=Bearer redacted")),
        )
    }
}
