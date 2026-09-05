package com.hallo.logistics.tracking

interface ActiveTripAuthorizer { suspend fun hasAuthorizedActiveTrip(): Boolean }
class TrackingGate(private val authorizer: ActiveTripAuthorizer) { suspend fun mayStart(): Boolean = runCatching { authorizer.hasAuthorizedActiveTrip() }.getOrDefault(false) }
