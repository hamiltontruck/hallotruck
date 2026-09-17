package com.hallo.logistics.driver

class DriverEarningsRepository {
    suspend fun summary():DriverEarningsSummary {
        val repo=DriverRepository()
        val financial=repo.wallet()
        val results=repo.tripPaymentResults()
        val orders=repo.completedTrips()
        return DriverEarningsPresentationPolicy.combine(financial,results,orders)
    }
}
