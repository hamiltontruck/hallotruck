package com.hallo.logistics.customer

/** Null-safe CharSequence helper used by runtime-bound Android TextViews. */
internal fun CharSequence?.orEmpty(): CharSequence = this ?: ""
