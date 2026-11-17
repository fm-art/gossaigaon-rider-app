package com.example.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.domain.RiderDomainLogic
import com.example.model.OrderDistanceFeeBreakdown
import com.example.model.OrderRecord
import com.example.model.StoreInfo
import com.example.model.TripGroup
import com.example.ui.theme.LocalFleetColors
import com.example.viewmodel.FleetUiState

@Composable
fun ActiveTripsTabComposable(
    state: FleetUiState,
    activeTrips: List<TripGroup>,
    onAcceptTrip: (String) -> Unit,
    onOpenPassTrip: (String) -> Unit,
    onVerifyPickup: (String, String) -> Unit,
    onCompleteDeliveryPin: (String, String) -> Unit,
    onOpenQrScanner: (String) -> Unit,
    onOpenCashCalculator: (String) -> Unit,
    onOpenSos: (String) -> Unit,
    onStartInAppCall: (TripGroup) -> Unit,
    onOpenInAppChat: (String) -> Unit,
    onRefreshOrders: () -> Unit,
    onExpandInAppCall: () -> Unit = {},
    onToggleCallMute: () -> Unit = {},
    onToggleCallSpeaker: () -> Unit = {},
    onEndInAppCall: () -> Unit = {}
) {
    val ext = LocalFleetColors.current

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 14.dp),
        contentPadding = PaddingValues(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Active Real-Time CallScreen Banner inside Active Trips Workflow
        val activeCall = state.activeInAppCall
        if (activeCall != null) {
            item(key = "active_call_banner_${activeCall.callId}") {
                ActiveTripCallWorkflowCard(
                    callSession = activeCall,
                    onExpandCallScreen = onExpandInAppCall,
                    onToggleMute = onToggleCallMute,
                    onToggleSpeaker = onToggleCallSpeaker,
                    onEndCall = onEndInAppCall
                )
            }
        }

        // Admin Announcement Banner
        if (state.adminSettings.riderAnnouncement.isNotBlank()) {
            item {
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = ext.warningContainer,
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, ext.warning.copy(alpha = 0.45f), MaterialTheme.shapes.medium)
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Campaign,
                            contentDescription = "Dispatch Broadcast",
                            tint = ext.warning,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = state.adminSettings.riderAnnouncement,
                            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }

        if (activeTrips.isEmpty()) {
            item {
                Surface(
                    shape = MaterialTheme.shapes.large,
                    color = ext.cardElevated,
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, ext.borderSubtle, MaterialTheme.shapes.large)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(
                            modifier = Modifier
                                .size(64.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Radar,
                                contentDescription = "Scanning",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(34.dp)
                            )
                        }
                        Spacer(Modifier.height(14.dp))
                        Text(
                            text = "No Active Trips Assigned",
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "Stay ON DUTY to receive multi-store delivery batches around Gossaigaon Bazar.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = ext.textMuted
                        )
                        Spacer(Modifier.height(16.dp))
                        OutlinedButton(
                            onClick = onRefreshOrders,
                            modifier = Modifier.testTag("refresh_orders_btn")
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Refresh Dispatch Queue")
                        }
                    }
                }
            }
        } else {
            items(activeTrips, key = { it.tripId }) { trip ->
                TripBatchCard(
                    trip = trip,
                    state = state,
                    onAcceptTrip = { onAcceptTrip(trip.tripId) },
                    onPassTrip = { onOpenPassTrip(trip.tripId) },
                    onVerifyPickup = onVerifyPickup,
                    onCompleteDeliveryPin = { pin -> onCompleteDeliveryPin(trip.tripId, pin) },
                    onOpenQrScanner = { onOpenQrScanner(trip.tripId) },
                    onOpenCashCalculator = { onOpenCashCalculator(trip.tripId) },
                    onOpenSos = { onOpenSos(trip.tripId) },
                    onStartInAppCall = { onStartInAppCall(trip) },
                    onOpenInAppChat = { onOpenInAppChat(trip.tripId) },
                    onExpandInAppCall = onExpandInAppCall,
                    onEndInAppCall = onEndInAppCall
                )
            }
        }
    }
}

@Composable
private fun TripBatchCard(
    trip: TripGroup,
    state: FleetUiState,
    onAcceptTrip: () -> Unit,
    onPassTrip: () -> Unit,
    onVerifyPickup: (String, String) -> Unit,
    onCompleteDeliveryPin: (String) -> Unit,
    onOpenQrScanner: () -> Unit,
    onOpenCashCalculator: () -> Unit,
    onOpenSos: () -> Unit,
    onStartInAppCall: () -> Unit,
    onOpenInAppChat: () -> Unit,
    onExpandInAppCall: () -> Unit = {},
    onEndInAppCall: () -> Unit = {}
) {
    val ext = LocalFleetColors.current
    val context = LocalContext.current

    val isUnaccepted = trip.orders.any { it.riderAccepted == null }
    val allPickedUp = trip.orders.all {
        it.status in setOf("PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED")
    }
    val totalBill = trip.orders.sumOf { it.totalAmount }
    val orderBreakdowns = remember(
        trip.orders,
        state.stores,
        state.adminSettings.riderBaseFee,
        state.adminSettings.riderPerKmRate
    ) {
        trip.orders.associate { order ->
            order.orderId to RiderDomainLogic.calculateOrderDistanceFeeBreakdown(
                order = order,
                stores = state.stores,
                baseFee = state.adminSettings.riderBaseFee,
                perKmRate = state.adminSettings.riderPerKmRate
            )
        }
    }
    val totalFee = orderBreakdowns.values.sumOf { it.totalRiderFee }
    val totalOrderDistanceKm = orderBreakdowns.values.sumOf { it.distanceKm }
    val totalBasePay = orderBreakdowns.values.sumOf { it.basePay }
    val totalDistancePay = orderBreakdowns.values.sumOf { it.distancePay }

    val sequence = remember(trip, state.stores, state.riderData.lat, state.riderData.lng) {
        RiderDomainLogic.calculateOptimalDeliverySequence(
            trip,
            state.stores,
            state.riderData.lat,
            state.riderData.lng
        )
    }
    val remainingSec = state.remainingAcceptSec[trip.tripId] ?: 90
    var deliveryPinInput by remember(trip.tripId) { mutableStateOf("") }

    Surface(
        shape = MaterialTheme.shapes.large,
        color = ext.cardElevated,
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = 1.5.dp,
                color = if (isUnaccepted) MaterialTheme.colorScheme.primary else ext.borderSubtle,
                shape = MaterialTheme.shapes.large
            )
            .testTag("trip_card_${trip.tripId}")
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Trip Top Header: Batch ID + Multi-Store Badge + Distance-Based Rider Earning Pill
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.primaryContainer
                    ) {
                        Text(
                            text = "#${trip.tripId.takeLast(6).uppercase()}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    if (trip.orders.size > 1) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = ext.infoContainer
                        ) {
                            Text(
                                text = "${trip.orders.size}-STORE COMBO",
                                style = MaterialTheme.typography.labelSmall,
                                color = ext.info,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    } else {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = ext.cardSubtle
                        ) {
                            Text(
                                text = "${"%.1f".format(totalOrderDistanceKm)} KM TRIP",
                                style = MaterialTheme.typography.labelSmall,
                                color = ext.info,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }

                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = ext.successContainer,
                    modifier = Modifier.border(1.dp, ext.success.copy(alpha = 0.4f), RoundedCornerShape(10.dp))
                ) {
                    Text(
                        text = "+₹${totalFee.toInt()} (${"%.1f".format(totalOrderDistanceKm)} km)",
                        style = MaterialTheme.typography.titleMedium,
                        color = ext.success,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            // Distance-Based Payout Breakdown Card
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = ext.successContainer.copy(alpha = 0.35f),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, ext.success.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                    .testTag("distance_payout_card_${trip.tripId}")
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "DISTANCE KE HISAB SE ORDER PAYOUT",
                            style = MaterialTheme.typography.labelSmall,
                            color = ext.success
                        )
                        Text(
                            text = "Base ₹${totalBasePay.toInt()} + ${"%.1f".format(totalOrderDistanceKm)} km × ₹${state.adminSettings.riderPerKmRate.toInt()}/km (+₹${totalDistancePay.toInt()})",
                            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Text(
                        text = "₹${totalFee.toInt()}",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.ExtraBold),
                        color = ext.success
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            // Optimal Route Sequence Planner Banner (for Multi-Order Trips)
            if (sequence.steps.isNotEmpty()) {
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = ext.cardSubtle,
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, ext.borderSubtle, MaterialTheme.shapes.medium)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.Route,
                                    contentDescription = "Optimal Sequence",
                                    tint = MaterialTheme.colorScheme.secondary,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = "SMART ROUTE SEQUENCE (${sequence.totalRemainingDistanceKm} km)",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.secondary
                                )
                            }
                            if (sequence.distanceSavedKm > 0.05) {
                                Text(
                                    text = "Saves ${sequence.distanceSavedKm} km",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = ext.success
                                )
                            }
                        }

                        Spacer(Modifier.height(8.dp))
                        sequence.steps.forEach { step ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 3.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(22.dp)
                                        .clip(CircleShape)
                                        .background(
                                            when {
                                                step.isCompleted -> ext.success
                                                step.isCurrent -> MaterialTheme.colorScheme.primary
                                                else -> ext.borderSubtle
                                            }
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = if (step.isCompleted) "✓" else "${step.stepNumber}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = if (step.isCompleted || step.isCurrent) {
                                            MaterialTheme.colorScheme.onPrimary
                                        } else {
                                            MaterialTheme.colorScheme.onSurface
                                        }
                                    )
                                }
                                Spacer(Modifier.width(8.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "${step.type}: ${step.title}",
                                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold),
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = step.subtitle,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = ext.textMuted
                                    )
                                }
                                if (step.legDistanceKm != null && step.legDistanceKm > 0) {
                                    Text(
                                        text = "${step.legDistanceKm} km",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = ext.textMuted
                                    )
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
            }

            // Accept / Pass Gate for Newly Dispatched Orders
            if (isUnaccepted) {
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, MaterialTheme.colorScheme.primary, MaterialTheme.shapes.medium)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "NEW DISPATCH ASSIGNMENT",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Text(
                                text = "Auto-timeout: ${remainingSec}s",
                                style = MaterialTheme.typography.labelMedium,
                                color = if (remainingSec <= 20) ext.danger else MaterialTheme.colorScheme.onSurface
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Lock,
                                contentDescription = "Pickup Code Locked",
                                tint = ext.warning,
                                modifier = Modifier.size(15.dp)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = "Pickup Code order accept karne ke baad hi show hoga.",
                                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                                color = ext.warning
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Button(
                                onClick = onAcceptTrip,
                                modifier = Modifier
                                    .weight(1.4f)
                                    .height(48.dp)
                                    .testTag("accept_trip_btn_${trip.tripId}")
                            ) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("Accept Order")
                            }
                            if (state.adminSettings.allowRiderPassTrip) {
                                OutlinedButton(
                                    onClick = onPassTrip,
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(48.dp)
                                        .testTag("pass_trip_btn_${trip.tripId}")
                                ) {
                                    Icon(Icons.Default.SwapHoriz, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("Pass")
                                }
                            }
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                // Preview Store Pickup Stops with Locked Pickup Code before Acceptance
                Text(
                    text = "STORE PICKUP STOPS (ACCEPT TO UNLOCK PICKUP CODE)",
                    style = MaterialTheme.typography.labelSmall,
                    color = ext.textMuted
                )
                Spacer(Modifier.height(6.dp))

                trip.orders.forEach { order ->
                    val store = state.stores[order.restaurantId] ?: StoreInfo(name = "Merchant Store")
                    val feeBreakdown = orderBreakdowns[order.orderId]
                        ?: RiderDomainLogic.calculateOrderDistanceFeeBreakdown(
                            order,
                            state.stores,
                            state.adminSettings.riderBaseFee,
                            state.adminSettings.riderPerKmRate
                        )
                    StorePickupStopRow(
                        order = order,
                        store = store,
                        feeBreakdown = feeBreakdown,
                        isOrderAccepted = false,
                        onVerifyPickup = { code -> onVerifyPickup(order.orderId, code) }
                    )
                    Spacer(Modifier.height(8.dp))
                }
            } else {
                // Store Pickup Stops (Order Accepted -> Pickup Code Unlocked)
                Text(
                    text = "STORE PICKUP STOPS",
                    style = MaterialTheme.typography.labelSmall,
                    color = ext.textMuted
                )
                Spacer(Modifier.height(6.dp))

                trip.orders.forEach { order ->
                    val store = state.stores[order.restaurantId] ?: StoreInfo(name = "Merchant Store")
                    val feeBreakdown = orderBreakdowns[order.orderId]
                        ?: RiderDomainLogic.calculateOrderDistanceFeeBreakdown(
                            order,
                            state.stores,
                            state.adminSettings.riderBaseFee,
                            state.adminSettings.riderPerKmRate
                        )
                    StorePickupStopRow(
                        order = order,
                        store = store,
                        feeBreakdown = feeBreakdown,
                        isOrderAccepted = order.riderAccepted == true,
                        onVerifyPickup = { code -> onVerifyPickup(order.orderId, code) }
                    )
                    Spacer(Modifier.height(8.dp))
                }

                Spacer(Modifier.height(6.dp))

                // Customer Dropoff & Verification Box
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = ext.cardSubtle,
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, ext.borderSubtle, MaterialTheme.shapes.medium)
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "CUSTOMER DROP-OFF",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.secondary
                                )
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = trip.address,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (trip.paymentMode == "COD") ext.warningContainer else ext.infoContainer
                            ) {
                                Text(
                                    text = "${trip.paymentMode} • ₹${totalBill.toInt()}",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (trip.paymentMode == "COD") ext.warning else ext.info,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }

                        Spacer(Modifier.height(10.dp))

                        // Quick Action Buttons (In-App Voice CallScreen, In-App Chat Message, Maps, Cash Change, SOS)
                        val unreadOrTotalMsgs = state.chatMessagesByTrip[trip.tripId]?.size ?: 0
                        val activeTripCall = state.activeInAppCall?.takeIf { it.tripId == trip.tripId }
                        val isTripOnCall = activeTripCall != null

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            FilledTonalButton(
                                onClick = {
                                    if (isTripOnCall) {
                                        onExpandInAppCall()
                                    } else {
                                        onStartInAppCall()
                                    }
                                },
                                colors = ButtonDefaults.filledTonalButtonColors(
                                    containerColor = if (isTripOnCall) ext.success else ext.successContainer,
                                    contentColor = if (isTripOnCall) MaterialTheme.colorScheme.onPrimary else ext.success
                                ),
                                modifier = Modifier
                                    .weight(1.15f)
                                    .testTag("in_app_call_btn_${trip.tripId}"),
                                contentPadding = PaddingValues(vertical = 8.dp, horizontal = 6.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.PhoneInTalk,
                                    contentDescription = "In-App Voice Call",
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    text = if (activeTripCall != null) {
                                        val m = activeTripCall.durationSec / 60
                                        val s = activeTripCall.durationSec % 60
                                        "Call %02d:%02d".format(m, s)
                                    } else {
                                        "Call User"
                                    },
                                    style = MaterialTheme.typography.labelLarge
                                )
                            }

                            if (isTripOnCall) {
                                Button(
                                    onClick = onEndInAppCall,
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = ext.danger,
                                        contentColor = MaterialTheme.colorScheme.onError
                                    ),
                                    modifier = Modifier
                                        .weight(1f)
                                        .testTag("trip_card_end_call_btn_${trip.tripId}"),
                                    contentPadding = PaddingValues(vertical = 8.dp, horizontal = 6.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.CallEnd,
                                        contentDescription = "End Call",
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(Modifier.width(4.dp))
                                    Text("End Call", style = MaterialTheme.typography.labelLarge)
                                }
                            }

                            FilledTonalButton(
                                onClick = onOpenInAppChat,
                                colors = ButtonDefaults.filledTonalButtonColors(
                                    containerColor = ext.infoContainer,
                                    contentColor = ext.info
                                ),
                                modifier = Modifier
                                    .weight(1.1f)
                                    .testTag("in_app_chat_btn_${trip.tripId}"),
                                contentPadding = PaddingValues(vertical = 8.dp, horizontal = 6.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Chat,
                                    contentDescription = "In-App Message",
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    text = if (unreadOrTotalMsgs > 0) "Chat ($unreadOrTotalMsgs)" else "Message",
                                    style = MaterialTheme.typography.labelLarge
                                )
                            }

                            OutlinedButton(
                                onClick = {
                                    val dest = if (trip.customerLat != null && trip.customerLng != null) {
                                        "${trip.customerLat},${trip.customerLng}"
                                    } else Uri.encode(trip.address)
                                    runCatching {
                                        context.startActivity(
                                            Intent(
                                                Intent.ACTION_VIEW,
                                                Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$dest")
                                            )
                                        )
                                    }
                                },
                                modifier = Modifier.weight(0.9f),
                                contentPadding = PaddingValues(vertical = 8.dp)
                            ) {
                                Icon(Icons.Default.Navigation, contentDescription = "Navigate", modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Map", style = MaterialTheme.typography.labelLarge)
                            }

                            if (trip.paymentMode == "COD") {
                                IconButton(
                                    onClick = onOpenCashCalculator,
                                    modifier = Modifier
                                        .size(40.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(ext.warningContainer)
                                        .testTag("cash_calc_btn_${trip.tripId}")
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Calculate,
                                        contentDescription = "Cash Change",
                                        tint = ext.warning,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }

                            IconButton(
                                onClick = onOpenSos,
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(ext.dangerContainer)
                                    .testTag("sos_btn_${trip.tripId}")
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Warning,
                                    contentDescription = "Emergency SOS",
                                    tint = ext.danger,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }

                        if (allPickedUp) {
                            Spacer(Modifier.height(12.dp))
                            HorizontalDivider(color = ext.borderSubtle)
                            Spacer(Modifier.height(12.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "VERIFY CUSTOMER DELIVERY",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = ext.success
                                )
                                Text(
                                    text = "Ask Customer for 4-Digit PIN",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = ext.textMuted
                                )
                            }

                            Spacer(Modifier.height(8.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                OutlinedTextField(
                                    value = deliveryPinInput,
                                    onValueChange = {
                                        deliveryPinInput = it.filter { ch -> ch.isDigit() }.take(6)
                                    },
                                    placeholder = { Text("4-Digit PIN") },
                                    singleLine = true,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                                    modifier = Modifier
                                        .weight(1f)
                                        .testTag("delivery_pin_input_${trip.tripId}")
                                )

                                Button(
                                    onClick = { onCompleteDeliveryPin(deliveryPinInput) },
                                    modifier = Modifier
                                        .height(54.dp)
                                        .testTag("verify_delivery_pin_btn_${trip.tripId}")
                                ) {
                                    Icon(Icons.Default.TaskAlt, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Deliver")
                                }
                            }

                            Spacer(Modifier.height(8.dp))

                            FilledTonalButton(
                                onClick = onOpenQrScanner,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(46.dp)
                                    .testTag("open_qr_scanner_btn_${trip.tripId}")
                            ) {
                                Icon(Icons.Default.QrCodeScanner, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("Scan Customer Delivery QR (Camera / Photo)")
                            }
                        } else {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "Verify all merchant pickup codes above to unlock customer delivery PIN & QR scanner.",
                                style = MaterialTheme.typography.bodySmall,
                                color = ext.warning
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StorePickupStopRow(
    order: OrderRecord,
    store: StoreInfo,
    feeBreakdown: OrderDistanceFeeBreakdown,
    isOrderAccepted: Boolean,
    onVerifyPickup: (String) -> Unit
) {
    val ext = LocalFleetColors.current
    val isPicked = order.status in setOf("PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED")
    val expectedCode = RiderDomainLogic.getStorePickupCode(order, order.orderId)
    var pickupCodeInput by remember(order.orderId) { mutableStateOf("") }

    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (isPicked) ext.successContainer.copy(alpha = 0.35f) else ext.cardSubtle,
        modifier = Modifier
            .fillMaxWidth()
            .border(
                1.dp,
                if (isPicked) ext.success.copy(alpha = 0.5f) else ext.borderSubtle,
                RoundedCornerShape(12.dp)
            )
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = store.name,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = store.address,
                        style = MaterialTheme.typography.bodySmall,
                        color = ext.textMuted
                    )
                    Text(
                        text = "Distance: ${"%.1f".format(feeBreakdown.distanceKm)} km • Rider Pay: ₹${feeBreakdown.totalRiderFee.toInt()} (${feeBreakdown.formulaLabel})",
                        style = MaterialTheme.typography.labelSmall,
                        color = ext.success
                    )
                }

                if (isPicked) {
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = ext.success
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onPrimary,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = "PICKED UP • #$expectedCode",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onPrimary
                            )
                        }
                    }
                } else if (!isOrderAccepted) {
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = ext.warningContainer
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Lock,
                                contentDescription = "Locked",
                                tint = ext.warning,
                                modifier = Modifier.size(13.dp)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = "Code Locked",
                                style = MaterialTheme.typography.labelSmall,
                                color = ext.warning
                            )
                        }
                    }
                } else {
                    Text(
                        text = "Awaiting Pickup",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }

            Spacer(Modifier.height(6.dp))
            // Order Items summary
            order.items.forEach { item ->
                Text(
                    text = "• ${item.qty}x ${item.name}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (!isPicked) {
                Spacer(Modifier.height(10.dp))

                if (!isOrderAccepted) {
                    // Before Accepting Order -> Pickup Code is strictly hidden
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = ext.warningContainer.copy(alpha = 0.55f),
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, ext.warning.copy(alpha = 0.4f), RoundedCornerShape(10.dp))
                            .testTag("pickup_code_locked_${order.orderId}")
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Lock,
                                    contentDescription = "Pickup Code Locked",
                                    tint = ext.warning,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(Modifier.width(8.dp))
                                Column {
                                    Text(
                                        text = "STORE PICKUP CODE LOCKED",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = ext.warning
                                    )
                                    Text(
                                        text = "Order accept karne ke baad Pickup Code show hoga",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                            Text(
                                text = "••••",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.ExtraBold),
                                color = ext.warning
                            )
                        }
                    }
                } else {
                    // After Accepting Order -> Show Store Pickup Code prominently to Rider
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f),
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(
                                1.dp,
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.6f),
                                RoundedCornerShape(10.dp)
                            )
                            .testTag("pickup_code_badge_${order.orderId}")
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.LockOpen,
                                        contentDescription = "Pickup Code Unlocked",
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(15.dp)
                                    )
                                    Spacer(Modifier.width(5.dp))
                                    Text(
                                        text = "STORE PICKUP CODE",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = "Show or verify this code at store counter",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = ext.textMuted
                                )
                            }

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = MaterialTheme.colorScheme.primary
                                ) {
                                    Text(
                                        text = "#$expectedCode",
                                        style = MaterialTheme.typography.titleMedium.copy(
                                            fontWeight = FontWeight.ExtraBold
                                        ),
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                                    )
                                }

                                OutlinedButton(
                                    onClick = { pickupCodeInput = expectedCode },
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                    modifier = Modifier
                                        .height(36.dp)
                                        .testTag("use_pickup_code_btn_${order.orderId}")
                                ) {
                                    Text("Fill", style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(8.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = pickupCodeInput,
                            onValueChange = { pickupCodeInput = it.filter { c -> c.isDigit() }.take(4) },
                            placeholder = { Text("Enter 4-Digit Code ($expectedCode)") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier
                                .weight(1f)
                                .testTag("pickup_code_input_${order.orderId}")
                        )
                        Button(
                            onClick = { onVerifyPickup(pickupCodeInput) },
                            enabled = pickupCodeInput.length >= 4,
                            modifier = Modifier
                                .height(52.dp)
                                .testTag("verify_pickup_btn_${order.orderId}")
                        ) {
                            Text("Pick Up")
                        }
                    }
                }
            }
        }
    }
}

