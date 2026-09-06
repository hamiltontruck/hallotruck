package com.hallo.logistics

import android.os.Bundle
import android.content.Intent
import android.view.View
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.hallo.logistics.auth.MobileRole
import com.hallo.logistics.databinding.ActivityMainBinding
import com.hallo.logistics.databinding.ScreenSignInBinding
import com.hallo.logistics.databinding.ScreenWorkspaceBinding
import com.hallo.logistics.ui.MainUiState
import com.hallo.logistics.ui.MainViewModel
import io.github.jan.supabase.auth.handleDeeplinks
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private val viewModel: MainViewModel by viewModels()
    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        HalloSupabase.client.handleDeeplinks(intent)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.state.collect(::render)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        HalloSupabase.client.handleDeeplinks(intent)
        viewModel.refresh()
    }

    override fun onResume() {
        super.onResume()
        viewModel.refresh()
    }

    private fun render(state: MainUiState) {
        when (state) {
            MainUiState.Loading -> binding.mainContainer.removeAllViews()
            MainUiState.SignedOut -> showSignIn()
            is MainUiState.SignedIn -> showWorkspace(state)
            MainUiState.Unauthorized -> showMessage("This account is not authorized for HALLO mobile.")
            is MainUiState.Error -> showMessage(state.message)
        }
    }

    private fun showSignIn() {
        val signIn = ScreenSignInBinding.inflate(layoutInflater, binding.mainContainer, false)
        signIn.signInButton.setOnClickListener {
            viewModel.signIn(
                signIn.emailInput.text?.toString().orEmpty().trim(),
                signIn.passwordInput.text?.toString().orEmpty(),
            )
        }
        binding.mainContainer.removeAllViews()
        binding.mainContainer.addView(signIn.root)
    }

    private fun showWorkspace(state: MainUiState.SignedIn) {
        val workspace = ScreenWorkspaceBinding.inflate(layoutInflater, binding.mainContainer, false)
        workspace.workspaceTitle.text = when (state.identity.role) {
            MobileRole.CUSTOMER -> "HALLO Customer"
            MobileRole.DRIVER -> "HALLO Driver"
            MobileRole.PARTNER -> "HALLO Partner"
        }
        workspace.workspaceSubtitle.text = state.identity.fullName ?: "Signed-in workspace foundation"
        workspace.signOutButton.setOnClickListener { viewModel.signOut() }
        binding.mainContainer.removeAllViews()
        binding.mainContainer.addView(workspace.root)
    }

    private fun showMessage(message: String) {
        val view = View.inflate(this, R.layout.screen_workspace, null)
        val workspace = ScreenWorkspaceBinding.bind(view)
        workspace.workspaceTitle.text = "HALLO Logistics"
        workspace.workspaceSubtitle.text = message
        workspace.signOutButton.visibility = View.GONE
        binding.mainContainer.removeAllViews()
        binding.mainContainer.addView(view)
    }
}
