package com.example.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.domain.RiderDomainLogic
import com.example.model.FinancialSummary
import com.example.ui.theme.LocalFleetColors
import com.example.viewmodel.FleetUiState

@Composable
fun RiderHeaderBar(
    state: FleetUiState,
    financials: FinancialSummary,
    hasActiveDelivery: Boolean,
    onToggleOnline: () -> Unit,
    onOpenNotifications: () -> Unit,
    onToggleDarkMode: () -> Unit,
    onOpenSecurityShield: () -> Unit,
    onOpenBatteryTips: () -> Unit,
    onSyncLive: () -> Unit
) {
    val ext = LocalFleetColors.current
    val rider = state.riderData
    val unreadCount = state.notifications.count { !it.isRead }
    val gpsPolicy = RiderDomainLogic.evaluateBatteryGpsPolicy(
        state.batteryStatus,
        hasActiveDelivery,
        state.autoGpsEnabled
    )

    val dutyColor by animateColorAsState(
        if (rider.online) ext.success else ext.textMuted,
        label = "dutyColor"
    )

    Surface(
        color = ext.cardElevated,
        modifier = Modifier
            .fillMaxWidth()
            .border(width = 1.dp, color = ext.borderSubtle)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            // Top Row: Avatar + Rider Info + Dark/Light Mode Toggle + Duty Toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.16f))
                            .border(1.5.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(14.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.TwoWheeler,
                            contentDescription = "Rider",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = rider.name,
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(Modifier.width(6.dp))
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = ext.warningContainer
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Star,
                                        contentDescription = "Rating",
                                        tint = ext.warning,
                                        modifier = Modifier.size(12.dp)
                                    )
                                    Spacer(Modifier.width(2.dp))
                                    Text(
                                        text = "${rider.ratingAvg}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = ext.warning
                                    )
                                }
                            }
                        }
                        Text(
                            text = rider.vehicle.ifBlank { "Gossaigaon Fleet Terminal" },
                            style = MaterialTheme.typography.bodySmall,
                            color = ext.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Notification Bell Icon with Unread Badge
                    IconButton(
                        onClick = onOpenNotifications,
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(ext.warningContainer)
                            .testTag("header_notifications_button")
                    ) {
                        BadgedBox(
                            badge = {
                                if (unreadCount > 0) {
                                    Badge(
                                        containerColor = ext.danger,
                                        contentColor = Color.White
                                    ) {
                                        Text(
                                            text = if (unreadCount > 9) "9+" else "$unreadCount",
                                            style = MaterialTheme.typography.labelSmall
                                        )
                                    }
                                }
                            }
                        ) {
                            Icon(
                                imageVector = if (unreadCount > 0) Icons.Default.NotificationsActive else Icons.Default.Notifications,
                                contentDescription = "Notifications",
                                tint = ext.warning,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }

                    Spacer(Modifier.width(6.dp))

                    // Dark Mode / Light Mode Toggle Button
                    IconButton(
                        onClick = onToggleDarkMode,
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.14f))
                            .testTag("header_dark_light_toggle")
                    ) {
                        Icon(
                            imageVector = if (state.isDarkMode) Icons.Default.LightMode else Icons.Default.DarkMode,
                            contentDescription = if (state.isDarkMode) "Switch to Light Mode" else "Switch to Dark Mode",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    Spacer(Modifier.width(6.dp))

                    // Scam Shield Button
                    IconButton(
                        onClick = onOpenSecurityShield,
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(ext.infoContainer)
                            .testTag("header_security_button")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Shield,
                            contentDescription = "Scam Shield",
                            tint = ext.info,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    Spacer(Modifier.width(6.dp))

                    // Duty Switch Pill
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = if (rider.online) ext.successContainer else ext.cardSubtle,
                        modifier = Modifier
                            .border(
                                1.5.dp,
                                dutyColor,
                                RoundedCornerShape(50)
                            )
                            .clickable { onToggleOnline() }
                            .testTag("duty_toggle_button")
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(dutyColor)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = if (rider.online) "ON DUTY" else "OFF DUTY",
                                style = MaterialTheme.typography.labelMedium,
                                color = dutyColor
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(8.dp))

            // Second Row: Telemetry Chips (Battery, GPS Mode, Cash-in-Hand, Simulate Dispatch)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Battery Chip
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (state.batteryStatus.levelPercent <= 20) ext.dangerContainer else ext.cardSubtle,
                    modifier = Modifier
                        .clickable { onOpenBatteryTips() }
                        .border(1.dp, ext.borderSubtle, RoundedCornerShape(8.dp))
                        .testTag("header_battery_chip")
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = if (state.batteryStatus.charging) Icons.Default.BatteryChargingFull else Icons.Default.BatteryStd,
                            contentDescription = "Battery",
                            tint = if (state.batteryStatus.levelPercent <= 20) ext.danger else ext.success,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = "${state.batteryStatus.levelPercent}% · ${gpsPolicy.badgeLabel}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }

                // COD Cash Chip
                val codRatio = (financials.netCashInHand / state.adminSettings.maxRiderCashLimit).coerceIn(0.0, 1.0)
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (codRatio >= 0.8) ext.warningContainer else ext.cardSubtle,
                    modifier = Modifier.border(1.dp, ext.borderSubtle, RoundedCornerShape(8.dp))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Payments,
                            contentDescription = "COD Cash",
                            tint = if (codRatio >= 0.8) ext.warning else MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = "COD ₹${financials.netCashInHand.toInt()}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }

                Spacer(Modifier.weight(1f))

                // Live Cloud Sync Chip
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                    modifier = Modifier
                        .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.45f), RoundedCornerShape(8.dp))
                        .clickable { onSyncLive() }
                        .testTag("live_sync_chip")
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Sync,
                            contentDescription = "Sync Live Data",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = "Sync",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        }
    }
}
