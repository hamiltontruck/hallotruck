package com.hallo.logistics.customer

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.text.InputFilter
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RatingBar
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class CustomerCompletionController(
    private val activity: AppCompatActivity,
    private val viewModel: CustomerViewModel,
    private val setStatus: (String) -> Unit,
    private val service: CustomerCompletionService = CustomerCompletionService(),
) {
    private var snapshot = CustomerCompletionSnapshot()
    private var loadedKey = ""
    private var loadingKey = ""
    private var loadJob: Job? = null

    fun render(state: CustomerUiState, ordersList: LinearLayout) {
        if (!state.authorized) {
            snapshot = CustomerCompletionSnapshot()
            loadedKey = ""
            loadingKey = ""
            loadJob?.cancel()
            return
        }

        val delivered = state.orders.filter { it.status == "delivered" }
        val key = delivered.map { it.id }.sorted().joinToString("|")
        ordersList.post { inject(viewModel.state.value, ordersList) }
        if (delivered.isEmpty() || loadedKey == key || loadingKey == key) return

        loadingKey = key
        loadJob?.cancel()
        loadJob = activity.lifecycleScope.launch {
            val result = runCatching { service.load(delivered.map { it.id }) }
            loadingKey = ""
            result.onSuccess {
                snapshot = it
                loadedKey = key
                ordersList.post { inject(viewModel.state.value, ordersList) }
            }.onFailure {
                setStatus(activity.getString(R.string.completion_evidence_error))
            }
        }
    }

    private fun inject(state: CustomerUiState, ordersList: LinearLayout) {
        val deliveredByTracking = state.orders
            .filter { it.status == "delivered" && !it.trackingId.isNullOrBlank() }
            .associateBy { it.trackingId.orEmpty() }

        for (index in 0 until ordersList.childCount) {
            val card = ordersList.getChildAt(index)
            val tracking = card.findViewById<TextView>(R.id.orderTrackingId)?.text?.toString() ?: continue
            val order = deliveredByTracking[tracking] ?: continue
            val actions = card.findViewById<LinearLayout>(R.id.orderActions) ?: continue
            val tag = completionTag(order.id)
            actions.findViewWithTag<View>(tag)?.let(actions::removeView)
            actions.addView(completionSection(order, tag), marginParams())
        }
    }

    private fun completionSection(order: CustomerOrder, tagValue: String): View {
        val proof = snapshot.proofs[order.id]
        val rating = snapshot.ratings[order.id]
        val card = MaterialCardView(activity).apply {
            tag = tagValue
            radius = dp(16).toFloat()
            strokeWidth = dp(1)
            setStrokeColor(activity.getColor(R.color.hallo_line))
            setCardBackgroundColor(activity.getColor(R.color.hallo_navy_soft))
        }
        val content = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        content.addView(text(activity.getString(R.string.delivery_proof), 13f, true))

        if (proof != null) {
            proof.recipientName?.takeIf { it.isNotBlank() }?.let {
                content.addView(text(activity.getString(R.string.delivery_recipient, it), 12f, false))
            }
            proof.deliveredAt?.takeIf { it.isNotBlank() }?.let {
                content.addView(text(activity.getString(R.string.delivered_at, it), 11f, false, activity.getColor(R.color.hallo_muted)))
            }
            proof.deliveryNote?.takeIf { it.isNotBlank() }?.let {
                content.addView(text(activity.getString(R.string.delivery_note, it), 11f, false, activity.getColor(R.color.hallo_muted)))
            }
            val row = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            proof.photoPath?.takeIf { it.isNotBlank() }?.let { path ->
                row.addView(button(activity.getString(R.string.view_delivery_photo)) { openProof(path) }, weightedParams(end = dp(4)))
            }
            proof.signaturePath?.takeIf { it.isNotBlank() }?.let { path ->
                row.addView(button(activity.getString(R.string.view_signature)) { openProof(path) }, weightedParams(start = dp(4)))
            }
            if (row.childCount > 0) content.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(6) })
            content.addView(text(activity.getString(R.string.private_delivery_evidence), 10f, false, activity.getColor(R.color.hallo_muted)))
        }

        if (rating != null) {
            content.addView(text(activity.getString(R.string.your_rating, rating.score), 12f, true).apply { setPadding(0, dp(8), 0, 0) })
            rating.comment?.takeIf { it.isNotBlank() }?.let {
                content.addView(text(it, 11f, false, activity.getColor(R.color.hallo_muted)))
            }
        } else {
            content.addView(button(activity.getString(R.string.rate_driver)) { showRatingDialog(order) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) })
        }

        card.addView(content)
        return card
    }

    private fun showRatingDialog(order: CustomerOrder) {
        val content = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), dp(8))
        }
        val ratingBar = RatingBar(activity).apply {
            numStars = 5
            stepSize = 1f
            setRating(5f)
            isIndicator = false
        }
        val comment = EditText(activity).apply {
            hint = activity.getString(R.string.rating_optional_note)
            minLines = 2
            maxLines = 5
            filters = arrayOf(InputFilter.LengthFilter(500))
        }
        val error = text("", 12f, true, activity.getColor(R.color.hallo_danger)).apply { visibility = View.GONE }
        content.addView(ratingBar)
        content.addView(comment, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) })
        content.addView(error)

        val dialog = AlertDialog.Builder(activity)
            .setTitle(activity.getString(R.string.rate_driver))
            .setView(content)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(activity.getString(R.string.submit_rating), null)
            .create()
        dialog.setOnShowListener {
            val submit = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            submit.setOnClickListener {
                val score = ratingBar.rating.toInt()
                val validated = runCatching { CustomerCompletionPolicy.rating(score, comment.text.toString()) }
                val failure = validated.exceptionOrNull()
                if (failure != null) {
                    error.text = failure.message ?: activity.getString(R.string.rating_error)
                    error.visibility = View.VISIBLE
                    return@setOnClickListener
                }
                submit.isEnabled = false
                setStatus(activity.getString(R.string.rating_submitting))
                activity.lifecycleScope.launch {
                    val result = runCatching { service.submitRating(order.id, score, comment.text.toString()) }
                    result.onSuccess {
                        setStatus(activity.getString(R.string.rating_saved))
                        loadedKey = ""
                        activity.findViewById<LinearLayout>(R.id.ordersList)?.let { list -> render(viewModel.state.value, list) }
                        dialog.dismiss()
                    }.onFailure {
                        submit.isEnabled = true
                        error.text = it.message ?: activity.getString(R.string.rating_error)
                        error.visibility = View.VISIBLE
                        setStatus(activity.getString(R.string.rating_error))
                    }
                }
            }
        }
        dialog.show()
    }

    private fun openProof(path: String) {
        setStatus(activity.getString(R.string.opening_secure_proof))
        activity.lifecycleScope.launch {
            val result = runCatching { service.signedDeliveryProof(path) ?: error(activity.getString(R.string.proof_unavailable)) }
            result.onSuccess { url ->
                val uri = runCatching { Uri.parse(url) }.getOrNull()
                if (uri?.scheme != "https") {
                    setStatus(activity.getString(R.string.proof_unavailable))
                    return@onSuccess
                }
                runCatching { activity.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                    .onFailure { setStatus(activity.getString(R.string.proof_unavailable)) }
            }.onFailure {
                setStatus(activity.getString(R.string.proof_unavailable))
            }
        }
    }

    private fun button(label: String, action: () -> Unit) = MaterialButton(activity).apply {
        text = label
        isAllCaps = false
        minWidth = 0
        minimumWidth = 0
        minHeight = dp(48)
        setOnClickListener { action() }
    }

    private fun text(value: String, size: Float, bold: Boolean, color: Int = Color.BLACK) = TextView(activity).apply {
        text = value
        textSize = size
        setTextColor(color)
        if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    private fun weightedParams(start: Int = 0, end: Int = 0) = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
        marginStart = start
        marginEnd = end
    }

    private fun marginParams() = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dp(8)
    }

    private fun completionTag(orderId: String) = "customer-completion-$orderId"
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
}
