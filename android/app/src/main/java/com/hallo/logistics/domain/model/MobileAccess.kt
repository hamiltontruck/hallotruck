package com.hallo.logistics.domain.model

enum class MobileAccess { SIGNED_OUT, CUSTOMER, DRIVER, DRIVER_PENDING, DRIVER_REJECTED, FORBIDDEN }
data class ProfileAccess(val role: String?, val driverStatus: String?)

object MobileAccessPolicy {
    fun resolve(profile: ProfileAccess?): MobileAccess {
        if (profile == null) return MobileAccess.FORBIDDEN
        return when (profile.role?.lowercase()) {
            "customer" -> MobileAccess.CUSTOMER
            "driver" -> when (profile.driverStatus?.lowercase()) {
                "approved", "active" -> MobileAccess.DRIVER
                "pending", "pending_verification", "under_review" -> MobileAccess.DRIVER_PENDING
                "rejected" -> MobileAccess.DRIVER_REJECTED
                else -> MobileAccess.FORBIDDEN
            }
            else -> MobileAccess.FORBIDDEN
        }
    }
}
