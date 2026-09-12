package com.hallo.logistics.driver

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.View
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.setPadding
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.hallo.logistics.driver.databinding.ActivityMainBinding
import com.hallo.logistics.driver.tracking.HalloLocationService
import io.github.jan.supabase.auth.handleDeeplinks
import java.text.NumberFormat
import kotlinx.coroutines.launch

class MainActivity:AppCompatActivity(){
    private lateinit var b:ActivityMainBinding
    private lateinit var authUi:DriverAuthUiController
    private val vm:DriverSessionViewModel by viewModels()
    private var pendingKey=""
    private var pendingTruck:String?=null
    private var photo:ByteArray?=null
    private var signature:ByteArray?=null

    private val documentPicker=registerForActivityResult(ActivityResultContracts.GetContent()){it?.let(::readDocument)}
    private val photoPicker=registerForActivityResult(ActivityResultContracts.GetContent()){uri->photo=uri?.let(::bytes);b.photoState.text=getString(if(photo!=null)R.string.delivery_photo_selected else R.string.photo_required)}
    private val signaturePicker=registerForActivityResult(ActivityResultContracts.GetContent()){uri->signature=uri?.let(::bytes);b.signatureState.text=getString(if(signature!=null)R.string.signature_selected else R.string.signature_required)}
    private val locationPermission=registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){grants->
        if(grants[Manifest.permission.ACCESS_FINE_LOCATION]==true)startTracking() else b.status.text=getString(R.string.gps_permission_denied)
    }

    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        if(savedInstanceState==null)DriverLocaleManager.applySaved(this)
        b=ActivityMainBinding.inflate(layoutInflater);setContentView(b.root)
        authUi=DriverAuthUiController(
            activity=this,
            host=b.authPanel,
            onSignIn={email,pin->vm.signIn(email,pin)},
            onSignUp={name,phone,email,pin,confirmPin->vm.signUp(name,phone,email,pin,confirmPin)},
        )
        ViewCompat.setOnApplyWindowInsetsListener(b.bottomNavigation){view,insets->
            val bottom=insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom
            view.setPadding(view.paddingLeft,view.paddingTop,view.paddingRight,bottom.coerceAtLeast(dp(6)));insets
        }
        if(HalloSupabase.configured)runCatching{HalloSupabase.client.handleDeeplinks(intent)}
        configureSpinners();configureListeners();updateLanguageButton()
        lifecycleScope.launch{repeatOnLifecycle(Lifecycle.State.STARTED){vm.state.collect(::render)}}
    }

    override fun onNewIntent(intent:Intent){super.onNewIntent(intent);setIntent(intent);if(HalloSupabase.configured)runCatching{HalloSupabase.client.handleDeeplinks(intent)}}

    private fun configureSpinners(){
        b.vehicleType.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,VEHICLE_TYPES)
        b.documentKey.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,DOCUMENT_KEYS.map(::documentLabel))
        b.paymentResult.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,PAYMENT_RESULTS.map(::paymentLabel))
    }

    private fun configureListeners(){
        b.languageAction.setOnClickListener{showLanguageDialog()}
        b.signOut.setOnClickListener{vm.signOut()};b.refresh.setOnClickListener{vm.refresh()}
        b.documentsAction.setOnClickListener{vm.page(DriverPage.ONBOARDING)};b.notificationsAction.setOnClickListener{vm.page(DriverPage.NOTIFICATIONS)};b.profileDocuments.setOnClickListener{vm.page(DriverPage.ONBOARDING)}
        b.bottomNavigation.setOnItemSelectedListener{item->vm.page(when(item.itemId){R.id.nav_jobs->DriverPage.JOBS;R.id.nav_trip->DriverPage.TRIP;R.id.nav_wallet->DriverPage.WALLET;R.id.nav_profile->DriverPage.PROFILE;else->DriverPage.HOME});true}
        b.saveVehicle.setOnClickListener{vm.saveVehicle(textOf(b.plate),VEHICLE_TYPES[b.vehicleType.selectedItemPosition],textOf(b.capacity).toDoubleOrNull()?:0.0)}
        b.chooseDocument.setOnClickListener{
            pendingKey=DOCUMENT_KEYS[b.documentKey.selectedItemPosition];pendingTruck=if(pendingKey in DriverDocumentPolicy.vehicleKeys)vm.state.value.trucks.firstOrNull()?.id else null
            if(pendingKey in DriverDocumentPolicy.vehicleKeys&&pendingTruck==null)b.status.text=getString(R.string.save_vehicle_first) else documentPicker.launch("*/*")
        }
        b.startTrip.setOnClickListener{vm.openTrip();requestTracking()};b.startTracking.setOnClickListener{requestTracking()}
        b.stopTracking.setOnClickListener{stopService(Intent(this,HalloLocationService::class.java));b.status.text=getString(R.string.gps_stopped)}
        b.openNavigation.setOnClickListener{openNavigation()};b.pickPhoto.setOnClickListener{photoPicker.launch("image/*")};b.pickSignature.setOnClickListener{signaturePicker.launch("image/*")}
        b.finishTrip.setOnClickListener{
            val result=PAYMENT_RESULTS[b.paymentResult.selectedItemPosition]
            vm.finish(textOf(b.recipient),textOf(b.deliveryNote),photo?:byteArrayOf(),"image/jpeg",signature?:byteArrayOf(),result,textOf(b.amount).toDoubleOrNull())
        }
    }

    private fun showLanguageDialog(){
        val values=arrayOf(DriverLocaleManager.EN,DriverLocaleManager.OR,DriverLocaleManager.AM)
        val labels=arrayOf(getString(R.string.language_english),getString(R.string.language_oromo),getString(R.string.language_amharic))
        AlertDialog.Builder(this).setTitle(R.string.language_dialog_title).setItems(labels){_,which->DriverLocaleManager.apply(this,values[which]);recreate()}.setNegativeButton(R.string.cancel,null).show()
    }
    private fun updateLanguageButton(){b.languageAction.text=DriverLocaleManager.compactLabel(DriverLocaleManager.saved(this))}

    private fun render(state:DriverUiState){
        val busy=state.loading||state.busy
        b.progress.visibility=visible(busy);authUi.setBusy(busy)
        b.status.text=state.errorCode?.let(::errorText)?:messageText(state.messageKey);b.statusCard.visibility=visible(b.status.text.isNotBlank())
        b.authPanel.visibility=visible(state.access==DriverAccess.SIGNED_OUT||state.access==DriverAccess.FORBIDDEN)
        val shell=state.access in setOf(DriverAccess.APPROVED,DriverAccess.ONBOARDING,DriverAccess.REJECTED)
        b.languageAction.visibility=visible(shell)
        b.driverShell.visibility=visible(shell);b.documentsAction.visibility=visible(shell);b.notificationsAction.visibility=visible(shell);b.bottomNavigation.visibility=visible(state.access==DriverAccess.APPROVED)
        val page=if(state.access==DriverAccess.APPROVED)state.page else DriverPage.ONBOARDING;showPage(page)
        b.accessState.text=getString(R.string.verification_format,localStatus(state.profile?.driverStatus))
        val docs=DriverDocumentPolicy.completion(state.documents,state.trucks.firstOrNull()?.id)
        b.homeAvailableJobs.text=state.jobs.size.toString();b.homeActiveTrip.text=state.activeTrip?.trackingId?:getString(R.string.none);b.homeDocuments.text="${docs.first}/${docs.second}"
        renderAssignment(state);renderJobs(state);renderTrip(state);renderWallet(state);renderNotifications(state);renderProfile(state)
        b.documentState.text=documentSummary(state.documents,state.trucks.firstOrNull()?.id)
    }

    private fun showPage(page:DriverPage){
        listOf(b.pageHome,b.pageOnboarding,b.pageJobs,b.pageTrip,b.pageWallet,b.pageAlerts,b.pageProfile).forEach{it.visibility=View.GONE}
        when(page){DriverPage.HOME->b.pageHome;DriverPage.ONBOARDING->b.pageOnboarding;DriverPage.JOBS->b.pageJobs;DriverPage.TRIP,DriverPage.DELIVERY->b.pageTrip;DriverPage.WALLET->b.pageWallet;DriverPage.NOTIFICATIONS->b.pageAlerts;DriverPage.PROFILE->b.pageProfile}.visibility=View.VISIBLE
        b.headerTitle.setText(when(page){DriverPage.HOME->R.string.ready_to_move;DriverPage.ONBOARDING->R.string.documents;DriverPage.JOBS->R.string.find_next_load;DriverPage.TRIP,DriverPage.DELIVERY->R.string.active_trip;DriverPage.WALLET->R.string.earnings;DriverPage.NOTIFICATIONS->R.string.notifications;DriverPage.PROFILE->R.string.your_profile})
        val navId=when(page){DriverPage.JOBS->R.id.nav_jobs;DriverPage.TRIP,DriverPage.DELIVERY->R.id.nav_trip;DriverPage.WALLET->R.id.nav_wallet;DriverPage.PROFILE->R.id.nav_profile;else->R.id.nav_home}
        if(page!=DriverPage.ONBOARDING&&page!=DriverPage.NOTIFICATIONS&&b.bottomNavigation.selectedItemId!=navId)b.bottomNavigation.menu.findItem(navId)?.isChecked=true
        b.contentScroll.post{b.contentScroll.scrollTo(0,0)}
    }

    private fun renderAssignment(state:DriverUiState){
        val trip=state.activeTrip;val truck=state.trucks.firstOrNull{it.id==trip?.truckId}?:state.trucks.firstOrNull()
        b.homeAssignment.text=if(trip==null)getString(R.string.no_active_assignment) else getString(R.string.assignment_format,trip.trackingId.orDash(),localStatus(trip.status),trip.pickup.orDash(),trip.dropoff.orDash(),truck?.plate.orDash(),truck?.vehicleType?:trip.vehicleType.orDash())
        val w=state.wallet;b.homeEarnings.text=if(w==null)getString(R.string.earnings_summary_unavailable) else buildString{append(getString(R.string.home_earnings_format,money(w.grossReleased),money(w.commissionDue),money(w.availableDeposit)));if(DriverFinancePresentationPolicy.blocked(state.commission,w))append("\n").append(getString(R.string.job_locked))}
    }

    private fun renderJobs(state:DriverUiState){
        b.jobsList.removeAllViews()
        if(DriverFinancePresentationPolicy.blocked(state.commission,state.wallet)){b.jobsList.addView(infoCard(getString(R.string.job_locked)));return}
        if(state.activeTrip!=null){b.jobsList.addView(infoCard(getString(R.string.finish_before_next,state.activeTrip.trackingId.orDash())));return}
        if(state.jobs.isEmpty()){b.jobsList.addView(infoCard(getString(R.string.no_jobs)));return}
        state.jobs.forEach{job->
            val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14))}
            box.addView(text(getString(R.string.job_card_format,job.trackingId.orDash(),job.pickup.orDash(),job.dropoff.orDash(),job.vehicleType.orDash(),job.distanceKm?.toString()?:"—",money(job.priceEtb)),15f))
            box.addView(button(getString(R.string.choose_truck_accept)){chooseTruck(job)});b.jobsList.addView(card(box))
        }
    }

    private fun chooseTruck(job:DriverJob){lifecycleScope.launch{runCatching{DriverRepository().trucks(job.id)}.onSuccess{trucks->
        if(trucks.isEmpty()){b.status.text=getString(R.string.no_authorized_truck);return@onSuccess}
        val labels=trucks.map{"${it.plate.orDash()} · ${it.vehicleType.orDash()} · ${it.capacity?:"—"} ton"}.toTypedArray()
        AlertDialog.Builder(this@MainActivity).setTitle(getString(R.string.choose_truck_title,job.trackingId.orDash())).setItems(labels){_,which->vm.claim(job.id,trucks[which].id)}.setNegativeButton(R.string.cancel,null).show()
    }.onFailure{b.status.text=getString(R.string.error_request_failed)}}}

    private fun renderTrip(state:DriverUiState){
        val trip=state.activeTrip;val truck=state.trucks.firstOrNull{it.id==trip?.truckId}
        b.tripDetails.text=if(trip==null)getString(R.string.no_active_trip) else getString(R.string.trip_details_format,trip.trackingId.orDash(),trip.pickup.orDash(),trip.dropoff.orDash(),trip.vehicleType.orDash(),money(trip.priceEtb),trip.cargoDescription.orDash(),truck?.plate.orDash(),localStatus(trip.status))
        b.liveTripMap.show(state.liveTrip);val live=state.liveTrip
        b.liveMapState.text=if(live?.truckLat==null)getString(R.string.waiting_gps) else getString(R.string.live_gps_format,live.truckLat,live.truckLng?:0.0,live.speedKmh?:0.0,live.recordedAt?:"—")
        b.liveTripMap.visibility=visible(trip!=null);b.liveMapState.visibility=visible(trip!=null);b.openNavigation.visibility=visible(trip!=null);b.startTrip.visibility=visible(trip?.status=="accepted");b.tripActions.visibility=visible(trip!=null);b.deliveryPanel.visibility=visible(trip?.status=="in_transit")
        if(trip!=null)configurePaymentChoices(trip.paymentMethod)
    }

    private fun configurePaymentChoices(method:String?){
        val allowed=when(method){"cash"->listOf("cash_received","payment_not_received");"bank_telebirr"->listOf("bank_telebirr","payment_not_received");else->listOf("payment_not_received")}
        currentPaymentResults=allowed
        b.paymentResult.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,allowed.map(::paymentLabel))
    }

    private var currentPaymentResults:List<String> = PAYMENT_RESULTS

    private fun renderWallet(state:DriverUiState){
        val w=state.wallet
        b.walletDetails.text=if(w==null)getString(R.string.wallet_unavailable) else getString(R.string.wallet_summary_format,money(w.grossReleased),w.completedTrips,money(w.commissionCharged),money(w.commissionPaid),money(w.commissionDue),money(w.adminDeposit),money(w.availableDeposit))
        val c=state.commission;b.commissionDetails.text=if(c==null)getString(R.string.wallet_unavailable) else getString(R.string.commission_state_format,money(c.balanceEtb),money(c.pendingEtb),getString(if(c.blocked)R.string.yes else R.string.no))
        b.tripHistoryList.removeAllViews();if(state.tripResults.isEmpty())b.tripHistoryList.addView(infoCard(getString(R.string.no_trip_history))) else state.tripResults.sortedByDescending{it.createdAt?:it.completedAt}.forEach{result->
            val order=state.completedTrips.firstOrNull{it.id==result.orderId};b.tripHistoryList.addView(infoCard(getString(R.string.trip_result_format,order?.trackingId.orDash(),localStatus(result.resultType),money(result.driverGrossEtb?:result.amountCollected),money(result.commissionEtb),money(result.driverNetEtb),result.completedAt?:result.createdAt?:"—")))
        }
        b.depositHistoryList.removeAllViews();if(state.depositTransactions.isEmpty())b.depositHistoryList.addView(infoCard(getString(R.string.no_deposits))) else state.depositTransactions.sortedByDescending{it.createdAt}.forEach{d->b.depositHistoryList.addView(infoCard(getString(R.string.deposit_row_format,money(d.amountEtb),localStatus(d.status),d.note?:"—",d.reversedAt?:d.createdAt?:"—")))}
        b.commissionPaymentsList.removeAllViews();if(state.commissionPayments.isEmpty())b.commissionPaymentsList.addView(infoCard(getString(R.string.no_commission_payments))) else state.commissionPayments.sortedByDescending{it.submittedAt}.forEach{p->b.commissionPaymentsList.addView(infoCard(getString(R.string.commission_payment_row_format,money(p.amountEtb),localStatus(p.status),p.provider,p.transactionId,p.rejectionReason?:p.submittedAt?:"—")))}
    }

    private fun renderNotifications(state:DriverUiState){b.alertsList.removeAllViews();state.notifications.forEach{note->b.alertsList.addView(infoCard("${if(note.readAt==null)"● " else ""}${note.title}\n${note.body}").apply{setOnClickListener{vm.markRead(note.id)}})};if(state.notifications.isEmpty())b.alertsList.addView(infoCard(getString(R.string.no_notifications)))}

    private fun renderProfile(state:DriverUiState){
        val p=state.profile;b.profileDetails.text=getString(R.string.profile_format,p?.fullName.orDash(),p?.phone.orDash(),p?.email.orDash(),localStatus(p?.driverStatus),p?.rating?.toString()?:"—")
        val truck=state.trucks.firstOrNull();b.profileVehicle.text=if(truck==null)getString(R.string.no_vehicle) else getString(R.string.vehicle_format,truck.plate.orDash(),truck.vehicleType.orDash(),truck.capacity?.toString()?:"—",localStatus(truck.status))
    }

    private fun documentSummary(documents:List<DriverDocument>,truckId:String?):String{
        val relevant=documents.filter{it.truckId==null||it.truckId==truckId}.groupBy{it.key}.mapValues{entry->entry.value.maxByOrNull{it.createdAt.orEmpty()}}
        return DOCUMENT_KEYS.joinToString("\n"){key->val item=relevant[key];val marker=if(item!=null)"✓" else "○";val extra=buildString{item?.expiryDate?.let{append(getString(R.string.document_expiry_format,it))};item?.rejectionReason?.let{append(getString(R.string.document_rejection_format,it))}};getString(R.string.document_row_format,marker,documentLabel(key),localStatus(item?.status?:"missing"),extra)}
    }

    private fun readDocument(uri:Uri){val name=contentResolver.query(uri,null,null,null,null)?.use{c->val i=c.getColumnIndex(OpenableColumns.DISPLAY_NAME);if(c.moveToFirst()&&i>=0)c.getString(i) else "document"}?:"document";vm.uploadDocument(pendingKey,pendingTruck,name,contentResolver.getType(uri)?:"application/octet-stream",bytes(uri)?:byteArrayOf())}
    private fun openNavigation(){vm.state.value.activeTrip?.dropoff?.let{runCatching{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("geo:0,0?q=${Uri.encode(it)}")))}.onFailure{b.status.text=getString(R.string.navigation_app_missing)}}}
    private fun bytes(uri:Uri)=contentResolver.openInputStream(uri)?.use{it.readBytes()}
    private fun requestTracking(){if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED)startTracking() else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.POST_NOTIFICATIONS))}
    private fun startTracking(){val id=vm.state.value.activeTrip?.id?:return;ContextCompat.startForegroundService(this,Intent(this,HalloLocationService::class.java).putExtra("order_id",id));b.status.text=getString(R.string.gps_started)}

    private fun messageText(message:DriverMessage)=getString(when(message){DriverMessage.RESTORING->R.string.restoring;DriverMessage.CONFIG_REQUIRED->R.string.config_required;DriverMessage.SIGN_IN_REQUIRED->R.string.sign_in_required;DriverMessage.SIGNING_IN->R.string.signing_in;DriverMessage.CREATING_ACCOUNT->R.string.creating_account;DriverMessage.CONFIRM_EMAIL->R.string.confirm_email;DriverMessage.SIGNED_OUT->R.string.signed_out;DriverMessage.REFRESHING->R.string.refreshing;DriverMessage.CURRENT->R.string.current;DriverMessage.ACCESS_DENIED->R.string.access_denied;DriverMessage.ACCEPTING_JOB->R.string.accepting_job;DriverMessage.OPEN_TRIP->R.string.open_trip;DriverMessage.SAVING_VEHICLE->R.string.saving_vehicle;DriverMessage.UPLOADING_DOCUMENT->R.string.uploading_document;DriverMessage.SUBMITTING_DELIVERY->R.string.submitting_delivery;DriverMessage.TRIP_COMPLETED->R.string.trip_completed;DriverMessage.ACTIVE_TRIP_SYNCED->R.string.active_trip_synced;DriverMessage.GPS_STARTED->R.string.gps_started;DriverMessage.GPS_STOPPED->R.string.gps_stopped;DriverMessage.MARKING_READ->R.string.marking_read})
    private fun errorText(error:DriverErrorCode)=getString(when(error){DriverErrorCode.INVALID_CREDENTIALS->R.string.error_invalid_credentials;DriverErrorCode.ACCOUNT_EXISTS->R.string.error_account_exists;DriverErrorCode.NETWORK->R.string.error_network;DriverErrorCode.SESSION_EXPIRED->R.string.error_session_expired;DriverErrorCode.FORBIDDEN->R.string.error_forbidden;DriverErrorCode.INVALID_INPUT->R.string.error_invalid_input;DriverErrorCode.DUPLICATE_ACTION->R.string.error_duplicate;DriverErrorCode.PERMISSION_DENIED->R.string.error_permission_denied;DriverErrorCode.REQUEST_FAILED->R.string.error_request_failed})
    private fun localStatus(value:String?):String=when(value?.lowercase()){"approved"->getString(R.string.approved);"verified"->getString(R.string.verified);"pending"->getString(R.string.pending);"rejected","suspended","disabled"->getString(R.string.rejected);"reversed"->getString(R.string.reversed);"cash_received"->getString(R.string.cash_received);"bank_telebirr"->getString(R.string.bank_telebirr);"payment_not_received"->getString(R.string.payment_not_received);null,""->getString(R.string.missing);else->value.replace('_',' ')}
    private fun paymentLabel(value:String)=when(value){"cash_received"->getString(R.string.cash_received);"bank_telebirr"->getString(R.string.bank_telebirr);else->getString(R.string.payment_not_received)}
    private fun documentLabel(key:String)=getString(when(key){"driver_photo"->R.string.driver_photo;"license_front"->R.string.license_front;"license_back"->R.string.license_back;"national_id_front"->R.string.national_id_front;"national_id_back"->R.string.national_id_back;"vehicle_registration"->R.string.vehicle_registration;"truck_front"->R.string.truck_front;"insurance"->R.string.insurance;"transport_permit"->R.string.transport_permit;"truck_back"->R.string.truck_back;"truck_side"->R.string.truck_side;else->R.string.truck_loading_area})
    private fun infoCard(value:String)=card(text(value,14f))
    private fun card(child:View)=MaterialCardView(this).apply{setCardBackgroundColor(ContextCompat.getColor(context,R.color.hallo_card));radius=dp(16).toFloat();strokeWidth=dp(1);strokeColor=ContextCompat.getColor(context,R.color.hallo_border);val lp=LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,LinearLayout.LayoutParams.WRAP_CONTENT);lp.setMargins(0,dp(6),0,dp(6));layoutParams=lp;addView(child)}
    private fun text(value:String,size:Float)=TextView(this).apply{text=value;textSize=size;setTextColor(ContextCompat.getColor(context,R.color.hallo_text));setPadding(dp(14))}
    private fun button(value:String,action:()->Unit)=MaterialButton(this).apply{text=value;isAllCaps=false;minHeight=dp(52);cornerRadius=dp(16);setOnClickListener{action()}}
    private fun textOf(view:TextView)=view.text?.toString().orEmpty();private fun visible(show:Boolean)=if(show)View.VISIBLE else View.GONE;private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt();private fun money(value:Double?)=if(value==null)"—" else "ETB ${NumberFormat.getIntegerInstance().format(value)}";private fun String?.orDash()=if(this.isNullOrBlank())"—" else this

    companion object{
        val VEHICLE_TYPES=listOf("Pickup","Van","Isuzu 5 Ton","Dry Cargo","Refrigerated","Truck 22 Ton","Truck 25 Ton","Truck 30 Ton","Trailer")
        val DOCUMENT_KEYS=listOf("driver_photo","license_front","license_back","national_id_front","national_id_back","vehicle_registration","truck_front","insurance","transport_permit","truck_back","truck_side","truck_loading_area")
        val PAYMENT_RESULTS=listOf("cash_received","bank_telebirr","payment_not_received")
    }
}
