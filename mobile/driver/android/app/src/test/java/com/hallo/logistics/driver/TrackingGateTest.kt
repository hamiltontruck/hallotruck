package com.hallo.logistics.driver
import com.hallo.logistics.driver.tracking.TrackingGate
import org.junit.Assert.*
import org.junit.Test
class TrackingGateTest{@Test fun onlyApprovedAssignedActiveDriverCanTrack(){assertTrue(TrackingGate.mayTrack("driver","approved","in_transit","d1","d1"));assertFalse(TrackingGate.mayTrack("customer","approved","in_transit","d1","d1"));assertFalse(TrackingGate.mayTrack("driver","pending","in_transit","d1","d1"));assertFalse(TrackingGate.mayTrack("driver","approved","delivered","d1","d1"));assertFalse(TrackingGate.mayTrack("driver","approved","in_transit","d2","d1"))}}
