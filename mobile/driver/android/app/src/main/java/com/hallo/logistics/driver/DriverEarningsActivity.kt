package com.hallo.logistics.driver

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.card.MaterialCardView
import com.hallo.logistics.driver.databinding.ActivityDriverEarningsBinding
import java.text.NumberFormat
import java.util.Locale
import kotlinx.coroutines.launch

class DriverEarningsActivity:AppCompatActivity(){
    private lateinit var b:ActivityDriverEarningsBinding
    private val repo=DriverEarningsRepository()
    private var summary:DriverEarningsSummary?=null

    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        DriverLocaleManager.applySaved(this)
        b=ActivityDriverEarningsBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.closeAction.setOnClickListener{finish()}
        b.filterGroup.check(R.id.filterAll)
        b.filterGroup.addOnButtonCheckedListener{_,_,checked->if(checked)renderTrips()}
        lifecycleScope.launch{load()}
    }

    private suspend fun load(){
        b.status.setText(R.string.earnings_loading)
        runCatching{repo.summary()}.onSuccess{value->
            summary=value
            b.totalReleased.text=money(value.totalReleasedEtb)
            b.summaryState.text=getString(
                R.string.earnings_summary_format,
                value.completedTrips,
                value.releasedTrips,
                money(value.totalCommissionEtb),
                money(value.totalDriverNetEtb),
                value.pendingTrips,
                money(value.pendingDriverBalanceEtb),
            )
            b.status.text=if(value.trips.isEmpty())getString(R.string.earnings_none) else ""
            renderTrips()
        }.onFailure{b.status.text=it.message?:getString(R.string.wallet_unavailable)}
    }

    private fun renderTrips(){
        val value=summary?:return
        val rows=when(b.filterGroup.checkedButtonId){
            R.id.filterReleased->value.trips.filter{it.payoutStatus=="released"}
            R.id.filterPending->value.trips.filter{it.payoutStatus!="released"}
            else->value.trips
        }
        b.tripList.removeAllViews()
        if(rows.isEmpty()){
            b.tripList.addView(TextView(this).apply{text=getString(R.string.earnings_none);textSize=13f;gravity=Gravity.CENTER;setTextColor(ContextCompat.getColor(this@DriverEarningsActivity,R.color.hallo_text_muted));setPadding(dp(12),dp(24),dp(12),dp(24))})
            return
        }
        rows.forEach{trip->b.tripList.addView(tripCard(trip))}
    }

    private fun tripCard(trip:DriverEarningsTrip):MaterialCardView{
        val paid=if(trip.payoutStatus=="released")trip.releasedEtb else trip.partialReleasedEtb
        val body=TextView(this).apply{
            text=getString(
                R.string.earnings_trip_format,
                trip.trackingId,
                localStatus(trip.payoutStatus),
                trip.pickup,
                trip.dropoff,
                money(trip.invoiceEtb),
                money(paid),
                money(trip.commissionEtb),
                money(trip.driverNetEtb),
                money(trip.heldEtb),
                money(trip.remainingEtb),
                trip.paymentProvider?:"—",
                trip.lastReleaseAt?:trip.deliveredAt?:"—",
            )
            textSize=13.5f
            setTextColor(ContextCompat.getColor(this@DriverEarningsActivity,R.color.hallo_text))
            setLineSpacing(dp(3).toFloat(),1f)
        }
        val action=TextView(this).apply{
            setText(R.string.comms_open_messages)
            textSize=12f
            setTextColor(ContextCompat.getColor(this@DriverEarningsActivity,R.color.hallo_blue))
            setPadding(0,dp(10),0,0)
        }
        val content=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(16),dp(14),dp(16),dp(14));addView(body);addView(action)}
        return MaterialCardView(this).apply{
            radius=dp(16).toFloat();cardElevation=0f;strokeWidth=dp(1);strokeColor=ContextCompat.getColor(this@DriverEarningsActivity,R.color.hallo_border);setCardBackgroundColor(ContextCompat.getColor(this@DriverEarningsActivity,android.R.color.white));addView(content)
            layoutParams=LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,LinearLayout.LayoutParams.WRAP_CONTENT).apply{topMargin=dp(10)}
            isClickable=true;isFocusable=true
            setOnClickListener{
                startActivity(Intent(this@DriverEarningsActivity,DriverCommunicationsActivity::class.java)
                    .putExtra(DriverCommunicationsActivity.EXTRA_MODE,DriverCommunicationMode.CUSTOMER.name)
                    .putExtra(DriverCommunicationsActivity.EXTRA_ORDER_ID,trip.orderId))
            }
        }
    }

    private fun money(value:Double):String="ETB "+NumberFormat.getNumberInstance(Locale.US).apply{minimumFractionDigits=2;maximumFractionDigits=2}.format(value)
    private fun localStatus(value:String)=value.replace('_',' ').split(' ').joinToString(" "){it.replaceFirstChar{c->c.uppercase()}}
    private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
}
