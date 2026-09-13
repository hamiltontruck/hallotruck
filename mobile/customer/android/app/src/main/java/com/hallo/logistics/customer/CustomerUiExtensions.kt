package com.hallo.logistics.customer

/** Keep String call sites strongly typed while supporting TextView CharSequence values. */
internal fun String?.orEmpty(): String = this ?: ""
internal fun CharSequence?.orEmpty(): CharSequence = this ?: ""
