package com.example.ui.components

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import com.example.R
import com.example.model.InAppCallSession
import com.example.model.InAppCallStatus
import com.example.ui.theme.LocalFleetColors

/**
 * Full-screen real-time CallScreen (Rider to User) component showing:
 * - Status indicator (Connecting, Ringing, Connected) with visual progression
 * - Live Call Duration Timer (MM:SS)
 * - Audio level waveform visualizer & hardware controls (Speaker, Mute, Hold, Chat)
 * - Prominent 'End Call' action button
 * - Minimize-to-Trip option so riders can inspect active trip details while on the call
 */
@Composable
fun CallScreen(
    callSession: InAppCallSession,
    riderName: String = "Rider",
    onToggleMute: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onToggleHold: () -> Unit,
    onSwitchToChat: () -> Unit,
    onMinimizeToTrip: () -> Unit = {},
    onEndCall: () -> Unit,
    onAcceptIncomingCall: () -> Unit = {},
    onMicPermissionGranted: () -> Unit = {}
) {
    val ext = LocalFleetColors.current
    val context = LocalContext.current

    var hasAudioPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasAudioPermission = granted
        if (granted) {
            onMicPermissionGranted()
        }
    }

    LaunchedEffect(Unit) {
        if (!hasAudioPermission) {
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        } else {
            onMicPermissionGranted()
        }
    }

    BackHandler {
        onMinimizeToTrip()
    }

    val infiniteTransition = rememberInfiniteTransition(label = "callScreenPulse")
    val outerWaveScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.24f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "outerWaveScale"
    )
    val innerWaveScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.12f,
        animationSpec = infiniteRepeatable(
            animation = tween(850, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "innerWaveScale"
    )
    val dotAlpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(650, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "dotAlpha"
    )

    val durationFormatted = remember(callSession.durationSec) {
        formatCallTimer(callSession.durationSec)
    }

    val statusText = when {
        callSession.isOnHold -> "On Hold"
        callSession.status == InAppCallStatus.CONNECTING -> stringResource(R.string.call_status_connecting)
        callSession.status == InAppCallStatus.RINGING -> stringResource(R.string.call_status_ringing)
        callSession.status == InAppCallStatus.INCOMING_RINGING -> "Incoming Call"
        callSession.status == InAppCallStatus.CONNECTED -> stringResource(R.string.call_status_connected)
        else -> "Ended"
    }

    val statusAccentColor by animateColorAsState(
        targetValue = when {
            callSession.isOnHold -> ext.warning
            callSession.status == InAppCallStatus.CONNECTED -> ext.success
            callSession.status == InAppCallStatus.RINGING || callSession.status == InAppCallStatus.INCOMING_RINGING -> Color(0xFFFBBF24)
            else -> Color(0xFF38BDF8)
        },
        label = "statusAccentColor"
    )

    Dialog(
        onDismissRequest = onMinimizeToTrip,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color(0xFF041311),
                            Color(0xFF091B2A),
                            Color(0xFF060B14)
                        )
                    )
                )
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(horizontal = 20.dp, vertical = 18.dp)
                .testTag("call_screen_root")
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                // 1. Top Header Bar: Minimize to Active Trip + Encrypted Rider-to-User Pill + Batch Tag
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        FilledTonalButton(
                            onClick = onMinimizeToTrip,
                            colors = ButtonDefaults.filledTonalButtonColors(
                                containerColor = Color.White.copy(alpha = 0.1f),
                                contentColor = Color.White
                            ),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                            modifier = Modifier
                                .height(38.dp)
                                .testTag("minimize_call_screen_btn")
                        ) {
                            Icon(
                                imageVector = Icons.Default.KeyboardArrowDown,
                                contentDescription = "Minimize to Active Trip",
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text("Trip View", style = MaterialTheme.typography.labelMedium)
                        }

                        Surface(
                            shape = RoundedCornerShape(50),
                            color = ext.success.copy(alpha = 0.16f),
                            modifier = Modifier.border(
                                1.dp,
                                ext.success.copy(alpha = 0.45f),
                                RoundedCornerShape(50)
                            )
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Lock,
                                    contentDescription = "Encrypted In-App Call",
                                    tint = ext.success,
                                    modifier = Modifier.size(13.dp)
                                )
                                Spacer(Modifier.width(5.dp))
                                Text(
                                    text = stringResource(R.string.call_rider_to_user_title).uppercase(),
                                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                                    color = ext.success
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(14.dp))

                    // 3-Stage Status Indicator Bar (Connecting -> Ringing -> Connected)
                    CallStatusProgressStepper(
                        status = callSession.status,
                        isOnHold = callSession.isOnHold,
                        accentColor = statusAccentColor
                    )
                }

                // 2. Center Caller Section: Rider -> User Avatar, Status Badge, and Live Duration Timer
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    val dynamicMicBoost = (callSession.micLevel * 0.25f).coerceIn(0f, 0.25f)

                    Box(contentAlignment = Alignment.Center) {
                        // Outer animated pulse ring
                        Box(
                            modifier = Modifier
                                .size(144.dp)
                                .scale(outerWaveScale + dynamicMicBoost)
                                .clip(CircleShape)
                                .background(statusAccentColor.copy(alpha = 0.11f))
                        )
                        // Inner animated pulse ring
                        Box(
                            modifier = Modifier
                                .size(120.dp)
                                .scale(innerWaveScale + (dynamicMicBoost * 0.6f))
                                .clip(CircleShape)
                                .background(statusAccentColor.copy(alpha = 0.18f))
                        )
                        // Core User Avatar Circle
                        Box(
                            modifier = Modifier
                                .size(96.dp)
                                .clip(CircleShape)
                                .background(
                                    Brush.linearGradient(
                                        listOf(
                                            statusAccentColor.copy(alpha = 0.35f),
                                            Color(0xFF1E293B)
                                        )
                                    )
                                )
                                .border(2.5.dp, statusAccentColor, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Person,
                                contentDescription = "Customer Avatar",
                                tint = Color.White,
                                modifier = Modifier.size(48.dp)
                            )
                        }
                    }

                    Spacer(Modifier.height(14.dp))

                    // Rider <-> User Route Pill
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = Color.White.copy(alpha = 0.08f)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.TwoWheeler,
                                contentDescription = null,
                                tint = Color(0xFF38BDF8),
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(Modifier.width(5.dp))
                            Text(
                                text = riderName.ifBlank { "Rider" },
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFFE2E8F0)
                            )
                            Spacer(Modifier.width(6.dp))
                            Icon(
                                imageVector = Icons.Default.SwapHoriz,
                                contentDescription = null,
                                tint = statusAccentColor,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = "User #${callSession.tripId.takeLast(5).uppercase()}",
                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                                color = statusAccentColor
                            )
                        }
                    }

                    Spacer(Modifier.height(10.dp))

                    // Customer Label
                    Text(
                        text = callSession.customerLabel,
                        style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.ExtraBold),
                        color = Color.White,
                        textAlign = TextAlign.Center
                    )

                    Spacer(Modifier.height(4.dp))

                    // Drop-off Address
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                        modifier = Modifier.padding(horizontal = 16.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Place,
                            contentDescription = null,
                            tint = Color(0xFF94A3B8),
                            modifier = Modifier.size(15.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = callSession.dropAddress,
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(0xFFCBD5E1),
                            textAlign = TextAlign.Center,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    Spacer(Modifier.height(14.dp))

                    // Live Call Status Pill (Connecting / Ringing / Connected)
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = statusAccentColor.copy(alpha = 0.16f),
                        modifier = Modifier
                            .border(1.dp, statusAccentColor.copy(alpha = 0.5f), RoundedCornerShape(50))
                            .testTag("call_status_indicator")
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(9.dp)
                                    .clip(CircleShape)
                                    .background(statusAccentColor.copy(alpha = dotAlpha))
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = statusText,
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = statusAccentColor
                            )
                        }
                    }

                    Spacer(Modifier.height(12.dp))

                    // Prominent Duration Timer Card
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        color = Color(0xFF0F172A).copy(alpha = 0.85f),
                        modifier = Modifier
                            .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(18.dp))
                            .testTag("call_duration_timer")
                    ) {
                        Column(
                            modifier = Modifier.padding(horizontal = 24.dp, vertical = 10.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = durationFormatted,
                                style = MaterialTheme.typography.headlineLarge.copy(
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 32.sp,
                                    letterSpacing = 2.sp
                                ),
                                color = if (callSession.status == InAppCallStatus.CONNECTED) {
                                    Color.White
                                } else {
                                    Color.White.copy(alpha = 0.65f)
                                }
                            )
                            Text(
                                text = when (callSession.status) {
                                    InAppCallStatus.CONNECTED -> "LIVE CALL DURATION"
                                    InAppCallStatus.RINGING -> "WAITING FOR USER TO ANSWER"
                                    InAppCallStatus.INCOMING_RINGING -> "INCOMING USER CALL"
                                    else -> "ESTABLISHING VOIP BRIDGE"
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFF94A3B8)
                            )
                        }
                    }

                    Spacer(Modifier.height(10.dp))

                    // Live Microphone Equalizer & Permission Indicator
                    if (hasAudioPermission) {
                        LiveAudioLevelBars(
                            micLevel = callSession.micLevel,
                            isMuted = callSession.isMuted,
                            isConnected = callSession.status == InAppCallStatus.CONNECTED,
                            accentColor = statusAccentColor
                        )
                    } else {
                        TextButton(
                            onClick = { micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) }
                        ) {
                            Icon(Icons.Default.MicOff, contentDescription = null, tint = ext.warning)
                            Spacer(Modifier.width(6.dp))
                            Text("Allow Microphone for 2-way voice audio", color = ext.warning)
                        }
                    }
                }

                // 3. Bottom Control Dock + 'End Call' Button
                Surface(
                    shape = RoundedCornerShape(28.dp),
                    color = Color(0xFF111C2D).copy(alpha = 0.94f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(28.dp))
                ) {
                    Column(
                        modifier = Modifier.padding(vertical = 18.dp, horizontal = 16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceEvenly,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CallScreenControlIcon(
                                icon = if (callSession.isSpeakerOn) Icons.Default.VolumeUp else Icons.Default.VolumeDown,
                                label = "Speaker",
                                active = callSession.isSpeakerOn,
                                onClick = onToggleSpeaker,
                                testTag = "call_speaker_btn"
                            )

                            CallScreenControlIcon(
                                icon = if (callSession.isMuted) Icons.Default.MicOff else Icons.Default.Mic,
                                label = if (callSession.isMuted) "Muted" else "Mute",
                                active = callSession.isMuted,
                                onClick = onToggleMute,
                                testTag = "call_mute_btn"
                            )

                            CallScreenControlIcon(
                                icon = if (callSession.isOnHold) Icons.Default.PlayArrow else Icons.Default.Pause,
                                label = if (callSession.isOnHold) "Resume" else "Hold",
                                active = callSession.isOnHold,
                                onClick = onToggleHold,
                                testTag = "call_hold_btn"
                            )

                            CallScreenControlIcon(
                                icon = Icons.Default.Chat,
                                label = "Chat",
                                active = false,
                                onClick = onSwitchToChat,
                                testTag = "call_switch_chat_btn"
                            )
                        }

                        Spacer(Modifier.height(18.dp))

                        if (callSession.status == InAppCallStatus.INCOMING_RINGING) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Button(
                                    onClick = onAcceptIncomingCall,
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = ext.success,
                                        contentColor = Color.White
                                    ),
                                    shape = RoundedCornerShape(50),
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(54.dp)
                                        .testTag("accept_in_app_call_btn")
                                ) {
                                    Icon(Icons.Default.Call, contentDescription = "Answer")
                                    Spacer(Modifier.width(8.dp))
                                    Text(
                                        text = "Answer Call",
                                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                                    )
                                }

                                Button(
                                    onClick = onEndCall,
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = Color(0xFFEF4444),
                                        contentColor = Color.White
                                    ),
                                    shape = RoundedCornerShape(50),
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(54.dp)
                                        .testTag("end_call_button")
                                ) {
                                    Icon(Icons.Default.CallEnd, contentDescription = "End Call")
                                    Spacer(Modifier.width(8.dp))
                                    Text(
                                        text = stringResource(R.string.call_end_button),
                                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                                    )
                                }
                            }
                        } else {
                            Button(
                                onClick = onEndCall,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color(0xFFEF4444),
                                    contentColor = Color.White
                                ),
                                shape = RoundedCornerShape(50),
                                modifier = Modifier
                                    .fillMaxWidth(0.76f)
                                    .height(56.dp)
                                    .testTag("end_call_button")
                            ) {
                                Icon(
                                    imageVector = Icons.Default.CallEnd,
                                    contentDescription = stringResource(R.string.call_end_button),
                                    modifier = Modifier.size(24.dp)
                                )
                                Spacer(Modifier.width(10.dp))
                                Text(
                                    text = stringResource(R.string.call_end_button),
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * 3-step visual status indicator showing Connecting -> Ringing -> Connected progression
 */
@Composable
private fun CallStatusProgressStepper(
    status: InAppCallStatus,
    isOnHold: Boolean,
    accentColor: Color
) {
    val activeStep = when (status) {
        InAppCallStatus.CONNECTING -> 1
        InAppCallStatus.RINGING, InAppCallStatus.INCOMING_RINGING -> 2
        InAppCallStatus.CONNECTED -> 3
        else -> 0
    }

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = Color.White.copy(alpha = 0.06f),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(16.dp))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            CallStepItem(
                label = "Connecting",
                isCurrent = activeStep == 1,
                isReached = activeStep >= 1,
                accentColor = accentColor,
                modifier = Modifier.weight(1f)
            )
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.35f),
                modifier = Modifier.size(16.dp)
            )
            CallStepItem(
                label = "Ringing",
                isCurrent = activeStep == 2,
                isReached = activeStep >= 2,
                accentColor = accentColor,
                modifier = Modifier.weight(1f)
            )
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.35f),
                modifier = Modifier.size(16.dp)
            )
            CallStepItem(
                label = if (isOnHold) "On Hold" else "Connected",
                isCurrent = activeStep == 3,
                isReached = activeStep >= 3,
                accentColor = accentColor,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun CallStepItem(
    label: String,
    isCurrent: Boolean,
    isReached: Boolean,
    accentColor: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = RoundedCornerShape(50),
        color = when {
            isCurrent -> accentColor.copy(alpha = 0.22f)
            isReached -> Color.White.copy(alpha = 0.1f)
            else -> Color.Transparent
        },
        modifier = modifier.padding(horizontal = 2.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (isReached && !isCurrent) Icons.Default.CheckCircle else Icons.Default.RadioButtonChecked,
                contentDescription = null,
                tint = when {
                    isCurrent -> accentColor
                    isReached -> Color(0xFF10B981)
                    else -> Color(0xFF64748B)
                },
                modifier = Modifier.size(12.dp)
            )
            Spacer(Modifier.width(4.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium
                ),
                color = when {
                    isCurrent -> Color.White
                    isReached -> Color(0xFFCBD5E1)
                    else -> Color(0xFF64748B)
                },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun LiveAudioLevelBars(
    micLevel: Float,
    isMuted: Boolean,
    isConnected: Boolean,
    accentColor: Color
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = if (isMuted) Icons.Default.MicOff else Icons.Default.GraphicEq,
            contentDescription = "Microphone Activity",
            tint = if (isMuted) Color(0xFFF59E0B) else accentColor,
            modifier = Modifier.size(16.dp)
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text = when {
                isMuted -> "Microphone Muted"
                isConnected -> "Live Audio Stream (${(micLevel * 100).toInt()}%)"
                else -> "Hardware Audio Ready"
            },
            style = MaterialTheme.typography.labelSmall,
            color = Color(0xFF94A3B8)
        )
    }
}

@Composable
private fun CallScreenControlIcon(
    icon: ImageVector,
    label: String,
    active: Boolean,
    onClick: () -> Unit,
    testTag: String
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(
            onClick = onClick,
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(if (active) Color.White else Color.White.copy(alpha = 0.12f))
                .testTag(testTag)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (active) Color(0xFF0F172A) else Color.White,
                modifier = Modifier.size(23.dp)
            )
        }
        Spacer(Modifier.height(5.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = Color(0xFFCBD5E1)
        )
    }
}

/**
 * Embedded Active Trip Call Banner shown directly inside the Active Trips workflow
 * when a Rider-to-User call is active, allowing the rider to monitor call status
 * (Connecting, Ringing, Connected), view the live duration timer, reopen the full
 * CallScreen, or tap 'End Call' without leaving the active trip card.
 */
@Composable
fun ActiveTripCallWorkflowCard(
    callSession: InAppCallSession,
    onExpandCallScreen: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onEndCall: () -> Unit,
    modifier: Modifier = Modifier
) {
    val ext = LocalFleetColors.current
    val statusLabel = when {
        callSession.isOnHold -> "On Hold"
        callSession.status == InAppCallStatus.CONNECTING -> "Connecting"
        callSession.status == InAppCallStatus.RINGING -> "Ringing"
        callSession.status == InAppCallStatus.INCOMING_RINGING -> "Incoming Call"
        callSession.status == InAppCallStatus.CONNECTED -> "Connected"
        else -> "Ended"
    }
    val statusColor = when (callSession.status) {
        InAppCallStatus.CONNECTED -> ext.success
        InAppCallStatus.RINGING, InAppCallStatus.INCOMING_RINGING -> ext.warning
        else -> ext.info
    }
    val timerText = remember(callSession.durationSec) {
        formatCallTimer(callSession.durationSec)
    }

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = Color(0xFF0B192C),
        modifier = modifier
            .fillMaxWidth()
            .border(1.5.dp, statusColor, RoundedCornerShape(16.dp))
            .clickable { onExpandCallScreen() }
            .testTag("active_trip_call_workflow_card")
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(statusColor.copy(alpha = 0.2f))
                            .border(1.dp, statusColor, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.PhoneInTalk,
                            contentDescription = "Active Call",
                            tint = statusColor,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = callSession.customerLabel,
                                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                color = Color.White,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(Modifier.width(8.dp))
                            Surface(
                                shape = RoundedCornerShape(50),
                                color = statusColor.copy(alpha = 0.2f)
                            ) {
                                Text(
                                    text = statusLabel,
                                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                                    color = statusColor,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                )
                            }
                        }
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = "Duration: $timerText • Tap to open full CallScreen",
                            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                            color = Color(0xFFCBD5E1)
                        )
                    }
                }

                // Live Duration Pill
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = Color.White.copy(alpha = 0.1f)
                ) {
                    Text(
                        text = timerText,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        ),
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedButton(
                    onClick = onToggleMute,
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = if (callSession.isMuted) ext.warning else Color.White
                    ),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        imageVector = if (callSession.isMuted) Icons.Default.MicOff else Icons.Default.Mic,
                        contentDescription = "Mute",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(if (callSession.isMuted) "Muted" else "Mute", style = MaterialTheme.typography.labelMedium)
                }

                OutlinedButton(
                    onClick = onToggleSpeaker,
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = if (callSession.isSpeakerOn) ext.success else Color.White
                    ),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        imageVector = if (callSession.isSpeakerOn) Icons.Default.VolumeUp else Icons.Default.VolumeDown,
                        contentDescription = "Speaker",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text("Speaker", style = MaterialTheme.typography.labelMedium)
                }

                FilledTonalButton(
                    onClick = onExpandCallScreen,
                    colors = ButtonDefaults.filledTonalButtonColors(
                        containerColor = statusColor.copy(alpha = 0.22f),
                        contentColor = statusColor
                    ),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                    modifier = Modifier
                        .weight(1.1f)
                        .testTag("open_call_screen_btn")
                ) {
                    Icon(Icons.Default.OpenInFull, contentDescription = "Full CallScreen", modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Call UI", style = MaterialTheme.typography.labelMedium)
                }

                Button(
                    onClick = onEndCall,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFEF4444),
                        contentColor = Color.White
                    ),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    modifier = Modifier
                        .weight(1.15f)
                        .testTag("active_trip_end_call_btn")
                ) {
                    Icon(Icons.Default.CallEnd, contentDescription = "End Call", modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("End Call", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
    }
}

private fun formatCallTimer(durationSec: Int): String {
    val m = durationSec / 60
    val s = durationSec % 60
    return "%02d:%02d".format(m, s)
}
