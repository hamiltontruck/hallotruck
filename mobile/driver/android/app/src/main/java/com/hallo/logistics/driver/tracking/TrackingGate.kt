package com.hallo.logistics.driver.tracking
object TrackingGate{fun mayTrack(role:String?,driverStatus:String?,orderStatus:String?,assignedDriverId:String?,userId:String?)=role=="driver"&&driverStatus=="approved"&&orderStatus in setOf("accepted","in_transit")&&assignedDriverId!=null&&assignedDriverId==userId}
