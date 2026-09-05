package com.hallo.logistics

import android.os.Bundle
import android.view.View
import android.widget.Button
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.hallo.logistics.databinding.ActivityMainBinding
import com.hallo.logistics.domain.model.MobileAccess
import com.hallo.logistics.ui.auth.AuthViewModel
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private val vm: AuthViewModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater); setContentView(binding.root)
        binding.signIn.setOnClickListener { vm.signIn(binding.email.text?.toString().orEmpty().trim(), binding.password.text?.toString().orEmpty()) }
        binding.signOut.setOnClickListener { vm.signOut() }
        lifecycleScope.launch { repeatOnLifecycle(Lifecycle.State.STARTED) { vm.state.collect(::render) } }
    }
    private fun render(state: com.hallo.logistics.ui.auth.AuthUiState) {
        binding.progress.visibility = if (state.loading) View.VISIBLE else View.GONE
        binding.loginPanel.visibility = if (!state.loading && state.access == MobileAccess.SIGNED_OUT) View.VISIBLE else View.GONE
        val destinations = when (state.access) {
            MobileAccess.CUSTOMER -> listOf("Home", "Orders", "Tracking", "Payments", "Profile")
            MobileAccess.DRIVER -> listOf("Home", "Available Jobs", "Accepted Jobs", "Active Trip", "Live Tracking", "Delivery Proof", "Wallet", "Driver Documents", "Vehicle Documents", "Notifications", "Profile")
            else -> emptyList()
        }
        binding.shell.visibility = if (destinations.isNotEmpty()) View.VISIBLE else View.GONE
        binding.signOut.visibility = if (!state.loading && state.access != MobileAccess.SIGNED_OUT) View.VISIBLE else View.GONE
        binding.destinations.removeAllViews()
        destinations.forEach { label -> binding.destinations.addView(Button(this).apply { text = label; isAllCaps = false; isEnabled = false }) }
        binding.status.text = state.error ?: when (state.access) {
            MobileAccess.CUSTOMER -> "Authorized customer workspace"
            MobileAccess.DRIVER -> "Authorized driver workspace"
            MobileAccess.DRIVER_PENDING -> "Driver verification pending"
            MobileAccess.DRIVER_REJECTED -> "Driver verification rejected"
            MobileAccess.FORBIDDEN -> "This account is not authorized for HALLO Customer/Driver mobile access."
            MobileAccess.SIGNED_OUT -> "Sign in with your HALLO account"
        }
    }
}
