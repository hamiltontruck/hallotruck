package com.hallo.logistics.driver

import android.content.Context
import android.util.AttributeSet
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * Native Driver live-map surface backed by OpenStreetMap tiles.
 * Only authoritative coordinates returned by the existing live-trip RPC are plotted.
 * No route geometry or GPS coordinate is synthesized when it is absent.
 */
class LiveTripMapView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : WebView(context, attrs) {

    init {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = false
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        webViewClient = WebViewClient()
        isVerticalScrollBarEnabled = false
        isHorizontalScrollBarEnabled = false
        setBackgroundColor(0xFFF5F7FA.toInt())
    }

    fun show(value: LiveTripSnapshot?) {
        val truck = coordinate(value?.truckLat, value?.truckLng)
        val pickup = coordinate(value?.pickupLat, value?.pickupLng)
        val dropoff = coordinate(value?.dropoffLat, value?.dropoffLng)
        val points = listOfNotNull(pickup, dropoff, truck)

        contentDescription = when {
            truck == null -> context.getString(R.string.live_trip_map_waiting_accessibility)
            value?.speedKmh != null -> context.getString(R.string.live_trip_map_accessibility, value.speedKmh.toInt())
            else -> context.getString(R.string.live_gps)
        }

        if (points.isEmpty()) {
            loadDataWithBaseURL(
                null,
                waitingHtml(context.getString(R.string.waiting_for_gps)),
                "text/html",
                "utf-8",
                null,
            )
            return
        }

        val markers = buildString {
            pickup?.let { append("L.circleMarker([${it.first},${it.second}],{radius:9,color:'#14213d',fillColor:'#14213d',fillOpacity:1}).addTo(map);") }
            dropoff?.let { append("L.circleMarker([${it.first},${it.second}],{radius:9,color:'#b87900',fillColor:'#ffb800',fillOpacity:1}).addTo(map);") }
            truck?.let { append("L.circleMarker([${it.first},${it.second}],{radius:11,color:'#0f5132',fillColor:'#16794a',fillOpacity:1}).addTo(map);") }
        }
        val bounds = points.joinToString(",") { "[${it.first},${it.second}]" }
        val viewport = if (points.size == 1) {
            "map.setView([${points.first().first},${points.first().second}],14);"
        } else {
            "map.fitBounds([$bounds],{padding:[24,24],maxZoom:15});"
        }

        val html = """
            <!doctype html>
            <html>
            <head>
              <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
              <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
              <style>
                html,body,#map{height:100%;width:100%;margin:0;padding:0;background:#f5f7fa}
                .leaflet-control-attribution{font-size:9px}
              </style>
            </head>
            <body>
              <div id="map"></div>
              <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
              <script>
                const map=L.map('map',{zoomControl:true,attributionControl:true});
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
                  maxZoom:19,
                  attribution:'&copy; OpenStreetMap contributors'
                }).addTo(map);
                $markers
                $viewport
              </script>
            </body>
            </html>
        """.trimIndent()
        loadDataWithBaseURL("https://www.openstreetmap.org/", html, "text/html", "utf-8", null)
    }

    private fun coordinate(lat: Double?, lng: Double?): Pair<Double, Double>? {
        if (lat == null || lng == null) return null
        if (lat !in -90.0..90.0 || lng !in -180.0..180.0) return null
        return lat to lng
    }

    private fun waitingHtml(message: String): String {
        val safe = JSONObject.quote(message)
        return """
            <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" />
            <style>html,body{height:100%;margin:0;background:#f5f7fa;font-family:sans-serif;color:#14213d}body{display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;box-sizing:border-box}</style>
            </head><body><div id="state"></div><script>document.getElementById('state').textContent=$safe;</script></body></html>
        """.trimIndent()
    }
}
