package com.hallo.logistics.customer

import io.github.jan.supabase.auth.auth

/**
 * Native Customer password recovery using the existing HALLO Supabase Auth contract.
 * No schema, RLS, pricing, or business-rule changes are introduced here.
 */
class CustomerPasswordRecovery {
    private val client get() = HalloSupabase.client

    suspend fun sendRecoveryEmail(email: String) {
        val cleanEmail = CustomerAuthPolicy.cleanEmail(email)
        val validation = CustomerAuthPolicy.validateSignIn(cleanEmail, "123456")
        require(validation == null || !validation.contains("email", ignoreCase = true)) {
            validation ?: "Enter a valid email address"
        }
        // Auth is configured with hallocustomer://auth-callback in HalloSupabase.
        // Omitting redirectUrl intentionally uses that platform-native callback.
        client.auth.resetPasswordForEmail(email = cleanEmail)
    }

    suspend fun updateRecoveredPin(pin: String, confirmation: String) {
        require(CustomerPolicy.isSixDigitPin(pin)) { "Password must be exactly 6 numeric digits." }
        require(pin == confirmation) { "PIN numbers do not match" }
        client.auth.updateUser {
            password = pin
        }
    }
}
