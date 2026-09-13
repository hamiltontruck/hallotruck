package com.hallo.logistics.customer

object CustomerAuthPolicy {
    private val emailPattern = Regex("^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$", RegexOption.IGNORE_CASE)

    fun validateSignIn(email: String, password: String): String? {
        val cleanEmail = email.trim()
        return when {
            cleanEmail.isBlank() -> "Enter your email address"
            cleanEmail.length > 254 || !emailPattern.matches(cleanEmail) -> "Enter a valid email address"
            password.length < 6 -> "Password must be at least 6 characters"
            password.length > 72 -> "Password must be 72 characters or fewer"
            else -> null
        }
    }

    fun validateSignUp(name: String, phone: String, email: String, pin: String, confirmation: String): String? {
        val cleanName = name.trim().replace(Regex("\\s+"), " ")
        val cleanEmail = email.trim()
        return when {
            cleanName.length !in 2..80 -> "Enter your full name"
            cleanName.any { it.isISOControl() } -> "Enter a valid full name"
            runCatching { CustomerPolicy.normalizePhone(phone) }.isFailure -> "Enter a valid Ethiopian 07/09 mobile number"
            cleanEmail.isBlank() -> "Enter your email address"
            cleanEmail.length > 254 || !emailPattern.matches(cleanEmail) -> "Enter a valid email address"
            !CustomerPolicy.isSixDigitPin(pin) -> "PIN must be exactly 6 digits"
            !CustomerPolicy.isSixDigitPin(confirmation) -> "Confirm PIN must be exactly 6 digits"
            pin != confirmation -> "PIN numbers do not match"
            else -> null
        }
    }

    fun cleanEmail(email: String): String = email.trim().lowercase()

    fun cleanName(name: String): String = name.trim().replace(Regex("\\s+"), " ")

    fun cleanPhone(phone: String): String = CustomerPolicy.normalizePhone(phone)

    fun safeMessage(error: Throwable): String {
        val text = generateSequence(error) { it.cause }
            .mapNotNull { it.message }
            .joinToString(" ")
            .lowercase()

        return when {
            "invalid login credentials" in text || "invalid_credentials" in text ->
                "Email or password is incorrect"
            "email not confirmed" in text || "email_not_confirmed" in text ->
                "Confirm your email before signing in"
            "user already registered" in text || "already been registered" in text ->
                "An account already exists for this email"
            "rate limit" in text || "too many requests" in text || "429" in text ->
                "Too many attempts. Please wait and try again"
            "network" in text || "timeout" in text || "timed out" in text || "socket" in text || "unable to resolve host" in text ->
                "Network problem. Check your connection and try again"
            "customer session expired" in text ->
                "Your session expired. Please sign in again"
            "not authorized for hallo customer" in text ->
                "This account is not authorized for HALLO Customer"
            "pin must be exactly 6 digits" in text ->
                "PIN must be exactly 6 digits"
            "full name" in text ->
                "Enter your full name"
            "valid ethiopian" in text ->
                "Enter a valid Ethiopian 07/09 mobile number"
            else -> "Customer request failed. Please try again"
        }
    }
}
