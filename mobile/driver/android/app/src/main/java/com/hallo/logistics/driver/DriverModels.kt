package com.hallo.logistics.driver

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable data class DriverProfile(
    val id:String,
    val role:String?=null,
    @SerialName("driver_status") val driverStatus:String?=null,
    @SerialName("full_name") val fullName:String?=null,
    val phone:String?=null,
    val email:String?=null,
    @SerialName("home_address") val homeAddress:String?=null,
    @SerialName("vehicle_type") val vehicleType:String?=null,
    @SerialName("rating_avg") val rating:Double?=null,
)

@Serializable data class DriverJob(
    val id:String,
    @SerialName("driver_id") val driverId:String?=null,
    @SerialName("tracking_id") val trackingId:String?=null,
    @SerialName("pickup_address") val pickup:String?=null,
    @SerialName("dropoff_address") val dropoff:String?=null,
    @SerialName("vehicle_type") val vehicleType:String?=null,
    @SerialName("distance_km") val distanceKm:Double?=null,
    @SerialName("price_etb") val priceEtb:Double?=null,
    @SerialName("selected_payment_method") val paymentMethod:String?=null,
    @SerialName("cargo_description") val cargoDescription:String?=null,
    @SerialName("payment_terms") val paymentTerms:String?=null,
    @SerialName("accepted_at") val acceptedAt:String?=null,
    @SerialName("delivered_at") val deliveredAt:String?=null,
    @SerialName("truck_id") val truckId:String?=null,
    val status:String?=null,
)

@Serializable data class DriverTruck(
    val id:String,
    @SerialName("plate_number") val plate:String?=null,
    @SerialName("vehicle_type") val vehicleType:String?=null,
    @SerialName("capacity_tons") val capacity:Double?=null,
    val status:String?=null,
)

@Serializable data class DriverDocument(
    val id:String,
    @SerialName("document_key") val key:String,
    @SerialName("truck_id") val truckId:String?=null,
    @SerialName("file_path") val path:String,
    val status:String?=null,
    @SerialName("expiry_date") val expiryDate:String?=null,
    @SerialName("rejection_reason") val rejectionReason:String?=null,
    @SerialName("created_at") val createdAt:String?=null,
)

@Serializable data class DriverNotification(
    val id:String,
    val title:String,
    val body:String,
    @SerialName("read_at") val readAt:String?=null,
    @SerialName("created_at") val createdAt:String?=null,
)

@Serializable data class FinancialSummary(
    @SerialName("completed_trips") val completedTrips:Long=0,
    @SerialName("gross_released_etb") val grossReleased:Double=0.0,
    @SerialName("commission_charged_etb") val commissionCharged:Double=0.0,
    @SerialName("commission_paid_etb") val commissionPaid:Double=0.0,
    @SerialName("admin_deposit_etb") val adminDeposit:Double=0.0,
    @SerialName("available_deposit_etb") val availableDeposit:Double=0.0,
    @SerialName("commission_due_etb") val commissionDue:Double=0.0,
)

@Serializable data class DriverCommissionSummary(
    @SerialName("balance_etb") val balanceEtb:Double=0.0,
    @SerialName("charged_etb") val chargedEtb:Double=0.0,
    @SerialName("approved_paid_etb") val approvedPaidEtb:Double=0.0,
    @SerialName("pending_etb") val pendingEtb:Double=0.0,
    val blocked:Boolean=false,
)

@Serializable data class DriverTripPaymentResult(
    val id:String,
    @SerialName("order_id") val orderId:String,
    @SerialName("assigned_driver_id") val assignedDriverId:String,
    @SerialName("result_type") val resultType:String,
    @SerialName("amount_collected") val amountCollected:Double?=null,
    @SerialName("payment_method") val paymentMethod:String?=null,
    @SerialName("completed_at") val completedAt:String?=null,
    @SerialName("created_at") val createdAt:String?=null,
    val note:String?=null,
    @SerialName("commission_etb") val commissionEtb:Double?=null,
    @SerialName("driver_gross_etb") val driverGrossEtb:Double?=null,
    @SerialName("driver_net_etb") val driverNetEtb:Double?=null,
    @SerialName("deposit_before_etb") val depositBeforeEtb:Double?=null,
    @SerialName("deposit_consumed_etb") val depositConsumedEtb:Double?=null,
    @SerialName("deposit_after_etb") val depositAfterEtb:Double?=null,
    @SerialName("commission_due_after_etb") val commissionDueAfterEtb:Double?=null,
)

@Serializable data class DriverCommissionPayment(
    val id:String,
    val provider:String,
    @SerialName("transaction_id") val transactionId:String,
    @SerialName("amount_etb") val amountEtb:Double=0.0,
    @SerialName("receipt_path") val receiptPath:String,
    val status:String,
    @SerialName("rejection_reason") val rejectionReason:String?=null,
    @SerialName("submitted_at") val submittedAt:String?=null,
    @SerialName("reviewed_at") val reviewedAt:String?=null,
)

@Serializable data class DriverDepositTransaction(
    val id:String,
    @SerialName("amount_etb") val amountEtb:Double=0.0,
    val status:String?=null,
    val note:String?=null,
    @SerialName("created_at") val createdAt:String?=null,
    @SerialName("reversed_at") val reversedAt:String?=null,
)

@Serializable data class LiveTripSnapshot(
    @SerialName("order_id") val orderId:String,
    @SerialName("pickup_lng") val pickupLng:Double?=null,
    @SerialName("pickup_lat") val pickupLat:Double?=null,
    @SerialName("dropoff_lng") val dropoffLng:Double?=null,
    @SerialName("dropoff_lat") val dropoffLat:Double?=null,
    @SerialName("truck_lng") val truckLng:Double?=null,
    @SerialName("truck_lat") val truckLat:Double?=null,
    val heading:Double?=null,
    @SerialName("speed_kmh") val speedKmh:Double?=null,
    @SerialName("recorded_at") val recordedAt:String?=null,
)

enum class DriverPage { HOME,ONBOARDING,JOBS,TRIP,DELIVERY,WALLET,NOTIFICATIONS,PROFILE }

data class DriverUiState(
    val loading:Boolean=true,
    val busy:Boolean=false,
    val access:DriverAccess=DriverAccess.SIGNED_OUT,
    val page:DriverPage=DriverPage.HOME,
    val messageKey:DriverMessage=DriverMessage.RESTORING,
    val profile:DriverProfile?=null,
    val jobs:List<DriverJob> = emptyList(),
    val activeTrip:DriverJob?=null,
    val trucks:List<DriverTruck> = emptyList(),
    val documents:List<DriverDocument> = emptyList(),
    val notifications:List<DriverNotification> = emptyList(),
    val wallet:FinancialSummary?=null,
    val commission:DriverCommissionSummary?=null,
    val tripResults:List<DriverTripPaymentResult> = emptyList(),
    val commissionPayments:List<DriverCommissionPayment> = emptyList(),
    val depositTransactions:List<DriverDepositTransaction> = emptyList(),
    val completedTrips:List<DriverJob> = emptyList(),
    val liveTrip:LiveTripSnapshot?=null,
    val errorCode:DriverErrorCode?=null,
)
