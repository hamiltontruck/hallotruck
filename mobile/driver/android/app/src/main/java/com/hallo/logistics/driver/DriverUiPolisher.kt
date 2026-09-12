package com.hallo.logistics.driver

import android.content.Intent
import android.graphics.Typeface
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.widget.addTextChangedListener
import com.google.android.material.button.MaterialButton
import kotlin.math.roundToInt

object DriverUiPolisher {
    private const val PROFILE_AVATAR_TAG = "driver-profile-avatar"
    private const val TRIP_MESSAGES_TAG = "driver-trip-messages"
    private const val WALLET_SETTLEMENT_TAG = "driver-wallet-settlement"
    private const val WALLET_EARNINGS_TAG = "driver-wallet-earnings"
    private const val WALLET_SUPPORT_TAG = "driver-wallet-support"
    private const val PROFILE_OPERATIONS_TAG = "driver-profile-operations"

    fun install(activity: AppCompatActivity) {
        polishHeader(activity)
        polishTripMap(activity)
        polishProfile(activity)
        val content=activity.findViewById<ViewGroup>(android.R.id.content)
        val root=content?.getChildAt(0)
        if(root!=null)DriverPortalParityUi.apply(root)
        installCommunicationsActions(activity)
    }

    private fun polishHeader(activity: AppCompatActivity) {
        val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return
        val root = content.getChildAt(0) as? ViewGroup ?: return
        val header = root.getChildAt(0) as? ViewGroup ?: return
        val logo = header.getChildAt(0) as? ImageView ?: return
        logo.apply {
            setImageResource(R.drawable.hallo_logistics_logo)
            imageTintList = null
            scaleType = ImageView.ScaleType.FIT_CENTER
            setPadding(0, 0, 0, 0)
            layoutParams = layoutParams.apply {
                width = dp(activity, 58)
                height = dp(activity, 44)
            }
        }
    }

    private fun polishTripMap(activity: AppCompatActivity) {
        val map = activity.findViewById<LiveTripMapView>(R.id.liveTripMap) ?: return
        val metrics = activity.resources.displayMetrics
        val target = (metrics.heightPixels * 0.44f).roundToInt()
            .coerceIn(dp(activity, 290), dp(activity, 430))
        map.apply {
            setBackgroundResource(R.drawable.bg_map)
            layoutParams = layoutParams.apply { height = target }
            elevation = 0f
            clipToOutline = true
        }
    }

    private fun polishProfile(activity: AppCompatActivity) {
        val page = activity.findViewById<LinearLayout>(R.id.pageProfile) ?: return
        val details = activity.findViewById<TextView>(R.id.profileDetails) ?: return
        val avatar = ensureProfileAvatar(activity, page)
        updateAvatar(activity, avatar, details.text)
        details.addTextChangedListener { text -> updateAvatar(activity, avatar, text) }
    }

    private fun installCommunicationsActions(activity:AppCompatActivity){
        activity.findViewById<LinearLayout>(R.id.tripActions)?.let{host->
            ensureAction(activity,host,TRIP_MESSAGES_TAG,R.string.comms_message_customer,null){
                activity.startActivity(Intent(activity,DriverCommunicationsActivity::class.java).putExtra(DriverCommunicationsActivity.EXTRA_MODE,DriverCommunicationMode.CUSTOMER.name))
            }
        }
        activity.findViewById<LinearLayout>(R.id.pageWallet)?.let{host->
            ensureAction(activity,host,WALLET_SETTLEMENT_TAG,R.string.settlement_pay_title,2){
                activity.startActivity(Intent(activity,DriverCommissionSettlementActivity::class.java))
            }
            ensureAction(activity,host,WALLET_EARNINGS_TAG,R.string.earnings_open_action,3){
                activity.startActivity(Intent(activity,DriverEarningsActivity::class.java))
            }
            ensureAction(activity,host,WALLET_SUPPORT_TAG,R.string.comms_open_messages,4){
                activity.startActivity(Intent(activity,DriverCommunicationsActivity::class.java).putExtra(DriverCommunicationsActivity.EXTRA_MODE,DriverCommunicationMode.CUSTOMER.name))
            }
        }
        activity.findViewById<LinearLayout>(R.id.pageProfile)?.let{host->
            ensureAction(activity,host,PROFILE_OPERATIONS_TAG,R.string.comms_message_operations,3){
                activity.startActivity(Intent(activity,DriverCommunicationsActivity::class.java).putExtra(DriverCommunicationsActivity.EXTRA_MODE,DriverCommunicationMode.OPERATIONS.name))
            }
        }
    }

    private fun ensureAction(activity:AppCompatActivity,host:LinearLayout,tagValue:String,label:Int,index:Int?,onClick:()->Unit){
        if(host.findViewWithTag<MaterialButton>(tagValue)!=null)return
        val button=MaterialButton(activity,null,com.google.android.material.R.attr.materialButtonOutlinedStyle).apply{
            tag=tagValue
            setText(label)
            isAllCaps=false
            minHeight=dp(activity,52)
            setOnClickListener{onClick()}
            layoutParams=LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,dp(activity,52)).apply{topMargin=dp(activity,10)}
        }
        if(index==null||index>=host.childCount)host.addView(button) else host.addView(button,index)
    }

    private fun ensureProfileAvatar(activity: AppCompatActivity, page: LinearLayout): TextView {
        page.findViewWithTag<TextView>(PROFILE_AVATAR_TAG)?.let { return it }
        return TextView(activity).apply {
            tag = PROFILE_AVATAR_TAG
            gravity = Gravity.CENTER
            text = "D"
            textSize = 28f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(ContextCompat.getColor(activity, R.color.hallo_navy))
            background = ContextCompat.getDrawable(activity, R.drawable.bg_profile_avatar)
            layoutParams = LinearLayout.LayoutParams(dp(activity, 88), dp(activity, 88)).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                topMargin = dp(activity, 18)
                bottomMargin = dp(activity, 4)
            }
            page.addView(this, 2)
        }
    }

    private fun updateAvatar(activity: AppCompatActivity, avatar: TextView, profileText: CharSequence?) {
        val firstLine = profileText?.toString()?.lineSequence()?.firstOrNull().orEmpty()
        val displayName = firstLine.substringAfter(':', firstLine).trim()
        avatar.text = displayName.firstOrNull()?.uppercaseChar()?.toString() ?: "D"
        avatar.contentDescription = displayName.ifBlank { activity.getString(R.string.profile) }
    }

    private fun dp(activity: AppCompatActivity, value: Int): Int =
        (value * activity.resources.displayMetrics.density).roundToInt()
}
