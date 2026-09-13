package com.hallo.logistics.driver

import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.widget.ArrayAdapter
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.hallo.logistics.driver.databinding.ActivityDriverCommissionSettlementBinding
import kotlinx.coroutines.launch

class DriverCommissionSettlementActivity:AppCompatActivity(){
    private lateinit var b:ActivityDriverCommissionSettlementBinding
    private val repo=DriverCommissionSettlementRepository()
    private var summary:DriverCommissionSummary?=null
    private var receipt:Receipt?=null

    private val receiptPicker=registerForActivityResult(ActivityResultContracts.GetContent()){uri->
        if(uri==null)return@registerForActivityResult
        runCatching{readReceipt(uri)}.onSuccess{selected->
            receipt=selected
            b.receiptState.text=getString(R.string.settlement_receipt_selected,selected.name)
        }.onFailure{
            receipt=null
            b.receiptState.setText(R.string.settlement_invalid_receipt)
        }
    }

    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        DriverLocaleManager.applySaved(this)
        b=ActivityDriverCommissionSettlementBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.provider.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,DriverCommissionSettlementRepository.PROVIDERS)
        b.closeAction.setOnClickListener{finish()}
        b.pickReceipt.setOnClickListener{receiptPicker.launch("*/*")}
        b.submitPayment.setOnClickListener{lifecycleScope.launch{submit()}}
        lifecycleScope.launch{loadSummary()}
    }

    private suspend fun loadSummary(){
        setBusy(true,getString(R.string.settlement_loading))
        runCatching{repo.summary()}.onSuccess{value->
            summary=value
            renderSummary(value)
            b.status.text=if(value.balanceEtb<=0.005)getString(R.string.settlement_no_balance) else ""
        }.onFailure{b.status.text=it.message?:getString(R.string.wallet_unavailable)}
        setBusy(false,b.status.text.toString())
    }

    private fun renderSummary(value:DriverCommissionSummary){
        b.balanceDue.text=getString(R.string.settlement_balance_format,value.balanceEtb)
        b.balanceState.text=getString(R.string.settlement_balance_state,value.chargedEtb,value.approvedPaidEtb,value.pendingEtb)
        b.submitPayment.isEnabled=value.balanceEtb>0.005
    }

    private suspend fun submit(){
        val current=summary
        if(current==null){b.status.setText(R.string.wallet_unavailable);return}
        if(current.balanceEtb<=0.005){b.status.setText(R.string.settlement_no_balance);return}
        val transaction=b.transactionId.text?.toString()?.trim().orEmpty()
        if(transaction.length !in 3..160){b.status.setText(R.string.settlement_invalid_transaction);return}
        val amount=b.amount.text?.toString()?.toDoubleOrNull()
        if(amount==null||amount<=0.0||amount>current.balanceEtb+0.005){b.status.setText(R.string.settlement_invalid_amount);return}
        val selected=receipt
        if(selected==null){b.status.setText(R.string.settlement_invalid_receipt);return}
        setBusy(true,getString(R.string.settlement_submitting))
        runCatching{
            repo.submit(
                provider=DriverCommissionSettlementRepository.PROVIDERS[b.provider.selectedItemPosition],
                transactionId=transaction,
                amountEtb=amount,
                fileName=selected.name,
                mime=selected.mime,
                bytes=selected.bytes,
            )
        }.onSuccess{
            b.transactionId.text?.clear();b.amount.text?.clear();receipt=null;b.receiptState.setText(R.string.settlement_receipt_required)
            b.status.setText(R.string.settlement_submitted)
            runCatching{repo.summary()}.onSuccess{updated->summary=updated;renderSummary(updated)}
        }.onFailure{b.status.text=it.message?:getString(R.string.error_request_failed)}
        setBusy(false,b.status.text.toString())
    }

    private fun readReceipt(uri:Uri):Receipt{
        val name=displayName(uri)
        val mime=(contentResolver.getType(uri)?:inferMime(name)).lowercase()
        require(mime in DriverCommissionSettlementRepository.ALLOWED_MIME)
        val bytes=contentResolver.openInputStream(uri)?.use{it.readBytes()}?:error("receipt unavailable")
        require(bytes.isNotEmpty()&&bytes.size<=DriverCommissionSettlementRepository.MAX_BYTES)
        return Receipt(name,mime,bytes)
    }

    private fun displayName(uri:Uri):String{
        var result="receipt"
        contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{cursor->
            if(cursor.moveToFirst()){
                val index=cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if(index>=0)result=cursor.getString(index)?:result
            }
        }
        return result
    }

    private fun inferMime(name:String)=when(name.substringAfterLast('.',"").lowercase()){
        "jpg","jpeg"->"image/jpeg"
        "png"->"image/png"
        "webp"->"image/webp"
        "pdf"->"application/pdf"
        else->"application/octet-stream"
    }

    private fun setBusy(value:Boolean,status:String){
        b.provider.isEnabled=!value;b.transactionId.isEnabled=!value;b.amount.isEnabled=!value;b.pickReceipt.isEnabled=!value
        b.submitPayment.isEnabled=!value&&(summary?.balanceEtb?:0.0)>0.005
        if(status.isNotBlank())b.status.text=status
    }

    private data class Receipt(val name:String,val mime:String,val bytes:ByteArray)
}
