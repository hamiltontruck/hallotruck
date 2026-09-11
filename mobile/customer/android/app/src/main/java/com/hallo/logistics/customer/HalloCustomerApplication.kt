package com.hallo.logistics.customer

import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.launch

class HalloCustomerApplication : Application(), Application.ActivityLifecycleCallbacks {
    override fun onCreate() {
        super.onCreate()
        registerActivityLifecycleCallbacks(this)
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
        if (activity !is MainActivity) return
        val host = activity as AppCompatActivity
        val viewModel = ViewModelProvider(host)[CustomerViewModel::class.java]
        val status = host.findViewById<TextView>(R.id.status)
        val page = host.findViewById<LinearLayout>(R.id.pageProfile)
        val details = host.findViewById<TextView>(R.id.profileDetails)
        val controller = CustomerAvatarController(host, viewModel) { status?.text = it }

        host.lifecycleScope.launch {
            host.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.state.collect { state ->
                    page?.post {
                        controller.render(state.profile, state.profileAvatarUrl, page, details, state.busy)
                        when (state.message) {
                            "Uploading profile photo…" -> status?.text = host.getString(R.string.profile_photo_uploading)
                            "Removing profile photo…" -> status?.text = host.getString(R.string.profile_photo_removing)
                            "Profile photo updated" -> status?.text = host.getString(R.string.profile_photo_updated)
                            "Profile photo removed" -> status?.text = host.getString(R.string.profile_photo_removed)
                        }
                    }
                }
            }
        }
    }

    override fun onActivityStarted(activity: Activity) = Unit
    override fun onActivityResumed(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivityStopped(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
}
