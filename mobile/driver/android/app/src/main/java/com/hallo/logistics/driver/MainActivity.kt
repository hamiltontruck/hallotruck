package com.hallo.logistics.driver

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.text.InputFilter
import android.view.View
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.setPadding
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.hallo.logistics.driver.databinding.ActivityMainBinding
import com.hallo.logistics.driver.tracking.HalloLocationService
import io.github.jan.supabase.auth.handleDeeplinks
import kotlinx.coroutines.launch
import java.text.NumberFormat

class MainActivity : AppCompatActivity() {
    private lateinit var b: ActivityMainBinding
    private val vm: DriverSessionViewModel by viewModels()
    private var signup = false
    private var pendingKey = ""
    private var pendingTruck: String? = null
    private var photo: ByteArray? = null
    private var signature: ByteArray? = null

    private val documentPicker = registerForActivityResult(ActivityResultContracts.GetContent()) { it?.let(::readDocument) }
    private val photoPicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        photo = uri?.let(::bytes); b.photoState.text = if (photo != null) "Delivery photo selected" else "Photo required"
    }
    private val signaturePicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        signature = uri?.let(::bytes); b.signatureState.text = if (signature != null) "Signature selected" else "Signature required"
    }
    private val locationPermission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants[Manifest.permission.ACCESS_FINE_LOCATION] == true) startTracking()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityMainBinding.inflate(layoutInflater); setContentView(b.root)
        if (HalloSupabase.configured) runCatching { HalloSupabase.client.handleDeeplinks(intent) }
        configureSpinners(); configureListeners()
        lifecycleScope.launch { repeatOnLifecycle(Lifecycle.State.STARTED) { vm.state.collect(::render) } }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); if (HalloSupabase.configured) runCatching { HalloSupabase.client.handleDeeplinks(intent) } }

    private fun configureSpinners() {
        b.vehicleType.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, VEHICLE_TYPES)
        b.documentKey.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, DOCUMENT_KEYS)
        b.paymentResult.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, listOf("cash_received", "bank_telebirr_confirmed", "not_collected"))
    }

    private fun configureListeners() {
        b.authMode.setOnClickListener { setSignupMode(!signup) }
        b.authSubmit.setOnClickListener { if (signup) vm.signUp(textOf(b.fullName), textOf(b.phone), textOf(b.email), textOf(b.pin), textOf(b.confirmPin)) else vm.signIn(textOf(b.email), textOf(b.pin)) }
        b.signOut.setOnClickListener { vm.signOut() }; b.refresh.setOnClickListener { vm.refresh() }
        b.documentsAction.setOnClickListener { vm.page(DriverPage.ONBOARDING) }; b.notificationsAction.setOnClickListener { vm.page(DriverPage.NOTIFICATIONS) }; b.profileDocuments.setOnClickListener { vm.page(DriverPage.ONBOARDING) }
        b.bottomNavigation.setOnItemSelectedListener {
            vm.page(when (it.itemId) { R.id.nav_jobs -> DriverPage.JOBS; R.id.nav_trip -> DriverPage.TRIP; R.id.nav_wallet -> DriverPage.WALLET; R.id.nav_profile -> DriverPage.PROFILE; else -> DriverPage.HOME }); true
        }
        b.saveVehicle.setOnClickListener { vm.saveVehicle(textOf(b.plate), b.vehicleType.selectedItem.toString(), textOf(b.capacity).toDoubleOrNull() ?: 0.0) }
        b.chooseDocument.setOnClickListener {
            pendingKey = b.documentKey.selectedItem.toString(); pendingTruck = if (pendingKey in VEHICLE_DOCUMENTS) vm.state.value.trucks.firstOrNull()?.id else null
            if (pendingKey in VEHICLE_DOCUMENTS && pendingTruck == null) b.status.text = "Save or receive an assigned vehicle before uploading this vehicle document" else documentPicker.launch("*/*")
        }
        b.startTrip.setOnClickListener { vm.openTrip(); requestTracking() }; b.startTracking.setOnClickListener { requestTracking() }
        b.stopTracking.setOnClickListener { stopService(Intent(this, HalloLocationService::class.java)); b.status.text = "Live GPS stopped" }
        b.openNavigation.setOnClickListener { openNavigation() }; b.pickPhoto.setOnClickListener { photoPicker.launch("image/*") }; b.pickSignature.setOnClickListener { signaturePicker.launch("image/*") }
        b.finishTrip.setOnClickListener { vm.finish(textOf(b.recipient), textOf(b.deliveryNote), photo ?: byteArrayOf(), "image/jpeg", signature ?: byteArrayOf(), b.paymentResult.selectedItem.toString(), textOf(b.amount).toDoubleOrNull()) }
    }

    private fun setSignupMode(enabled: Boolean) {
        signup = enabled; b.signupFields.visibility = visible(enabled); b.confirmPinLayout.visibility = visible(enabled)
        b.pin.filters = if (enabled) arrayOf(InputFilter.LengthFilter(6)) else emptyArray()
        b.authSubmit.text = if (enabled) "Create Driver account" else "Sign in"; b.authMode.text = if (enabled) "Already registered? Sign in" else "Create Driver account"
    }

    private fun render(state: DriverUiState) {
        b.progress.visibility = visible(state.loading || state.busy); b.status.text = state.message; b.statusCard.visibility = visible(state.message.isNotBlank())
        b.authPanel.visibility = visible(state.access == DriverAccess.SIGNED_OUT || state.access == DriverAccess.FORBIDDEN)
        val shell = state.access in setOf(DriverAccess.APPROVED, DriverAccess.ONBOARDING, DriverAccess.REJECTED)
        b.driverShell.visibility = visible(shell); b.documentsAction.visibility = visible(shell); b.notificationsAction.visibility = visible(shell); b.bottomNavigation.visibility = visible(state.access == DriverAccess.APPROVED)
        val page = if (state.access == DriverAccess.APPROVED) state.page else DriverPage.ONBOARDING; showPage(page)
        b.accessState.text = "Verification: ${state.profile?.driverStatus ?: "pending"}"
        val docs = documentProgress(state.documents); b.homeAvailableJobs.text = state.jobs.size.toString(); b.homeActiveTrip.text = state.activeTrip?.trackingId ?: "None"; b.homeDocuments.text = "${docs.first}/${docs.second}"
        renderAssignment(state); renderJobs(state); renderTrip(state); renderWallet(state); renderNotifications(state)
        b.profileDetails.text = "${state.profile?.fullName.orEmpty()}\n${state.profile?.phone.orEmpty()}\nStatus: ${state.profile?.driverStatus ?: "pending"}\nRating: ${state.profile?.rating ?: "—"}"
        b.documentState.text = documentSummary(state.documents)
    }

    private fun showPage(page: DriverPage) {
        listOf(b.pageHome, b.pageOnboarding, b.pageJobs, b.pageTrip, b.pageWallet, b.pageAlerts, b.pageProfile).forEach { it.visibility = View.GONE }
        when (page) { DriverPage.HOME -> b.pageHome; DriverPage.ONBOARDING -> b.pageOnboarding; DriverPage.JOBS -> b.pageJobs; DriverPage.TRIP, DriverPage.DELIVERY -> b.pageTrip; DriverPage.WALLET -> b.pageWallet; DriverPage.NOTIFICATIONS -> b.pageAlerts; DriverPage.PROFILE -> b.pageProfile }.visibility = View.VISIBLE
        b.headerTitle.text = when (page) { DriverPage.HOME -> "Ready to move"; DriverPage.ONBOARDING -> "Documents"; DriverPage.JOBS -> "Find your next load"; DriverPage.TRIP, DriverPage.DELIVERY -> "Active trip"; DriverPage.WALLET -> "Earnings"; DriverPage.NOTIFICATIONS -> "Notifications"; DriverPage.PROFILE -> "Your profile" }
        b.contentScroll.smoothScrollTo(0, 0)
    }

    private fun renderAssignment(state: DriverUiState) {
        val trip = state.activeTrip; val truck = state.trucks.firstOrNull { it.id == trip?.truckId } ?: state.trucks.firstOrNull()
        b.homeAssignment.text = if (trip == null) "No active assignment\nYou are ready for an authorized job." else "${trip.trackingId} · ${trip.status?.replace('_', ' ')}\n${trip.pickup} → ${trip.dropoff}\nTruck: ${truck?.plate ?: "Assigned"} · ${truck?.vehicleType ?: trip.vehicleType}"
        val w = state.wallet; b.homeEarnings.text = if (w == null) "Earnings summary unavailable" else "Earnings ${money(w.grossReleased)}\nCommission due ${money(w.commissionDue)} · Available deposit ${money(w.availableDeposit)}"
    }

    private fun renderJobs(state: DriverUiState) {
        b.jobsList.removeAllViews(); if (state.activeTrip != null) { b.jobsList.addView(infoCard("Finish ${state.activeTrip.trackingId} before accepting another job")); return }; if (state.jobs.isEmpty()) { b.jobsList.addView(infoCard("No authorized jobs are available right now.")); return }
        state.jobs.forEach { job -> val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18)) }; box.addView(text("${job.trackingId}\n${job.pickup} → ${job.dropoff}\n${job.vehicleType} · ${job.distanceKm ?: "—"} km\n${money(job.priceEtb)}", 15f)); box.addView(button("Choose truck & accept") { chooseTruck(job) }); b.jobsList.addView(card(box)) }
    }

    private fun chooseTruck(job: DriverJob) { lifecycleScope.launch { runCatching { DriverRepository().trucks(job.id) }.onSuccess { trucks -> if (trucks.isEmpty()) { b.status.text = "No authorized truck is available"; return@onSuccess }; val labels = trucks.map { "${it.plate} · ${it.vehicleType} · ${it.capacity ?: "—"} ton" }.toTypedArray(); AlertDialog.Builder(this@MainActivity).setTitle("Choose truck for ${job.trackingId}").setItems(labels) { _, which -> vm.claim(job.id, trucks[which].id) }.setNegativeButton("Cancel", null).show() }.onFailure { b.status.text = DriverErrorPolicy.safeMessage(it) } } }

    private fun renderTrip(state: DriverUiState) {
        val trip = state.activeTrip; val truck = state.trucks.firstOrNull { it.id == trip?.truckId }; b.tripDetails.text = if (trip == null) "No active trip" else "${trip.trackingId}\n${trip.pickup} → ${trip.dropoff}\n${trip.vehicleType} · ${money(trip.priceEtb)}\nTruck: ${truck?.plate ?: "Assigned"}\nStatus: ${trip.status?.replace('_', ' ')}"
        b.liveTripMap.show(state.liveTrip); val live = state.liveTrip; b.liveMapState.text = if (live?.truckLat == null) "Waiting for the first authorized GPS ping" else "Live: %.5f, %.5f · %.0f km/h\nUpdated: %s".format(live.truckLat, live.truckLng, live.speedKmh ?: 0.0, live.recordedAt ?: "now")
        b.liveTripMap.visibility = visible(trip != null); b.liveMapState.visibility = visible(trip != null); b.openNavigation.visibility = visible(trip != null); b.startTrip.visibility = visible(trip?.status == "accepted"); b.tripActions.visibility = visible(trip != null); b.deliveryPanel.visibility = visible(trip?.status == "in_transit")
    }

    private fun renderWallet(state: DriverUiState) { val w = state.wallet; b.walletDetails.text = if (w == null) "Wallet unavailable" else "TOTAL RELEASED\n${money(w.grossReleased)}\n\nCompleted trips  ${w.completedTrips}\nCommission charged  ${money(w.commissionCharged)}\nCommission paid  ${money(w.commissionPaid)}\nCommission due  ${money(w.commissionDue)}\nAdmin deposit  ${money(w.adminDeposit)}\nAvailable deposit  ${money(w.availableDeposit)}" }
    private fun renderNotifications(state: DriverUiState) { b.alertsList.removeAllViews(); state.notifications.forEach { note -> b.alertsList.addView(infoCard("${if (note.readAt == null) "● " else ""}${note.title}\n${note.body}").apply { setOnClickListener { vm.markRead(note.id) } }) }; if (state.notifications.isEmpty()) b.alertsList.addView(infoCard("No notifications")) }
    private fun documentSummary(documents: List<DriverDocument>): String { val latest = documents.groupBy { it.key }.mapValues { it.value.last() }; return DOCUMENT_KEYS.joinToString("\n") { key -> val item = latest[key]; "${if (item != null) "✓" else "○"} ${key.replace('_', ' ')}: ${item?.status ?: "missing"}${item?.rejectionReason?.let { " · $it" } ?: ""}" } }
    private fun documentProgress(documents: List<DriverDocument>) = documents.map { it.key }.toSet().count { it in DOCUMENT_KEYS } to DOCUMENT_KEYS.size
    private fun readDocument(uri: Uri) { val name = contentResolver.query(uri, null, null, null, null)?.use { c -> val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME); if (c.moveToFirst() && i >= 0) c.getString(i) else "document" } ?: "document"; vm.uploadDocument(pendingKey, pendingTruck, name, contentResolver.getType(uri) ?: "application/octet-stream", bytes(uri) ?: byteArrayOf()) }
    private fun openNavigation() { vm.state.value.activeTrip?.dropoff?.let { runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=${Uri.encode(it)}"))) }.onFailure { b.status.text = "Install a navigation app to open this destination" } } }
    private fun bytes(uri: Uri) = contentResolver.openInputStream(uri)?.use { it.readBytes() }
    private fun requestTracking() { if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) startTracking() else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.POST_NOTIFICATIONS)) }
    private fun startTracking() { val id = vm.state.value.activeTrip?.id ?: return; ContextCompat.startForegroundService(this, Intent(this, HalloLocationService::class.java).putExtra("order_id", id)); b.status.text = "Live GPS started" }
    private fun infoCard(value: String) = card(text(value, 15f))
    private fun card(child: View) = MaterialCardView(this).apply { setCardBackgroundColor(ContextCompat.getColor(context, R.color.hallo_card)); radius = dp(18).toFloat(); strokeWidth = dp(1); strokeColor = ContextCompat.getColor(context, R.color.hallo_border); addView(child) }
    private fun text(value: String, size: Float) = TextView(this).apply { text = value; textSize = size; setTextColor(ContextCompat.getColor(context, R.color.hallo_text)); setPadding(dp(16)) }
    private fun button(value: String, action: () -> Unit) = MaterialButton(this).apply { text = value; isAllCaps = false; setOnClickListener { action() } }
    private fun textOf(view: TextView) = view.text?.toString().orEmpty(); private fun visible(show: Boolean) = if (show) View.VISIBLE else View.GONE; private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt(); private fun money(value: Double?) = if (value == null) "—" else "ETB ${NumberFormat.getIntegerInstance().format(value)}"

    companion object { val VEHICLE_TYPES = listOf("Pickup", "Van", "Isuzu 5 Ton", "Dry Cargo", "Refrigerated", "Truck 22 Ton", "Truck 25 Ton", "Truck 30 Ton", "Trailer"); val DOCUMENT_KEYS = listOf("driver_photo", "license_front", "license_back", "national_id_front", "national_id_back", "vehicle_registration", "insurance", "truck_front", "truck_side"); val VEHICLE_DOCUMENTS = setOf("vehicle_registration", "insurance", "truck_front", "truck_side") }
}
