package com.hallo.logistics.customer

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.util.AttributeSet
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive

/**
 * Customer map surface only.
 *
 * V5 keeps map loading isolated and lazy: hidden screens do not start a WebView/map engine, which
 * keeps auth/locale changes fast and avoids three maps competing for memory/network at once.
 */
@SuppressLint("SetJavaScriptEnabled")
class CustomerLiveMapView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : WebView(context, attrs) {
    private var started = false
    private var ready = false
    private var pendingScript: String? = null
    private var lastScript: String? = null

    init {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = false
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setSupportZoom(true)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        setLayerType(View.LAYER_TYPE_HARDWARE, null)
        setBackgroundColor(Color.TRANSPARENT)
        overScrollMode = OVER_SCROLL_NEVER
        isVerticalScrollBarEnabled = false
        isHorizontalScrollBarEnabled = false
        webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                ready = true
                flushPendingScript()
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val target = request?.url?.toString().orEmpty()
                if (target == RETRY_URL) {
                    retryMap()
                    return true
                }
                // The embedded map must never navigate the Customer app WebView to docs or other pages.
                return request?.isForMainFrame == true
            }
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        applyResponsiveHeight()
        if (isShown && lastScript != null) ensureLoaded()
    }

    override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, visibility)
        if (visibility == View.VISIBLE && isShown && lastScript != null) {
            ensureLoaded()
            flushPendingScript()
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
        lastScript = script
        pendingScript = script
        if (!isShown) return
        ensureLoaded()
        flushPendingScript()
    }

    private fun ensureLoaded() {
        if (started) return
        started = true
        ready = false
        loadDataWithBaseURL("https://api.maptiler.com", mapHtml(), "text/html", "UTF-8", null)
    }

    private fun flushPendingScript() {
        if (!ready || !isShown) return
        val script = pendingScript ?: return
        evaluateJavascript(script, null)
        pendingScript = null
    }

    private fun retryMap() {
        stopLoading()
        ready = false
        started = false
        pendingScript = lastScript
        ensureLoaded()
    }

    private fun applyResponsiveHeight() {
        val widthDp = resources.configuration.screenWidthDp.coerceAtLeast(320)
        val targetDp = when (id) {
            R.id.homeMap -> (widthDp * 0.62f).toInt().coerceIn(200, 260)
            R.id.bookingMap -> (widthDp * 0.76f).toInt().coerceIn(230, 310)
            R.id.trackingMap -> (widthDp * 0.86f).toInt().coerceIn(260, 350)
            else -> (widthDp * 0.72f).toInt().coerceIn(220, 320)
        }
        layoutParams = layoutParams.apply { height = (targetDp * resources.displayMetrics.density).toInt() }
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
        const val RETRY_URL = "hallo-map://retry"

        val MAP_HTML = """
            <!doctype html><html><head>
            <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css">
            <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
            <style>
            html,body,#map{margin:0;width:100%;height:100%;overflow:hidden;background:#eaf0e6;touch-action:none;font-family:system-ui,sans-serif}
            #status{position:absolute;z-index:20;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;background:#f4f8feee;color:#0a2345;text-align:center;padding:20px;font-size:14px}
            #status.hidden{display:none} #retry{display:none;background:#1478f2;color:white;text-decoration:none;padding:10px 18px;border-radius:14px;font-weight:700}
            .spinner{width:28px;height:28px;border:3px solid #d9e5f7;border-top-color:#1478f2;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
            .maplibregl-canvas{outline:none}.maplibregl-ctrl-top-right{top:10px;right:10px}.maplibregl-ctrl-group{border-radius:14px;overflow:hidden;box-shadow:0 5px 18px #10213d2e}.maplibregl-ctrl-group button{width:42px;height:42px}
            .pin{width:18px;height:18px;border:3px solid white;border-radius:50%;box-shadow:0 3px 10px #10213d55}.pickup{background:#18a971}.dropoff{background:#eba915}
            .truck{width:40px;height:40px;border:3px solid white;border-radius:12px;background:#0a2345;color:white;display:grid;place-items:center;font:bold 20px sans-serif;box-shadow:0 5px 14px #10213d66}.truck span{display:block;transform-origin:center}
            </style></head><body>
            <div id="map"></div><div id="status"><div class="spinner" id="spinner"></div><div id="statusText">Loading live map…</div><a id="retry" href="hallo-map://retry">Retry map</a></div>
            <script>
            let map=null, mapLoaded=false, markers=[], pendingAction=null, fallbackTried=false;
            const status=document.getElementById('status'), statusText=document.getElementById('statusText'), retry=document.getElementById('retry'), spinner=document.getElementById('spinner');
            function setStatus(message,canRetry){status.classList.remove('hidden');statusText.textContent=message;retry.style.display=canRetry?'inline-block':'none';spinner.style.display=canRetry?'none':'block'}
            function hideStatus(){status.classList.add('hidden')}
            function clearMarkers(){markers.forEach(m=>m.remove());markers=[]}
            function marker(p,c,t){if(!p||!map)return null;const e=document.createElement('div');e.className=c;e.textContent=t||'';const m=new maplibregl.Marker({element:e,anchor:'center'}).setLngLat(p).addTo(map);markers.push(m);return e}
            function truckMarker(p,h){if(!p)return;const e=marker(p,'truck','');if(!e)return;const s=document.createElement('span');s.textContent='➤';s.style.transform='rotate('+((Number(h)||0)-90)+'deg)';e.appendChild(s)}
            function fit(points){if(!map)return;const valid=(points||[]).filter(Boolean);if(!valid.length)return;if(valid.length===1){map.easeTo({center:valid[0],zoom:12,duration:300});return}const b=valid.slice(1).reduce((x,p)=>x.extend(p),new maplibregl.LngLatBounds(valid[0],valid[0]));map.fitBounds(b,{padding:{top:48,bottom:42,left:36,right:36},maxZoom:13,duration:350})}
            function routeSource(points){if(!map)return;if(map.getLayer('route'))map.removeLayer('route');if(map.getLayer('route-outline'))map.removeLayer('route-outline');if(map.getSource('route'))map.removeSource('route');if(points.length>1){map.addSource('route',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:points}}});map.addLayer({id:'route-outline',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#0a2345','line-width':9,'line-opacity':.30}});map.addLayer({id:'route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#1f62da','line-width':6,'line-opacity':.98}})}}
            function whenReady(action){pendingAction=action;if(mapLoaded&&map){const run=pendingAction;pendingAction=null;run()}}
            function showBooking(p,d,points){whenReady(()=>{clearMarkers();routeSource(points||[]);const start=points&&points.length?points[0]:p;const end=points&&points.length?points[points.length-1]:d;marker(start,'pin pickup');marker(end,'pin dropoff');fit(points&&points.length?points:[p,d])})}
            function showTrip(p,d,t,h,points){whenReady(()=>{clearMarkers();const route=points&&points.length>1?points:[p,d].filter(Boolean);routeSource(route);marker(p,'pin pickup');marker(d,'pin dropoff');truckMarker(t,h);fit(route.concat(t?[t]:[]))})}
            function bootMap(){if(map||typeof maplibregl==='undefined')return;try{map=new maplibregl.Map({container:'map',style:'__HALLO_MAP_STYLE__',center:[39.6,8.8],zoom:5.2,attributionControl:false,dragRotate:false,pitchWithRotate:false});map.addControl(new maplibregl.NavigationControl({showCompass:false,visualizePitch:false}),'top-right');map.dragPan.enable();map.scrollZoom.enable();map.touchZoomRotate.enable();map.touchZoomRotate.disableRotation();map.doubleClickZoom.enable();map.once('load',()=>{mapLoaded=true;hideStatus();if(pendingAction){const run=pendingAction;pendingAction=null;run()}});map.on('error',()=>{if(!mapLoaded)setStatus('Map data could not load.',true)});setTimeout(()=>{if(!mapLoaded)setStatus('Map is taking longer than expected.',true)},12000)}catch(e){setStatus('Map could not start.',true)}}
            function fallbackLibrary(){if(fallbackTried)return;fallbackTried=true;const script=document.createElement('script');script.src='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';script.onload=bootMap;script.onerror=()=>setStatus('Map library is unavailable.',true);document.head.appendChild(script)}
            </script>
            <script src="https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js" onload="bootMap()" onerror="fallbackLibrary()"></script>
            </body></html>
        """.trimIndent()
    }
}
