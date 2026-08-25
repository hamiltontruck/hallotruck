package com.hallo.logistics

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Route
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonPrimitive

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { HalloTheme { HalloApp() } }
    }
}

private enum class SessionState { Loading, SignedOut, Driver, Forbidden }
private enum class DriverTab(val label: String, val icon: ImageVector) {
    Jobs("Jobs", Icons.Outlined.LocalShipping),
    Trip("Active Trip", Icons.Outlined.Route),
    Wallet("Wallet", Icons.Outlined.AccountBalanceWallet),
    Documents("Documents", Icons.Outlined.Description),
    Profile("Profile", Icons.Outlined.Person),
}

@Composable
private fun HalloApp() {
    var sessionState by remember { mutableStateOf(SessionState.Loading) }
    val scope = rememberCoroutineScope()

    suspend fun refreshSession() {
        val user = HalloSupabase.client.auth.currentUserOrNull()
        if (user == null) {
            sessionState = SessionState.SignedOut
            return
        }
        val role = user.userMetadata?.get("role")?.jsonPrimitive?.content
            ?: user.appMetadata?.get("role")?.jsonPrimitive?.content
        sessionState = if (role.equals("driver", ignoreCase = true)) SessionState.Driver else SessionState.Forbidden
    }

    LaunchedEffect(Unit) { refreshSession() }

    when (sessionState) {
        SessionState.Loading -> LoadingScreen()
        SessionState.SignedOut -> DriverLoginScreen(
            onSignedIn = { scope.launch { refreshSession() } },
        )
        SessionState.Driver -> DriverDashboard(
            onSignOut = {
                scope.launch {
                    HalloSupabase.client.auth.signOut()
                    sessionState = SessionState.SignedOut
                }
            },
        )
        SessionState.Forbidden -> ForbiddenScreen(
            onSignOut = {
                scope.launch {
                    HalloSupabase.client.auth.signOut()
                    sessionState = SessionState.SignedOut
                }
            },
        )
    }
}

@Composable
private fun DriverLoginScreen(onSignedIn: () -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 40.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text("HALLO", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Text("Driver login", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Text(
                "Secure access for approved HALLO drivers.",
                modifier = Modifier.padding(top = 8.dp, bottom = 28.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = email,
                onValueChange = { email = it.trim() },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Email") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            )
            Spacer(Modifier.height(14.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Password") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            )
            error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 14.dp))
            }
            Button(
                onClick = {
                    scope.launch {
                        busy = true
                        error = null
                        runCatching {
                            check(HalloSupabase.isConfigured) { "Supabase configuration is missing." }
                            HalloSupabase.client.auth.signInWith(Email) {
                                this.email = email
                                this.password = password
                            }
                        }.onSuccess { onSignedIn() }
                            .onFailure { error = it.message ?: "Sign in failed." }
                        busy = false
                    }
                },
                enabled = !busy && email.isNotBlank() && password.length >= 6,
                modifier = Modifier.fillMaxWidth().padding(top = 22.dp),
                contentPadding = PaddingValues(vertical = 15.dp),
            ) {
                if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                else Text("Open driver workspace")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DriverDashboard(onSignOut: () -> Unit) {
    var selected by rememberSaveable { mutableStateOf(DriverTab.Jobs) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("HALLO Driver", fontWeight = FontWeight.Bold)
                        Text(selected.label, style = MaterialTheme.typography.labelMedium)
                    }
                },
                actions = { OutlinedButton(onClick = onSignOut) { Text("Sign out") } },
            )
        },
        bottomBar = {
            NavigationBar {
                DriverTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = selected == tab,
                        onClick = { selected = tab },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { padding ->
        DashboardTab(selected, Modifier.padding(padding))
    }
}

@Composable
private fun DashboardTab(tab: DriverTab, modifier: Modifier = Modifier) {
    val description = when (tab) {
        DriverTab.Jobs -> "Approved jobs assigned to this driver will appear here."
        DriverTab.Trip -> "The current trip, route progress, GPS controls and delivery actions will appear here."
        DriverTab.Wallet -> "Verified earnings, commission and wallet transactions will appear here."
        DriverTab.Documents -> "License, vehicle documents and compliance status will appear here."
        DriverTab.Profile -> "Driver identity and account settings will appear here."
    }
    Box(modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(tab.icon, contentDescription = null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary)
            Text(tab.label, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp))
            Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            Text("No production records loaded.", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 18.dp))
        }
    }
}

@Composable
private fun ForbiddenScreen(onSignOut: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Driver access required", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text("This account is not authorized for the driver application.", modifier = Modifier.padding(top = 8.dp))
            Button(onClick = onSignOut, modifier = Modifier.padding(top = 20.dp)) { Text("Return to login") }
        }
    }
}

@Composable
private fun LoadingScreen() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
private fun HalloTheme(content: @Composable () -> Unit) {
    val colors = MaterialTheme.colorScheme.copy(
        primary = Color(0xFFB56A1D),
        secondary = Color(0xFF176B57),
        background = Color(0xFFF6F4EE),
        surface = Color(0xFFFFFFFF),
    )
    MaterialTheme(colorScheme = colors, content = content)
}
