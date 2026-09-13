package com.hallo.logistics.customer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CustomerAuthPolicyTest {
    @Test fun signInRequiresValidEmailAndBoundedPassword() {
        assertEquals("Enter a valid email address", CustomerAuthPolicy.validateSignIn("not-an-email", "123456"))
        assertEquals("Password must be at least 6 characters", CustomerAuthPolicy.validateSignIn("user@example.com", "12345"))
        assertEquals("Password must be 72 characters or fewer", CustomerAuthPolicy.validateSignIn("user@example.com", "x".repeat(73)))
        assertNull(CustomerAuthPolicy.validateSignIn(" User@Example.com ", "123456"))
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
}
