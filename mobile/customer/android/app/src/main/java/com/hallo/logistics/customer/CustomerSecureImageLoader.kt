package com.hallo.logistics.customer

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URI

object CustomerSecureImageLoader {
    private val cache = object : LruCache<String, Bitmap>(12 * 1024) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount / 1024
    }

    suspend fun load(url: String?): Bitmap? {
        val safeUrl = CustomerDisplayPolicy.usablePhotoUrl(url) ?: return null
        cache.get(safeUrl)?.let { return it }
        return withContext(Dispatchers.IO) {
            runCatching {
                val connection = URI(safeUrl).toURL().openConnection() as HttpURLConnection
                try {
                    connection.connectTimeout = 12_000
                    connection.readTimeout = 18_000
                    connection.instanceFollowRedirects = true
                    connection.setRequestProperty("Accept", "image/*")
                    connection.setRequestProperty("User-Agent", "HALLO-Customer-Android/1")
                    if (connection.responseCode !in 200..299) return@runCatching null
                    val bitmap = connection.inputStream.use(BitmapFactory::decodeStream) ?: return@runCatching null
                    cache.put(safeUrl, bitmap)
                    bitmap
                } finally {
                    connection.disconnect()
                }
            }.getOrNull()
        }
    }
}
