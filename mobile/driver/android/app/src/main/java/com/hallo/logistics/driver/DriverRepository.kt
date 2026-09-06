package com.hallo.logistics.driver
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.storage.storage
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.UUID

class DriverRepository {
 private val client get()=HalloSupabase.client
 suspend fun signUp(name:String,phone:String,email:String,pin:String){require(DriverAccessPolicy.validSignupPin(pin)){"PIN must contain exactly 6 digits"};require(name.trim().length in 2..120);client.auth.signUpWith(Email){this.email=email.trim().lowercase();password=pin;data=buildJsonObject{put("full_name",name.trim());put("phone",phone.trim());put("role","driver")}}}
 suspend fun signIn(email:String,pin:String){require(DriverAccessPolicy.validSignupPin(pin)){"PIN must contain exactly 6 digits"};client.auth.signInWith(Email){this.email=email.trim().lowercase();password=pin}}
 suspend fun signOut()=client.auth.signOut()
 fun userId()=client.auth.currentUserOrNull()?.id
 suspend fun profile():DriverProfile{val id=userId()?:error("Driver session expired");val p=client.from("profiles").select(Columns.list("id,role,driver_status,full_name,phone,vehicle_type,rating_avg")){filter{eq("id",id)}}.decodeSingleOrNull<DriverProfile>()?:error("Driver profile not found");if(p.role!="driver"){client.auth.signOut();error("This account is not authorized for HALLO Driver")};return p}
 suspend fun activeTrip():DriverJob?{val id=profile().id;return client.from("orders").select(Columns.list("id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,price_etb,selected_payment_method,status")){filter{eq("driver_id",id);isIn("status",listOf("accepted","in_transit"))};limit(1)}.decodeList<DriverJob>().firstOrNull()}
 suspend fun jobs():List<DriverJob>{profile();return client.postgrest.rpc("get_available_jobs").decodeList()}
 suspend fun trucks(orderId:String):List<DriverTruck>{profile();return client.postgrest.rpc("driver_available_trucks_for_order",buildJsonObject{put("p_order_id",orderId)}).decodeList()}
 suspend fun claim(orderId:String,truckId:String){profile();val ok=client.postgrest.rpc("claim_order_with_truck",buildJsonObject{put("p_order_id",orderId);put("p_truck_id",truckId)}).decodeAs<Boolean>();require(ok){"Job was already taken"}}
 suspend fun driverTrucks():List<DriverTruck>{val id=profile().id;return client.from("trucks").select(Columns.list("id,plate_number,vehicle_type,capacity_tons,status")){filter{eq("driver_id",id)}}.decodeList()}
 suspend fun documents():List<DriverDocument>{val id=profile().id;return client.from("driver_verification_files").select(Columns.list("id,document_key,truck_id,file_path,status,rejection_reason")){filter{eq("driver_id",id)}}.decodeList()}
 suspend fun saveVehicle(plate:String,type:String,capacity:Double){profile();client.postgrest.rpc("driver_save_vehicle_profile",buildJsonObject{put("p_plate_number",plate.trim());put("p_vehicle_type",type);put("p_capacity_tons",capacity)})}
 suspend fun uploadDocument(key:String,truckId:String?,name:String,mime:String,bytes:ByteArray){val id=profile().id;require(bytes.isNotEmpty()&&bytes.size<=10*1024*1024);require(mime in setOf("image/jpeg","image/png","image/webp","application/pdf"));val scope=truckId?.let{"truck-$it"}?:"identity";val safe=name.lowercase().replace(Regex("[^a-z0-9._-]"),"-").takeLast(90);val path="$id/$scope/$key/${UUID.randomUUID()}-$safe";client.storage.from("driver-verification").upload(path,bytes){upsert=false};client.from("driver_verification_files").insert(buildJsonObject{put("driver_id",id);if(truckId!=null)put("truck_id",truckId);put("document_key",key);put("file_path",path);put("original_name",name);put("mime_type",mime);put("status","pending")})}
 suspend fun uploadDeliveryAsset(orderId:String,kind:String,mime:String,bytes:ByteArray):String{profile();require(kind in setOf("delivery","signature"));require(mime.startsWith("image/")&&bytes.isNotEmpty()&&bytes.size<=10*1024*1024);val ext=if(mime=="image/png")"png"else"jpg";val path="$orderId/${UUID.randomUUID()}-$kind.$ext";client.storage.from("delivery-proofs").upload(path,bytes){upsert=false};return path}
 suspend fun notifications():List<DriverNotification>{profile();return client.postgrest.rpc("my_notifications",buildJsonObject{put("p_limit",100)}).decodeList()}
 suspend fun markRead(id:String){profile();client.postgrest.rpc("mark_notification_read",buildJsonObject{put("p_notification_id",id)})}
 suspend fun wallet():FinancialSummary{val id=profile().id;return client.postgrest.rpc("driver_financial_summary",buildJsonObject{put("p_driver_id",id)}).decodeList<FinancialSummary>().firstOrNull()?:FinancialSummary()}
 suspend fun finishTrip(orderId:String,recipient:String,note:String,photoPath:String,signaturePath:String,result:String,amount:Double?){profile();client.postgrest.rpc("driver_finish_trip",buildJsonObject{put("p_order_id",orderId);put("p_recipient_name",recipient.trim());put("p_delivery_note",note.trim());put("p_photo_path",photoPath);put("p_signature_path",signaturePath);put("p_result_type",result);if(amount!=null)put("p_amount_collected",amount)})}
}
