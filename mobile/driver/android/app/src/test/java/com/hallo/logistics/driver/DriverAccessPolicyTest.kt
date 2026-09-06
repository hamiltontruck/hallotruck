package com.hallo.logistics.driver
import org.junit.Assert.*
import org.junit.Test
class DriverAccessPolicyTest { @Test fun blocksEveryOtherRole(){listOf("customer","partner","admin","ceo").forEach{assertEquals(DriverAccess.FORBIDDEN,DriverAccessPolicy.resolve(it,"approved"))}}; @Test fun pinIsExactlySixDigits(){assertTrue(DriverAccessPolicy.validSignupPin("123456"));assertFalse(DriverAccessPolicy.validSignupPin("12345"));assertFalse(DriverAccessPolicy.validSignupPin("12345a"))} }
