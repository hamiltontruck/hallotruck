package com.hallo.logistics.customer

import androidx.appcompat.app.AppCompatDelegate
import java.util.Locale

object CustomerAuthPolicy {
    private val emailPattern = Regex("^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$", RegexOption.IGNORE_CASE)
    private val safeLocalMessages = setOf(
        "Enter cargo weight",
        "Cargo load exceeds the selected truck capacity",
        "Payment receipt is not available",
        "Customer order was not found",
    )

    fun validateSignIn(email: String, password: String): String? {
        val cleanEmail = email.trim()
        return when {
            cleanEmail.isBlank() -> tr("Enter your email address")
            cleanEmail.length > 254 || !emailPattern.matches(cleanEmail) -> tr("Enter a valid email address")
            password.length < 6 -> tr("Password must be at least 6 characters")
            password.length > 72 -> tr("Password must be 72 characters or fewer")
            else -> null
        }
    }

    fun validateSignUp(name: String, phone: String, email: String, pin: String, confirmation: String): String? {
        val cleanName = name.trim().replace(Regex("\\s+"), " ")
        val cleanEmail = email.trim()
        return when {
            cleanName.length !in 2..80 -> tr("Enter your full name")
            cleanName.any { it.isISOControl() } -> tr("Enter a valid full name")
            runCatching { CustomerPolicy.normalizePhone(phone) }.isFailure -> tr("Enter a valid Ethiopian 07/09 mobile number")
            cleanEmail.isBlank() -> tr("Enter your email address")
            cleanEmail.length > 254 || !emailPattern.matches(cleanEmail) -> tr("Enter a valid email address")
            !CustomerPolicy.isSixDigitPin(pin) -> tr("PIN must be exactly 6 digits")
            !CustomerPolicy.isSixDigitPin(confirmation) -> tr("Confirm PIN must be exactly 6 digits")
            pin != confirmation -> tr("PIN numbers do not match")
            else -> null
        }
    }

    fun cleanEmail(email: String): String = email.trim().lowercase()

    fun cleanName(name: String): String = name.trim().replace(Regex("\\s+"), " ")

    fun cleanPhone(phone: String): String = CustomerPolicy.normalizePhone(phone)

    fun safeMessage(error: Throwable): String {
        val direct = error.message?.trim().orEmpty()
        if (direct in safeLocalMessages) return direct

        val text = generateSequence(error) { it.cause }
            .mapNotNull { it.message }
            .joinToString(" ")
            .lowercase()

        return when {
            "invalid login credentials" in text || "invalid_credentials" in text ->
                tr("Email or password is incorrect")
            "email not confirmed" in text || "email_not_confirmed" in text ->
                tr("Confirm your email before signing in")
            "user already registered" in text || "already been registered" in text ->
                tr("An account already exists for this email")
            "rate limit" in text || "too many requests" in text || "429" in text ->
                tr("Too many attempts. Please wait and try again")
            "network" in text || "timeout" in text || "timed out" in text || "socket" in text || "unable to resolve host" in text ->
                tr("Network problem. Check your connection and try again")
            "customer session expired" in text ->
                tr("Your session expired. Please sign in again")
            "not authorized for hallo customer" in text ->
                tr("This account is not authorized for HALLO Customer")
            "pin must be exactly 6 digits" in text ->
                tr("PIN must be exactly 6 digits")
            "full name" in text ->
                tr("Enter your full name")
            "valid ethiopian" in text ->
                tr("Enter a valid Ethiopian 07/09 mobile number")
            else -> tr("Customer request failed. Please try again")
        }
    }

    /**
     * Converts a retained auth validation/error message to the currently active app locale.
     * This is presentation-only and is used after AppCompat recreates the Activity for EN/OR/AM.
     */
    fun localizeKnownMessage(message: String): String {
        val canonical = when (message.trim()) {
            "Imeelii kee galchi", "ኢሜይልዎን ያስገቡ" -> "Enter your email address"
            "Teessoo imeelii sirrii galchi", "ትክክለኛ የኢሜይል አድራሻ ያስገቡ" -> "Enter a valid email address"
            "Jechi darbii yoo xiqqaate arfiilee 6 qabaachuu qaba", "የይለፍ ቃሉ ቢያንስ 6 ቁምፊዎች ሊኖሩት ይገባል" -> "Password must be at least 6 characters"
            "Jechi darbii arfiilee 72 caaluu hin qabu", "የይለፍ ቃሉ 72 ቁምፊዎች ወይም ከዚያ ያነሰ መሆን አለበት" -> "Password must be 72 characters or fewer"
            "Maqaa kee guutuu galchi", "ሙሉ ስምዎን ያስገቡ" -> "Enter your full name"
            "Maqaa guutuu sirrii galchi", "ትክክለኛ ሙሉ ስም ያስገቡ" -> "Enter a valid full name"
            "Lakkoofsa bilbilaa Itoophiyaa 07/09 sirrii galchi", "ትክክለኛ የኢትዮጵያ 07/09 ሞባይል ቁጥር ያስገቡ" -> "Enter a valid Ethiopian 07/09 mobile number"
            "PIN lakkoofsa 6 qofa ta'uu qaba", "PIN በትክክል 6 አሃዞች መሆን አለበት" -> "PIN must be exactly 6 digits"
            "PIN mirkaneessuu lakkoofsa 6 qofa ta'uu qaba", "የማረጋገጫ PIN በትክክል 6 አሃዞች መሆን አለበት" -> "Confirm PIN must be exactly 6 digits"
            "PIN lamaan wal hin gitu", "የPIN ቁጥሮቹ አይዛመዱም" -> "PIN numbers do not match"
            "Imeeliin ykn jechi darbii sirrii miti", "ኢሜይሉ ወይም የይለፍ ቃሉ ትክክል አይደለም" -> "Email or password is incorrect"
            "Osoo hin seeniin dura imeelii kee mirkaneessi", "ከመግባትዎ በፊት ኢሜይልዎን ያረጋግጡ" -> "Confirm your email before signing in"
            "Imeelii kanaan herregni duraan jira", "በዚህ ኢሜይል መለያ አስቀድሞ አለ" -> "An account already exists for this email"
            "Yaalii baay'ate. Xiqqoo eegiitii irra deebi'ii yaali", "ብዙ ሙከራዎች ተደርገዋል። ትንሽ ቆይተው እንደገና ይሞክሩ" -> "Too many attempts. Please wait and try again"
            "Rakkoo interneetii. Walqunnamtii kee ilaalii irra deebi'ii yaali", "የኔትወርክ ችግር አለ። ግንኙነትዎን ይፈትሹ እና እንደገና ይሞክሩ" -> "Network problem. Check your connection and try again"
            "Yeroon seensaa kee dhumeera. Irra deebi'ii seeni", "የመግቢያ ጊዜዎ አብቅቷል። እንደገና ይግቡ" -> "Your session expired. Please sign in again"
            "Herregni kun HALLO Customer fayyadamuuf hayyamama hin qabu", "ይህ መለያ HALLO Customer ለመጠቀም አልተፈቀደለትም" -> "This account is not authorized for HALLO Customer"
            "Gaaffiin Customer hin milkoofne. Irra deebi'ii yaali", "የCustomer ጥያቄው አልተሳካም። እንደገና ይሞክሩ" -> "Customer request failed. Please try again"
            else -> message
        }
        return tr(canonical)
    }

    private fun tr(english: String): String {
        val appLanguage = AppCompatDelegate.getApplicationLocales().get(0)?.language
            ?.takeIf { it.isNotBlank() }
            ?: Locale.getDefault().language
        return when (appLanguage.lowercase()) {
            "om" -> when (english) {
                "Enter your email address" -> "Imeelii kee galchi"
                "Enter a valid email address" -> "Teessoo imeelii sirrii galchi"
                "Password must be at least 6 characters" -> "Jechi darbii yoo xiqqaate arfiilee 6 qabaachuu qaba"
                "Password must be 72 characters or fewer" -> "Jechi darbii arfiilee 72 caaluu hin qabu"
                "Enter your full name" -> "Maqaa kee guutuu galchi"
                "Enter a valid full name" -> "Maqaa guutuu sirrii galchi"
                "Enter a valid Ethiopian 07/09 mobile number" -> "Lakkoofsa bilbilaa Itoophiyaa 07/09 sirrii galchi"
                "PIN must be exactly 6 digits" -> "PIN lakkoofsa 6 qofa ta'uu qaba"
                "Confirm PIN must be exactly 6 digits" -> "PIN mirkaneessuu lakkoofsa 6 qofa ta'uu qaba"
                "PIN numbers do not match" -> "PIN lamaan wal hin gitu"
                "Email or password is incorrect" -> "Imeeliin ykn jechi darbii sirrii miti"
                "Confirm your email before signing in" -> "Osoo hin seeniin dura imeelii kee mirkaneessi"
                "An account already exists for this email" -> "Imeelii kanaan herregni duraan jira"
                "Too many attempts. Please wait and try again" -> "Yaalii baay'ate. Xiqqoo eegiitii irra deebi'ii yaali"
                "Network problem. Check your connection and try again" -> "Rakkoo interneetii. Walqunnamtii kee ilaalii irra deebi'ii yaali"
                "Your session expired. Please sign in again" -> "Yeroon seensaa kee dhumeera. Irra deebi'ii seeni"
                "This account is not authorized for HALLO Customer" -> "Herregni kun HALLO Customer fayyadamuuf hayyamama hin qabu"
                "Customer request failed. Please try again" -> "Gaaffiin Customer hin milkoofne. Irra deebi'ii yaali"
                else -> english
            }
            "am" -> when (english) {
                "Enter your email address" -> "ኢሜይልዎን ያስገቡ"
                "Enter a valid email address" -> "ትክክለኛ የኢሜይል አድራሻ ያስገቡ"
                "Password must be at least 6 characters" -> "የይለፍ ቃሉ ቢያንስ 6 ቁምፊዎች ሊኖሩት ይገባል"
                "Password must be 72 characters or fewer" -> "የይለፍ ቃሉ 72 ቁምፊዎች ወይም ከዚያ ያነሰ መሆን አለበት"
                "Enter your full name" -> "ሙሉ ስምዎን ያስገቡ"
                "Enter a valid full name" -> "ትክክለኛ ሙሉ ስም ያስገቡ"
                "Enter a valid Ethiopian 07/09 mobile number" -> "ትክክለኛ የኢትዮጵያ 07/09 ሞባይል ቁጥር ያስገቡ"
                "PIN must be exactly 6 digits" -> "PIN በትክክል 6 አሃዞች መሆን አለበት"
                "Confirm PIN must be exactly 6 digits" -> "የማረጋገጫ PIN በትክክል 6 አሃዞች መሆን አለበት"
                "PIN numbers do not match" -> "የPIN ቁጥሮቹ አይዛመዱም"
                "Email or password is incorrect" -> "ኢሜይሉ ወይም የይለፍ ቃሉ ትክክል አይደለም"
                "Confirm your email before signing in" -> "ከመግባትዎ በፊት ኢሜይልዎን ያረጋግጡ"
                "An account already exists for this email" -> "በዚህ ኢሜይል መለያ አስቀድሞ አለ"
                "Too many attempts. Please wait and try again" -> "ብዙ ሙከራዎች ተደርገዋል። ትንሽ ቆይተው እንደገና ይሞክሩ"
                "Network problem. Check your connection and try again" -> "የኔትወርክ ችግር አለ። ግንኙነትዎን ይፈትሹ እና እንደገና ይሞክሩ"
                "Your session expired. Please sign in again" -> "የመግቢያ ጊዜዎ አብቅቷል። እንደገና ይግቡ"
                "This account is not authorized for HALLO Customer" -> "ይህ መለያ HALLO Customer ለመጠቀም አልተፈቀደለትም"
                "Customer request failed. Please try again" -> "የCustomer ጥያቄው አልተሳካም። እንደገና ይሞክሩ"
                else -> english
            }
            else -> english
        }
    }
}
