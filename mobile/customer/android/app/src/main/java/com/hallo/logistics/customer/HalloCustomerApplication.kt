package com.hallo.logistics.customer

import android.app.Activity
import android.app.Application
import android.content.res.Configuration
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.launch
import java.lang.ref.WeakReference

class HalloCustomerApplication : Application(), Application.ActivityLifecycleCallbacks {
    private var activeMainActivity = WeakReference<MainActivity>(null)

    override fun onCreate() {
        super.onCreate()
        registerActivityLifecycleCallbacks(this)
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
        if (activity !is MainActivity) return
        activeMainActivity = WeakReference(activity)
        val host = activity as AppCompatActivity
        val viewModel = ViewModelProvider(host)[CustomerViewModel::class.java]
        val status = host.findViewById<TextView>(R.id.status)
        val page = host.findViewById<LinearLayout>(R.id.pageProfile)
        val details = host.findViewById<TextView>(R.id.profileDetails)
        val ordersList = host.findViewById<LinearLayout>(R.id.ordersList)
        val avatarController = CustomerAvatarController(host, viewModel) { status?.text = it }
        val completionController = CustomerCompletionController(
            activity = host,
            viewModel = viewModel,
            setStatus = { message -> status?.text = message },
        )

        host.lifecycleScope.launch {
            host.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.state.collect { state ->
                    page?.post {
                        avatarController.render(state.profile, state.profileAvatarUrl, page, details, state.busy)
                        when (state.message) {
                            "Uploading profile photo…" -> status?.text = host.getString(R.string.profile_photo_uploading)
                            "Removing profile photo…" -> status?.text = host.getString(R.string.profile_photo_removing)
                            "Profile photo updated" -> status?.text = host.getString(R.string.profile_photo_updated)
                            "Profile photo removed" -> status?.text = host.getString(R.string.profile_photo_removed)
                        }
                    }
                    ordersList?.let { completionController.render(state, it) }
                }
            }
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val activity = activeMainActivity.get() ?: return
        if (activity.isFinishing || activity.isDestroyed) return
        activity.window.decorView.post {
            if (activity.isFinishing || activity.isDestroyed) return@post
            val viewModel = ViewModelProvider(activity)[CustomerViewModel::class.java]
            // Re-emit the current page so every visible label is rebound from the new locale
            // without destroying/recreating the Activity (which caused the long black screen).
            viewModel.show(viewModel.state.value.page)
        }
    }

    override fun onActivityStarted(activity: Activity) = Unit
    override fun onActivityResumed(activity: Activity) {
        if (activity is MainActivity) activeMainActivity = WeakReference(activity)
    }
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivityStopped(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) {
        if (activeMainActivity.get() === activity) activeMainActivity.clear()
    }
}
