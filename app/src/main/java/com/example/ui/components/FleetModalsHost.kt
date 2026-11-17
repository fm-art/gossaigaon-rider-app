package com.example.ui.components

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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.example.domain.RiderDomainLogic
import com.example.model.FinancialSummary
import com.example.model.TripGroup
import com.example.ui.theme.LocalFleetColors
import com.example.viewmodel.FleetUiState

@Composable
fun FleetModalsHost(
    state: FleetUiState,
    activeTrips: List<TripGroup>,
    financials: FinancialSummary,
    onSetDarkMode: (Boolean) -> Unit,
    onCloseBatteryTips: () -> Unit,
    onCloseSecurityModal: () -> Unit,
    onCloseSettlementModal: () -> Unit,
    onSubmitSettlement: (String, String) -> Unit,
    onClosePayoutModal: () -> Unit,
    onSubmitPayout: (String) -> Unit,
    onCloseFeedbackModal: () -> Unit,
    onSubmitFeedback: (String, String) -> Unit,
    onCloseRatingsModal: () -> Unit,
    onClosePassTrip: () -> Unit,
    onConfirmPassTrip: (String, String) -> Unit,
    onCloseSos: () -> Unit,
    onConfirmSos: (String, String) -> Unit,
    onCloseQrScanner: () -> Unit,
    onQrDecoded: (String, String) -> Unit,
    onCloseCashChange: () -> Unit,
    onToggleAutoGps: (Boolean) -> Unit,
    onCloseNotificationsModal: () -> Unit = {},
    onMarkAllNotificationsRead: () -> Unit = {},
    onClearAllNotifications: () -> Unit = {},
    onToggleCallMute: () -> Unit = {},
    onToggleCallSpeaker: () -> Unit = {},
    onToggleCallHold: () -> Unit = {},
    onMinimizeInAppCall: () -> Unit = {},
    onEndInAppCall: () -> Unit = {},
    onAcceptIncomingCall: () -> Unit = {},
    onMicPermissionGranted: (String) -> Unit = {},
    onStartInAppCallForTrip: (TripGroup) -> Unit = {},
    onOpenInAppChatForTrip: (String) -> Unit = {},
    onCloseInAppChat: () -> Unit = {},
    onSendInAppChatMessage: (String, String) -> Unit = { _, _ -> }
) {
    // Real-time Rider-to-User CallScreen Modal
    val activeCall = state.activeInAppCall
    if (activeCall != null && !state.isCallMinimized) {
        CallScreen(
            callSession = activeCall,
            riderName = state.riderData.name,
            onToggleMute = onToggleCallMute,
            onToggleSpeaker = onToggleCallSpeaker,
            onToggleHold = onToggleCallHold,
            onSwitchToChat = {
                onMinimizeInAppCall()
                onOpenInAppChatForTrip(activeCall.tripId)
            },
            onMinimizeToTrip = onMinimizeInAppCall,
            onEndCall = onEndInAppCall,
            onAcceptIncomingCall = onAcceptIncomingCall,
            onMicPermissionGranted = { onMicPermissionGranted(activeCall.tripId) }
        )
    }

    // In-App Customer Chat Fullscreen Modal
    val chatTripId = state.activeInAppChatTripId
    if (chatTripId != null) {
        val trip = activeTrips.find { it.tripId == chatTripId } ?: TripGroup(tripId = chatTripId)
        val messages = state.chatMessagesByTrip[chatTripId].orEmpty()
        InAppChatModal(
            trip = trip,
            messages = messages,
            onSendMessage = { text -> onSendInAppChatMessage(chatTripId, text) },
            onStartVoiceCall = {
                onCloseInAppChat()
                onStartInAppCallForTrip(trip)
            },
            onDismiss = onCloseInAppChat
        )
    }
    // 0. Fleet Notifications Center Modal
    if (state.showNotificationsModal) {
        NotificationsCenterModal(
            state = state,
            onMarkAllRead = onMarkAllNotificationsRead,
            onClearAll = onClearAllNotifications,
            onDismiss = onCloseNotificationsModal
        )
    }
    // 1. Battery Optimization Tips Modal
    if (state.showBatteryTipsModal) {
        BatteryOptimizationTipsModal(
            state = state,
            hasActiveDelivery = activeTrips.isNotEmpty(),
            onToggleAutoGps = onToggleAutoGps,
            onSelectDarkTheme = { onSetDarkMode(true) },
            onDismiss = onCloseBatteryTips
        )
    }

    // 3. Scam Shield & Security Audit Modal
    if (state.showSecurityModal) {
        SecurityShieldModal(
            state = state,
            onDismiss = onCloseSecurityModal
        )
    }

    // 4. COD Settlement Modal (12-digit UTR Scam Shield)
    if (state.showSettlementModal) {
        SettlementDepositModal(
            state = state,
            netCashInHand = financials.netCashInHand,
            onSubmit = onSubmitSettlement,
            onDismiss = onCloseSettlementModal
        )
    }

    // 5. Earnings Payout Withdrawal Modal
    if (state.showPayoutModal) {
        PayoutWithdrawModal(
            state = state,
            availableBalance = financials.availablePayoutBalance,
            onSubmit = onSubmitPayout,
            onDismiss = onClosePayoutModal
        )
    }

    // 6. Rider Support / Feedback Modal
    if (state.showFeedbackModal) {
        FeedbackTicketModal(
            state = state,
            onSubmit = onSubmitFeedback,
            onDismiss = onCloseFeedbackModal
        )
    }

    // 7. Customer Ratings Modal
    if (state.showRatingsModal) {
        CustomerRatingsModal(
            state = state,
            onDismiss = onCloseRatingsModal
        )
    }

    // 8. Pass Trip Modal
    val passTripId = state.showPassTripModalForTripId
    if (passTripId != null) {
        PassTripDialog(
            tripId = passTripId,
            onConfirm = { reason -> onConfirmPassTrip(passTripId, reason) },
            onDismiss = onClosePassTrip
        )
    }

    // 9. Emergency SOS Beacon Modal
    val sosTripId = state.showSosModalForTripId
    if (sosTripId != null) {
        SosBeaconDialog(
            tripId = sosTripId,
            riderLat = state.riderData.lat,
            riderLng = state.riderData.lng,
            onConfirm = { issue -> onConfirmSos(sosTripId, issue) },
            onDismiss = onCloseSos
        )
    }

    // 10. QR Scanner Modal
    val qrTripId = state.activeQrScannerTripId
    if (qrTripId != null) {
        val trip = activeTrips.find { it.tripId == qrTripId }
        if (trip != null) {
            QrScannerDialogComposable(
                trip = trip,
                onDismiss = onCloseQrScanner,
                onQrDecoded = { raw -> onQrDecoded(qrTripId, raw) }
            )
        }
    }

    // 11. Cash Change Calculator Modal
    val cashTripId = state.activeCashChangeTripId
    if (cashTripId != null) {
        val trip = activeTrips.find { it.tripId == cashTripId }
        if (trip != null) {
            CashChangeCalculatorModal(
                trip = trip,
                onDismiss = onCloseCashChange
            )
        }
    }
}

@Composable
private fun BatteryOptimizationTipsModal(
    state: FleetUiState,
    hasActiveDelivery: Boolean,
    onToggleAutoGps: (Boolean) -> Unit,
    onSelectDarkTheme: () -> Unit,
    onDismiss: () -> Unit
) {
    val ext = LocalFleetColors.current
    val policy = RiderDomainLogic.evaluateBatteryGpsPolicy(
        state.batteryStatus,
        hasActiveDelivery,
        state.autoGpsEnabled
    )

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = ext.cardElevated,
            modifier = Modifier
                .fillMaxWidth()
                .border(1.5.dp, ext.success.copy(alpha = 0.6f), MaterialTheme.shapes.extraLarge)
                .testTag("battery_optimization_tips_modal")
        ) {
            Column(
                modifier = Modifier
                    .padding(18.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.BatterySaver,
                            contentDescription = null,
                            tint = ext.success
                        )
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(
                                text = "Battery Optimization Tips",
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "Extend device longevity during 8–12 hr shifts",
                                style = MaterialTheme.typography.bodySmall,
                                color = ext.textMuted
                            )
                        }
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }

                Spacer(Modifier.height(10.dp))

                // Live Telemetry Status Box
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = ext.cardSubtle,
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, ext.borderSubtle, RoundedCornerShape(12.dp))
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "Battery: ${state.batteryStatus.levelPercent}% ${if (state.batteryStatus.charging) "(Charging)" else ""}",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "GPS Mode: ${policy.badgeLabel}",
                                style = MaterialTheme.typography.bodySmall,
                                color = ext.info
                            )
                        }
                        Switch(
                            checked = state.autoGpsEnabled,
                            onCheckedChange = onToggleAutoGps
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))

                val tips = listOf(
                    Triple(
                        "1. Dim Screen Brightness & OLED Dark Mode",
                        "Keep brightness around 40–50% under shade and use Crimson Nitro or Solar Amber dark theme to cut display power by up to 35%.",
                        "-35% Display Drain"
                    ),
                    Triple(
                        "2. Close Heavy Background Apps",
                        "Swipe away video streaming, social feeds, and background games before starting your Gossaigaon shift so CPU & RAM stay cool.",
                        "-25% CPU Heat"
                    ),
                    Triple(
                        "3. Smart Adaptive GPS Polling",
                        "Gossaigaon Fleet automatically scales GPS from 5s High Accuracy down to 15s/25s Eco Saver when battery drops below 25%.",
                        "-40% Radio Drain"
                    ),
                    Triple(
                        "4. Disable Unused Wi-Fi / Hotspot / Bluetooth",
                        "Turn off personal hotspot and continuous Wi-Fi scanning while riding between Station Road and Habrubil.",
                        "+90 Min Shift Life"
                    ),
                    Triple(
                        "5. Avoid Direct Handlebar Sun Overheating",
                        "Mount your phone with a sun-visor cover. Lithium batteries drain 2x faster when device temperature exceeds 42°C.",
                        "Thermal Protection"
                    )
                )

                tips.forEach { (title, desc, badge) ->
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = ext.cardSubtle,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .border(1.dp, ext.borderSubtle, RoundedCornerShape(12.dp))
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = title,
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    modifier = Modifier.weight(1f)
                                )
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = ext.successContainer
                                ) {
                                    Text(
                                        text = badge,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = ext.success,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = desc,
                                style = MaterialTheme.typography.bodySmall,
                                color = ext.textMuted
                            )
                        }
                    }
                }

                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = onSelectDarkTheme,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("AMOLED Saver Theme")
                    }
                    Button(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Got It")
                    }
                }
            }
        }
    }
}

@Composable
private fun SettlementDepositModal(
    state: FleetUiState,
    netCashInHand: Double,
    onSubmit: (String, String) -> Unit,
    onDismiss: () -> Unit
) {
    val ext = LocalFleetColors.current
    var amount by remember { mutableStateOf(netCashInHand.toInt().coerceAtLeast(100).toString()) }
    var utr by remember { mutableStateOf("") }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = ext.cardElevated,
            modifier = Modifier
                .fillMaxWidth()
                .border(1.5.dp, ext.warning, MaterialTheme.shapes.extraLarge)
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text(
                    text = "Deposit COD Cash to Admin",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "Admin UPI: ${state.adminSettings.upiId} • Cash in Hand: ₹${netCashInHand.toInt()}",
                    style = MaterialTheme.typography.bodySmall,
                    color = ext.textMuted
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it.filter { c -> c.isDigit() } },
                    label = { Text("Deposit Amount (₹)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = utr,
                    onValueChange = { utr = it.filter { c -> c.isDigit() }.take(12) },
                    label = { Text("12-Digit Bank UTR Reference") },
                    placeholder = { Text("e.g. 412987654321") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settlement_utr_input")
                )
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                        Text("Cancel")
                    }
                    Button(
                        onClick = { onSubmit(amount, utr) },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("submit_settlement_btn")
                    ) {
                        Text("Verify UTR")
                    }
                }
            }
        }
    }
}

@Composable
private fun PayoutWithdrawModal(
    state: FleetUiState,
    availableBalance: Double,
    onSubmit: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val ext = LocalFleetColors.current
    var amount by remember { mutableStateOf(availableBalance.toInt().toString()) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = ext.cardElevated,
            modifier = Modifier
                .fillMaxWidth()
                .border(1.5.dp, ext.success, MaterialTheme.shapes.extraLarge)
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text(
                    text = "Withdraw Rider Earnings",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "Available: ₹${availableBalance.toInt()} → UPI: ${state.riderData.upiId}",
                    style = MaterialTheme.typography.bodySmall,
                    color = ext.textMuted
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it.filter { c -> c.isDigit() } },
                    label = { Text("Withdrawal Amount (₹)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                        Text("Cancel")
                    }
                    Button(
                        onClick = { onSubmit(amount) },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("confirm_payout_btn")
                    ) {
                        Text("Transfer Now")
                    }
                }
            }
        }
    }
}

@Composable
private fun SecurityShieldModal(
    state: FleetUiState,
    onDismiss: () -> Unit
) {
    val ext = LocalFleetColors.current
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = ext.cardElevated,
            modifier = Modifier
                .fillMaxWidth()
                .border(1.5.dp, ext.info, MaterialTheme.shapes.extraLarge)
        ) {
            Column(
                modifier = Modifier
                    .padding(18.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Shield, contentDescription = null, tint = ext.info)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "Anti-Scam Shield & Security Log",
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "• Never scan a UPI QR code to RECEIVE money. QR codes are only for customer order PIN verification.\n• All 12-digit UTRs are checked against sequential/duplicate patterns.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ext.textMuted
                )
                Spacer(Modifier.height(12.dp))
                state.securityEvents.take(8).forEach { evt ->
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = ext.cardSubtle,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 3.dp)
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text(
                                text = "${evt.type} (${evt.severity})",
                                style = MaterialTheme.typography.labelSmall,
                                color = ext.info
                            )
                            Text(
                                text = evt.detail,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                    Text("Close Shield")
                }
            }
        }
    }
}

@Composable
private fun FeedbackTicketModal(
    state: FleetUiState,
    onSubmit: (String, String) -> Unit,
    onDismiss: () -> Unit
) {
    val ext = LocalFleetColors.current
    var subject by remember { mutableStateOf("Route / Store Delay") }
    var message by remember { mutableStateOf("") }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = ext.cardElevated,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text("Support & Dispatch Feedback", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = subject,
                    onValueChange = { subject = it },
                    label = { Text("Subject") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = message,
                    onValueChange = { message = it },
                    label = { Text("Describe issue or suggestion") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                        Text("Cancel")
                    }
                    Button(onClick = { onSubmit(subject, message) }, modifier = Modifier.weight(1f)) {
                        Text("Submit")
                    }
                }
            }
        }
    }
}

@Composable
private fun CustomerRatingsModal(
    state: FleetUiState,
    onDismiss: () -> Unit
) {
    val ext = LocalFleetColors.current
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = ext.cardElevated,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text(
                    text = "Customer Ratings (★ ${state.riderData.ratingAvg})",
                    style = MaterialTheme.typography.titleLarge
                )
                Spacer(Modifier.height(10.dp))
                state.ratings.forEach { r ->
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = ext.cardSubtle,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text(
                                text = "${r.customerName} • ★ ${r.rating}",
                                style = MaterialTheme.typography.titleSmall,
                                color = ext.warning
                            )
                            Text(
                                text = r.comment,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                    Text("Close")
                }
            }
        }
    }
}

@Composable
private fun PassTripDialog(
    tripId: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val ext = LocalFleetColors.current
    var reason by remember { mutableStateOf("Heavy traffic / Vehicle check") }
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = MaterialTheme.shapes.extraLarge, color = ext.cardElevated) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text("Pass Batch #${tripId.takeLast(5)}", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text("Reason for passing") },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                        Text("Back")
                    }
                    Button(onClick = { onConfirm(reason) }, modifier = Modifier.weight(1f)) {
                        Text("Reassign")
                    }
                }
            }
        }
    }
}

@Composable
private fun SosBeaconDialog(
    tripId: String,
    riderLat: Double,
    riderLng: Double,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val ext = LocalFleetColors.current
    var details by remember { mutableStateOf("Vehicle breakdown / Medical / Route hazard") }
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = ext.cardElevated,
            modifier = Modifier.border(2.dp, ext.danger, MaterialTheme.shapes.extraLarge)
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text("Emergency SOS Beacon", style = MaterialTheme.typography.titleLarge, color = ext.danger)
                Text(
                    text = "GPS: ${"%.4f".format(riderLat)}, ${"%.4f".format(riderLng)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = ext.textMuted
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = details,
                    onValueChange = { details = it },
                    label = { Text("Emergency Situation") },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
                        Text("Cancel")
                    }
                    Button(
                        onClick = { onConfirm(details) },
                        colors = ButtonDefaults.buttonColors(containerColor = ext.danger),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Send SOS", color = Color.White)
                    }
                }
            }
        }
    }
}

@Composable
private fun CashChangeCalculatorModal(
    trip: TripGroup,
    onDismiss: () -> Unit
) {
    val ext = LocalFleetColors.current
    val bill = trip.orders.sumOf { it.totalAmount }
    var tenderedStr by remember { mutableStateOf("500") }
    val tendered = tenderedStr.toDoubleOrNull() ?: 0.0
    val diff = tendered - bill

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = MaterialTheme.shapes.extraLarge, color = ext.cardElevated) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text("COD Cash Change Calculator", style = MaterialTheme.typography.titleLarge)
                Text("Trip Bill: ₹${bill.toInt()}", style = MaterialTheme.typography.titleMedium, color = ext.warning)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("200", "500", "1000").forEach { note ->
                        FilterChip(
                            selected = tenderedStr == note,
                            onClick = { tenderedStr = note },
                            label = { Text("₹$note") }
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = tenderedStr,
                    onValueChange = { tenderedStr = it.filter { c -> c.isDigit() } },
                    label = { Text("Cash Given by Customer (₹)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = if (diff >= 0) "Return Change: ₹${diff.toInt()}" else "Customer Short by: ₹${(-diff).toInt()}",
                    style = MaterialTheme.typography.headlineMedium,
                    color = if (diff >= 0) ext.success else ext.danger
                )
                Spacer(Modifier.height(12.dp))
                Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                    Text("Done")
                }
            }
        }
    }
}

@Composable
private fun NotificationsCenterModal(
    state: FleetUiState,
    onMarkAllRead: () -> Unit,
    onClearAll: () -> Unit,
    onDismiss: () -> Unit
) {
    val ext = LocalFleetColors.current
    val unreadCount = state.notifications.count { !it.isRead }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = ext.cardElevated,
            modifier = Modifier
                .fillMaxWidth()
                .border(1.5.dp, ext.warning.copy(alpha = 0.65f), MaterialTheme.shapes.extraLarge)
                .testTag("notifications_center_modal")
        ) {
            Column(
                modifier = Modifier
                    .padding(18.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(ext.warningContainer),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = if (unreadCount > 0) Icons.Default.NotificationsActive else Icons.Default.Notifications,
                                contentDescription = "Notifications",
                                tint = ext.warning
                            )
                        }
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "Fleet Dispatch Alerts",
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = if (unreadCount > 0) "$unreadCount unread notifications" else "All caught up",
                                style = MaterialTheme.typography.bodySmall,
                                color = ext.textMuted
                            )
                        }
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }

                Spacer(Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = onMarkAllRead,
                        enabled = unreadCount > 0,
                        modifier = Modifier
                            .weight(1f)
                            .testTag("mark_all_notifications_read_btn")
                    ) {
                        Icon(Icons.Default.DoneAll, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Mark Read")
                    }
                    OutlinedButton(
                        onClick = onClearAll,
                        enabled = state.notifications.isNotEmpty(),
                        modifier = Modifier
                            .weight(1f)
                            .testTag("clear_all_notifications_btn")
                    ) {
                        Icon(Icons.Default.DeleteSweep, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Clear All")
                    }
                }

                Spacer(Modifier.height(10.dp))

                if (state.notifications.isEmpty()) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = ext.cardSubtle,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                imageVector = Icons.Default.NotificationsNone,
                                contentDescription = null,
                                tint = ext.textMuted,
                                modifier = Modifier.size(32.dp)
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                text = "No active dispatch or payout alerts.",
                                style = MaterialTheme.typography.bodySmall,
                                color = ext.textMuted
                            )
                        }
                    }
                } else {
                    state.notifications.take(10).forEach { item ->
                        val catColor = when (item.category) {
                            "PAYOUT" -> ext.success
                            "BROADCAST" -> ext.warning
                            "SECURITY" -> ext.danger
                            else -> ext.info
                        }
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (!item.isRead) catColor.copy(alpha = 0.12f) else ext.cardSubtle,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .border(
                                    1.dp,
                                    if (!item.isRead) catColor.copy(alpha = 0.5f) else ext.borderSubtle,
                                    RoundedCornerShape(12.dp)
                                )
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.Top
                            ) {
                                Icon(
                                    imageVector = when (item.category) {
                                        "PAYOUT" -> Icons.Default.AccountBalanceWallet
                                        "BROADCAST" -> Icons.Default.Campaign
                                        "SECURITY" -> Icons.Default.Shield
                                        else -> Icons.Default.LocalShipping
                                    },
                                    contentDescription = null,
                                    tint = catColor,
                                    modifier = Modifier
                                        .size(20.dp)
                                        .padding(top = 2.dp)
                                )
                                Spacer(Modifier.width(10.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = item.title,
                                            style = MaterialTheme.typography.titleSmall,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            modifier = Modifier.weight(1f)
                                        )
                                        if (!item.isRead) {
                                            Box(
                                                modifier = Modifier
                                                    .size(8.dp)
                                                    .clip(CircleShape)
                                                    .background(catColor)
                                            )
                                        }
                                    }
                                    Spacer(Modifier.height(3.dp))
                                    Text(
                                        text = item.body,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = ext.textMuted
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Done")
                }
            }
        }
    }
}
