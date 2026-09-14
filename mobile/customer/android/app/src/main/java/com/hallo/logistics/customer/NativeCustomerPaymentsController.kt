package com.hallo.logistics.customer

import android.content.Intent
import android.graphics.Typeface
import android.view.View
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

class NativeCustomerPaymentsController(
    private val activity: AppCompatActivity,
    private val root: View,
    private val viewModel: CustomerViewModel,
    private val requestReceipt: () -> Unit,
    private val submissionRepository: CustomerPaymentSubmissionRepository = CustomerPaymentSubmissionRepository(),
) {
    data class Draft(
        val order: CustomerOrder,
        val provider: String,
        val providerRef: String,
        val amountEtb: Double,
    )

    private val list = root.findViewById<LinearLayout>(R.id.nativePaymentsList)
    private val empty = root.findViewById<TextView>(R.id.nativePaymentsEmpty)
    private var pendingDraft: Draft? = null

    init {
        root.findViewById<MaterialButton>(R.id.nativePaymentsSubmit).setOnClickListener { showPaymentDialog() }
    }

    fun render(state: CustomerUiState) {
        val activeOrders = state.orders.filterNot { it.status == "cancelled" }
        var invoiceTotal = 0.0
        var pendingTotal = 0.0
        var balanceTotal = 0.0
        activeOrders.forEach { order ->
            val summary = CustomerPaymentPolicy.summarize(order, paymentsFor(order, state))
            invoiceTotal += summary.invoiceTotal
            pendingTotal += summary.pendingVerification
            balanceTotal += summary.balanceToPay
        }
        root.findViewById<TextView>(R.id.nativePaymentsInvoice).text = money(invoiceTotal)
        root.findViewById<TextView>(R.id.nativePaymentsPending).text = money(pendingTotal)
        root.findViewById<TextView>(R.id.nativePaymentsBalance).text = money(balanceTotal)

        empty.visibility = if (state.orders.isEmpty()) View.VISIBLE else View.GONE
        list.removeAllViews()
        state.orders.filterNot { it.status == "cancelled" }.forEach { order ->
            list.addView(orderPaymentCard(order, state))
        }
    }

    fun consumeReceipt(bytes: ByteArray, mimeType: String, extension: String) {
        val draft = pendingDraft ?: return
        pendingDraft = null
        activity.lifecycleScope.launch {
            runCatching {
                submissionRepository.submit(
                    orderId = draft.order.id,
                    provider = draft.provider,
                    providerRef = draft.providerRef,
                    amountEtb = draft.amountEtb,
                    receipt = CustomerPaymentSubmissionRepository.Receipt(bytes, mimeType, extension),
                )
            }.onSuccess {
                AlertDialog.Builder(activity)
                    .setTitle(R.string.native_payment_submitted_title)
                    .setMessage(R.string.native_payment_submitted_message)
                    .setPositiveButton(android.R.string.ok, null)
                    .show()
                viewModel.refresh()
            }.onFailure {
                showError(CustomerAuthPolicy.safeMessage(it))
            }
        }
    }

    fun clearPendingReceipt() {
        pendingDraft = null
    }

    private fun showPaymentDialog() {
        val state = viewModel.state.value
        val payable = state.orders.filter { order ->
            order.status != "cancelled" && CustomerPaymentPolicy.summarize(order, paymentsFor(order, state)).remainingToSubmit > 0
        }
        if (payable.isEmpty()) {
            showError(activity.getString(R.string.native_no_outstanding_payment))
            return
        }

        val container = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(6), dp(18), 0)
        }
        val orderSpinner = Spinner(activity)
        val orderLabels = payable.map { "${it.trackingId ?: it.id} · ${money(CustomerPaymentPolicy.summarize(it, paymentsFor(it, state)).remainingToSubmit)}" }
        orderSpinner.adapter = ArrayAdapter(activity, android.R.layout.simple_spinner_dropdown_item, orderLabels)
        val provider = Spinner(activity).apply {
            adapter = ArrayAdapter(
                activity,
                android.R.layout.simple_spinner_dropdown_item,
                listOf(activity.getString(R.string.native_bank), "Telebirr"),
            )
        }
        val reference = EditText(activity).apply {
            hint = activity.getString(R.string.native_transaction_reference)
            maxLines = 1
        }
        val amount = EditText(activity).apply {
            hint = activity.getString(R.string.native_amount_etb)
            inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL
            maxLines = 1
        }
        listOf(
            activity.getString(R.string.order_label) to orderSpinner,
            activity.getString(R.string.native_provider) to provider,
            activity.getString(R.string.native_reference) to reference,
            activity.getString(R.string.native_amount) to amount,
        ).forEach { (label, field) ->
            container.addView(TextView(activity).apply {
                text = label
                setTextColor(activity.getColor(R.color.hallo_muted))
                textSize = 11f
                setPadding(0, dp(10), 0, dp(3))
            })
            container.addView(field, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        }

        val dialog = AlertDialog.Builder(activity)
            .setTitle(R.string.native_submit_payment_receipt)
            .setMessage(R.string.native_payment_receipt_help)
            .setView(container)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.native_choose_receipt, null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val order = payable.getOrNull(orderSpinner.selectedItemPosition) ?: return@setOnClickListener
                val value = amount.text.toString().trim().toDoubleOrNull() ?: 0.0
                val summary = CustomerPaymentPolicy.summarize(order, paymentsFor(order, state))
                when {
                    reference.text.toString().trim().isBlank() -> reference.error = activity.getString(R.string.native_enter_payment_reference)
                    value <= 0 -> amount.error = activity.getString(R.string.native_enter_positive_amount)
                    value > summary.remainingToSubmit + 0.01 -> amount.error = activity.getString(R.string.native_amount_exceeds_remaining)
                    else -> {
                        pendingDraft = Draft(
                            order = order,
                            provider = if (provider.selectedItemPosition == 1) "telebirr" else "bank",
                            providerRef = reference.text.toString().trim(),
                            amountEtb = value,
                        )
                        dialog.dismiss()
                        requestReceipt()
                    }
                }
            }
        }
        dialog.show()
    }

    private fun orderPaymentCard(order: CustomerOrder, state: CustomerUiState): View {
        val card = MaterialCardView(activity).apply {
            radius = dp(18).toFloat()
            cardElevation = 0f
            strokeWidth = dp(1)
            strokeColor = activity.getColor(R.color.hallo_line)
            setCardBackgroundColor(activity.getColor(android.R.color.white))
        }
        val content = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(15), dp(14), dp(15), dp(14))
        }
        val payments = paymentsFor(order, state)
        val summary = CustomerPaymentPolicy.summarize(order, payments)
        content.addView(TextView(activity).apply {
            text = order.trackingId ?: order.id
            textSize = 17f
            setTextColor(activity.getColor(R.color.hallo_navy))
            setTypeface(typeface, Typeface.BOLD)
        })
        content.addView(TextView(activity).apply {
            text = buildString {
                append(activity.getString(R.string.invoice_total)).append(" ").append(money(summary.invoiceTotal))
                append(" · ").append(activity.getString(R.string.verified_paid)).append(" ").append(money(summary.verifiedPaid))
                append("\n").append(activity.getString(R.string.pending_amount)).append(" ").append(money(summary.pendingVerification))
                append(" · ").append(activity.getString(R.string.balance_to_pay)).append(" ").append(money(summary.balanceToPay))
            }
            textSize = 12f
            setTextColor(activity.getColor(R.color.hallo_muted))
            setPadding(0, dp(7), 0, 0)
        })
        payments.forEach { payment ->
            content.addView(TextView(activity).apply {
                text = "${paymentEventLabel(payment.event)} · ${money(payment.amountEtb ?: 0.0)}\n${payment.provider ?: "—"} · ${payment.providerRef ?: "—"}"
                textSize = 11f
                setTextColor(activity.getColor(R.color.hallo_text))
                setPadding(0, dp(9), 0, 0)
            })
            if (!payment.receiptPath.isNullOrBlank()) {
                content.addView(MaterialButton(activity, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
                    text = activity.getString(R.string.view_receipt)
                    isAllCaps = false
                    setOnClickListener { viewModel.openReceipt(payment) }
                })
            }
        }
        content.addView(MaterialButton(activity, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = activity.getString(R.string.invoice_receipt_pdf)
            isAllCaps = false
            setOnClickListener { shareInvoice(order, payments) }
        })
        card.addView(content)
        card.layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(12)
        }
        return card
    }

    private fun paymentEventLabel(event: String?): String = when (event?.trim()?.lowercase()) {
        "initiated" -> activity.getString(R.string.status_initiated)
        "held_escrow" -> activity.getString(R.string.status_held_escrow)
        "released" -> activity.getString(R.string.status_released)
        "refunded" -> activity.getString(R.string.status_refunded)
        "rejected" -> activity.getString(R.string.status_rejected)
        "verified" -> activity.getString(R.string.status_verified)
        "unpaid" -> activity.getString(R.string.status_unpaid)
        "paid" -> activity.getString(R.string.status_paid)
        null, "" -> activity.getString(R.string.payment)
        else -> event.replace('_', ' ').replaceFirstChar { it.uppercase() }
    }

    private fun shareInvoice(order: CustomerOrder, payments: List<CustomerPayment>) {
        runCatching {
            val file = CustomerInvoiceWriter.create(activity, order, payments)
            val uri = CustomerInvoiceWriter.uri(activity, file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(Intent.createChooser(intent, activity.getString(R.string.invoice_receipt_pdf)))
        }.onFailure { showError(activity.getString(R.string.pdf_open_error)) }
    }

    private fun paymentsFor(order: CustomerOrder, state: CustomerUiState) = state.payments.filter { it.orderId == order.id }
    private fun money(value: Double) = "ETB ${NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = 2 }.format(value)}"
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()

    private fun showError(message: String) {
        AlertDialog.Builder(activity).setTitle(activity.getString(R.string.payments_title)).setMessage(message).setPositiveButton(android.R.string.ok, null).show()
    }
}
