package com.hallo.logistics.driver.tracking
import android.content.Context

class TrackingQueue(context:Context){private val prefs=context.getSharedPreferences("driver_tracking_queue",Context.MODE_PRIVATE)
 fun enqueue(p:TrackingPingRequest){prefs.edit().putString(KEY,(read().takeLast(99)+p).joinToString("\n",transform=::encode)).apply()}
 fun read():List<TrackingPingRequest> = prefs.getString(KEY,"").orEmpty().lineSequence().filter{it.isNotBlank()}.mapNotNull(::decode).toList()
 fun removeFirst(){prefs.edit().putString(KEY,read().drop(1).joinToString("\n",transform=::encode)).apply()}
 private fun encode(p:TrackingPingRequest)=listOf(p.orderId,p.lng,p.lat,p.heading?:"",p.speedKmh?:"",p.accuracyM?:"",p.recordedAt?:"").joinToString("|")
 private fun decode(v:String):TrackingPingRequest?=runCatching{val x=v.split('|');TrackingPingRequest(x[0],x[1].toDouble(),x[2].toDouble(),x[3].toDoubleOrNull(),x[4].toDoubleOrNull(),x[5].toDoubleOrNull(),x[6].ifBlank{null})}.getOrNull()
 companion object{private const val KEY="pending"}
}
