package com.hallo.logistics.customer

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.util.AttributeSet
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.ContextCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.roundToInt

@SuppressLint("SetJavaScriptEnabled")
class CustomerLiveMapView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : WebView(context, attrs) {
    private var ready = false
    private var lastScript: String? = null

    init {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = false
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.setSupportZoom(true)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        setBackgroundColor(ContextCompat.getColor(context, R.color.hallo_surface))
        overScrollMode = OVER_SCROLL_NEVER
        isVerticalScrollBarEnabled = false
        isHorizontalScrollBarEnabled = false
        webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                ready = false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                ready = true
                lastScript?.let { evaluateJavascript(it, null) }
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                if (request == null || !request.isForMainFrame) return false
                return handleMainFrameNavigation(request.url)
            }

            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                val parsed = url?.let(Uri::parse) ?: return true
                return handleMainFrameNavigation(parsed)
            }
        }
        reloadMapDocument()
    }

    private fun handleMainFrameNavigation(uri: Uri): Boolean {
        if (uri.scheme == "hallo-map" && uri.host == "retry") {
            post { reloadMapDocument() }
            return true
        }
        // The map must never navigate its main frame to MapTiler/API documentation or another
        // external page. Tiles, styles and scripts are subresources and remain allowed.
        return true
    }

    private fun reloadMapDocument() {
        ready = false
        loadDataWithBaseURL("https://api.maptiler.com", mapHtml(), "text/html", "UTF-8", null)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        post { CustomerReferenceUi.apply(this) }
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

            (parent as? MaterialCardView)?.apply {
                radius = (24 * metrics.density)
                cardElevation = 0f
                strokeWidth = metrics.density.roundToInt().coerceAtLeast(1)
                strokeColor = ContextCompat.getColor(context, R.color.hallo_line)
            }

            rootView.findViewById<MaterialButton>(R.id.refreshTracking)?.apply {
                minHeight = (54 * metrics.density).roundToInt()
                cornerRadius = (18 * metrics.density).roundToInt()
                backgroundTintList = ColorStateList.valueOf(Color.rgb(245, 248, 253))
                setTextColor(Color.rgb(31, 98, 218))
                strokeWidth = 0
            }
        }
    }

    fun showBooking(pickup: CustomerPlace?, dropoff: CustomerPlace?, route: CustomerRoute?) {
        val points = route?.coordinates.orEmpty().map { JsonArray(listOf(JsonPrimitive(it.first), JsonPrimitive(it.second))) }
        fun coordinate(place: CustomerPlace?) = place?.let { "[${it.longitude},${it.latitude}]" } ?: "null"
        val emptyMessage = JsonPrimitive(context.getString(R.string.map_booking_empty))
        update("showBooking(${coordinate(pickup)},${coordinate(dropoff)},${JsonArray(points)},$emptyMessage)")
        contentDescription = route?.let { "Truck route from ${it.pickup.label} to ${it.dropoff.label}, ${it.distanceKm} kilometers" }
            ?: when {
                pickup != null && dropoff != null -> "Map showing selected pickup and drop-off"
                pickup != null -> "Map showing selected pickup"
                dropoff != null -> "Map showing selected drop-off"
                else -> context.getString(R.string.map_booking_empty)
            }
    }

    fun showTrip(trip: CustomerLiveTrip?, routeCoordinates: List<Pair<Double, Double>> = emptyList()) {
        fun coordinate(longitude: Double?, latitude: Double?) =
            if (longitude == null || latitude == null) "null" else "[$longitude,$latitude]"
        val points = routeCoordinates.map { JsonArray(listOf(JsonPrimitive(it.first), JsonPrimitive(it.second))) }
        val emptyMessage = JsonPrimitive(context.getString(R.string.map_tracking_empty))
        update(
            "showTrip(" +
                "${coordinate(trip?.pickupLongitude, trip?.pickupLatitude)}," +
                "${coordinate(trip?.dropoffLongitude, trip?.dropoffLatitude)}," +
                "${coordinate(trip?.truckLongitude, trip?.truckLatitude)}," +
                "${trip?.heading ?: 0.0},${JsonArray(points)},$emptyMessage)",
        )
        contentDescription = if (trip?.truckLatitude != null) {
            "Trip map showing pickup, drop-off, HALLO road route and last reported truck position"
        } else {
            context.getString(R.string.map_tracking_empty)
        }
    }

    private fun update(script: String) {
        lastScript = script
        if (ready) evaluateJavascript(script, null)
    }

    private fun mapHtml(): String {
        val mapKey = Uri.encode(BuildConfig.MAPTILER_KEY)
        val style = if (BuildConfig.MAPTILER_KEY.isBlank()) {
            "https://demotiles.maplibre.org/style.json"
        } else {
            "https://api.maptiler.com/maps/streets-v2/style.json?key=$mapKey"
        }
        return MAP_HTML
            .replace("__HALLO_MAP_STYLE__", JsonPrimitive(style).toString())
            .replace("__HALLO_MAP_LOADING__", JsonPrimitive(context.getString(R.string.map_loading)).toString())
            .replace("__HALLO_MAP_ERROR__", JsonPrimitive(context.getString(R.string.map_error)).toString())
            .replace("__HALLO_MAP_RETRY__", JsonPrimitive(context.getString(R.string.map_retry)).toString())
    }

    private companion object {
        val MAP_HTML = """
            <!doctype html><html><head>
            <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
            <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
            <style>
            html,body,#map{margin:0;width:100%;height:100%;overflow:hidden;background:#eef3f8;touch-action:none}
            #state{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:24px;background:#f5f8fc;color:#10213d;font:600 14px/1.45 sans-serif;text-align:center;box-sizing:border-box}
            #stateCard{max-width:320px;padding:18px;border:1px solid #e3eaf4;border-radius:18px;background:#fff;box-shadow:0 8px 24px #10213d14}
            #retry{display:none;margin:14px auto 0;min-width:110px;min-height:44px;border:0;border-radius:14px;background:#0a6ff5;color:#fff;font:700 14px sans-serif;padding:0 18px}
            .maplibregl-canvas{outline:none}
            .maplibregl-ctrl-top-right{top:10px;right:10px}
            .maplibregl-ctrl-group{border-radius:14px;overflow:hidden;box-shadow:0 5px 18px #10213d2e}
            .maplibregl-ctrl-group button{width:42px;height:42px}
            .pin{width:18px;height:18px;border:3px solid white;border-radius:50%;box-shadow:0 3px 10px #10213d55}
            .pickup{background:#18a971}.dropoff{background:#eba915}
            .truck{width:40px;height:40px;border:3px solid white;border-radius:12px;background:#0a2345;color:white;display:grid;place-items:center;font:bold 20px sans-serif;box-shadow:0 5px 14px #10213d66}
            .truck span{display:block;transform-origin:center}
            </style></head><body><div id="map"></div><div id="state"><div id="stateCard"><div id="stateText"></div><button id="retry" type="button"></button></div></div>
            <script>
            const HALLO_LOADING=__HALLO_MAP_LOADING__;
            const HALLO_ERROR=__HALLO_MAP_ERROR__;
            const HALLO_RETRY=__HALLO_MAP_RETRY__;
            const stateBox=document.getElementById('state');
            const stateText=document.getElementById('stateText');
            const retryButton=document.getElementById('retry');
            retryButton.textContent=HALLO_RETRY;
            retryButton.addEventListener('click',()=>{showState(HALLO_LOADING,false);window.location.href='hallo-map://retry'});
            function showState(message,retry){stateText.textContent=message;retryButton.style.display=retry?'block':'none';stateBox.style.display='flex'}
            function hideState(){stateBox.style.display='none';retryButton.style.display='none'}
            function mapLibraryFailed(){showState(HALLO_ERROR,true)}
            showState(HALLO_LOADING,false);
            </script>
            <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js" onerror="mapLibraryFailed()"></script><script>
            if(typeof maplibregl==='undefined'){
              mapLibraryFailed();
            }else{
              const map=new maplibregl.Map({container:'map',style:__HALLO_MAP_STYLE__,center:[39.6,8.8],zoom:5.2,attributionControl:false,dragRotate:false,pitchWithRotate:false});
              let mapLoaded=false;
              map.addControl(new maplibregl.NavigationControl({showCompass:false,visualizePitch:false}),'top-right');
              map.dragPan.enable();map.scrollZoom.enable();map.touchZoomRotate.enable();map.touchZoomRotate.disableRotation();map.doubleClickZoom.enable();
              map.on('load',()=>{mapLoaded=true});
              map.on('error',()=>{if(!mapLoaded)showState(HALLO_ERROR,true)});
              let markers=[];
              function clearMarkers(){markers.forEach(m=>m.remove());markers=[]}
              function marker(p,c,t){if(!p)return null;const e=document.createElement('div');e.className=c;e.textContent=t||'';const m=new maplibregl.Marker({element:e,anchor:'center'}).setLngLat(p).addTo(map);markers.push(m);return e}
              function truckMarker(p,h){if(!p)return;const e=marker(p,'truck','');if(!e)return;const s=document.createElement('span');s.textContent='➤';s.style.transform='rotate('+((Number(h)||0)-90)+'deg)';e.appendChild(s)}
              function fit(points){const valid=(points||[]).filter(Boolean);if(!valid.length)return;if(valid.length===1){map.easeTo({center:valid[0],zoom:12,duration:300});return}const b=valid.slice(1).reduce((x,p)=>x.extend(p),new maplibregl.LngLatBounds(valid[0],valid[0]));map.fitBounds(b,{padding:{top:58,bottom:48,left:42,right:42},maxZoom:13,duration:350})}
              function routeSource(points){if(map.getLayer('route'))map.removeLayer('route');if(map.getLayer('route-outline'))map.removeLayer('route-outline');if(map.getSource('route'))map.removeSource('route');if(points.length>1){map.addSource('route',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:points}}});map.addLayer({id:'route-outline',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#0a2345','line-width':9,'line-opacity':.30}});map.addLayer({id:'route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#1f62da','line-width':6,'line-opacity':.98}})}}
              function showBooking(p,d,points,emptyMessage){const run=()=>{clearMarkers();routeSource(points||[]);const hasData=!!p||!!d||(points&&points.length>0);if(!hasData){showState(emptyMessage,false);return}const start=points&&points.length?points[0]:p;const end=points&&points.length?points[points.length-1]:d;marker(start,'pin pickup');marker(end,'pin dropoff');fit(points&&points.length?points:[p,d]);hideState()};map.loaded()?run():map.once('load',run)}
              function showTrip(p,d,t,h,points,emptyMessage){const run=()=>{clearMarkers();const hasData=!!p||!!d||!!t||(points&&points.length>0);if(!hasData){routeSource([]);showState(emptyMessage,false);return}const route=points&&points.length>1?points:[p,d].filter(Boolean);routeSource(route);marker(p,'pin pickup');marker(d,'pin dropoff');truckMarker(t,h);fit(route.concat(t?[t]:[]));hideState()};map.loaded()?run():map.once('load',run)}
            }
            </script></body></html>
        """.trimIndent()
    }
}
