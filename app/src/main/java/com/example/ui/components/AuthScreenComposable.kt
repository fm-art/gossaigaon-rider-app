package com.example.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.domain.RiderDomainLogic
import com.example.ui.theme.LocalFleetColors
import com.example.viewmodel.FleetUiState

@Composable
fun AuthScreenComposable(
    state: FleetUiState,
    onSignIn: (String, String) -> Unit,
    onRegister: (String, String, String, String, String, String) -> Unit,
    onForgotPassword: (String) -> Unit,
    onResendVerification: () -> Unit,
    onCheckVerified: () -> Unit,
    onSignOutVerification: () -> Unit,
    onGoogleDirectLogin: (String, String) -> Unit,
    onToggleDarkMode: () -> Unit,
    onClearMessages: () -> Unit
) {
    val ext = LocalFleetColors.current
    var authTab by remember { mutableStateOf("login") }
    var forgotPasswordOpen by remember { mutableStateOf(false) }
    var showGoogleSheet by remember { mutableStateOf(false) }
    var googleEmailInput by remember { mutableStateOf("") }
    var googleNameInput by remember { mutableStateOf("") }

    var loginEmail by remember { mutableStateOf("") }
    var loginPassword by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }

    var resetEmail by remember { mutableStateOf("") }

    var signupName by remember { mutableStateOf("") }
    var signupEmail by remember { mutableStateOf("") }
    var signupPhone by remember { mutableStateOf("") }
    var signupUpi by remember { mutableStateOf("") }
    var signupVehicle by remember { mutableStateOf("") }
    var signupPassword by remember { mutableStateOf("") }

    val pwStrength = remember(signupPassword) {
        RiderDomainLogic.validatePasswordStrength(signupPassword)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 18.dp, vertical = 12.dp),
        contentAlignment = Alignment.TopCenter
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 520.dp)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Top Dark Mode / Light Mode Quick Switcher Row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = RoundedCornerShape(50),
                    color = ext.infoContainer,
                    modifier = Modifier.border(1.dp, ext.info.copy(alpha = 0.4f), RoundedCornerShape(50))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.VerifiedUser,
                            contentDescription = "Scam Shield",
                            tint = ext.info,
                            modifier = Modifier.size(15.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = "KOTLIN NATIVE v2.4",
                            style = MaterialTheme.typography.labelSmall,
                            color = ext.info
                        )
                    }
                }

                OutlinedButton(
                    onClick = onToggleDarkMode,
                    shape = RoundedCornerShape(50),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    modifier = Modifier.testTag("auth_dark_light_toggle")
                ) {
                    Icon(
                        imageVector = if (state.isDarkMode) Icons.Default.LightMode else Icons.Default.DarkMode,
                        contentDescription = "Toggle Dark or Light Mode",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = if (state.isDarkMode) "Light Mode" else "Dark Mode",
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }

            // Hero Header Card
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MaterialTheme.shapes.large)
                    .background(ext.heroGradient)
                    .border(1.dp, ext.borderStrong.copy(alpha = 0.5f), MaterialTheme.shapes.large)
                    .padding(22.dp)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Box(
                        modifier = Modifier
                            .size(62.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.18f))
                            .border(2.dp, MaterialTheme.colorScheme.primary, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.TwoWheeler,
                            contentDescription = "Rider Bike",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(34.dp)
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = "Gossaigaon Fleet",
                        style = MaterialTheme.typography.headlineLarge,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Tactical Multi-Store Rider Cockpit · Anti-Scam & Live GPS",
                        style = MaterialTheme.typography.bodySmall,
                        color = ext.textMuted,
                        textAlign = TextAlign.Center
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // Main Auth Card
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, ext.borderSubtle, MaterialTheme.shapes.large),
                shape = MaterialTheme.shapes.large,
                color = ext.cardElevated
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    if (state.pendingVerificationEmail != null) {
                        // Email Verification Panel
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(42.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(ext.infoContainer),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.MarkEmailRead,
                                    contentDescription = "Verify Email",
                                    tint = ext.info
                                )
                            }
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = "Verify Your Email",
                                    style = MaterialTheme.typography.titleLarge,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = state.pendingVerificationEmail,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = ext.textMuted
                                )
                            }
                        }

                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = "To protect your rider payouts and trip OTPs, open the verification link sent to your email inbox before entering the terminal.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = ext.textMuted
                        )

                        if (state.authNotice.isNotBlank()) {
                            Spacer(Modifier.height(10.dp))
                            BannerBox(text = state.authNotice, color = ext.success, bg = ext.successContainer)
                        }
                        if (state.authError.isNotBlank()) {
                            Spacer(Modifier.height(10.dp))
                            BannerBox(text = state.authError, color = ext.danger, bg = ext.dangerContainer)
                        }

                        Spacer(Modifier.height(14.dp))
                        Button(
                            onClick = onCheckVerified,
                            enabled = !state.authLoading,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp)
                                .testTag("check_email_verified_btn")
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(if (state.authLoading) "Checking Status..." else "I've Verified — Continue")
                        }

                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(
                            onClick = onResendVerification,
                            enabled = !state.authLoading && state.resendCooldownSec == 0,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                                .testTag("resend_verification_btn")
                        ) {
                            Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(
                                if (state.resendCooldownSec > 0) {
                                    "Resend Link in ${state.resendCooldownSec}s"
                                } else {
                                    "Resend Verification Email"
                                }
                            )
                        }

                        Spacer(Modifier.height(8.dp))
                        TextButton(
                            onClick = onSignOutVerification,
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("cancel_verification_btn")
                        ) {
                            Icon(Icons.Default.ArrowBack, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Use Another Account")
                        }
                    } else if (forgotPasswordOpen) {
                        // Forgot Password Panel
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(42.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(ext.infoContainer),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Key,
                                    contentDescription = "Reset Password",
                                    tint = ext.info
                                )
                            }
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = "Reset Password",
                                    style = MaterialTheme.typography.titleLarge,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = "Receive a secure Firebase reset link",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = ext.textMuted
                                )
                            }
                        }

                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = "Enter your registered rider email address. We will send you a password reset link.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = ext.textMuted
                        )

                        if (state.authNotice.isNotBlank()) {
                            Spacer(Modifier.height(10.dp))
                            BannerBox(text = state.authNotice, color = ext.success, bg = ext.successContainer)
                        }
                        if (state.authError.isNotBlank()) {
                            Spacer(Modifier.height(10.dp))
                            BannerBox(text = state.authError, color = ext.danger, bg = ext.dangerContainer)
                        }

                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = resetEmail,
                            onValueChange = { resetEmail = it },
                            label = { Text("Registered Email") },
                            placeholder = { Text("rider@gossaigaonbazar.com") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("reset_password_email_input")
                        )

                        Spacer(Modifier.height(14.dp))
                        Button(
                            onClick = { onForgotPassword(resetEmail) },
                            enabled = !state.authLoading && state.resetCooldownSec == 0,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp)
                                .testTag("send_reset_link_btn")
                        ) {
                            Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(
                                when {
                                    state.authLoading -> "Sending Reset Link..."
                                    state.resetCooldownSec > 0 -> "Resend Link in ${state.resetCooldownSec}s"
                                    else -> "Send Reset Link"
                                }
                            )
                        }

                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(
                            onClick = {
                                onClearMessages()
                                forgotPasswordOpen = false
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                                .testTag("back_to_login_btn")
                        ) {
                            Icon(Icons.Default.ArrowBack, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Back to Sign In")
                        }
                    } else {
                        // Sign In / Register Tabs
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(ext.cardSubtle)
                                .padding(4.dp)
                        ) {
                            listOf("login" to "Sign In", "signup" to "Register Rider").forEach { (key, label) ->
                                val active = authTab == key
                                val bg by animateColorAsState(
                                    if (active) MaterialTheme.colorScheme.primary else Color.Transparent,
                                    label = "tabBg"
                                )
                                val fg by animateColorAsState(
                                    if (active) MaterialTheme.colorScheme.onPrimary else ext.textMuted,
                                    label = "tabFg"
                                )
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(bg)
                                        .clickable {
                                            onClearMessages()
                                            authTab = key
                                        }
                                        .padding(vertical = 10.dp)
                                        .testTag("tab_${key}_btn"),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = label,
                                        style = MaterialTheme.typography.labelLarge,
                                        color = fg
                                    )
                                }
                            }
                        }

                        Spacer(Modifier.height(14.dp))

                        if (state.lockRemainingSec > 0 && authTab == "login") {
                            BannerBox(
                                text = "Brute-force protection active — wait ${state.lockRemainingSec}s before retrying.",
                                color = ext.danger,
                                bg = ext.dangerContainer
                            )
                            Spacer(Modifier.height(10.dp))
                        }

                        if (state.authNotice.isNotBlank()) {
                            BannerBox(text = state.authNotice, color = ext.success, bg = ext.successContainer)
                            Spacer(Modifier.height(10.dp))
                        }
                        if (state.authError.isNotBlank()) {
                            BannerBox(text = state.authError, color = ext.danger, bg = ext.dangerContainer)
                            Spacer(Modifier.height(10.dp))
                        }

                        if (authTab == "login") {
                            OutlinedTextField(
                                value = loginEmail,
                                onValueChange = { loginEmail = it },
                                label = { Text("Registered Email") },
                                placeholder = { Text("bipin@gossaigaonbazar.com") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                                leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("login_email_input")
                            )

                            Spacer(Modifier.height(10.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Password",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = ext.textMuted
                                )
                                TextButton(
                                    onClick = {
                                        onClearMessages()
                                        resetEmail = loginEmail.trim()
                                        forgotPasswordOpen = true
                                    },
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp),
                                    modifier = Modifier.testTag("forgot_password_btn")
                                ) {
                                    Text(
                                        text = "Forgot Password?",
                                        style = MaterialTheme.typography.labelLarge,
                                        color = MaterialTheme.colorScheme.secondary
                                    )
                                }
                            }

                            OutlinedTextField(
                                value = loginPassword,
                                onValueChange = { loginPassword = it },
                                placeholder = { Text("••••••••") },
                                singleLine = true,
                                visualTransformation = if (showPassword) {
                                    VisualTransformation.None
                                } else {
                                    PasswordVisualTransformation()
                                },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                                trailingIcon = {
                                    IconButton(onClick = { showPassword = !showPassword }) {
                                        Icon(
                                            imageVector = if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                            contentDescription = "Toggle password visibility"
                                        )
                                    }
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("login_password_input")
                            )

                            Spacer(Modifier.height(16.dp))

                            Button(
                                onClick = { onSignIn(loginEmail, loginPassword) },
                                enabled = !state.authLoading && state.lockRemainingSec == 0,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(52.dp)
                                    .testTag("login_submit_button")
                            ) {
                                Icon(Icons.Default.Shield, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = when {
                                        state.lockRemainingSec > 0 -> "Locked (${state.lockRemainingSec}s)"
                                        state.authLoading -> "Authenticating..."
                                        else -> "Start Protected Shift"
                                    },
                                    style = MaterialTheme.typography.titleMedium
                                )
                            }
                        } else {
                            // Register Rider Form
                            OutlinedTextField(
                                value = signupName,
                                onValueChange = { signupName = it },
                                label = { Text("Rider Full Name") },
                                placeholder = { Text("e.g. Bipin Brahma") },
                                singleLine = true,
                                leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("signup_name_input")
                            )
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = signupEmail,
                                onValueChange = { signupEmail = it },
                                label = { Text("Email Address") },
                                placeholder = { Text("rider@gmail.com") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                                leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("signup_email_input")
                            )
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = signupPhone,
                                onValueChange = { signupPhone = it.filter { ch -> ch.isDigit() }.take(10) },
                                label = { Text("10-Digit Mobile Number") },
                                placeholder = { Text("9876543210") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                                leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("signup_phone_input")
                            )
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = signupUpi,
                                onValueChange = { signupUpi = it },
                                label = { Text("Verified UPI ID for Payouts") },
                                placeholder = { Text("9876543210@paytm") },
                                singleLine = true,
                                leadingIcon = { Icon(Icons.Default.AccountBalanceWallet, contentDescription = null) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("signup_upi_input")
                            )
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = signupVehicle,
                                onValueChange = { signupVehicle = it },
                                label = { Text("Vehicle (Bike / Scooter)") },
                                placeholder = { Text("Hero Splendor - AS-16-XXXX") },
                                singleLine = true,
                                leadingIcon = { Icon(Icons.Default.TwoWheeler, contentDescription = null) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("signup_vehicle_input")
                            )
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = signupPassword,
                                onValueChange = { signupPassword = it },
                                label = {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text("Strong Password")
                                        if (signupPassword.isNotEmpty()) {
                                            Spacer(Modifier.width(8.dp))
                                            Text(
                                                text = "• ${pwStrength.label}",
                                                color = if (pwStrength.valid) ext.success else ext.warning,
                                                fontWeight = FontWeight.Bold
                                            )
                                        }
                                    }
                                },
                                singleLine = true,
                                visualTransformation = PasswordVisualTransformation(),
                                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("signup_password_input")
                            )

                            Spacer(Modifier.height(14.dp))
                            Button(
                                onClick = {
                                    onRegister(
                                        signupName,
                                        signupEmail,
                                        signupPhone,
                                        signupUpi,
                                        signupVehicle,
                                        signupPassword
                                    )
                                },
                                enabled = !state.authLoading,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(52.dp)
                                    .testTag("signup_submit_button")
                            ) {
                                Icon(Icons.Default.Badge, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("Register Rider Account", style = MaterialTheme.typography.titleMedium)
                            }
                        }

                        // Divider
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            HorizontalDivider(modifier = Modifier.weight(1f), color = ext.borderSubtle)
                            Text(
                                text = "  OR DIRECT ACCESS  ",
                                style = MaterialTheme.typography.labelSmall,
                                color = ext.textMuted
                            )
                            HorizontalDivider(modifier = Modifier.weight(1f), color = ext.borderSubtle)
                        }

                        // Direct Google Sign-In Button
                        Button(
                            onClick = { showGoogleSheet = true },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color.White,
                                contentColor = Color(0xFF0F172A)
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp)
                                .border(1.dp, ext.borderStrong, MaterialTheme.shapes.medium)
                                .testTag("google_login_btn")
                        ) {
                            Icon(
                                imageVector = Icons.Default.AccountCircle,
                                contentDescription = "Google",
                                tint = Color(0xFFEA4335),
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                text = "Continue with Google",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.ExtraBold),
                                color = Color(0xFF0F172A)
                            )
                        }

                        if (showGoogleSheet) {
                            AlertDialog(
                                onDismissRequest = { showGoogleSheet = false },
                                title = { Text("Continue with Google") },
                                text = {
                                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text(
                                            text = "Enter your Google account details to sign in to Gossaigaon Fleet:",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = ext.textMuted
                                        )
                                        OutlinedTextField(
                                            value = googleNameInput,
                                            onValueChange = { googleNameInput = it },
                                            label = { Text("Your Name") },
                                            singleLine = true,
                                            modifier = Modifier.fillMaxWidth()
                                        )
                                        OutlinedTextField(
                                            value = googleEmailInput,
                                            onValueChange = { googleEmailInput = it },
                                            label = { Text("Google Email") },
                                            placeholder = { Text("name@gmail.com") },
                                            singleLine = true,
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                                            modifier = Modifier.fillMaxWidth()
                                        )
                                    }
                                },
                                confirmButton = {
                                    Button(
                                        onClick = {
                                            showGoogleSheet = false
                                            onGoogleDirectLogin(googleEmailInput, googleNameInput)
                                        }
                                    ) {
                                        Text("Continue")
                                    }
                                },
                                dismissButton = {
                                    TextButton(onClick = { showGoogleSheet = false }) {
                                        Text("Cancel")
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun BannerBox(text: String, color: Color, bg: Color) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(bg)
            .border(1.dp, color.copy(alpha = 0.45f), RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
            color = color
        )
    }
}
