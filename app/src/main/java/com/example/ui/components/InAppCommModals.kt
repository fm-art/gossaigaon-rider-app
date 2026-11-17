package com.example.ui.components

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import com.example.model.InAppCallSession
import com.example.model.InAppCallStatus
import com.example.model.InAppChatMessage
import com.example.model.TripGroup
import com.example.ui.theme.LocalFleetColors
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun InAppVoiceCallModal(
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
    CallScreen(
        callSession = callSession,
        riderName = riderName,
        onToggleMute = onToggleMute,
        onToggleSpeaker = onToggleSpeaker,
        onToggleHold = onToggleHold,
        onSwitchToChat = onSwitchToChat,
        onMinimizeToTrip = onMinimizeToTrip,
        onEndCall = onEndCall,
        onAcceptIncomingCall = onAcceptIncomingCall,
        onMicPermissionGranted = onMicPermissionGranted
    )
}

@Composable
fun InAppChatModal(
    trip: TripGroup,
    messages: List<InAppChatMessage>,
    onSendMessage: (String) -> Unit,
    onStartVoiceCall: () -> Unit,
    onDismiss: () -> Unit
) {
    val ext = LocalFleetColors.current
    var draftText by remember { mutableStateOf("") }
    val timeFormat = remember { SimpleDateFormat("hh:mm a", Locale.US) }

    val quickReplies = listOf(
        "Order picked up, on the way!",
        "Reached near your gate / landmark.",
        "Please share exact house / gate colour.",
        "Please keep 4-digit delivery PIN ready."
    )

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            color = MaterialTheme.colorScheme.background,
            modifier = Modifier
                .fillMaxSize()
                .testTag("in_app_chat_modal")
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // WhatsApp-style Top Bar with Customer Info + Instant In-App Call Icon
                Surface(
                    color = ext.cardElevated,
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, ext.borderSubtle)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 10.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f)
                        ) {
                            IconButton(onClick = onDismiss) {
                                Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                            }
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(CircleShape)
                                    .background(ext.successContainer)
                                    .border(1.dp, ext.success, CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Person,
                                    contentDescription = null,
                                    tint = ext.success
                                )
                            }
                            Spacer(Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Customer • #${trip.tripId.takeLast(5).uppercase()}",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    text = "In-App Encrypted Chat • ${trip.address}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = ext.textMuted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }

                        // Direct In-App Voice Call Button inside Chat Header
                        FilledTonalIconButton(
                            onClick = onStartVoiceCall,
                            colors = IconButtonDefaults.filledTonalIconButtonColors(
                                containerColor = ext.successContainer,
                                contentColor = ext.success
                            ),
                            modifier = Modifier.testTag("chat_header_voice_call_btn")
                        ) {
                            Icon(
                                imageVector = Icons.Default.PhoneInTalk,
                                contentDescription = "Start In-App Voice Call"
                            )
                        }
                    }
                }

                // Privacy Notice Banner
                Surface(
                    color = ext.infoContainer.copy(alpha = 0.6f),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.VerifiedUser,
                            contentDescription = null,
                            tint = ext.info,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = "Phone numbers are hidden. Calls & messages stay inside Gossaigaon Fleet.",
                            style = MaterialTheme.typography.labelSmall,
                            color = ext.info
                        )
                    }
                }

                // Message Thread List
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp),
                    contentPadding = PaddingValues(vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (messages.isEmpty()) {
                        item {
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = ext.cardElevated,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 16.dp)
                                    .border(1.dp, ext.borderSubtle, RoundedCornerShape(14.dp))
                            ) {
                                Column(
                                    modifier = Modifier.padding(18.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Forum,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(32.dp)
                                    )
                                    Spacer(Modifier.height(6.dp))
                                    Text(
                                        text = "Start In-App Conversation",
                                        style = MaterialTheme.typography.titleSmall,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = "Send an instant update or tap the green call button above for an in-app voice call.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = ext.textMuted,
                                        textAlign = TextAlign.Center
                                    )
                                }
                            }
                        }
                    } else {
                        items(messages, key = { it.id }) { msg ->
                            val isRider = msg.senderRole == "RIDER"
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = if (isRider) Arrangement.End else Arrangement.Start
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(
                                        topStart = 16.dp,
                                        topEnd = 16.dp,
                                        bottomStart = if (isRider) 16.dp else 4.dp,
                                        bottomEnd = if (isRider) 4.dp else 16.dp
                                    ),
                                    color = if (isRider) MaterialTheme.colorScheme.primary else ext.cardElevated,
                                    modifier = Modifier.widthIn(max = 290.dp)
                                ) {
                                    Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                                        Text(
                                            text = msg.text,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = if (isRider) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                                        )
                                        Spacer(Modifier.height(2.dp))
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.End,
                                            modifier = Modifier.align(Alignment.End)
                                        ) {
                                            Text(
                                                text = timeFormat.format(Date(msg.timestamp)),
                                                style = MaterialTheme.typography.labelSmall,
                                                color = if (isRider) {
                                                    MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.75f)
                                                } else {
                                                    ext.textMuted
                                                }
                                            )
                                            if (isRider) {
                                                Spacer(Modifier.width(4.dp))
                                                Icon(
                                                    imageVector = Icons.Default.DoneAll,
                                                    contentDescription = "Delivered",
                                                    tint = MaterialTheme.colorScheme.onPrimary,
                                                    modifier = Modifier.size(13.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Quick Reply Chips Row
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    quickReplies.forEach { preset ->
                        AssistChip(
                            onClick = { onSendMessage(preset) },
                            label = { Text(preset, style = MaterialTheme.typography.bodySmall) }
                        )
                    }
                }

                // Bottom Message Composer Bar
                Surface(
                    color = ext.cardElevated,
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, ext.borderSubtle)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = draftText,
                            onValueChange = { draftText = it },
                            placeholder = { Text("Message customer in-app...") },
                            singleLine = true,
                            shape = RoundedCornerShape(24.dp),
                            modifier = Modifier
                                .weight(1f)
                                .testTag("in_app_chat_input")
                        )

                        FloatingActionButton(
                            onClick = {
                                if (draftText.isNotBlank()) {
                                    onSendMessage(draftText)
                                    draftText = ""
                                }
                            },
                            containerColor = MaterialTheme.colorScheme.primary,
                            contentColor = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier
                                .size(48.dp)
                                .testTag("in_app_chat_send_btn")
                        ) {
                            Icon(Icons.Default.Send, contentDescription = "Send Message")
                        }
                    }
                }
            }
        }
    }
}
