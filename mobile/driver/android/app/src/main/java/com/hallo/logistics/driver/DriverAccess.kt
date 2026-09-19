package com.hallo.logistics.driver

import java.time.LocalDate

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
    val identityKeys = linkedSetOf(
        "driver_photo",
        "license_front",
        "license_back",
        "national_id_front",
        "national_id_back",
    )
    val vehicleKeys = linkedSetOf(
        "vehicle_registration",
        "truck_front",
        "truck_side",
    )
    val expiryRequiredKeys = setOf("license_front", "national_id_front")

    // Historical files remain readable in Driver data, but they are not current requirements
    // and cannot be selected as new required uploads from the native app.
    val historicalVehicleKeys = setOf(
        "insurance",
        "transport_permit",
        "truck_back",
        "truck_loading_area",
    )
    val allKeys = identityKeys + vehicleKeys

    fun identityCompletion(documents:List<DriverDocument>, today:LocalDate=LocalDate.now()):Pair<Int,Int> =
        currentCount(documents.filter { it.truckId == null }, identityKeys, today) to identityKeys.size

    fun vehicleCompletion(documents:List<DriverDocument>, truckId:String?, today:LocalDate=LocalDate.now()):Pair<Int,Int> {
        if (truckId == null) return 0 to vehicleKeys.size
        return currentCount(documents.filter { it.truckId == truckId }, vehicleKeys, today) to vehicleKeys.size
    }

    fun completion(documents:List<DriverDocument>,truckId:String?,today:LocalDate=LocalDate.now()):Pair<Int,Int>{
        val identity = identityCompletion(documents,today)
        val vehicle = vehicleCompletion(documents,truckId,today)
        return (identity.first + vehicle.first) to (identity.second + vehicle.second)
    }

    private fun currentCount(documents:List<DriverDocument>, required:Set<String>, today:LocalDate):Int {
        val latest = documents
            .filter { it.key in required }
            .groupBy { it.key }
            .mapValues { (_, rows) -> rows.maxByOrNull { it.createdAt.orEmpty() } }
        return required.count { key ->
            val row = latest[key] ?: return@count false
            if (row.status?.lowercase() != "verified") return@count false
            if (key !in expiryRequiredKeys) return@count true
            val expiry = runCatching { LocalDate.parse(row.expiryDate) }.getOrNull() ?: return@count false
            !expiry.isBefore(today)
        }
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
