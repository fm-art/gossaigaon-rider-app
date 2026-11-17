package com.example.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.domain.RiderDomainLogic
import com.example.model.HeatmapPoint
import com.example.model.TripGroup
import com.example.ui.theme.LocalFleetColors
import com.example.viewmodel.FleetUiState

@Composable
fun MapViewTabComposable(
    state: FleetUiState,
    activeTrips: List<TripGroup>,
    onRefreshGps: () -> Unit,
    onToggleAutoGps: (Boolean) -> Unit
) {
    val ext = LocalFleetColors.current
    val context = LocalContext.current
    var showDemandHeatmap by remember { mutableStateOf(true) }

    val heatmapPoints = remember(state.allOrders, state.stores) {
        RiderDomainLogic.buildOrderVolumeHeatmap(state.allOrders, state.stores)
    }

    val gpsPolicy = RiderDomainLogic.evaluateBatteryGpsPolicy(
        state.batteryStatus,
        activeTrips.isNotEmpty(),
        state.autoGpsEnabled
    )

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 14.dp),
        contentPadding = PaddingValues(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Radar Control Bar
        item {
            Surface(
                shape = MaterialTheme.shapes.large,
                color = ext.cardElevated,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, ext.borderSubtle, MaterialTheme.shapes.large)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "GOSSAIGAON TACTICAL RADAR",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Text(
                                text = "Lat ${"%.4f".format(state.riderData.lat)} · Lng ${"%.4f".format(state.riderData.lng)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = ext.textMuted
                            )
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(
                                selected = showDemandHeatmap,
                                onClick = { showDemandHeatmap = !showDemandHeatmap },
                                label = { Text("Heatmap") },
                                leadingIcon = {
                                    Icon(
                                        imageVector = Icons.Default.Whatshot,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp)
                                    )
                                },
                                modifier = Modifier.testTag("toggle_heatmap_chip")
                            )

                            Button(
                                onClick = onRefreshGps,
                                enabled = !state.isRefreshingGps,
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                                modifier = Modifier.testTag("manual_gps_refresh_btn")
                            ) {
                                Icon(
                                    imageVector = Icons.Default.MyLocation,
                                    contentDescription = "My GPS",
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(if (state.isRefreshingGps) "Fixing..." else "My GPS")
                            }
                        }
                    }

                    Spacer(Modifier.height(12.dp))

                    // Interactive Tactical Canvas Radar
                    TacticalRadarCanvas(
                        riderLat = state.riderData.lat,
                        riderLng = state.riderData.lng,
                        stores = state.stores.values.toList(),
                        activeTrips = activeTrips,
                        heatmapPoints = if (showDemandHeatmap) heatmapPoints else emptyList()
                    )

                    Spacer(Modifier.height(10.dp))

                    // Legend & Auto-GPS Switch Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            LegendDot(color = MaterialTheme.colorScheme.primary, label = "You")
                            LegendDot(color = ext.info, label = "Stores")
                            LegendDot(color = ext.success, label = "Drop-offs")
                            if (showDemandHeatmap) {
                                LegendDot(color = ext.danger, label = "Hotspots")
                            }
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "Auto GPS",
                                style = MaterialTheme.typography.labelSmall,
                                color = ext.textMuted
                            )
                            Spacer(Modifier.width(6.dp))
                            Switch(
                                checked = state.autoGpsEnabled,
                                onCheckedChange = onToggleAutoGps,
                                modifier = Modifier.testTag("map_auto_gps_switch")
                            )
                        }
                    }

                    Text(
                        text = gpsPolicy.reason,
                        style = MaterialTheme.typography.bodySmall,
                        color = ext.textMuted
                    )
                }
            }
        }

        // High-Demand Order Volume Hotspots Card
        if (showDemandHeatmap && heatmapPoints.isNotEmpty()) {
            item {
                Surface(
                    shape = MaterialTheme.shapes.large,
                    color = ext.cardElevated,
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, ext.borderSubtle, MaterialTheme.shapes.large)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Whatshot,
                                contentDescription = null,
                                tint = ext.warning
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = "High-Order Demand Zones (Gossaigaon)",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        heatmapPoints.take(4).forEach { pt ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 5.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = pt.areaLabel,
                                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = "${pt.orderCount} recent deliveries • ₹${pt.totalValue.toInt()} volume",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = ext.textMuted
                                    )
                                }
                                OutlinedButton(
                                    onClick = {
                                        runCatching {
                                            context.startActivity(
                                                Intent(
                                                    Intent.ACTION_VIEW,
                                                    Uri.parse("https://www.google.com/maps/dir/?api=1&destination=${pt.lat},${pt.lng}")
                                                )
                                            )
                                        }
                                    },
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp)
                                ) {
                                    Text("Head Here", style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                    }
                }
            }
        }

        // Partner Stores Directory with Distance
        item {
            Text(
                text = "GOSSAIGAON BAZAR PARTNER STORES",
                style = MaterialTheme.typography.labelMedium,
                color = ext.textMuted
            )
        }

        items(state.stores.values.toList(), key = { it.storeId }) { store ->
            val dist = RiderDomainLogic.calculateDistanceKm(
                state.riderData.lat,
                state.riderData.lng,
                store.lat,
                store.lng
            )
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = ext.cardElevated,
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, ext.borderSubtle, MaterialTheme.shapes.medium)
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
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
                        if (dist != null) {
                            Text(
                                text = "${"%.2f".format(dist)} km from your position",
                                style = MaterialTheme.typography.labelSmall,
                                color = ext.info
                            )
                        }
                    }
                    FilledTonalIconButton(
                        onClick = {
                            runCatching {
                                context.startActivity(
                                    Intent(
                                        Intent.ACTION_VIEW,
                                        Uri.parse("https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}")
                                    )
                                )
                            }
                        }
                    ) {
                        Icon(Icons.Default.Directions, contentDescription = "Directions")
                    }
                }
            }
        }
    }
}

@Composable
private fun TacticalRadarCanvas(
    riderLat: Double,
    riderLng: Double,
    stores: List<com.example.model.StoreInfo>,
    activeTrips: List<TripGroup>,
    heatmapPoints: List<HeatmapPoint>
) {
    val ext = LocalFleetColors.current
    val primaryColor = MaterialTheme.colorScheme.primary
    val storeColor = ext.info
    val dropColor = ext.success
    val heatColor = ext.danger

    val minLat = 26.4495
    val maxLat = 26.4605
    val minLng = 89.9680
    val maxLng = 89.9805

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(250.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(ext.cardSubtle)
            .border(1.dp, ext.borderStrong.copy(alpha = 0.45f), RoundedCornerShape(16.dp))
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            val pad = 28f

            fun project(lat: Double, lng: Double): Offset {
                val nx = ((lng - minLng) / (maxLng - minLng)).coerceIn(0.0, 1.0).toFloat()
                val ny = (1.0 - ((lat - minLat) / (maxLat - minLat)).coerceIn(0.0, 1.0)).toFloat()
                return Offset(
                    x = pad + nx * (w - pad * 2f),
                    y = pad + ny * (h - pad * 2f)
                )
            }

            // Draw Radar Grid Rings
            val center = Offset(w / 2f, h / 2f)
            val gridColor = ext.borderSubtle.copy(alpha = 0.55f)
            listOf(0.24f, 0.42f, 0.62f).forEach { rRatio ->
                drawCircle(
                    color = gridColor,
                    radius = minOf(w, h) * rRatio,
                    center = center,
                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.2f)
                )
            }
            drawLine(gridColor, Offset(0f, center.y), Offset(w, center.y), strokeWidth = 1f)
            drawLine(gridColor, Offset(center.x, 0f), Offset(center.x, h), strokeWidth = 1f)

            // Draw Heatmap Glow Circles
            heatmapPoints.forEach { pt ->
                val pos = project(pt.lat, pt.lng)
                drawCircle(
                    color = heatColor.copy(alpha = 0.18f * pt.weight),
                    radius = 46f * pt.weight.coerceAtLeast(0.45f),
                    center = pos
                )
                drawCircle(
                    color = heatColor.copy(alpha = 0.35f * pt.weight),
                    radius = 20f * pt.weight.coerceAtLeast(0.45f),
                    center = pos
                )
            }

            val riderPos = project(riderLat, riderLng)

            // Draw Route Lines from Rider to Active Stores & Customers
            activeTrips.forEach { trip ->
                val cLat = trip.customerLat
                val cLng = trip.customerLng
                if (cLat != null && cLng != null) {
                    val dropPos = project(cLat, cLng)
                    drawLine(
                        color = dropColor.copy(alpha = 0.7f),
                        start = riderPos,
                        end = dropPos,
                        strokeWidth = 4f,
                        cap = StrokeCap.Round,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 8f), 0f)
                    )
                    drawCircle(color = dropColor, radius = 9f, center = dropPos)
                }
            }

            // Draw Store Nodes
            stores.forEach { st ->
                val stPos = project(st.lat, st.lng)
                drawCircle(color = storeColor.copy(alpha = 0.25f), radius = 15f, center = stPos)
                drawCircle(color = storeColor, radius = 7f, center = stPos)
            }

            // Draw Rider Beacon
            drawCircle(color = primaryColor.copy(alpha = 0.28f), radius = 22f, center = riderPos)
            drawCircle(color = Color.White, radius = 9.5f, center = riderPos)
            drawCircle(color = primaryColor, radius = 7f, center = riderPos)
        }

        Surface(
            shape = RoundedCornerShape(8.dp),
            color = ext.cardElevated.copy(alpha = 0.88f),
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(10.dp)
        ) {
            Text(
                text = "GOSSAIGAON LIVE TELEMETRY",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }
    }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(9.dp)
                .clip(CircleShape)
                .background(color)
        )
        Spacer(Modifier.width(4.dp))
        Text(text = label, style = MaterialTheme.typography.bodySmall)
    }
}
