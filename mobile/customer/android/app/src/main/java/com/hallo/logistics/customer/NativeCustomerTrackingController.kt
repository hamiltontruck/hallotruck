package com.hallo.logistics.customer

import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

class NativeCustomerTrackingController(
    private val activity: AppCompatActivity,
    private val root: View,
    private val viewModel: CustomerViewModel,
) {
    private val trackingId = root.findViewById<TextView>(R.id.nativeTrackingId)
    private val gpsBadge = root.findViewById<TextView>(R.id.nativeTrackingGpsBadge)
    private val assignmentCard = root.findViewById<View>(R.id.nativeTrackingAssignmentCard)
    private val driverPhoto = root.findViewById<ImageView>(R.id.nativeTrackingDriverPhoto)
    private val truckPhoto = root.findViewById<ImageView>(R.id.nativeTrackingTruckPhoto)
    private val driverName = root.findViewById<TextView>(R.id.nativeTrackingDriverName)
    private val driverMeta = root.findViewById<TextView>(R.id.nativeTrackingDriverMeta)
    private val call = root.findViewById<MaterialButton>(R.id.nativeTrackingCall)
    private val chat = root.findViewById<MaterialButton>(R.id.nativeTrackingChat)
    private val map = root.findViewById<CustomerLiveMapView>(R.id.nativeTrackingMap)
    private val gps = root.findViewById<TextView>(R.id.nativeTrackingGps)
    private val remaining = root.findViewById<TextView>(R.id.nativeTrackingRemaining)
    private val eta = root.findViewById<TextView>(R.id.nativeTrackingEta)
    private val route = root.findViewById<TextView>(R.id.nativeTrackingRoute)
    private val waiting = root.findViewById<TextView>(R.id.nativeTrackingWaiting)
    private val steps = listOf(
        root.findViewById<TextView>(R.id.nativeStepAssigned),
        root.findViewById<TextView>(R.id.nativeStepPickup),
        root.findViewById<TextView>(R.id.nativeStepRoute),
        root.findViewById<TextView>(R.id.nativeStepDelivered),
    )

    init {
        root.findViewById<MaterialButton>(R.id.nativeTrackingRefresh).setOnClickListener { viewModel.refreshTracking() }
    }

    fun render(state: CustomerUiState) {
        val order = state.trackingOrder
            ?: state.orders.firstOrNull { CustomerPolicy.canTrack(it.status) }
        if (order == null) {
            trackingId.text = activity.getString(R.string.live_tracking)
            gpsBadge.text = activity.getString(R.string.gps_offline)
            assignmentCard.visibility = View.GONE
            map.showTrip(null)
            gps.text = activity.getString(R.string.gps_offline)
            remaining.text = "—"
            eta.text = "—"
            route.text = activity.getString(R.string.no_active_delivery)
            waiting.visibility = View.VISIBLE
            styleTimeline(null)
            return
        }

        val assignment = state.assignments.firstOrNull { it.orderId == order.id }
        val media = state.assignmentMedia[order.id]
        val trip = state.liveTrip?.takeIf { it.orderId == order.id }
        val hasTruck = trip?.truckLongitude != null && trip.truckLatitude != null
        val freshness = CustomerPolicy.trackingFreshness(trip?.recordedAt, hasTruck)

        trackingId.text = order.trackingId ?: activity.getString(R.string.order_label)
        gpsBadge.text = when (freshness) {
            "LIVE" -> activity.getString(R.string.gps_live)
            "STALE" -> activity.getString(R.string.gps_stale)
            else -> activity.getString(R.string.gps_offline)
        }
        styleTimeline(order.status)
        route.text = "${order.pickupAddress.orEmpty()}\n→ ${order.dropoffAddress.orEmpty()}"
        map.showTrip(trip, state.trackingRoute?.coordinates.orEmpty())

        waiting.visibility = if (hasTruck) View.GONE else View.VISIBLE
        gps.text = when {
            !hasTruck -> activity.getString(R.string.gps_offline)
            freshness == "LIVE" && trip?.speedKmh != null -> "${activity.getString(R.string.gps_live)}\n${activity.getString(R.string.speed_kmh, trip.speedKmh.toInt())}"
            freshness == "LIVE" -> activity.getString(R.string.gps_live)
            freshness == "STALE" -> activity.getString(R.string.gps_stale)
            else -> activity.getString(R.string.gps_offline)
        }
        remaining.text = if (freshness == "LIVE") {
            state.remainingRoute?.distanceKm?.let { activity.getString(R.string.distance_km, number(it)) } ?: "—"
        } else {
            activity.getString(R.string.last_known_only)
        }
        eta.text = if (freshness == "LIVE") {
            state.remainingRoute?.durationSeconds?.let(::duration) ?: "—"
        } else {
            activity.getString(R.string.last_known_only)
        }

        renderAssignment(order, assignment, media)
    }

    private fun renderAssignment(order: CustomerOrder, assignment: CustomerAssignment?, media: CustomerAssignmentMedia?) {
        if (assignment == null || !CustomerPolicy.showAssignment(order.status)) {
            assignmentCard.visibility = View.GONE
            return
        }
        assignmentCard.visibility = View.VISIBLE
        driverName.text = assignment.driverName ?: activity.getString(R.string.assigned_driver)
        driverMeta.text = buildString {
            append(if (assignment.driverVerified == true) activity.getString(R.string.verified_driver) else activity.getString(R.string.verification_pending))
            append("\n")
            append(assignment.plateNumber ?: "—")
            append(" · ")
            append(assignment.vehicleType ?: order.vehicleType ?: "—")
        }

        val phone = assignment.driverPhone?.trim().orEmpty()
        call.isEnabled = phone.isNotBlank()
        call.setOnClickListener {
            if (phone.isNotBlank()) activity.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(phone)}")))
        }
        chat.isEnabled = true
        chat.setOnClickListener {
            NativeCustomerChatDialog(
                activity = activity,
                orderId = order.id,
                driverName = assignment.driverName ?: activity.getString(R.string.assigned_driver),
            ).show()
        }

        loadImage(driverPhoto, media?.driverPhotoUrl, R.drawable.hallo_logistics_logo)
        loadImage(truckPhoto, media?.truckPhotoUrl, R.drawable.truck_10_ton)
    }

    private fun loadImage(target: ImageView, url: String?, fallback: Int) {
        if (target.tag == url) return
        target.tag = url
        if (url.isNullOrBlank()) {
            target.setImageResource(fallback)
            return
        }
        activity.lifecycleScope.launch {
            val bitmap = CustomerSecureImageLoader.load(url)
            if (target.tag == url) {
                if (bitmap == null) target.setImageResource(fallback) else target.setImageBitmap(bitmap)
            }
        }
    }

    private fun styleTimeline(status: String?) {
        val active = when (status) {
            "delivered" -> 3
            "in_transit" -> 2
            "accepted", "assigned" -> 1
            else -> 0
        }
        steps.forEachIndexed { index, step ->
            step.alpha = if (index <= active) 1f else 0.45f
            step.setTypeface(step.typeface, if (index == active) Typeface.BOLD else Typeface.NORMAL)
            step.setTextColor(activity.getColor(if (index <= active) R.color.hallo_navy else R.color.hallo_muted))
        }
    }

    private fun duration(seconds: Double): String {
        val minutes = (seconds / 60.0).toInt().coerceAtLeast(0)
        val hours = minutes / 60
        val rest = minutes % 60
        return if (hours > 0) {
            activity.getString(R.string.hours_minutes_short, hours, rest)
        } else {
            activity.getString(R.string.minutes_only_short, rest)
        }
    }

    private fun number(value: Double): String = NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = 1 }.format(value)
}
