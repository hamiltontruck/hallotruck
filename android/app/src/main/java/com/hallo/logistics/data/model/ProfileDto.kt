package com.hallo.logistics.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable data class ProfileDto(val id: String, val role: String? = null, @SerialName("driver_status") val driverStatus: String? = null)
