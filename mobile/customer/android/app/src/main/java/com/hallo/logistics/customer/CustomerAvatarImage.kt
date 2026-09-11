package com.hallo.logistics.customer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import java.io.ByteArrayOutputStream

object CustomerAvatarImage {
    private const val MAX_EDGE = 1024
    private const val JPEG_QUALITY = 88
    private const val MAX_UPLOAD_BYTES = 5 * 1024 * 1024

    fun prepare(context: Context, uri: Uri): ByteArray {
        val source = decode(context, uri) ?: error("Profile photo could not be decoded")
        val square = centerCropSquare(source)
        val resized = resize(square)
        if (square !== source) source.recycle()
        if (resized !== square) square.recycle()
        return try {
            val output = ByteArrayOutputStream()
            check(resized.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output)) { "Profile photo could not be prepared" }
            output.toByteArray().also {
                require(it.isNotEmpty()) { "Profile photo is empty" }
                require(it.size <= MAX_UPLOAD_BYTES) { "Profile photo must be 5 MB or smaller" }
            }
        } finally {
            resized.recycle()
        }
    }

    private fun decode(context: Context, uri: Uri): Bitmap? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val source = ImageDecoder.createSource(context.contentResolver, uri)
        ImageDecoder.decodeBitmap(source) { decoder, _, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
    } else {
        context.contentResolver.openInputStream(uri)?.use(BitmapFactory::decodeStream)
    }

    private fun centerCropSquare(bitmap: Bitmap): Bitmap {
        val edge = minOf(bitmap.width, bitmap.height)
        require(edge > 0) { "Profile photo has invalid dimensions" }
        val x = (bitmap.width - edge) / 2
        val y = (bitmap.height - edge) / 2
        return if (bitmap.width == edge && bitmap.height == edge) bitmap else Bitmap.createBitmap(bitmap, x, y, edge, edge)
    }

    private fun resize(bitmap: Bitmap): Bitmap {
        val edge = bitmap.width.coerceAtMost(MAX_EDGE)
        return if (bitmap.width <= MAX_EDGE) bitmap else Bitmap.createScaledBitmap(bitmap, edge, edge, true)
    }
}
