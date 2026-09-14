package com.hallo.logistics.customer

import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

class NativeCustomerOrdersController(
    private val activity: AppCompatActivity,
    private val root: View,
    private val viewModel: CustomerViewModel,
) {
    private enum class Filter { ALL, ACTIVE, PAYMENT, DELIVERED, CANCELLED }

    private val list = root.findViewById<LinearLayout>(R.id.nativeOrdersList)
    private val empty = root.findViewById<TextView>(R.id.nativeOrdersEmpty)
    private val filters = root.findViewById<MaterialButtonToggleGroup>(R.id.nativeOrdersFilters)
    private val expanded = mutableSetOf<String>()
    private var filter = Filter.ALL

    init {
        root.findViewById<MaterialButton>(R.id.nativeOrdersRefresh).setOnClickListener { viewModel.refresh() }
        filters.check(R.id.nativeFilterAll)
        filters.addOnButtonCheckedListener { _, checkedId, checked ->
            if (!checked) return@addOnButtonCheckedListener
            filter = when (checkedId) {
                R.id.nativeFilterActive -> Filter.ACTIVE
                R.id.nativeFilterPayment -> Filter.PAYMENT
                R.id.nativeFilterDelivered -> Filter.DELIVERED
                R.id.nativeFilterCancelled -> Filter.CANCELLED
                else -> Filter.ALL
            }
            render(viewModel.state.value)
        }
    }

    fun render(state: CustomerUiState) {
        val active = state.orders.count { it.status in activeStatuses }
        val delivered = state.orders.count { it.status == "delivered" }
        val toPay = state.orders.filterNot { it.status == "cancelled" }.sumOf { order ->
            CustomerPaymentPolicy.summarize(order, paymentsFor(order, state)).remainingToSubmit
        }
        root.findViewById<TextView>(R.id.nativeOrdersMetricAll).text = state.orders.size.toString()
        root.findViewById<TextView>(R.id.nativeOrdersMetricActive).text = active.toString()
        root.findViewById<TextView>(R.id.nativeOrdersMetricDelivered).text = delivered.toString()
        root.findViewById<TextView>(R.id.nativeOrdersMetricPay).text = "ETB ${number(toPay)}"

        val shown = state.orders.filter { order ->
            when (filter) {
                Filter.ALL -> true
                Filter.ACTIVE -> order.status in activeStatuses
                Filter.DELIVERED -> order.status == "delivered"
                Filter.CANCELLED -> order.status == "cancelled"
                Filter.PAYMENT -> CustomerPaymentPolicy.needsPayment(order, paymentsFor(order, state))
            }
        }
        empty.visibility = if (shown.isEmpty()) View.VISIBLE else View.GONE
        empty.text = activity.getString(if (state.orders.isEmpty()) R.string.no_orders else R.string.no_matching_orders)
        list.removeAllViews()
        shown.forEach { order -> list.addView(orderCard(order, state)) }
    }

    private fun orderCard(order: CustomerOrder, state: CustomerUiState): View {
        val card = LayoutInflater.from(activity).inflate(R.layout.item_customer_order_native, list, false)
        val payments = paymentsFor(order, state)
        val paymentSummary = CustomerPaymentPolicy.summarize(order, payments)
        card.findViewById<TextView>(R.id.nativeOrderTracking).text = order.trackingId ?: activity.getString(R.string.order_label)
        card.findViewById<TextView>(R.id.nativeOrderCreated).text = formatDate(order.createdAt)
        card.findViewById<TextView>(R.id.nativeOrderStatus).text = statusLabel(order.status)
        card.findViewById<TextView>(R.id.nativeOrderRoute).text = "${order.pickupAddress.orEmpty()}\n→ ${order.dropoffAddress.orEmpty()}"
        card.findViewById<TextView>(R.id.nativeOrderFacts).text = buildString {
            append(order.vehicleType ?: "—")
            append(" · ").append(order.distanceKm?.let(::formatDistance) ?: "—")
            append(" · ").append(order.priceEtb?.let { "ETB ${number(it)}" } ?: "—")
        }
        val detailsPanel = card.findViewById<View>(R.id.nativeOrderDetailsPanel)
        val details = card.findViewById<TextView>(R.id.nativeOrderDetailsText)
        val detailsButton = card.findViewById<MaterialButton>(R.id.nativeOrderDetails)
        val isExpanded = order.id in expanded
        detailsPanel.visibility = if (isExpanded) View.VISIBLE else View.GONE
        detailsButton.text = activity.getString(if (isExpanded) R.string.hide_details else R.string.view_details)
        details.text = buildString {
            append(activity.getString(R.string.load)).append(": ").append(CustomerPaymentPolicy.formatLoad(order))
            append("\n").append(activity.getString(R.string.payment_method)).append(": ").append(paymentMethod(order.paymentMethod))
            append("\n").append(activity.getString(R.string.verified_paid)).append(": ETB ").append(number(paymentSummary.verifiedPaid))
            append("\n").append(activity.getString(R.string.pending_verification)).append(": ETB ").append(number(paymentSummary.pendingVerification))
            append("\n").append(activity.getString(R.string.to_pay)).append(": ETB ").append(number(paymentSummary.remainingToSubmit))
            if (!order.cancellationReason.isNullOrBlank()) {
                append("\n").append(activity.getString(R.string.native_cancellation)).append(": ").append(order.cancellationReason)
            }
        }
        detailsButton.setOnClickListener {
            if (order.id in expanded) expanded.remove(order.id) else expanded.add(order.id)
            render(viewModel.state.value)
        }

        val track = card.findViewById<MaterialButton>(R.id.nativeOrderTrack)
        track.visibility = if (CustomerPolicy.canTrack(order.status)) View.VISIBLE else View.GONE
        track.setOnClickListener { viewModel.track(order) }

        val cancel = card.findViewById<MaterialButton>(R.id.nativeOrderCancel)
        cancel.visibility = if (CustomerPolicy.canCancel(order.status)) View.VISIBLE else View.GONE
        cancel.setOnClickListener { showCancel(order) }
        return card
    }

    private fun showCancel(order: CustomerOrder) {
        val input = EditText(activity).apply {
            hint = activity.getString(R.string.cancel_reason)
            minLines = 3
            maxLines = 5
            setPadding(dp(16), dp(12), dp(16), dp(12))
        }
        AlertDialog.Builder(activity)
            .setTitle(R.string.cancel_order)
            .setMessage(R.string.cancel_reason_help)
            .setView(input)
            .setNegativeButton(R.string.keep_order, null)
            .setPositiveButton(R.string.confirm_cancel) { _, _ ->
                viewModel.cancelOrder(order, input.text.toString())
            }
            .show()
    }

    private fun paymentsFor(order: CustomerOrder, state: CustomerUiState) = state.payments.filter { it.orderId == order.id }

    private fun statusLabel(status: String?): String = when (status?.lowercase()) {
        "quoted" -> activity.getString(R.string.native_status_quote_ready)
        "placed" -> activity.getString(R.string.native_status_order_placed)
        "assigned" -> activity.getString(R.string.native_status_driver_assigned)
        "accepted" -> activity.getString(R.string.native_status_driver_accepted)
        "in_transit" -> activity.getString(R.string.in_transit)
        "delivered" -> activity.getString(R.string.delivered)
        "cancelled" -> activity.getString(R.string.filter_cancelled)
        else -> status?.replace('_', ' ')?.replaceFirstChar { it.uppercase() } ?: activity.getString(R.string.pending)
    }

    private fun paymentMethod(value: String?): String = when (value) {
        "bank_telebirr" -> activity.getString(R.string.bank_telebirr)
        "cash" -> activity.getString(R.string.cash)
        else -> value ?: "—"
    }

    private fun formatDate(value: String?): String {
        if (value.isNullOrBlank()) return "—"
        return runCatching {
            DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)
                .withLocale(activity.resources.configuration.locales[0] ?: Locale.getDefault())
                .withZone(ZoneId.systemDefault())
                .format(Instant.parse(value))
        }.getOrDefault(value)
    }

    private fun formatDistance(value: Double): String = activity.getString(R.string.distance_km, number(value))
    private fun number(value: Double): String = NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = 2 }.format(value)
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()

    private companion object {
        val activeStatuses = setOf("assigned", "accepted", "in_transit")
    }
}
