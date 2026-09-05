package com.hallo.logistics.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hallo.logistics.core.session.SessionCoordinator
import com.hallo.logistics.data.repository.SupabaseSessionRepository
import com.hallo.logistics.domain.model.MobileAccess
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AuthUiState(val loading: Boolean = true, val access: MobileAccess = MobileAccess.SIGNED_OUT, val error: String? = null)
class AuthViewModel(private val coordinator: SessionCoordinator = SessionCoordinator(SupabaseSessionRepository())) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()
    init { restore() }
    fun restore() = viewModelScope.launch { _state.value = AuthUiState(loading = true); _state.value = AuthUiState(false, coordinator.restore()) }
    fun signIn(email: String, password: String) = viewModelScope.launch { _state.value = AuthUiState(true); _state.value = runCatching { AuthUiState(false, coordinator.login(email, password)) }.getOrElse { AuthUiState(false, MobileAccess.SIGNED_OUT, it.message ?: "Sign in failed") } }
    fun signOut() = viewModelScope.launch { runCatching { coordinator.logout() }; _state.value = AuthUiState(false, MobileAccess.SIGNED_OUT) }
}
