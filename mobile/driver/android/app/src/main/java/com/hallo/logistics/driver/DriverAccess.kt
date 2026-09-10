package com.hallo.logistics.driver

enum class DriverAccess { SIGNED_OUT, ONBOARDING, APPROVED, REJECTED, FORBIDDEN }

enum class DriverMessage {
    RESTORING, CONFIG_REQUIRED, SIGN_IN_REQUIRED, SIGNING_IN, CREATING_ACCOUNT,
    CONFIRM_EMAIL, SIGNED_OUT, REFRESHING, CURRENT, ACCESS_DENIED, ACCEPTING_JOB,
    OPEN_TRIP, SAVING_VEHICLE, UPLOADING_DOCUMENT, SUBMITTING_DELIVERY,
    TRIP_COMPLETED, ACTIVE_TRIP_SYNCED, GPS_STARTED, GPS_STOPPED, MARKING_READ,
}

enum class DriverErrorCode {
    INVALID_CREDENTIALS, ACCOUNT_EXISTS, NETWORK, SESSION_EXPIRED, FORBIDDEN,
    INVALID_INPUT, DUPLICATE_ACTION, PERMISSION_DENIED, REQUEST_FAILED,
}

object DriverAccessPolicy {
    fun resolve(role:String?, status:String?):DriverAccess {
        if (role?.lowercase() != "driver") return DriverAccess.FORBIDDEN
        return when (status?.lowercase()) {
            "approved" -> DriverAccess.APPROVED
            "rejected", "suspended", "disabled" -> DriverAccess.REJECTED
            else -> DriverAccess.ONBOARDING
        }
    }
    fun validSignupPin(value:String)=value.length==6 && value.all(Char::isDigit)
    fun jobsLocked(access:DriverAccess, commissionDue:Double)=access != DriverAccess.APPROVED || commissionDue > 0.005
}

object DriverErrorPolicy {
    fun code(error:Throwable):DriverErrorCode {
        val raw=error.message.orEmpty()
        return when {
            raw.contains("invalid_credentials",true)||raw.contains("invalid login credentials",true)->DriverErrorCode.INVALID_CREDENTIALS
            raw.contains("already registered",true)->DriverErrorCode.ACCOUNT_EXISTS
            raw.contains("network",true)||raw.contains("timeout",true)||raw.contains("unable to resolve host",true)->DriverErrorCode.NETWORK
            raw.contains("session expired",true)||raw.contains("jwt",true)->DriverErrorCode.SESSION_EXPIRED
            raw.contains("authorized",true)||raw.contains("permission",true)||raw.contains("row-level security",true)->DriverErrorCode.FORBIDDEN
            raw.contains("already",true)||raw.contains("duplicate",true)->DriverErrorCode.DUPLICATE_ACTION
            error is IllegalArgumentException->DriverErrorCode.INVALID_INPUT
            else->DriverErrorCode.REQUEST_FAILED
        }
    }

    // Preserved for regression/security tests and non-UI callers. UI renders localized
    // resources from code(error), so raw Supabase request headers are never exposed.
    fun safeMessage(error:Throwable):String=when(code(error)) {
        DriverErrorCode.INVALID_CREDENTIALS -> "Email or password is incorrect"
        DriverErrorCode.ACCOUNT_EXISTS -> "An account already exists for this email"
        DriverErrorCode.NETWORK -> "Network unavailable. Check your connection and try again"
        DriverErrorCode.SESSION_EXPIRED -> "Your session expired. Sign in again"
        DriverErrorCode.FORBIDDEN -> "You do not have permission for this Driver action"
        DriverErrorCode.INVALID_INPUT -> "Check the required information and try again"
        DriverErrorCode.DUPLICATE_ACTION -> "This action was already completed"
        DriverErrorCode.PERMISSION_DENIED -> "Required permission was denied"
        DriverErrorCode.REQUEST_FAILED -> "Request failed. Please try again"
    }
}

object DriverDocumentPolicy {
    val identityKeys=setOf("driver_photo","license_front","license_back","national_id_front","national_id_back")
    val vehicleKeys=setOf("vehicle_registration","truck_front","insurance","transport_permit","truck_back","truck_side","truck_loading_area")
    val allKeys=identityKeys+vehicleKeys
    fun completion(documents:List<DriverDocument>,truckId:String?):Pair<Int,Int>{
        val identity=documents.filter{it.truckId==null}.map{it.key}.toSet()
        val vehicle=documents.filter{it.truckId==truckId}.map{it.key}.toSet()
        return (identityKeys.count{it in identity}+vehicleKeys.count{it in vehicle}) to allKeys.size
    }
}

object DriverDeliveryPolicy {
    val supportedResults=setOf("cash_received","bank_telebirr","payment_not_received")
    fun validate(status:String?,method:String?,result:String,tripAmount:Double?,collected:Double?){
        require(status=="in_transit")
        require(result in supportedResults)
        when(method){
            "cash"->{
                require(result in setOf("cash_received","payment_not_received"))
                if(result=="cash_received") require(tripAmount!=null&&collected!=null&&kotlin.math.abs(tripAmount-collected)<0.005)
            }
            "bank_telebirr"->require(result in setOf("bank_telebirr","payment_not_received"))
            else->require(result=="payment_not_received")
        }
    }
}

object DriverFinancePresentationPolicy {
    fun blocked(summary:DriverCommissionSummary?, financial:FinancialSummary?):Boolean =
        summary?.blocked ?: ((financial?.commissionDue ?: 0.0) > 0.005)
    fun availableDeposit(financial:FinancialSummary?)=financial?.availableDeposit ?: 0.0
    fun activeDeposit(financial:FinancialSummary?)=financial?.adminDeposit ?: 0.0
}
