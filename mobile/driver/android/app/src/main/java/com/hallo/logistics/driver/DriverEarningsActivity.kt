package com.hallo.logistics.driver

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.card.MaterialCardView
import com.hallo.logistics.driver.databinding.ActivityDriverEarningsBinding
import java.text.NumberFormat
import java.time.ZoneId
import java.util.Locale
import kotlinx.coroutines.launch

class DriverEarningsActivity:DriverLocalizedActivity(){
    private lateinit var b:ActivityDriverEarningsBinding
    private val repo=DriverEarningsRepository()
    private var summary:DriverEarningsSummary?=null

    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        b=ActivityDriverEarningsBinding.inflate(layoutInflater)
        setContentView(b.root)
        b.closeAction.setOnClickListener{finish()}

        // The current authoritative Driver sources do not expose a per-trip payout lifecycle.
        // Do not infer Released/Pending from payment ledger events in Android.
        b.filterGroup.visibility=View.GONE
        lifecycleScope.launch{load()}
    }

    private suspend fun load(){
        b.status.setText(R.string.earnings_loading)
        runCatching{repo.summary()}.onSuccess{value->
            summary=value
            b.totalReleased.text=money(value.releasedEarningsEtb)
            b.summaryState.text=getString(
                R.string.earnings_summary_authoritative,
                value.completedTrips,
                money(value.releasedEarningsEtb),
                money(value.commissionChargedEtb),
                money(value.commissionPaidEtb),
                money(value.commissionDueEtb),
                money(value.availableDepositEtb),
            )
            b.status.text=if(value.trips.isEmpty())getString(R.string.earnings_none) else ""
            renderTrips()
        }.onFailure{b.status.setText(R.string.wallet_unavailable)}
    }

    private fun renderTrips(){
        val value=summary?:return
        b.tripList.removeAllViews()
        if(value.trips.isEmpty()){
            b.tripList.addView(TextView(this).apply{
                text=getString(R.string.earnings_none)
                textSize=13f
                gravity=Gravity.CENTER
                setTextColor(ContextCompat.getColor(this@DriverEarningsActivity,R.color.hallo_text_muted))
                setPadding(dp(12),dp(24),dp(12),dp(24))
            })
            return
        }
        value.trips.forEach{trip->b.tripList.addView(tripCard(trip))}
    }

    private fun tripCard(trip:DriverEarningsTrip):MaterialCardView{
        val date=readableDateTime(trip.completedAt)
        val payment=localizedToken(trip.paymentMethod)
        val bodyText=buildString{
            append(getString(
                R.string.earnings_trip_authoritative,
                trip.trackingId,
                localizedToken(trip.orderStatus),
                trip.pickup,
                trip.dropoff,
                money(trip.fareEtb),
                money(trip.driverGrossEtb),
                money(trip.commissionEtb),
                money(trip.driverNetEtb),
                money(trip.depositConsumedEtb),
                money(trip.depositAfterEtb),
                payment,
                date,
            ))
            trip.customerCollectedEtb?.let{
                append("\n")
                append(getString(R.string.customer_collection_format,money(it)))
            }
        }
        val body=TextView(this).apply{
            text=bodyText
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
        val content=LinearLayout(this).apply{
            orientation=LinearLayout.VERTICAL
            setPadding(dp(16),dp(14),dp(16),dp(14))
            addView(body)
            addView(action)
        }
        return MaterialCardView(this).apply{
            radius=dp(16).toFloat()
            cardElevation=0f
            strokeWidth=dp(1)
            strokeColor=ContextCompat.getColor(this@DriverEarningsActivity,R.color.hallo_border)
            setCardBackgroundColor(ContextCompat.getColor(this@DriverEarningsActivity,android.R.color.white))
            addView(content)
            layoutParams=LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,LinearLayout.LayoutParams.WRAP_CONTENT).apply{topMargin=dp(10)}
            isClickable=true
            isFocusable=true
            setOnClickListener{
                startActivity(Intent(this@DriverEarningsActivity,DriverCommunicationsActivity::class.java)
                    .putExtra(DriverCommunicationsActivity.EXTRA_MODE,DriverCommunicationMode.CUSTOMER.name)
                    .putExtra(DriverCommunicationsActivity.EXTRA_ORDER_ID,trip.orderId))
            }
        }
    }

    private fun currentLocale():Locale=resources.configuration.locales[0]?:Locale.getDefault()
    private fun readableDateTime(value:String?):String=DriverPresentation.formatDateTime(value,currentLocale(),ZoneId.systemDefault())?:getString(R.string.data_unavailable)
    private fun money(value:Double?):String=if(value==null)getString(R.string.data_unavailable) else "ETB "+NumberFormat.getNumberInstance(currentLocale()).apply{minimumFractionDigits=2;maximumFractionDigits=2}.format(value)
    private fun localizedToken(value:String?):String=when(value?.lowercase()){
        "accepted"->getString(R.string.status_accepted)
        "in_transit"->getString(R.string.status_in_transit)
        "delivered"->getString(R.string.status_delivered)
        "cash_received"->getString(R.string.cash_received)
        "bank_telebirr"->getString(R.string.bank_telebirr)
        "payment_not_received"->getString(R.string.payment_not_received)
        null,""->getString(R.string.payment_method_unknown)
        else->DriverPresentation.humanizeToken(value)?:getString(R.string.data_unavailable)
    }
    private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
}
