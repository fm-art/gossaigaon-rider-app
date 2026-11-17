package com.example.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.domain.RiderDomainLogic
import com.example.ui.theme.LocalFleetColors
import com.example.viewmodel.FleetUiState

@Composable
fun ProfileTabComposable(
    state: FleetUiState,
    onSetDarkMode: (Boolean) -> Unit,
    onOpenBatteryTipsModal: () -> Unit,
    onOpenSecurityModal: () -> Unit,
    onOpenFeedbackModal: () -> Unit,
    onOpenRatingsModal: () -> Unit,
    onToggleVoice: (Boolean) -> Unit,
    onToggleAutoGps: (Boolean) -> Unit,
    onSaveProfile: (String, String, String, Boolean, String, String) -> Unit,
    onSignOut: () -> Unit
) {
    val ext = LocalFleetColors.current
    val rider = state.riderData

    var phone by remember(rider.phone) { mutableStateOf(rider.phone) }
    var upiId by remember(rider.upiId) { mutableStateOf(rider.upiId) }
    var vehicle by remember(rider.vehicle) { mutableStateOf(rider.vehicle) }
    var shiftEnabled by remember(rider.preferredShift.enabled) { mutableStateOf(rider.preferredShift.enabled) }
    var shiftStart by remember(rider.preferredShift.startTime) { mutableStateOf(rider.preferredShift.startTime) }
    var shiftEnd by remember(rider.preferredShift.endTime) { mutableStateOf(rider.preferredShift.endTime) }

    val trailSummary = remember(rider.recentRoute) {
        RiderDomainLogic.summarizeTodayRouteTrail(rider.recentRoute)
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 14.dp),
        contentPadding = PaddingValues(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Appearance: Dark Mode / Light Mode Card
        item {
            Surface(
                shape = MaterialTheme.shapes.large,
                color = ext.cardElevated,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.6f), MaterialTheme.shapes.large)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = if (state.isDarkMode) Icons.Default.DarkMode else Icons.Default.LightMode,
                                contentDescription = "Appearance Mode",
                                tint = MaterialTheme.colorScheme.primary
                            )
                            Spacer(Modifier.width(8.dp))
                            Column {
                                Text(
                                    text = "DISPLAY MODE (DARK / LIGHT)",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                Text(
                                    text = if (state.isDarkMode) "Active: Dark Mode (Night & Battery Saver)" else "Active: Light Mode (Daylight High-Visibility)",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = ext.textMuted
                                )
                            }
                        }
                        Switch(
                            checked = state.isDarkMode,
                            onCheckedChange = onSetDarkMode,
                            modifier = Modifier.testTag("profile_dark_mode_switch")
                        )
                    }

                    Spacer(Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = if (state.isDarkMode) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f) else ext.cardSubtle,
                            modifier = Modifier
                                .weight(1f)
                                .border(
                                    width = if (state.isDarkMode) 2.dp else 1.dp,
                                    color = if (state.isDarkMode) MaterialTheme.colorScheme.primary else ext.borderSubtle,
                                    shape = RoundedCornerShape(14.dp)
                                )
                                .clickable { onSetDarkMode(true) }
                                .testTag("profile_dark_mode_btn")
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.DarkMode,
                                    contentDescription = "Dark Mode",
                                    tint = if (state.isDarkMode) MaterialTheme.colorScheme.primary else ext.textMuted,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = "Dark Mode",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }

                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = if (!state.isDarkMode) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f) else ext.cardSubtle,
                            modifier = Modifier
                                .weight(1f)
                                .border(
                                    width = if (!state.isDarkMode) 2.dp else 1.dp,
                                    color = if (!state.isDarkMode) MaterialTheme.colorScheme.primary else ext.borderSubtle,
                                    shape = RoundedCornerShape(14.dp)
                                )
                                .clickable { onSetDarkMode(false) }
                                .testTag("profile_light_mode_btn")
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.LightMode,
                                    contentDescription = "Light Mode",
                                    tint = if (!state.isDarkMode) MaterialTheme.colorScheme.primary else ext.textMuted,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = "Light Mode",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                    }
                }
            }
        }

        // Battery Optimization Tips & Ratings Row
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                FilledTonalButton(
                    onClick = onOpenBatteryTipsModal,
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp)
                        .testTag("open_battery_tips_modal_btn")
                ) {
                    Icon(Icons.Default.BatterySaver, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Battery Tips")
                }

                FilledTonalButton(
                    onClick = onOpenRatingsModal,
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp)
                        .testTag("open_ratings_modal_btn")
                ) {
                    Icon(Icons.Default.Star, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Ratings (${rider.ratingAvg})")
                }
            }
        }

        // Today's GPS Route Trail Card
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
                                text = "TODAY'S GPS ROUTE TRAIL",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.secondary
                            )
                            Text(
                                text = "${trailSummary.pointCount} points • ${trailSummary.totalDistanceKm} km • ${trailSummary.durationMinutes} min",
                                style = MaterialTheme.typography.bodySmall,
                                color = ext.textMuted
                            )
                        }
                        Text(
                            text = "${trailSummary.startTimeLabel} – ${trailSummary.endTimeLabel}",
                            style = MaterialTheme.typography.labelSmall,
                            color = ext.info
                        )
                    }

                    Spacer(Modifier.height(10.dp))
                    val trailColor = MaterialTheme.colorScheme.secondary
                    Canvas(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(110.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(ext.cardSubtle)
                    ) {
                        val pts = trailSummary.points
                        if (pts.size >= 2) {
                            val minLat = pts.minOf { it.lat }
                            val maxLat = pts.maxOf { it.lat }.coerceAtLeast(minLat + 0.001)
                            val minLng = pts.minOf { it.lng }
                            val maxLng = pts.maxOf { it.lng }.coerceAtLeast(minLng + 0.001)
                            val pad = 20f
                            val path = Path()
                            pts.forEachIndexed { idx, p ->
                                val x = pad + ((p.lng - minLng) / (maxLng - minLng)).toFloat() * (size.width - pad * 2f)
                                val y = size.height - pad - ((p.lat - minLat) / (maxLat - minLat)).toFloat() * (size.height - pad * 2f)
                                if (idx == 0) path.moveTo(x, y) else path.lineTo(x, y)
                                drawCircle(trailColor, radius = 5f, center = Offset(x, y))
                            }
                            drawPath(
                                path = path,
                                color = trailColor,
                                style = Stroke(width = 4f, cap = StrokeCap.Round)
                            )
                        }
                    }
                }
            }
        }

        // Rider Profile Form
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
                        text = "RIDER COCKPIT & PAYOUT SETTINGS",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(10.dp))

                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it.filter { c -> c.isDigit() }.take(10) },
                        label = { Text("10-Digit Mobile") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = upiId,
                        onValueChange = { upiId = it },
                        label = { Text("Verified Payout UPI ID") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = vehicle,
                        onValueChange = { vehicle = it },
                        label = { Text("Vehicle Registration") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Voice TTS Announcements", style = MaterialTheme.typography.bodyMedium)
                        Switch(checked = state.voiceAnnouncementsEnabled, onCheckedChange = onToggleVoice)
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Battery-Aware Auto GPS", style = MaterialTheme.typography.bodyMedium)
                        Switch(checked = state.autoGpsEnabled, onCheckedChange = onToggleAutoGps)
                    }

                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = {
                            onSaveProfile(phone, upiId, vehicle, shiftEnabled, shiftStart, shiftEnd)
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                            .testTag("save_profile_btn")
                    ) {
                        Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Save Rider Settings")
                    }

                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = onOpenFeedbackModal,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Support Ticket")
                        }
                        OutlinedButton(
                            onClick = onOpenSecurityModal,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Scam Shield Log")
                        }
                    }

                    Spacer(Modifier.height(12.dp))
                    TextButton(
                        onClick = onSignOut,
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("sign_out_btn")
                    ) {
                        Icon(Icons.Default.Logout, contentDescription = null, tint = ext.danger)
                        Spacer(Modifier.width(6.dp))
                        Text("Sign Out of Terminal", color = ext.danger)
                    }
                }
            }
        }
    }
}
