package com.hallo.logistics.customer

// Compatibility name retained for native-boundary tooling and earlier references.
typealias CustomerSessionViewModel = CustomerViewModel

internal fun isCustomerRole(role: String?) = role?.trim()?.lowercase() == "customer"
