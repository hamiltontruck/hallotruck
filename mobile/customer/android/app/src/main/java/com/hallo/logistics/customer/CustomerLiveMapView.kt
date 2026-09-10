package com.hallo.logistics.customer

import android.annotation.SuppressLint
import android.content.Context
import android.util.AttributeSet
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive

@SuppressLint("SetJavaScriptEnabled")
class CustomerLiveMapView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : WebView(context, attrs) {
    private var ready = false
    private var pendingScript: String? = null

    init {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = false
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setSupportZoom(false)
        setBackgroundColor(android.graphics.Color.TRANSPARENT)
        overScrollMode = OVER_SCROLL_NEVER
        webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                ready = true
                pendingScript?.let { evaluateJavascript(it, null) }
                pendingScript = null
            }
        }
        loadDataWithBaseURL("https://tiles.openfreemap.org", MAP_HTML, "text/html", "UTF-8", null)
    }

    fun showBooking(pickup: CustomerPlace?, dropoff: CustomerPlace?, route: CustomerRoute?) {
        val points = route?.coordinates.orEmpty().map { JsonArray(listOf(JsonPrimitive(it.first), JsonPrimitive(it.second))) }
        fun coordinate(place: CustomerPlace?) = place?.let { "[${it.longitude},${it.latitude}]" } ?: "null"
        update("showBooking(${coordinate(pickup)},${coordinate(dropoff)},${JsonArray(points)})")
        contentDescription = route?.let { "Truck route from ${it.pickup.label} to ${it.dropoff.label}, ${it.distanceKm} kilometers" }
            ?: when {
                pickup != null && dropoff != null -> "Map showing selected pickup and drop-off"
                pickup != null -> "Map showing selected pickup"
                dropoff != null -> "Map showing selected drop-off"
                else -> "Route map waiting for pickup and drop-off"
            }
    }

    fun showTrip(trip: CustomerLiveTrip?) {
        fun coordinate(longitude: Double?, latitude: Double?) =
            if (longitude == null || latitude == null) "null" else "[$longitude,$latitude]"
        update("showTrip(${coordinate(trip?.pickupLongitude, trip?.pickupLatitude)},${coordinate(trip?.dropoffLongitude, trip?.dropoffLatitude)},${coordinate(trip?.truckLongitude, trip?.truckLatitude)},${trip?.heading ?: 0.0})")
        contentDescription = if (trip?.truckLatitude != null) "Live trip map showing the last reported truck position" else "Live trip map waiting for GPS"
    }

    private fun update(script: String) {
        if (ready) evaluateJavascript(script, null) else pendingScript = script
    }

    private companion object {
        val MAP_HTML = """
            <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
            <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
            <style>html,body,#map{margin:0;width:100%;height:100%;overflow:hidden;background:#dfe9f5}.maplibregl-ctrl-group{border-radius:12px;overflow:hidden;box-shadow:0 4px 14px #10213d33}.pin{width:18px;height:18px;border:3px solid white;border-radius:50%;box-shadow:0 3px 10px #10213d55}.pickup{background:#10213d}.dropoff{background:#f5b400}.truck{width:36px;height:36px;border:3px solid white;border-radius:12px;background:#10213d;color:#f5b400;display:grid;place-items:center;font:bold 19px sans-serif;box-shadow:0 5px 14px #10213d66}</style>
            </head><body><div id="map"></div><script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script><script>
            const map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',center:[39.6,8.8],zoom:5.2,attributionControl:false});map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');let markers=[];
            function clearMarkers(){markers.forEach(m=>m.remove());markers=[]}function marker(p,c,t){if(!p)return;const e=document.createElement('div');e.className=c;e.textContent=t||'';markers.push(new maplibregl.Marker({element:e}).setLngLat(p).addTo(map))}
            function fit(points){if(!points.length)return;const b=points.slice(1).reduce((x,p)=>x.extend(p),new maplibregl.LngLatBounds(points[0],points[0]));map.fitBounds(b,{padding:52,maxZoom:13,duration:500})}
            function routeSource(points){if(map.getLayer('route'))map.removeLayer('route');if(map.getLayer('route-outline'))map.removeLayer('route-outline');if(map.getSource('route'))map.removeSource('route');if(points.length>1){map.addSource('route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:points}}});map.addLayer({id:'route-outline',type:'line',source:'route',paint:{'line-color':'#10213d','line-width':10,'line-opacity':.82}});map.addLayer({id:'route',type:'line',source:'route',paint:{'line-color':'#f5b400','line-width':6,'line-opacity':1}})}}
            function showBooking(p,d,points){const run=()=>{clearMarkers();routeSource(points);const start=points.length?points[0]:p;const end=points.length?points[points.length-1]:d;marker(start,'pin pickup');marker(end,'pin dropoff');fit(points.length?points:[p,d].filter(Boolean))};map.loaded()?run():map.once('load',run)}
            function showTrip(p,d,t,h){const run=()=>{clearMarkers();routeSource([p,d].filter(Boolean));marker(p,'pin pickup');marker(d,'pin dropoff');marker(t,'truck','➤');const all=[p,d,t].filter(Boolean);fit(all)};map.loaded()?run():map.once('load',run)}
            </script></body></html>
        """.trimIndent()
    }
}

