package com.hallo.logistics.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hallo.logistics.HalloSupabase
import com.hallo.logistics.auth.AuthRepository
import com.hallo.logistics.auth.MobileIdentity
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface MainUiState {
    data object Loading : MainUiState
    data object SignedOut : MainUiState
    data class SignedIn(val identity: MobileIdentity) : MainUiState
    data object Unauthorized : MainUiState
    data class Error(val message: String) : MainUiState
}

class MainViewModel(
    private val authRepository: AuthRepository = AuthRepository(),
) : ViewModel() {
    private val _state = MutableStateFlow<MainUiState>(MainUiState.Loading)
    val state: StateFlow<MainUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            if (!HalloSupabase.isConfigured) {
                _state.value = MainUiState.Error("Supabase configuration is missing.")
                return@launch
            }
            _state.value = MainUiState.Loading
            runCatching { authRepository.currentIdentity() }
                .onSuccess { identity ->
                    _state.value = when {
                        identity == null && HalloSupabase.client.auth.currentUserOrNull() == null -> MainUiState.SignedOut
                        identity == null -> MainUiState.Unauthorized
                        else -> MainUiState.SignedIn(identity)
                    }
                }
                .onFailure { _state.value = MainUiState.Error(it.message ?: "Unable to load account.") }
        }
    }

    fun signIn(email: String, password: String) {
        viewModelScope.launch {
            _state.value = MainUiState.Loading
            runCatching { authRepository.signIn(email, password) }
                .onSuccess { refresh() }
                .onFailure { _state.value = MainUiState.Error(it.message ?: "Sign in failed.") }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            runCatching { authRepository.signOut() }
                .onSuccess { _state.value = MainUiState.SignedOut }
                .onFailure { _state.value = MainUiState.Error(it.message ?: "Sign out failed.") }
        }
    }
}