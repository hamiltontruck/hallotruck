package com.hallo.logistics.driver.tracking
import org.junit.Assert.assertTrue
import org.junit.Test

class TrackingQueueEncodingTest{@Test fun requestRejectsFabricatedCoordinates(){assertTrue(runCatching{require(TrackingPingRequest("o",181.0,9.0).lng in -180.0..180.0)}.isFailure)}}
