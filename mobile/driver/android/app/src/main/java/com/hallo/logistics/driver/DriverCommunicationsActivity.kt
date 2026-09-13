package com.hallo.logistics.driver

import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.material.card.MaterialCardView
import com.hallo.logistics.driver.databinding.ActivityDriverCommunicationsBinding
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class DriverCommunicationsActivity:AppCompatActivity(){
    private lateinit var b:ActivityDriverCommunicationsBinding
    private val repo=DriverCommunicationsRepository()
    private var orders:List<DriverJob> = emptyList()
    private var disputes:List<DriverTripDispute> = emptyList()
    private var operationsThread:String?=null
    private val customerThreads=mutableMapOf<String,String>()
    private var loading=false

    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        DriverLocaleManager.applySaved(this)
        b=ActivityDriverCommunicationsBinding.inflate(layoutInflater)
        setContentView(b.root)
        configureUi()
        lifecycleScope.launch{loadScreen()}
        lifecycleScope.launch{
            repeatOnLifecycle(Lifecycle.State.STARTED){
                while(true){delay(4_000);refreshChat(silent=true);refreshDisputes(silent=true)}
            }
        }
    }

    private fun configureUi(){
        b.closeAction.setOnClickListener{finish()}
        b.disputeCategory.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,disputeLabels())
        val initial=runCatching{DriverCommunicationMode.valueOf(intent.getStringExtra(EXTRA_MODE)?:DriverCommunicationMode.CUSTOMER.name)}.getOrDefault(DriverCommunicationMode.CUSTOMER)
        b.chatModeGroup.check(if(initial==DriverCommunicationMode.CUSTOMER)R.id.customerMode else R.id.operationsMode)
        b.chatModeGroup.addOnButtonCheckedListener{_,_,checked->if(checked)lifecycleScope.launch{renderOrderContext();refreshChat(silent=false)}}
        b.orderSelector.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{
            override fun onItemSelected(parent:AdapterView<*>?,view:View?,position:Int,id:Long){lifecycleScope.launch{renderOrderContext();refreshChat(silent=false);refreshDisputes(silent=true)}}
            override fun onNothingSelected(parent:AdapterView<*>?){Unit}
        }
        b.sendMessage.setOnClickListener{lifecycleScope.launch{sendMessage()}}
        b.submitDispute.setOnClickListener{lifecycleScope.launch{submitDispute()}}
    }

    private suspend fun loadScreen(){
        if(!HalloSupabase.configured||repo.userId()==null){b.screenStatus.setText(R.string.comms_sign_in_required);disableActions();return}
        setLoading(true,getString(R.string.comms_loading))
        runCatching{repo.eligibleOrders()}.onSuccess{loaded->
            orders=loaded.sortedWith(compareByDescending<DriverJob>{it.status=="in_transit"||it.status=="accepted"}.thenByDescending{it.deliveredAt?:it.acceptedAt.orEmpty()})
            val labels=if(orders.isEmpty())listOf(getString(R.string.comms_no_orders)) else orders.map(::orderLabel)
            b.orderSelector.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,labels)
            intent.getStringExtra(EXTRA_ORDER_ID)?.let{requested->orders.indexOfFirst{it.id==requested}.takeIf{it>=0}?.let(b.orderSelector::setSelection)}
        }.onFailure{b.screenStatus.text=it.message?:getString(R.string.error_request_failed)}
        renderOrderContext();refreshChat(silent=false);refreshDisputes(silent=false)
        setLoading(false,"")
    }

    private fun currentMode()=if(b.chatModeGroup.checkedButtonId==R.id.operationsMode)DriverCommunicationMode.OPERATIONS else DriverCommunicationMode.CUSTOMER
    private fun selectedOrder():DriverJob?=orders.getOrNull(b.orderSelector.selectedItemPosition)

    private suspend fun renderOrderContext(){
        val order=selectedOrder()
        b.orderSummary.text=if(order==null)getString(R.string.comms_no_orders) else getString(R.string.comms_order_summary,order.trackingId.orDash(),order.pickup.orDash(),order.dropoff.orDash(),localStatus(order.status))
        b.submitDispute.isEnabled=!loading&&order!=null&&DriverCommunicationsPolicy.canDispute(order.status)
        if(currentMode()==DriverCommunicationMode.OPERATIONS){
            b.customerContact.text=getString(R.string.comms_operations_hint)
            return
        }
        if(order==null){b.customerContact.setText(R.string.comms_customer_unavailable);return}
        runCatching{repo.customerContact(order.id)}.onSuccess{contact->
            b.customerContact.text=getString(R.string.comms_customer_contact,contact.customerName,contact.customerPhone.orDash())
        }.onFailure{b.customerContact.setText(R.string.comms_customer_unavailable)}
    }

    private suspend fun refreshChat(silent:Boolean){
        if(loading||repo.userId()==null)return
        val actor=repo.userId().orEmpty()
        when(currentMode()){
            DriverCommunicationMode.OPERATIONS->runCatching{
                val thread=operationsThread?:repo.openOperationsChat().also{operationsThread=it}
                repo.markOperationsRead(thread)
                repo.operationsMessages(thread).map{ChatRow(it.senderId,it.body,it.createdAt,it.orderId)}
            }.onSuccess{rows->renderMessages(rows,actor);b.chatStatus.setText(R.string.comms_operations_connected)}.onFailure{if(!silent)b.chatStatus.text=it.message?:getString(R.string.error_request_failed)}
            DriverCommunicationMode.CUSTOMER->{
                val order=selectedOrder()
                if(order==null){renderMessages(emptyList(),actor);b.chatStatus.setText(R.string.comms_choose_order);return}
                runCatching{
                    val thread=customerThreads[order.id]?:repo.openCustomerChat(order.id).also{customerThreads[order.id]=it}
                    repo.markCustomerRead(thread)
                    repo.customerMessages(thread).map{ChatRow(it.senderId,it.body,it.createdAt,order.id)}
                }.onSuccess{rows->renderMessages(rows,actor);b.chatStatus.setText(R.string.comms_customer_connected)}.onFailure{if(!silent)b.chatStatus.text=it.message?:getString(R.string.error_request_failed)}
            }
        }
    }

    private suspend fun sendMessage(){
        val text=b.messageInput.text?.toString().orEmpty()
        if(!DriverCommunicationsPolicy.validMessage(text)){b.screenStatus.setText(R.string.comms_message_invalid);return}
        setLoading(true,getString(R.string.comms_sending))
        runCatching{
            when(currentMode()){
                DriverCommunicationMode.OPERATIONS->{val thread=operationsThread?:repo.openOperationsChat().also{operationsThread=it};repo.sendOperationsMessage(thread,text,selectedOrder()?.id)}
                DriverCommunicationMode.CUSTOMER->{val order=selectedOrder()?:error(getString(R.string.comms_choose_order));val thread=customerThreads[order.id]?:repo.openCustomerChat(order.id).also{customerThreads[order.id]=it};repo.sendCustomerMessage(thread,text)}
            }
        }.onSuccess{b.messageInput.text?.clear();b.screenStatus.setText(R.string.comms_message_sent);refreshChat(silent=false)}
            .onFailure{b.screenStatus.text=it.message?:getString(R.string.error_request_failed)}
        setLoading(false,b.screenStatus.text.toString())
    }

    private suspend fun refreshDisputes(silent:Boolean){
        if(repo.userId()==null)return
        runCatching{repo.disputes()}.onSuccess{loaded->disputes=loaded;renderDisputes()}.onFailure{if(!silent)b.screenStatus.text=it.message?:getString(R.string.comms_disputes_unavailable)}
    }

    private suspend fun submitDispute(){
        val order=selectedOrder()
        if(order==null||!DriverCommunicationsPolicy.canDispute(order.status)){b.screenStatus.setText(R.string.comms_dispute_order_required);return}
        val details=b.disputeDetails.text?.toString().orEmpty()
        if(!DriverCommunicationsPolicy.validDispute(details)){b.screenStatus.setText(R.string.comms_dispute_invalid);return}
        val category=DriverCommunicationsPolicy.disputeCategories[b.disputeCategory.selectedItemPosition.coerceIn(0,DriverCommunicationsPolicy.disputeCategories.lastIndex)]
        setLoading(true,getString(R.string.comms_submitting_dispute))
        runCatching{repo.createDispute(order.id,category,details)}.onSuccess{
            b.disputeDetails.text?.clear();b.screenStatus.setText(R.string.comms_dispute_submitted);refreshDisputes(silent=false)
        }.onFailure{b.screenStatus.text=it.message?:getString(R.string.error_request_failed)}
        setLoading(false,b.screenStatus.text.toString())
    }

    private fun renderMessages(rows:List<ChatRow>,actor:String){
        b.messagesList.removeAllViews()
        if(rows.isEmpty()){b.messagesList.addView(emptyText(getString(R.string.comms_no_messages)));return}
        rows.forEach{row->
            val mine=row.senderId==actor
            val message=TextView(this).apply{
                text=buildString{append(row.body);append("\n");append(row.createdAt)}
                textSize=14f;setTextColor(ContextCompat.getColor(this@DriverCommunicationsActivity,R.color.hallo_navy));setPadding(dp(12),dp(10),dp(12),dp(10))
            }
            val card=MaterialCardView(this).apply{
                radius=dp(14).toFloat();cardElevation=0f;strokeWidth=dp(1);strokeColor=ContextCompat.getColor(this@DriverCommunicationsActivity,if(mine)R.color.hallo_blue else R.color.hallo_border);setCardBackgroundColor(ContextCompat.getColor(this@DriverCommunicationsActivity,if(mine)R.color.hallo_blue_soft else android.R.color.white));addView(message)
                layoutParams=LinearLayout.LayoutParams((resources.displayMetrics.widthPixels*0.78f).toInt(),LinearLayout.LayoutParams.WRAP_CONTENT).apply{gravity=if(mine)Gravity.END else Gravity.START;topMargin=dp(6)}
            }
            b.messagesList.addView(card)
        }
        b.messagesScroll.post{b.messagesScroll.fullScroll(View.FOCUS_DOWN)}
    }

    private fun renderDisputes(){
        b.disputesList.removeAllViews()
        val order=selectedOrder()
        val visible=if(order==null)disputes.take(10) else disputes.filter{it.orderId==order.id}.take(10)
        if(visible.isEmpty()){b.disputesList.addView(emptyText(getString(R.string.comms_no_disputes)));return}
        visible.forEach{item->
            val tracking=orders.firstOrNull{it.id==item.orderId}?.trackingId.orDash()
            b.disputesList.addView(emptyText(getString(R.string.comms_dispute_row,tracking,localStatus(item.category),localStatus(item.status),item.details,item.adminNote?:getString(R.string.none),item.createdAt?:getString(R.string.none))).apply{setPadding(dp(10),dp(8),dp(10),dp(8))})
        }
    }

    private fun setLoading(value:Boolean,status:String){
        loading=value;b.sendMessage.isEnabled=!value;b.orderSelector.isEnabled=!value;b.chatModeGroup.isEnabled=!value;b.disputeCategory.isEnabled=!value;b.disputeDetails.isEnabled=!value
        val order=selectedOrder();b.submitDispute.isEnabled=!value&&order!=null&&DriverCommunicationsPolicy.canDispute(order.status)
        if(status.isNotBlank())b.screenStatus.text=status
    }
    private fun disableActions(){b.sendMessage.isEnabled=false;b.submitDispute.isEnabled=false;b.orderSelector.isEnabled=false;b.chatModeGroup.isEnabled=false}
    private fun orderLabel(order:DriverJob)="${order.trackingId.orDash()} · ${order.pickup.orDash()} → ${order.dropoff.orDash()} · ${localStatus(order.status)}"
    private fun disputeLabels()=listOf(R.string.comms_dispute_payment,R.string.comms_dispute_delivery,R.string.comms_dispute_assignment,R.string.comms_dispute_customer,R.string.comms_dispute_safety,R.string.comms_dispute_other).map(::getString)
    private fun emptyText(value:String)=TextView(this).apply{text=value;textSize=13f;setTextColor(ContextCompat.getColor(this@DriverCommunicationsActivity,R.color.hallo_text_muted))}
    private fun localStatus(value:String?)=value?.replace('_',' ')?.split(' ')?.joinToString(" "){it.replaceFirstChar{c->c.uppercase()}}?:getString(R.string.none)
    private fun String?.orDash()=if(this.isNullOrBlank())"—" else this
    private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()

    private data class ChatRow(val senderId:String,val body:String,val createdAt:String,val orderId:String?)

    companion object{
        const val EXTRA_MODE="driver_communications_mode"
        const val EXTRA_ORDER_ID="driver_communications_order_id"
    }
}
