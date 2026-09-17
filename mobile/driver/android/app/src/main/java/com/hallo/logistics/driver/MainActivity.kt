package com.hallo.logistics.driver

import android.Manifest
import android.app.DatePickerDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.Gravity
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.setPadding
import androidx.core.widget.addTextChangedListener
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.hallo.logistics.driver.databinding.ActivityMainBinding
import com.hallo.logistics.driver.tracking.HalloLocationService
import io.github.jan.supabase.auth.handleDeeplinks
import java.net.URL
import java.text.NumberFormat
import java.time.ZoneId
import java.util.Calendar
import kotlin.math.abs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity:DriverLocalizedActivity(){
    private lateinit var b:ActivityMainBinding
    private lateinit var authUi:DriverAuthUiController
    private val vm:DriverSessionViewModel by viewModels()
    private val repository=DriverRepository()
    private val communicationsRepository=DriverCommunicationsRepository()
    private var pendingKey=""
    private var pendingTruck:String?=null
    private var pendingDocumentUri:Uri?=null
    private var photo:ByteArray?=null
    private var signature:ByteArray?=null
    private var currentPaymentResults:List<String> = PAYMENT_RESULTS
    private var vehiclePrefillId:String?=null
    private var vehicleFormDirty=false
    private var applyingVehiclePrefill=false
    private var vehicleSpinnerArmed=false
    private var loadedProfilePhotoPath:String?=null
    private var loadingProfilePhotoPath:String?=null

    private val documentPicker=registerForActivityResult(ActivityResultContracts.GetContent()){uri->
        if(uri==null)return@registerForActivityResult
        pendingDocumentUri=uri
        if(pendingKey in DriverDocumentPolicy.expiryRequiredKeys)showExpiryPicker() else readDocument(uri,null)
    }
    private val photoPicker=registerForActivityResult(ActivityResultContracts.GetContent()){uri->photo=uri?.let(::bytes);b.photoState.text=getString(if(photo!=null)R.string.delivery_photo_selected else R.string.photo_required)}
    private val signaturePicker=registerForActivityResult(ActivityResultContracts.GetContent()){uri->signature=uri?.let(::bytes);b.signatureState.text=getString(if(signature!=null)R.string.signature_selected else R.string.signature_required)}
    private val locationPermission=registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){grants->
        if(grants[Manifest.permission.ACCESS_FINE_LOCATION]==true)startTracking() else b.status.text=getString(R.string.gps_permission_denied)
    }

    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        b=ActivityMainBinding.inflate(layoutInflater);setContentView(b.root)
        DriverAuthenticatedUi.install(this)
        authUi=DriverAuthUiController(
            activity=this,
            host=b.authPanel,
            onSignIn={email,pin->vm.signIn(email,pin)},
            onSignUp={name,phone,email,pin,confirmPin->vm.signUp(name,phone,email,pin,confirmPin)},
        )
        installTripContactActions()
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
        b.plate.addTextChangedListener{if(!applyingVehiclePrefill)vehicleFormDirty=true}
        b.capacity.addTextChangedListener{if(!applyingVehiclePrefill)vehicleFormDirty=true}
        b.vehicleType.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{
            override fun onItemSelected(parent:AdapterView<*>?,view:View?,position:Int,id:Long){
                if(vehicleSpinnerArmed&&!applyingVehiclePrefill)vehicleFormDirty=true
                vehicleSpinnerArmed=true
            }
            override fun onNothingSelected(parent:AdapterView<*>?)=Unit
        }
        b.saveVehicle.setOnClickListener{
            vm.saveVehicle(textOf(b.plate),b.vehicleType.selectedItem?.toString().orEmpty(),textOf(b.capacity).toDoubleOrNull()?:0.0)
        }
        b.chooseDocument.setOnClickListener{
            pendingKey=DOCUMENT_KEYS[b.documentKey.selectedItemPosition]
            pendingTruck=if(pendingKey in DriverDocumentPolicy.vehicleKeys)primaryTruck(vm.state.value)?.id else null
            if(pendingKey in DriverDocumentPolicy.vehicleKeys&&pendingTruck==null)b.status.text=getString(R.string.save_vehicle_first) else documentPicker.launch("*/*")
        }
        b.startTrip.setOnClickListener{vm.openTrip();requestTracking()}
        b.startTracking.setOnClickListener{requestTracking()}
        b.stopTracking.setOnClickListener{
            stopService(Intent(this,HalloLocationService::class.java))
            val trip=vm.state.value.activeTrip
            b.stopTracking.visibility=View.GONE
            b.startTrip.visibility=visible(trip?.status=="accepted")
            b.startTracking.visibility=visible(trip?.status=="in_transit")
            b.status.text=getString(R.string.gps_stopped)
        }
        b.openNavigation.setOnClickListener{openNavigation()};b.pickPhoto.setOnClickListener{photoPicker.launch("image/*")};b.pickSignature.setOnClickListener{signaturePicker.launch("image/*")}
        b.finishTrip.setOnClickListener{
            val result=currentPaymentResults.getOrNull(b.paymentResult.selectedItemPosition)?:return@setOnClickListener
            vm.finish(textOf(b.recipient),textOf(b.deliveryNote),photo?:byteArrayOf(),"image/jpeg",signature?:byteArrayOf(),result,textOf(b.amount).toDoubleOrNull())
        }
    }

    private fun installTripContactActions(){
        b.tripActions.findViewWithTag<MaterialButton>("driver-trip-messages")?.setOnClickListener{
            val intent=Intent(this,DriverCommunicationsActivity::class.java)
                .putExtra(DriverCommunicationsActivity.EXTRA_MODE,DriverCommunicationMode.CUSTOMER.name)
            vm.state.value.activeTrip?.id?.let{intent.putExtra(DriverCommunicationsActivity.EXTRA_ORDER_ID,it)}
            startActivity(intent)
        }
        if(b.tripActions.findViewWithTag<View>("driver-trip-call-customer")!=null)return
        val call=MaterialButton(this,null,com.google.android.material.R.attr.materialButtonOutlinedStyle).apply{
            tag="driver-trip-call-customer"
            setText(R.string.call_customer)
            isAllCaps=false
            minHeight=dp(52)
            cornerRadius=dp(14)
            strokeWidth=dp(1)
            strokeColor=android.content.res.ColorStateList.valueOf(ContextCompat.getColor(this@MainActivity,R.color.hallo_border))
            backgroundTintList=android.content.res.ColorStateList.valueOf(ContextCompat.getColor(this@MainActivity,R.color.hallo_card))
            setTextColor(ContextCompat.getColor(this@MainActivity,R.color.hallo_navy))
            setOnClickListener{callAssignedCustomer()}
            layoutParams=LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,dp(52)).apply{topMargin=dp(10)}
        }
        b.tripActions.addView(call)
    }

    private fun callAssignedCustomer(){
        val trip=vm.state.value.activeTrip?:run{b.status.text=getString(R.string.no_active_trip);return}
        lifecycleScope.launch{
            runCatching{communicationsRepository.customerContact(trip.id)}.onSuccess{contact->
                val phone=contact.customerPhone?.trim().orEmpty()
                if(phone.isBlank())b.status.text=getString(R.string.customer_contact_unavailable)
                else runCatching{startActivity(Intent(Intent.ACTION_DIAL,Uri.fromParts("tel",phone,null)))}.onFailure{b.status.text=getString(R.string.error_request_failed)}
            }.onFailure{b.status.text=getString(R.string.customer_contact_unavailable)}
        }
    }

    private fun showLanguageDialog(){
        val values=arrayOf(DriverLocaleManager.EN,DriverLocaleManager.OR,DriverLocaleManager.AM)
        val labels=arrayOf(getString(R.string.language_english),getString(R.string.language_oromo),getString(R.string.language_amharic))
        AlertDialog.Builder(this).setTitle(R.string.language_dialog_title).setItems(labels){_,which->DriverLocaleManager.apply(this,values[which])}.setNegativeButton(R.string.cancel,null).show()
    }
    private fun updateLanguageButton(){b.languageAction.text=DriverLocaleManager.compactLabel(DriverLocaleManager.saved(this))}

    private fun render(state:DriverUiState){
        val busy=state.loading||state.busy
        b.progress.visibility=visible(busy);authUi.setBusy(busy)
        val quietMessage=state.messageKey in setOf(DriverMessage.CURRENT,DriverMessage.MARKING_READ,DriverMessage.OPEN_TRIP,DriverMessage.ACTIVE_TRIP_SYNCED)
        b.status.text=state.errorCode?.let(::errorText)?:if(quietMessage)"" else messageText(state.messageKey)
        b.statusCard.visibility=visible(b.status.text.isNotBlank())
        b.authPanel.visibility=visible(state.access==DriverAccess.SIGNED_OUT||state.access==DriverAccess.FORBIDDEN)
        val shell=state.access in setOf(DriverAccess.APPROVED,DriverAccess.ONBOARDING,DriverAccess.REJECTED)
        b.languageAction.visibility=visible(shell);b.driverShell.visibility=visible(shell);b.documentsAction.visibility=visible(shell);b.notificationsAction.visibility=visible(shell);b.bottomNavigation.visibility=visible(state.access==DriverAccess.APPROVED)
        val page=if(state.access==DriverAccess.APPROVED)state.page else DriverPage.ONBOARDING;showPage(page)
        b.accessState.text=getString(R.string.verification_format,localStatus(state.profile?.driverStatus))
        val truck=primaryTruck(state)
        val docs=DriverDocumentPolicy.completion(state.documents,truck?.id)
        b.homeAvailableJobs.text=if(state.jobsAvailable)getString(R.string.home_kpi_jobs,state.jobs.size) else getString(R.string.data_unavailable)+"\n"+getString(R.string.available_jobs)
        b.homeActiveTrip.text=if(!state.activeTripAvailable)getString(R.string.data_unavailable)+"\n"+getString(R.string.active_trip) else getString(R.string.home_kpi_trip,state.activeTrip?.trackingId?:getString(R.string.none))
        b.homeDocuments.text=if(state.documentsAvailable)getString(R.string.home_kpi_documents,docs.first,docs.second) else getString(R.string.data_unavailable)+"\n"+getString(R.string.documents)
        renderVehicleForm(state)
        renderAssignment(state);renderJobs(state);renderTrip(state);renderWallet(state);renderNotifications(state);renderProfile(state)
        b.documentState.text=if(state.documentsAvailable)documentSummary(state.documents,truck?.id) else getString(R.string.data_unavailable)
    }

    private fun showPage(page:DriverPage){
        listOf(b.pageHome,b.pageOnboarding,b.pageJobs,b.pageTrip,b.pageWallet,b.pageAlerts,b.pageProfile).forEach{it.visibility=View.GONE}
        when(page){DriverPage.HOME->b.pageHome;DriverPage.ONBOARDING->b.pageOnboarding;DriverPage.JOBS->b.pageJobs;DriverPage.TRIP,DriverPage.DELIVERY->b.pageTrip;DriverPage.WALLET->b.pageWallet;DriverPage.NOTIFICATIONS->b.pageAlerts;DriverPage.PROFILE->b.pageProfile}.visibility=View.VISIBLE
        b.headerTitle.setText(when(page){DriverPage.HOME->R.string.ready_to_move;DriverPage.ONBOARDING->R.string.verification_center;DriverPage.JOBS->R.string.find_next_load;DriverPage.TRIP,DriverPage.DELIVERY->R.string.active_trip;DriverPage.WALLET->R.string.wallet_earnings_title;DriverPage.NOTIFICATIONS->R.string.notifications;DriverPage.PROFILE->R.string.your_profile})
        val navId=when(page){DriverPage.JOBS->R.id.nav_jobs;DriverPage.TRIP,DriverPage.DELIVERY->R.id.nav_trip;DriverPage.WALLET->R.id.nav_wallet;DriverPage.PROFILE->R.id.nav_profile;else->R.id.nav_home}
        if(page!=DriverPage.ONBOARDING&&page!=DriverPage.NOTIFICATIONS&&b.bottomNavigation.selectedItemId!=navId)b.bottomNavigation.menu.findItem(navId)?.isChecked=true
        b.contentScroll.post{b.contentScroll.scrollTo(0,0)}
    }

    private fun primaryTruck(state:DriverUiState):DriverTruck?=
        state.activeTrip?.truckId?.let{id->state.trucks.firstOrNull{it.id==id}}?:state.trucks.firstOrNull()

    private fun renderVehicleForm(state:DriverUiState){
        val summary=vehicleStatusView()
        if(!state.trucksAvailable){
            summary.setText(R.string.vehicle_prefill_unavailable)
            return
        }
        val truck=primaryTruck(state)
        if(truck==null){
            summary.setText(R.string.vehicle_prefill_none)
            if(!vehicleFormDirty&&vehiclePrefillId!=null){
                applyingVehiclePrefill=true
                b.plate.text?.clear();b.capacity.text?.clear()
                if(b.vehicleType.adapter.count>0)b.vehicleType.setSelection(0,false)
                applyingVehiclePrefill=false
            }
            vehiclePrefillId=null
            return
        }
        summary.text=getString(R.string.vehicle_prefill_summary,localStatus(truck.status),vehicleReviewStatus(state,truck.id))
        if(vehicleFormDirty){
            if(vehicleFormMatches(truck)){vehicleFormDirty=false;vehiclePrefillId=truck.id}
            return
        }
        if(vehiclePrefillId==truck.id&&vehicleFormMatches(truck))return
        applyingVehiclePrefill=true
        b.plate.setText(truck.plate.orEmpty())
        b.capacity.setText(capacityInput(truck.capacity))
        val type=truck.vehicleType.orEmpty()
        if(type.isNotBlank()){
            var options=VEHICLE_TYPES
            if(options.none{it.equals(type,ignoreCase=true)}){
                options=listOf(type)+VEHICLE_TYPES.filterNot{it.equals(type,ignoreCase=true)}
                b.vehicleType.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,options)
            }
            val index=options.indexOfFirst{it.equals(type,ignoreCase=true)}
            if(index>=0)b.vehicleType.setSelection(index,false)
        }
        applyingVehiclePrefill=false
        vehiclePrefillId=truck.id
    }

    private fun vehicleStatusView():TextView{
        b.pageOnboarding.findViewWithTag<TextView>("driver-vehicle-prefill-state")?.let{return it}
        return TextView(this).apply{
            tag="driver-vehicle-prefill-state"
            setText(R.string.vehicle_form_uses_assigned)
            textSize=13f
            setTextColor(ContextCompat.getColor(this@MainActivity,R.color.hallo_text_muted))
            setPadding(dp(12),dp(10),dp(12),dp(10))
            val index=b.pageOnboarding.indexOfChild(b.saveVehicle).let{if(it>=0)it else 0}
            b.pageOnboarding.addView(this,index)
        }
    }

    private fun vehicleReviewStatus(state:DriverUiState,truckId:String):String{
        if(!state.documentsAvailable)return getString(R.string.data_unavailable)
        val latest=state.documents
            .filter{it.truckId==truckId&&it.key in DriverDocumentPolicy.vehicleKeys}
            .groupBy{it.key}
            .mapValues{(_,rows)->rows.maxByOrNull{it.createdAt.orEmpty()}}
            .values
            .filterNotNull()
        if(latest.any{it.status?.lowercase()=="rejected"})return getString(R.string.rejected)
        if(latest.any{it.status?.lowercase()=="pending"})return getString(R.string.pending)
        if(latest.size<DriverDocumentPolicy.vehicleKeys.size)return getString(R.string.missing)
        val reviewed=latest.mapNotNull{it.status?.lowercase()}
        return when{
            reviewed.all{it=="verified"}->getString(R.string.verified)
            reviewed.all{it in setOf("verified","approved")}->getString(R.string.approved)
            else->getString(R.string.missing)
        }
    }

    private fun vehicleFormMatches(truck:DriverTruck):Boolean{
        val plateMatches=textOf(b.plate).trim().equals(truck.plate.orEmpty().trim(),ignoreCase=true)
        val typeMatches=b.vehicleType.selectedItem?.toString().orEmpty().equals(truck.vehicleType.orEmpty(),ignoreCase=true)
        val formCapacity=textOf(b.capacity).toDoubleOrNull()
        val capacityMatches=when{
            formCapacity==null&&truck.capacity==null->true
            formCapacity!=null&&truck.capacity!=null->abs(formCapacity-truck.capacity)<0.005
            else->false
        }
        return plateMatches&&typeMatches&&capacityMatches
    }

    private fun capacityInput(value:Double?):String=value?.let{if(abs(it-it.toLong())<0.000001)it.toLong().toString() else it.toString()}.orEmpty()

    private fun renderAssignment(state:DriverUiState){
        if(!state.activeTripAvailable){b.homeAssignment.text=getString(R.string.data_unavailable)} else {
            val trip=state.activeTrip;val truck=state.trucks.firstOrNull{it.id==trip?.truckId}?:state.trucks.firstOrNull()
            b.homeAssignment.text=if(trip==null)getString(R.string.no_active_assignment) else getString(R.string.assignment_format,trip.trackingId.orDash(),localStatus(trip.status),trip.pickup.orDash(),trip.dropoff.orDash(),truck?.plate.orDash(),truck?.vehicleType?:trip.vehicleType.orDash())
        }
        val w=state.wallet;b.homeEarnings.text=if(w==null)getString(R.string.earnings_summary_unavailable) else buildString{append(getString(R.string.home_earnings_format,money(w.grossReleased),money(w.commissionDue),money(w.availableDeposit)));if(DriverFinancePresentationPolicy.blocked(state.commission,w))append("\n").append(getString(R.string.job_locked))}
    }

    private fun renderJobs(state:DriverUiState){
        b.jobsList.removeAllViews()
        if(!state.jobsAvailable){b.jobsList.addView(infoCard(getString(R.string.data_unavailable)));return}
        if(DriverFinancePresentationPolicy.blocked(state.commission,state.wallet)){b.jobsList.addView(infoCard(getString(R.string.job_locked)));return}
        if(state.activeTrip!=null){b.jobsList.addView(infoCard(getString(R.string.finish_before_next,state.activeTrip.trackingId.orDash())));return}
        if(state.jobs.isEmpty()){b.jobsList.addView(infoCard(getString(R.string.no_jobs)));return}
        state.jobs.forEach{job->
            val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14))}
            box.addView(text(getString(R.string.job_card_format_v2,job.trackingId.orDash(),job.pickup.orDash(),job.dropoff.orDash(),job.vehicleType.orDash(),job.distanceKm?.let{"${NumberFormat.getNumberInstance().format(it)} km"}?:"—",money(job.priceEtb)),15f))
            if(!job.cargoDescription.isNullOrBlank())box.addView(text(getString(R.string.job_cargo_format,job.cargoDescription),14f))
            box.addView(button(getString(R.string.choose_truck_accept)){chooseTruck(job)});b.jobsList.addView(card(box))
        }
    }

    private fun chooseTruck(job:DriverJob){lifecycleScope.launch{runCatching{repository.trucks(job.id)}.onSuccess{trucks->
        if(trucks.isEmpty()){b.status.text=getString(R.string.no_authorized_truck);return@onSuccess}
        val labels=trucks.map{getString(R.string.truck_option_format,it.plate.orDash(),it.vehicleType.orDash(),it.capacity?.let{v->NumberFormat.getNumberInstance().format(v)}?:"—")}.toTypedArray()
        AlertDialog.Builder(this@MainActivity).setTitle(getString(R.string.choose_truck_title,job.trackingId.orDash())).setItems(labels){_,which->vm.claim(job.id,trucks[which].id)}.setNegativeButton(R.string.cancel,null).show()
    }.onFailure{b.status.text=getString(R.string.error_request_failed)}}}

    private fun renderTrip(state:DriverUiState){
        if(!state.activeTripAvailable){b.tripDetails.text=getString(R.string.data_unavailable);b.liveTripMap.visibility=View.GONE;b.liveMapState.visibility=View.GONE;b.openNavigation.visibility=View.GONE;b.startTrip.visibility=View.GONE;b.startTracking.visibility=View.GONE;b.stopTracking.visibility=View.GONE;b.tripActions.visibility=View.GONE;b.deliveryPanel.visibility=View.GONE;return}
        val trip=state.activeTrip;val truck=state.trucks.firstOrNull{it.id==trip?.truckId}
        b.tripDetails.text=if(trip==null)getString(R.string.no_active_trip) else getString(R.string.trip_details_format_v2,trip.trackingId.orDash(),localStatus(trip.status),trip.pickup.orDash(),trip.dropoff.orDash(),trip.vehicleType.orDash(),truck?.plate.orDash(),trip.cargoDescription.orDash(),money(trip.priceEtb),trip.paymentMethod?.let(::paymentMethodLabel)?:getString(R.string.payment_method_unknown))
        b.liveTripMap.show(state.liveTrip);val live=state.liveTrip
        val trackingRunning=HalloLocationService.isRunningFor(trip?.id)
        b.liveMapState.text=when{
            trip?.status=="accepted"&&trackingRunning->getString(R.string.gps_starting_server)
            trip?.status=="accepted"&&live?.recordedAt==null->getString(R.string.ready_to_start)
            live?.truckLat==null->getString(R.string.waiting_gps)
            else->{
                val freshness=when(DriverPresentation.trackingFreshness(live.recordedAt)){DriverTrackingFreshness.LIVE->getString(R.string.tracking_live);DriverTrackingFreshness.STALE->getString(R.string.tracking_stale);DriverTrackingFreshness.OFFLINE->getString(R.string.tracking_offline)}
                val whenText=DriverPresentation.formatDateTime(live.recordedAt,resources.configuration.locales[0],ZoneId.systemDefault())?:getString(R.string.data_unavailable)
                when{
                    live.speedKmh!=null&&live.heading!=null->getString(R.string.tracking_summary_with_speed_heading,freshness,live.speedKmh,live.heading,whenText)
                    live.speedKmh!=null->getString(R.string.tracking_summary_with_speed,freshness,live.speedKmh,whenText)
                    else->getString(R.string.tracking_summary_no_speed,freshness,whenText)
                }
            }
        }
        b.liveTripMap.visibility=visible(trip!=null);b.liveMapState.visibility=visible(trip!=null);b.openNavigation.visibility=visible(trip!=null)
        b.startTrip.visibility=visible(trip?.status=="accepted"&&!trackingRunning)
        b.startTracking.visibility=visible(trip?.status=="in_transit"&&!trackingRunning)
        b.stopTracking.visibility=visible(trip!=null&&trackingRunning)
        b.tripActions.visibility=visible(trip!=null);b.deliveryPanel.visibility=visible(trip?.status=="in_transit")
        if(trip!=null)configurePaymentChoices(trip.paymentMethod)
    }

    private fun configurePaymentChoices(method:String?){
        val allowed=when(method){"cash"->listOf("cash_received","payment_not_received");"bank_telebirr"->listOf("bank_telebirr","payment_not_received");else->listOf("payment_not_received")}
        if(currentPaymentResults==allowed)return
        currentPaymentResults=allowed;b.paymentResult.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,allowed.map(::paymentLabel))
    }

    private fun renderWallet(state:DriverUiState){
        val w=state.wallet
        b.walletDetails.text=if(w==null)getString(R.string.wallet_unavailable) else getString(R.string.wallet_summary_v2,money(w.grossReleased),w.completedTrips,money(w.adminDeposit),money(w.availableDeposit))
        val c=state.commission;b.commissionDetails.text=if(c==null)getString(R.string.wallet_unavailable) else getString(R.string.commission_summary_v2,money(c.chargedEtb),money(c.approvedPaidEtb),money(c.pendingEtb),money(c.balanceEtb),getString(if(DriverFinancePresentationPolicy.blocked(c,w))R.string.job_access_blocked else R.string.job_access_active))
        b.tripHistoryList.removeAllViews();when{!state.tripResultsAvailable||!state.completedTripsAvailable->b.tripHistoryList.addView(infoCard(getString(R.string.history_unavailable)));state.tripResults.isEmpty()->b.tripHistoryList.addView(infoCard(getString(R.string.no_trip_history)));else->state.tripResults.sortedByDescending{it.createdAt?:it.completedAt}.forEach{result->
            val order=state.completedTrips.firstOrNull{it.id==result.orderId};val date=formatDateTime(result.completedAt?:result.createdAt)
            b.tripHistoryList.addView(infoCard(getString(R.string.trip_result_format_v2,order?.trackingId.orDash(),localStatus(order?.status),order?.pickup.orDash(),order?.dropoff.orDash(),localStatus(result.resultType),paymentMethodLabel(result.paymentMethod),money(order?.priceEtb),money(result.driverGrossEtb?:result.amountCollected),money(result.commissionEtb),money(result.driverNetEtb),money(result.depositConsumedEtb),money(result.depositAfterEtb),date)))
        }}
        b.depositHistoryList.removeAllViews();when{!state.depositTransactionsAvailable->b.depositHistoryList.addView(infoCard(getString(R.string.history_unavailable)));state.depositTransactions.isEmpty()->b.depositHistoryList.addView(infoCard(getString(R.string.no_deposits)));else->state.depositTransactions.sortedByDescending{it.createdAt}.forEach{d->b.depositHistoryList.addView(infoCard(getString(R.string.deposit_row_format_v2,money(d.amountEtb),localStatus(d.status),getString(R.string.deposit_note_format,d.note.orDash()),formatDateTime(d.reversedAt?:d.createdAt))))}}
        b.commissionPaymentsList.removeAllViews();when{!state.commissionPaymentsAvailable->b.commissionPaymentsList.addView(infoCard(getString(R.string.history_unavailable)));state.commissionPayments.isEmpty()->b.commissionPaymentsList.addView(infoCard(getString(R.string.no_commission_payments)));else->state.commissionPayments.sortedByDescending{it.submittedAt}.forEach{p->b.commissionPaymentsList.addView(infoCard(getString(R.string.commission_payment_row_format_v2,money(p.amountEtb),localStatus(p.status),DriverPresentation.humanizeToken(p.provider)?:p.provider,p.transactionId,p.rejectionReason?:formatDateTime(p.reviewedAt?:p.submittedAt))))}}
    }

    private fun renderNotifications(state:DriverUiState){
        b.alertsList.removeAllViews()
        if(!state.notificationsAvailable){b.alertsList.addView(infoCard(getString(R.string.notifications_unavailable)));return}
        state.notifications.forEach{note->b.alertsList.addView(infoCard("${if(note.readAt==null)"● " else ""}${note.title}\n${note.body}").apply{setOnClickListener{vm.markRead(note.id)}})}
        if(state.notifications.isEmpty())b.alertsList.addView(infoCard(getString(R.string.no_notifications)))
    }

    private fun renderProfile(state:DriverUiState){
        val p=state.profile;b.profileDetails.text=buildString{append(getString(R.string.profile_format_v2,p?.fullName.orDash(),p?.phone.orDash(),p?.email.orDash(),localStatus(p?.driverStatus),p?.rating?.toString()?:"—"));if(!p?.homeAddress.isNullOrBlank())append("\n").append(getString(R.string.profile_home_address_format,p?.homeAddress))}
        val truck=primaryTruck(state);b.profileVehicle.text=if(!state.trucksAvailable)getString(R.string.data_unavailable) else if(truck==null)getString(R.string.no_vehicle) else getString(R.string.vehicle_format_v2,truck.plate.orDash(),truck.vehicleType.orDash(),truck.capacity?.let{NumberFormat.getNumberInstance().format(it)}?:"—",localStatus(truck.status))
        renderVerifiedProfilePhoto(state)
    }

    private fun renderVerifiedProfilePhoto(state:DriverUiState){
        val avatar=b.pageProfile.findViewWithTag<TextView>("driver-profile-avatar")
        val existingImage=b.pageProfile.findViewWithTag<ImageView>("driver-profile-photo")
        val verified=if(state.documentsAvailable)state.documents
            .filter{it.key=="driver_photo"&&it.status?.lowercase() in setOf("verified","approved")}
            .maxByOrNull{it.createdAt.orEmpty()} else null
        val path=verified?.path
        if(path.isNullOrBlank()){
            existingImage?.visibility=View.GONE;avatar?.visibility=View.VISIBLE
            loadedProfilePhotoPath=null;loadingProfilePhotoPath=null
            return
        }
        if(loadedProfilePhotoPath==path&&existingImage?.drawable!=null){existingImage.visibility=View.VISIBLE;avatar?.visibility=View.GONE;return}
        if(loadingProfilePhotoPath==path)return
        loadingProfilePhotoPath=path
        lifecycleScope.launch{
            val result=runCatching{
                val signed=repository.verificationDocumentSignedUrl(path)
                withContext(Dispatchers.IO){URL(signed).openStream().use{stream->BitmapFactory.decodeStream(stream)?:error("profile photo decode failed")}}
            }
            if(loadingProfilePhotoPath!=path)return@launch
            result.onSuccess{bitmap->
                val image=profilePhotoView()
                image.setImageBitmap(bitmap);image.visibility=View.VISIBLE;avatar?.visibility=View.GONE
                loadedProfilePhotoPath=path
            }
            loadingProfilePhotoPath=null
        }
    }

    private fun profilePhotoView():ImageView{
        b.pageProfile.findViewWithTag<ImageView>("driver-profile-photo")?.let{return it}
        val avatar=b.pageProfile.findViewWithTag<TextView>("driver-profile-avatar")
        val image=ImageView(this).apply{
            tag="driver-profile-photo"
            scaleType=ImageView.ScaleType.CENTER_CROP
            contentDescription=getString(R.string.verified_profile_photo)
            background=ContextCompat.getDrawable(this@MainActivity,R.drawable.bg_profile_avatar)
            clipToOutline=true
            layoutParams=LinearLayout.LayoutParams(dp(88),dp(88)).apply{gravity=Gravity.CENTER_HORIZONTAL;topMargin=dp(18);bottomMargin=dp(4)}
        }
        val index=avatar?.let{b.pageProfile.indexOfChild(it)}?.takeIf{it>=0}?:2
        b.pageProfile.addView(image,index.coerceAtMost(b.pageProfile.childCount))
        return image
    }

    private fun documentSummary(documents:List<DriverDocument>,truckId:String?):String{
        val relevant=documents.filter{it.truckId==null||it.truckId==truckId}.groupBy{it.key}.mapValues{entry->entry.value.maxByOrNull{it.createdAt.orEmpty()}}
        val identity=DriverDocumentPolicy.identityCompletion(documents);val vehicle=DriverDocumentPolicy.vehicleCompletion(documents,truckId)
        val rows=DOCUMENT_KEYS.joinToString("\n"){key->
            val item=relevant[key];val marker=if(item!=null)"✓" else "○"
            val extra=buildString{
                if(key in DriverDocumentPolicy.expiryRequiredKeys)item?.expiryDate?.let{append(getString(R.string.document_expiry_format,DriverPresentation.formatDate(it,resources.configuration.locales[0])?:it))}
                item?.rejectionReason?.let{append(getString(R.string.document_rejection_format,it))}
            }
            getString(R.string.document_row_format,marker,documentLabel(key),localStatus(item?.status?:"missing"),extra)
        }
        return getString(R.string.driver_documents_progress,identity.first,identity.second)+"\n"+getString(R.string.vehicle_documents_progress,vehicle.first,vehicle.second)+"\n\n"+rows
    }

    private fun showExpiryPicker(){
        val uri=pendingDocumentUri?:return
        val now=Calendar.getInstance()
        DatePickerDialog(this,{_,year,month,day->val expiry="%04d-%02d-%02d".format(year,month+1,day);readDocument(uri,expiry);pendingDocumentUri=null},now.get(Calendar.YEAR),now.get(Calendar.MONTH),now.get(Calendar.DAY_OF_MONTH)).apply{datePicker.minDate=System.currentTimeMillis();setTitle(getString(R.string.document_expiry_prompt,documentLabel(pendingKey)));setOnCancelListener{pendingDocumentUri=null;b.status.text=getString(R.string.document_expiry_required)}}.show()
    }
    private fun readDocument(uri:Uri,expiryDate:String?){val name=contentResolver.query(uri,null,null,null,null)?.use{c->val i=c.getColumnIndex(OpenableColumns.DISPLAY_NAME);if(c.moveToFirst()&&i>=0)c.getString(i) else "document"}?:"document";vm.uploadDocument(pendingKey,pendingTruck,name,contentResolver.getType(uri)?:"application/octet-stream",bytes(uri)?:byteArrayOf(),expiryDate)}
    private fun openNavigation(){vm.state.value.activeTrip?.dropoff?.let{runCatching{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("geo:0,0?q=${Uri.encode(it)}")))}.onFailure{b.status.text=getString(R.string.navigation_app_missing)}}}
    private fun bytes(uri:Uri)=contentResolver.openInputStream(uri)?.use{it.readBytes()}
    private fun requestTracking(){if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED)startTracking() else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.POST_NOTIFICATIONS))}
    private fun startTracking(){
        val trip=vm.state.value.activeTrip?:return
        ContextCompat.startForegroundService(this,Intent(this,HalloLocationService::class.java).putExtra("order_id",trip.id))
        b.startTrip.visibility=View.GONE;b.startTracking.visibility=View.GONE;b.stopTracking.visibility=View.VISIBLE
        if(trip.status=="accepted")b.liveMapState.text=getString(R.string.gps_starting_server)
        b.status.text=getString(R.string.gps_started)
    }

    private fun messageText(message:DriverMessage)=getString(when(message){DriverMessage.RESTORING->R.string.restoring;DriverMessage.CONFIG_REQUIRED->R.string.config_required;DriverMessage.SIGN_IN_REQUIRED->R.string.sign_in_required;DriverMessage.SIGNING_IN->R.string.signing_in;DriverMessage.CREATING_ACCOUNT->R.string.creating_account;DriverMessage.CONFIRM_EMAIL->R.string.confirm_email;DriverMessage.SIGNED_OUT->R.string.signed_out;DriverMessage.REFRESHING->R.string.refreshing;DriverMessage.CURRENT->R.string.current;DriverMessage.ACCESS_DENIED->R.string.access_denied;DriverMessage.ACCEPTING_JOB->R.string.accepting_job;DriverMessage.OPEN_TRIP->R.string.open_trip;DriverMessage.SAVING_VEHICLE->R.string.saving_vehicle;DriverMessage.UPLOADING_DOCUMENT->R.string.uploading_document;DriverMessage.SUBMITTING_DELIVERY->R.string.submitting_delivery;DriverMessage.TRIP_COMPLETED->R.string.trip_completed;DriverMessage.ACTIVE_TRIP_SYNCED->R.string.active_trip_synced;DriverMessage.GPS_STARTED->R.string.gps_started;DriverMessage.GPS_STOPPED->R.string.gps_stopped;DriverMessage.MARKING_READ->R.string.marking_read})
    private fun errorText(error:DriverErrorCode)=getString(when(error){DriverErrorCode.INVALID_CREDENTIALS->R.string.error_invalid_credentials;DriverErrorCode.ACCOUNT_EXISTS->R.string.error_account_exists;DriverErrorCode.NETWORK->R.string.error_network;DriverErrorCode.SESSION_EXPIRED->R.string.error_session_expired;DriverErrorCode.FORBIDDEN->R.string.error_forbidden;DriverErrorCode.INVALID_INPUT->R.string.error_invalid_input;DriverErrorCode.DUPLICATE_ACTION->R.string.error_duplicate;DriverErrorCode.PERMISSION_DENIED->R.string.error_permission_denied;DriverErrorCode.REQUEST_FAILED->R.string.error_request_failed})
    private fun localStatus(value:String?):String=when(value?.lowercase()){ "approved"->getString(R.string.approved);"verified"->getString(R.string.verified);"pending"->getString(R.string.pending);"missing"->getString(R.string.missing);"rejected","suspended","disabled"->getString(R.string.rejected);"reversed"->getString(R.string.reversed);"accepted"->getString(R.string.status_accepted);"in_transit"->getString(R.string.status_in_transit);"delivered"->getString(R.string.status_delivered);"partial","partially_paid"->getString(R.string.status_partial);"held_escrow"->getString(R.string.status_held_escrow);"initiated"->getString(R.string.status_initiated);"unpaid"->getString(R.string.status_unpaid);"active"->getString(R.string.status_active);"blocked"->getString(R.string.status_blocked);"cash_received"->getString(R.string.cash_received);"bank_telebirr"->getString(R.string.bank_telebirr);"payment_not_received"->getString(R.string.payment_not_received);null,""->getString(R.string.missing);else->DriverPresentation.humanizeToken(value)?:getString(R.string.missing)}
    private fun paymentLabel(value:String)=when(value){"cash_received"->getString(R.string.cash_received);"bank_telebirr"->getString(R.string.bank_telebirr_review);else->getString(R.string.payment_not_received)}
    private fun paymentMethodLabel(value:String?)=when(value){"cash"->getString(R.string.payment_method_cash);"bank_telebirr"->getString(R.string.bank_telebirr);null,""->getString(R.string.payment_method_unknown);else->DriverPresentation.humanizeToken(value)?:getString(R.string.payment_method_unknown)}
    private fun documentLabel(key:String)=getString(when(key){"driver_photo"->R.string.driver_photo;"license_front"->R.string.license_front;"license_back"->R.string.license_back;"national_id_front"->R.string.national_id_front;"national_id_back"->R.string.national_id_back;"vehicle_registration"->R.string.vehicle_registration;"truck_front"->R.string.truck_front;else->R.string.truck_side})
    private fun formatDateTime(value:String?)=DriverPresentation.formatDateTime(value,resources.configuration.locales[0],ZoneId.systemDefault())?:getString(R.string.data_unavailable)
    private fun infoCard(value:String)=card(text(value,14f))
    private fun card(child:View)=MaterialCardView(this).apply{setCardBackgroundColor(ContextCompat.getColor(context,R.color.hallo_card));radius=dp(16).toFloat();strokeWidth=dp(1);strokeColor=ContextCompat.getColor(context,R.color.hallo_border);val lp=LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,LinearLayout.LayoutParams.WRAP_CONTENT);lp.setMargins(0,dp(6),0,dp(6));layoutParams=lp;addView(child)}
    private fun text(value:String,size:Float)=TextView(this).apply{text=value;textSize=size;setTextColor(ContextCompat.getColor(context,R.color.hallo_text));setPadding(dp(14))}
    private fun button(value:String,action:()->Unit)=MaterialButton(this).apply{text=value;isAllCaps=false;minHeight=dp(52);cornerRadius=dp(16);setOnClickListener{action()}}
    private fun textOf(view:TextView)=view.text?.toString().orEmpty();private fun visible(show:Boolean)=if(show)View.VISIBLE else View.GONE;private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt();private fun money(value:Double?)=if(value==null)"—" else "ETB ${NumberFormat.getIntegerInstance().format(value)}";private fun String?.orDash()=if(this.isNullOrBlank())"—" else this

    companion object{
        val VEHICLE_TYPES=listOf("Pickup","Van","Isuzu 5 Ton","Dry Cargo","Refrigerated","Truck 22 Ton","Truck 25 Ton","Truck 30 Ton","Trailer")
        val DOCUMENT_KEYS=DriverDocumentPolicy.allKeys.toList()
        val PAYMENT_RESULTS=listOf("cash_received","bank_telebirr","payment_not_received")
    }
}
