package com.hallo.logistics.tracking

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.hallo.logistics.R

/** Foreground-service foundation only. Location collection starts only through an authorized TrackingGate path. */
class HalloLocationService : Service() {
    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "HALLO active trip tracking", NotificationManager.IMPORTANCE_LOW))
        startForeground(LOCATION_NOTIFICATION_ID, NotificationCompat.Builder(this, CHANNEL).setContentTitle("HALLO active trip").setContentText("Location tracking is active for your authorized trip.").setSmallIcon(android.R.drawable.ic_menu_mylocation).setOngoing(true).build())
    }
    override fun onBind(intent: Intent?): IBinder? = null
    companion object { const val CHANNEL = "hallo_active_trip_tracking"; const val LOCATION_NOTIFICATION_ID = 4102 }
}
