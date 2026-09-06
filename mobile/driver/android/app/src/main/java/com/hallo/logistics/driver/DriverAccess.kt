package com.hallo.logistics.driver
enum class DriverAccess { SIGNED_OUT, ONBOARDING, APPROVED, REJECTED, FORBIDDEN }
object DriverAccessPolicy {
 fun resolve(role: String?, status: String?): DriverAccess {
  if (role?.lowercase() != "driver") return DriverAccess.FORBIDDEN
  return when (status?.lowercase()) { "approved" -> DriverAccess.APPROVED; "rejected", "suspended" -> DriverAccess.REJECTED; else -> DriverAccess.ONBOARDING }
 }
 fun validSignupPin(value: String) = value.length == 6 && value.all(Char::isDigit)
}
