package com.hallo.logistics.driver

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.util.AttributeSet
import android.view.View
import kotlin.math.max

class LiveTripMapView @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) : View(context, attrs) {
    private val route = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(255, 184, 0); strokeWidth = 10f; style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val road = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(218, 224, 235); strokeWidth = 24f; style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val point = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(20, 33, 61) }
    private val truck = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(22, 121, 74) }
    private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(24, 32, 51); textSize = 30f; isFakeBoldText = true }
    private var snapshot: LiveTripSnapshot? = null

    fun show(value: LiveTripSnapshot?) { snapshot = value; contentDescription = value?.let { "Live trip map. Speed ${it.speedKmh?.toInt() ?: 0} kilometers per hour" } ?: "Live trip map waiting for GPS"; invalidate() }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat(); val h = height.toFloat(); val pad = max(42f, w * .1f)
        val path = Path().apply { moveTo(pad, h * .72f); cubicTo(w * .35f, h * .35f, w * .62f, h * .78f, w - pad, h * .28f) }
        canvas.drawPath(path, road); canvas.drawPath(path, route)
        canvas.drawCircle(pad, h * .72f, 18f, point); canvas.drawCircle(w - pad, h * .28f, 18f, point)
        val hasGps = snapshot?.truckLat != null && snapshot?.truckLng != null
        canvas.drawCircle(w * .52f, h * .52f, 23f, if (hasGps) truck else point)
        canvas.drawText(if (hasGps) "LIVE GPS" else "WAITING FOR GPS", pad, 42f, label)
    }
}
