package com.hallo.logistics.driver.tracking
import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.IBinder
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.time.Instant

class HalloLocationService:Service(){
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO);private val remote=TrackingRemoteDataSource();private val queue by lazy{TrackingQueue(this)};private val fused by lazy{LocationServices.getFusedLocationProviderClient(this)};private var orderId:String?=null
 private val callback=object:LocationCallback(){override fun onLocationResult(result:LocationResult){val id=orderId?:return;result.lastLocation?.let{l->scope.launch{val current=TrackingPingRequest(id,l.longitude,l.latitude,l.bearing.toDouble(),l.speed*3.6,l.accuracy.toDouble(),Instant.ofEpochMilli(l.time).toString());for(p in queue.read()){if(runCatching{remote.record(p)}.isSuccess)queue.removeFirst()else break};if(runCatching{remote.record(current)}.isFailure)queue.enqueue(current)}}}}
 override fun onCreate(){super.onCreate();getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL,"HALLO active trip tracking",NotificationManager.IMPORTANCE_LOW));startForeground(4102,NotificationCompat.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("HALLO Driver active trip").setContentText("Authorized GPS tracking is running").setOngoing(true).build())}
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{orderId=intent?.getStringExtra("order_id");if(orderId.isNullOrBlank()||ActivityCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){stopSelf();return START_NOT_STICKY};fused.requestLocationUpdates(LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY,15000).setMinUpdateIntervalMillis(10000).build(),callback,mainLooper);return START_NOT_STICKY}
 override fun onDestroy(){fused.removeLocationUpdates(callback);scope.cancel();super.onDestroy()};override fun onBind(intent:Intent?):IBinder?=null
 companion object{const val CHANNEL="hallo_driver_tracking"}
}
