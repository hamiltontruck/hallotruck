package com.hallo.logistics.customer

import android.content.Context
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.text.NumberFormat
import java.time.Instant

object CustomerInvoiceWriter {
    fun create(context: Context, order: CustomerOrder, payments: List<CustomerPayment>): File {
        val summary = CustomerPaymentPolicy.summarize(order, payments)
        val directory = File(context.cacheDir, "customer-pdfs").apply { mkdirs() }
        val safeTracking = (order.trackingId ?: order.id).replace(Regex("[^A-Za-z0-9_-]"), "_")
        val file = File(directory, "HALLO-$safeTracking-invoice.pdf")
        val document = PdfDocument()
        try {
            val page = document.startPage(PdfDocument.PageInfo.Builder(595, 842, 1).create())
            val canvas = page.canvas
            val title = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 28f; isFakeBoldText = true }
            val subtitle = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 12f }
            val label = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 11f; isFakeBoldText = true }
            val value = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 12f }
            val rule = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeWidth = 1f }

            var y = 54f
            canvas.drawText("HALLOTRUCK", 42f, y, title)
            y += 24f
            canvas.drawText(context.getString(R.string.invoice_receipt_pdf), 42f, y, subtitle)
            y += 34f

            fun row(labelText: String, valueText: String) {
                canvas.drawText(labelText, 42f, y, label)
                drawWrapped(canvas, valueText, 245f, y, 305f, value)
                y += 34f
                canvas.drawLine(42f, y - 13f, 553f, y - 13f, rule)
            }

            row(context.getString(R.string.order_label), order.trackingId ?: order.id)
            row(context.getString(R.string.route_section), "${order.pickupAddress.orEmpty()} → ${order.dropoffAddress.orEmpty()}")
            row(context.getString(R.string.vehicle), order.vehicleType ?: "—")
            row(context.getString(R.string.load), CustomerPaymentPolicy.formatLoad(order))
            row(context.getString(R.string.trip_status), order.status?.replace('_', ' ') ?: context.getString(R.string.pending))
            row(context.getString(R.string.invoice_total), money(summary.invoiceTotal))
            row(context.getString(R.string.verified_paid), money(summary.verifiedPaid))
            row(context.getString(R.string.pending_amount), money(summary.pendingVerification))
            row(context.getString(R.string.balance_to_pay), money(summary.balanceToPay))
            y += 8f
            canvas.drawText("HALLO shared Customer backend · ${Instant.now()}", 42f, y, subtitle)
            document.finishPage(page)
            FileOutputStream(file).use(document::writeTo)
        } finally {
            document.close()
        }
        return file
    }

    fun uri(context: Context, file: File) = FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file,
    )

    private fun money(value: Double): String = "ETB ${NumberFormat.getIntegerInstance().format(value)}"

    private fun drawWrapped(
        canvas: android.graphics.Canvas,
        text: String,
        x: Float,
        y: Float,
        maxWidth: Float,
        paint: Paint,
    ) {
        val words = text.ifBlank { "—" }.split(Regex("\\s+"))
        var line = ""
        var lineY = y
        for (word in words) {
            val candidate = if (line.isBlank()) word else "$line $word"
            if (paint.measureText(candidate) > maxWidth && line.isNotBlank()) {
                canvas.drawText(line, x, lineY, paint)
                lineY += 14f
                line = word
            } else {
                line = candidate
            }
        }
        if (line.isNotBlank()) canvas.drawText(line, x, lineY, paint)
    }
}
