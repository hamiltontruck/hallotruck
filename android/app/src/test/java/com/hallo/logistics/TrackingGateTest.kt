package com.hallo.logistics

import com.hallo.logistics.tracking.*
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class TrackingGateTest {
    @Test fun trackingCannotStartWithoutAuthorizedActiveTrip() = runTest { assertFalse(TrackingGate(object: ActiveTripAuthorizer { override suspend fun hasAuthorizedActiveTrip() = false }).mayStart()) }
    @Test fun authorizationFailureFailsClosed() = runTest { assertFalse(TrackingGate(object: ActiveTripAuthorizer { override suspend fun hasAuthorizedActiveTrip(): Boolean = error("network") }).mayStart()) }
}
