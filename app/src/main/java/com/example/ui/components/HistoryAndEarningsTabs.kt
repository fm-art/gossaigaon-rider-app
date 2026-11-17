package com.example.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.domain.RiderDomainLogic
import com.example.model.FinancialSummary
import com.example.model.StoreInfo
import com.example.model.TripGroup
import com.example.ui.theme.LocalFleetColors
import com.example.viewmodel.FleetUiState

@Composable
fun HistoryTabComposable(
    completedTrips: List<TripGroup>,
    stores: Map<String, StoreInfo>,
    baseFee: Double,
    perKmRate: Double = 10.0
) {
    val ext = LocalFleetColors.current
    var filterMode by remember { mutableStateOf("ALL") }

    val historyEntries = remember(completedTrips, stores, baseFee, perKmRate) {
        RiderDomainLogic.buildDeliveredHistoryEntries(completedTrips, stores, baseFee, perKmRate)
    }
    val filtered = remember(historyEntries, filterMode) {
        if (filterMode == "ALL") historyEntries
        else historyEntries.filter { it.paymentMode.equals(filterMode, ignoreCase = true) }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 14.dp),
        contentPadding = PaddingValues(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Surface(
                shape = MaterialTheme.shapes.large,
                color = ext.cardElevated,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, ext.borderSubtle, MaterialTheme.shapes.large)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "DELIVERED TRIP ARCHIVE",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Text(
                                text = "${filtered.size} trips · ${"%.1f".format(filtered.sumOf { it.totalDistanceKm })} km · Earned ₹${filtered.sumOf { it.totalEarnings }.toInt()}",
                                style = MaterialTheme.typography.bodySmall,
                                color = ext.textMuted
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf("ALL", "COD", "UPI").forEach { mode ->
                                FilterChip(
                                    selected = filterMode == mode,
                                    onClick = { filterMode = mode },
                                    label = { Text(mode) }
                                )
                            }
                        }
                    }
                }
            }
        }

        if (filtered.isEmpty()) {
            item {
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = ext.cardElevated,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "No completed deliveries match the selected filter.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = ext.textMuted,
                        modifier = Modifier.padding(24.dp)
                    )
                }
            }
        } else {
            items(filtered, key = { it.tripId }) { entry ->
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = ext.cardElevated,
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, ext.borderSubtle, MaterialTheme.shapes.medium)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
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
                                        text = entry.shortId.uppercase(),
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = entry.dateLabel,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = ext.textMuted
                                )
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(
                                    text = "+₹${entry.totalEarnings.toInt()}",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = ext.success
                                )
                                Text(
                                    text = "${"%.1f".format(entry.totalDistanceKm)} km distance pay",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = entry.customerLocation,
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "Stores: ${entry.storeNames.joinToString(", ")} • ${"%.1f".format(entry.totalDistanceKm)} km • ${entry.paymentMode} Bill ₹${entry.totalBillAmount.toInt()}",
                            style = MaterialTheme.typography.bodySmall,
                            color = ext.textMuted
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun EarningsTabComposable(
    state: FleetUiState,
    financials: FinancialSummary,
    completedTrips: List<TripGroup>,
    onOpenSettlementModal: () -> Unit,
    onOpenPayoutModal: () -> Unit
) {
    val ext = LocalFleetColors.current
    val chartPoints = remember(
        completedTrips,
        state.adminSettings.riderBaseFee,
        state.adminSettings.riderPerKmRate,
        state.stores
    ) {
        RiderDomainLogic.calculateLast7DaysPerformance(
            completedTrips,
            state.adminSettings.riderBaseFee,
            state.stores,
            state.adminSettings.riderPerKmRate
        )
    }
    val leaderboard = remember(
        state.allOrders,
        state.allRiders,
        state.riderData.uid,
        state.adminSettings.riderBaseFee,
        state.adminSettings.riderPerKmRate,
        state.stores
    ) {
        RiderDomainLogic.calculateWeeklyLeaderboard(
            state.allOrders,
            state.allRiders,
            state.riderData.uid,
            state.adminSettings.riderBaseFee,
            state.stores,
            state.adminSettings.riderPerKmRate
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 14.dp),
        contentPadding = PaddingValues(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Distance-Based Payout Rate Card Banner
        item {
            Surface(
                shape = MaterialTheme.shapes.large,
                color = ext.cardElevated,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.5f), MaterialTheme.shapes.large)
                    .testTag("distance_rate_card_banner")
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "DISTANCE-BASED ORDER PAYOUT FORMULA",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = "Base ₹${state.adminSettings.riderBaseFee.toInt()} + ₹${state.adminSettings.riderPerKmRate.toInt()} per km (Store → Customer)",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = ext.successContainer
                        ) {
                            Text(
                                text = "₹${state.adminSettings.riderPerKmRate.toInt()}/km",
                                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.ExtraBold),
                                color = ext.success,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "Delivered Distance: ${"%.1f".format(financials.totalDistanceKm)} km • Distance Pay Earned: +₹${financials.totalDistanceBonusEarned.toInt()}",
                        style = MaterialTheme.typography.bodySmall,
                        color = ext.textMuted
                    )
                }
            }
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Surface(
                    shape = MaterialTheme.shapes.large,
                    color = ext.cardElevated,
                    modifier = Modifier
                        .weight(1f)
                        .border(1.5.dp, ext.success.copy(alpha = 0.5f), MaterialTheme.shapes.large)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = "WITHDRAWABLE WALLET",
                            style = MaterialTheme.typography.labelSmall,
                            color = ext.success
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "₹${financials.availablePayoutBalance.toInt()}",
                            style = MaterialTheme.typography.headlineLarge,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "Total Earned: ₹${financials.totalRiderEarned.toInt()}",
                            style = MaterialTheme.typography.bodySmall,
                            color = ext.textMuted
                        )
                        Spacer(Modifier.height(10.dp))
                        Button(
                            onClick = onOpenPayoutModal,
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("open_payout_modal_btn")
                        ) {
                            Text("Withdraw UPI")
                        }
                    }
                }

                Surface(
                    shape = MaterialTheme.shapes.large,
                    color = ext.cardElevated,
                    modifier = Modifier
                        .weight(1f)
                        .border(1.5.dp, ext.warning.copy(alpha = 0.5f), MaterialTheme.shapes.large)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = "COD CASH IN HAND",
                            style = MaterialTheme.typography.labelSmall,
                            color = ext.warning
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "₹${financials.netCashInHand.toInt()}",
                            style = MaterialTheme.typography.headlineLarge,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "Limit: ₹${state.adminSettings.maxRiderCashLimit.toInt()}",
                            style = MaterialTheme.typography.bodySmall,
                            color = ext.textMuted
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedButton(
                            onClick = onOpenSettlementModal,
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("open_settlement_modal_btn")
                        ) {
                            Text("Deposit COD")
                        }
                    }
                }
            }
        }

        item {
            Surface(
                shape = MaterialTheme.shapes.large,
                color = ext.cardElevated,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, ext.borderSubtle, MaterialTheme.shapes.large)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "LAST 7 DAYS EARNINGS TELEMETRY",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(12.dp))
                    val maxEarn = (chartPoints.maxOfOrNull { it.earnings } ?: 100.0).coerceAtLeast(100.0)
                    val barColor = MaterialTheme.colorScheme.primary
                    Canvas(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(130.dp)
                    ) {
                        val count = chartPoints.size.coerceAtLeast(1)
                        val slotW = size.width / count
                        val barW = (slotW * 0.52f).coerceAtMost(42f)
                        chartPoints.forEachIndexed { idx, pt ->
                            val ratio = (pt.earnings / maxEarn).toFloat().coerceIn(0.08f, 1f)
                            val bh = size.height * ratio
                            val left = idx * slotW + (slotW - barW) / 2f
                            drawRoundRect(
                                color = if (idx == count - 1) barColor else barColor.copy(alpha = 0.45f),
                                topLeft = Offset(left, size.height - bh),
                                size = Size(barW, bh),
                                cornerRadius = CornerRadius(10f, 10f)
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    Row(modifier = Modifier.fillMaxWidth()) {
                        chartPoints.forEach { pt ->
                            Column(
                                modifier = Modifier.weight(1f),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    text = "₹${pt.earnings.toInt()}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = pt.label,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = ext.textMuted
                                )
                            }
                        }
                    }
                }
            }
        }

        item {
            Surface(
                shape = MaterialTheme.shapes.large,
                color = ext.cardElevated,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, ext.borderSubtle, MaterialTheme.shapes.large)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "WEEKLY FLEET LEADERBOARD",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Text(
                                text = "${leaderboard.weekRangeLabel} • ${leaderboard.totalFleetTripsThisWeek} Fleet Trips",
                                style = MaterialTheme.typography.bodySmall,
                                color = ext.textMuted
                            )
                        }
                        Icon(
                            imageVector = Icons.Default.EmojiEvents,
                            contentDescription = "Leaderboard",
                            tint = ext.warning
                        )
                    }

                    Spacer(Modifier.height(10.dp))
                    leaderboard.topRiders.forEach { entry ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(
                                    if (entry.isCurrentRider) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)
                                    else Color.Transparent
                                )
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = "#${entry.rank}",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (entry.rank <= 3) ext.warning else ext.textMuted,
                                    modifier = Modifier.width(30.dp)
                                )
                                Column {
                                    Text(
                                        text = if (entry.isCurrentRider) "${entry.name} (You)" else entry.name,
                                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = "${entry.vehicle} • ★ ${entry.ratingAvg}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = ext.textMuted
                                    )
                                }
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(
                                    text = "${entry.deliveredTrips} trips",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = ext.success
                                )
                                Text(
                                    text = "₹${entry.weeklyEarnings.toInt()}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = ext.textMuted
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
