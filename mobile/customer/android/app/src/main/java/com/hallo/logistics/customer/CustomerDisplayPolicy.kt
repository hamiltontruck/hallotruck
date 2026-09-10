package com.hallo.logistics.customer

object CustomerDisplayPolicy {
    fun initial(name: String?, fallback: String): String =
        name?.trim()?.firstOrNull()?.uppercase() ?: fallback.take(1).uppercase()

    fun usablePhotoUrl(url: String?): String? = url?.trim()?.takeIf { it.startsWith("https://") }

    fun verifiedDriverPhotoUrl(assignment: CustomerAssignment?, media: CustomerAssignmentMedia?): String? =
        if (assignment?.driverVerified == true) usablePhotoUrl(media?.driverPhotoUrl) else null

    fun truckPhotoUrl(media: CustomerAssignmentMedia?): String? = usablePhotoUrl(media?.truckPhotoUrl)
}
