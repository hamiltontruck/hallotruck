package com.hallo.logistics.driver

import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.storage.storage
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class DriverCommissionSettlementRepository {
    private val client get()=HalloSupabase.client

    suspend fun summary():DriverCommissionSummary=DriverRepository().commissionSummary()

    suspend fun submit(provider:String,transactionId:String,amountEtb:Double,fileName:String,mime:String,bytes:ByteArray){
        val driver=DriverRepository().profile()
        require(provider.trim().isNotEmpty())
        require(transactionId.trim().length in 3..160)
        require(amountEtb>0.0)
        require(mime in ALLOWED_MIME)
        require(bytes.isNotEmpty()&&bytes.size<=MAX_BYTES)
        val safe=fileName.lowercase().replace(Regex("[^a-z0-9._-]+"),"-").replace(Regex("-+"),"-").takeLast(80).ifBlank{"receipt"}
        val path="${driver.id}/${System.currentTimeMillis()}-$safe"
        client.storage.from(BUCKET).upload(path,bytes){upsert=false}
        try{
            client.postgrest.rpc("submit_driver_commission_payment",buildJsonObject{
                put("p_provider",provider.trim())
                put("p_transaction_id",transactionId.trim())
                put("p_amount_etb",amountEtb)
                put("p_receipt_path",path)
            })
        }catch(error:Throwable){
            runCatching{client.storage.from(BUCKET).delete(path)}
            throw error
        }
    }

    companion object{
        const val BUCKET="driver-commission-receipts"
        const val MAX_BYTES=10*1024*1024
        val ALLOWED_MIME=setOf("image/jpeg","image/png","image/webp","application/pdf")
        val PROVIDERS=listOf("Telebirr","CBE","Awash Bank","Bank of Abyssinia","Dashen Bank","Cooperative Bank of Oromia","M-Pesa")
    }
}
