package com.hallo.logistics.driver
enum class DriverAccess { SIGNED_OUT, ONBOARDING, APPROVED, REJECTED, FORBIDDEN }
object DriverAccessPolicy {
 fun resolve(role: String?, status: String?): DriverAccess {
  if (role?.lowercase() != "driver") return DriverAccess.FORBIDDEN
  return when (status?.lowercase()) { "approved" -> DriverAccess.APPROVED; "rejected", "suspended" -> DriverAccess.REJECTED; else -> DriverAccess.ONBOARDING }
 }
 fun validSignupPin(value: String) = value.length == 6 && value.all(Char::isDigit)
}

object DriverDocumentPolicy {
 val identityKeys=setOf("driver_photo","license_front","license_back","national_id_front","national_id_back")
 val vehicleKeys=setOf("vehicle_registration","insurance","truck_front","truck_side")
 fun completion(documents:List<DriverDocument>,truckId:String?):Pair<Int,Int>{val identity=documents.filter{it.truckId==null}.map{it.key}.toSet();val vehicle=documents.filter{it.truckId==truckId}.map{it.key}.toSet();return (identityKeys.count{it in identity}+vehicleKeys.count{it in vehicle}) to 9}
}

object DriverDeliveryPolicy {
 fun validate(status:String?,method:String?,result:String,tripAmount:Double?,collected:Double?){require(status=="in_transit"){"Trip must be in transit"};when(method){"cash"->{require(result=="cash_received"){"Confirm cash received"};require(tripAmount!=null&&collected!=null&&kotlin.math.abs(tripAmount-collected)<0.005){"Enter the exact collected amount"}};"bank_telebirr"->require(result in setOf("bank_telebirr_confirmed","not_collected")){"Choose a valid platform payment result"};else->error("Payment method is unavailable")}}
}
