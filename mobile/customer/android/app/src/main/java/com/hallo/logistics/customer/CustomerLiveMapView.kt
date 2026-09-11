package com.hallo.logistics.customer

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.util.AttributeSet
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.roundToInt

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
        settings.setSupportZoom(true)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        setBackgroundColor(android.graphics.Color.TRANSPARENT)
        overScrollMode = OVER_SCROLL_NEVER
        isVerticalScrollBarEnabled = false
        isHorizontalScrollBarEnabled = false
        webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                ready = true
                pendingScript?.let { evaluateJavascript(it, null) }
                pendingScript = null
            }
        }
        loadDataWithBaseURL("https://api.maptiler.com", mapHtml(), "text/html", "UTF-8", null)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (id != R.id.trackingMap) return
        post {
            val metrics = resources.displayMetrics
            val target = (metrics.heightPixels * 0.56f).roundToInt()
            val minimum = (320 * metrics.density).roundToInt()
            val maximum = (480 * metrics.density).roundToInt()
            val params = layoutParams ?: return@post
            val bounded = target.coerceIn(minimum, maximum)
            if (params.height != bounded) {
                params.height = bounded
                layoutParams = params
            }
        }
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

    fun showTrip(trip: CustomerLiveTrip?, routeCoordinates: List<Pair<Double, Double>> = emptyList()) {
        fun coordinate(longitude: Double?, latitude: Double?) =
            if (longitude == null || latitude == null) "null" else "[$longitude,$latitude]"
        val points = routeCoordinates.map { JsonArray(listOf(JsonPrimitive(it.first), JsonPrimitive(it.second))) }
        update(
            "showTrip(" +
                "${coordinate(trip?.pickupLongitude, trip?.pickupLatitude)}," +
                "${coordinate(trip?.dropoffLongitude, trip?.dropoffLatitude)}," +
                "${coordinate(trip?.truckLongitude, trip?.truckLatitude)}," +
                "${trip?.heading ?: 0.0},${JsonArray(points)})",
        )
        contentDescription = if (trip?.truckLatitude != null) {
            "Trip map showing pickup, drop-off, HALLO road route and last reported truck position"
        } else {
            "Trip map waiting for driver GPS"
        }
    }

    private fun update(script: String) {
        if (ready) evaluateJavascript(script, null) else pendingScript = script
    }

    private fun mapHtml(): String {
        val mapKey = Uri.encode(BuildConfig.MAPTILER_KEY)
        val style = if (BuildConfig.MAPTILER_KEY.isBlank()) {
            "https://demotiles.maplibre.org/style.json"
        } else {
            "https://api.maptiler.com/maps/streets-v2/style.json?key=$mapKey"
        }
        return MAP_HTML.replace("__HALLO_MAP_STYLE__", style)
    }

    private companion object {
        val MAP_HTML = """
            <!doctype html><html><head>
            <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
            <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
            <style>
            html,body,#map{margin:0;width:100%;height:100%;overflow:hidden;background:#eaf0f7;touch-action:none}
            .maplibregl-canvas{outline:none}
            .maplibregl-ctrl-top-right{top:10px;right:10px}
            .maplibregl-ctrl-group{border-radius:14px;overflow:hidden;box-shadow:0 5px 18px #10213d2e}
            .maplibregl-ctrl-group button{width:42px;height:42px}
            .pin{width:18px;height:18px;border:3px solid white;border-radius:50%;box-shadow:0 3px 10px #10213d55}
            .pickup{background:#10213d}.dropoff{background:#f2b705}
            .truck{width:40px;height:40px;border:3px solid white;border-radius:12px;background:#10213d;color:#f2b705;display:grid;place-items:center;font:bold 20px sans-serif;box-shadow:0 5px 14px #10213d66}
            .truck span{display:block;transform-origin:center}
            </style></head><body><div id="map"></div>
            <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script><script>
            const map=new maplibregl.Map({container:'map',style:'__HALLO_MAP_STYLE__',center:[39.6,8.8],zoom:5.2,attributionControl:false,dragRotate:false,pitchWithRotate:false});
            map.addControl(new maplibregl.NavigationControl({showCompass:false,visualizePitch:false}),'top-right');
            map.dragPan.enable();map.scrollZoom.enable();map.touchZoomRotate.enable();map.touchZoomRotate.disableRotation();map.doubleClickZoom.enable();
            let markers=[];
            function clearMarkers(){markers.forEach(m=>m.remove());markers=[]}
            function marker(p,c,t){if(!p)return null;const e=document.createElement('div');e.className=c;e.textContent=t||'';const m=new maplibregl.Marker({element:e,anchor:'center'}).setLngLat(p).addTo(map);markers.push(m);return e}
            function truckMarker(p,h){if(!p)return;const e=marker(p,'truck','');if(!e)return;const s=document.createElement('span');s.textContent='➤';s.style.transform='rotate('+((Number(h)||0)-90)+'deg)';e.appendChild(s)}
            function fit(points){const valid=(points||[]).filter(Boolean);if(!valid.length)return;if(valid.length===1){map.easeTo({center:valid[0],zoom:12,duration:300});return}const b=valid.slice(1).reduce((x,p)=>x.extend(p),new maplibregl.LngLatBounds(valid[0],valid[0]));map.fitBounds(b,{padding:{top:58,bottom:48,left:42,right:42},maxZoom:13,duration:350})}
            function routeSource(points){if(map.getLayer('route'))map.removeLayer('route');if(map.getLayer('route-outline'))map.removeLayer('route-outline');if(map.getSource('route'))map.removeSource('route');if(points.length>1){map.addSource('route',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:points}}});map.addLayer({id:'route-outline',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#10213d','line-width':9,'line-opacity':.72}});map.addLayer({id:'route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#1463ff','line-width':5,'line-opacity':.96}})}}
            function showBooking(p,d,points){const run=()=>{clearMarkers();routeSource(points||[]);const start=points&&points.length?points[0]:p;const end=points&&points.length?points[points.length-1]:d;marker(start,'pin pickup');marker(end,'pin dropoff');fit(points&&points.length?points:[p,d])};map.loaded()?run():map.once('load',run)}
            function showTrip(p,d,t,h,points){const run=()=>{clearMarkers();const route=points&&points.length>1?points:[p,d].filter(Boolean);routeSource(route);marker(p,'pin pickup');marker(d,'pin dropoff');truckMarker(t,h);fit(route.concat(t?[t]:[]))};map.loaded()?run():map.once('load',run)}
            </script></body></html>
        """.trimIndent()
    }
}
