package com.example

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.domain.RiderDomainLogic
import com.example.model.RiderTab
import com.example.model.ToastType
import com.example.ui.components.*
import com.example.ui.theme.DarkBackgroundColor
import com.example.ui.theme.GossaigaonFleetTheme
import com.example.ui.theme.LightBackgroundColor
import com.example.ui.theme.LocalFleetColors
import com.example.viewmodel.FleetViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val fleetViewModel: FleetViewModel = viewModel()
            val state by fleetViewModel.uiState.collectAsStateWithLifecycle()

            LaunchedEffect(state.isDarkMode) {
                val bgArgb = (if (state.isDarkMode) DarkBackgroundColor else LightBackgroundColor).toArgb()
                if (state.isDarkMode) {
                    enableEdgeToEdge(
                        statusBarStyle = SystemBarStyle.dark(bgArgb),
                        navigationBarStyle = SystemBarStyle.dark(bgArgb)
                    )
                } else {
                    enableEdgeToEdge(
                        statusBarStyle = SystemBarStyle.light(bgArgb, bgArgb),
                        navigationBarStyle = SystemBarStyle.light(bgArgb, bgArgb)
                    )
                }
            }

            GossaigaonFleetTheme(isDarkMode = state.isDarkMode) {
                GossaigaonNativeApp(viewModel = fleetViewModel)
            }
        }
    }
}

@Composable
fun GossaigaonNativeApp(viewModel: FleetViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val ext = LocalFleetColors.current

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { _ ->
        viewModel.refreshManualGps()
    }

    val (activeTrips, completedTrips) = remember(state.assignedOrders) {
        RiderDomainLogic.getTripsGrouped(state.assignedOrders)
    }

    val financials = remember(
        state.assignedOrders,
        state.settlements,
        state.payouts,
        state.adminSettings.riderBaseFee,
        state.adminSettings.riderPerKmRate,
        state.stores
    ) {
        RiderDomainLogic.calculateFinancialSummary(
            state.assignedOrders,
            state.settlements,
            state.payouts,
            state.adminSettings.riderBaseFee,
            state.stores,
            state.adminSettings.riderPerKmRate
        )
    }

    // Back button returns from secondary tabs to Active tab
    BackHandler(enabled = state.session != null && state.activeTab != RiderTab.ACTIVE) {
        viewModel.selectTab(RiderTab.ACTIVE)
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.safeDrawing)
    ) {
        val isExpandedScreen = maxWidth >= 700.dp

        if (state.session == null || state.pendingVerificationEmail != null) {
            AuthScreenComposable(
                state = state,
                onSignIn = viewModel::signInWithEmail,
                onRegister = viewModel::registerRider,
                onForgotPassword = viewModel::sendPasswordReset,
                onResendVerification = viewModel::resendVerificationEmail,
                onCheckVerified = viewModel::checkEmailVerificationConfirmed,
                onSignOutVerification = viewModel::signOut,
                onGoogleDirectLogin = viewModel::signInWithGoogleDirect,
                onToggleDarkMode = viewModel::toggleDarkMode,
                onClearMessages = viewModel::clearAuthMessages
            )
        } else {
            Scaffold(
                containerColor = MaterialTheme.colorScheme.background,
                topBar = {
                    RiderHeaderBar(
                        state = state,
                        financials = financials,
                        hasActiveDelivery = activeTrips.isNotEmpty(),
                        onToggleOnline = viewModel::toggleDutyOnline,
                        onOpenNotifications = { viewModel.setModalState(notifications = true) },
                        onToggleDarkMode = viewModel::toggleDarkMode,
                        onOpenSecurityShield = { viewModel.setModalState(security = true) },
                        onOpenBatteryTips = { viewModel.setModalState(batteryTips = true) },
                        onSyncLive = viewModel::syncWithFirebaseBackend
                    )
                },
                bottomBar = {
                    if (!isExpandedScreen) {
                        NavigationBar(
                            containerColor = ext.cardElevated,
                            tonalElevation = 0.dp,
                            modifier = Modifier.border(1.dp, ext.borderSubtle)
                        ) {
                            RiderTab.entries.forEach { tab ->
                                val selected = state.activeTab == tab
                                NavigationBarItem(
                                    selected = selected,
                                    onClick = { viewModel.selectTab(tab) },
                                    icon = {
                                        BadgedBox(
                                            badge = {
                                                if (tab == RiderTab.ACTIVE && activeTrips.isNotEmpty()) {
                                                    Badge(
                                                        containerColor = MaterialTheme.colorScheme.primary,
                                                        contentColor = MaterialTheme.colorScheme.onPrimary
                                                    ) {
                                                        Text("${activeTrips.size}")
                                                    }
                                                }
                                            }
                                        ) {
                                            Icon(
                                                imageVector = when (tab) {
                                                    RiderTab.ACTIVE -> Icons.Default.LocalShipping
                                                    RiderTab.MAP -> Icons.Default.Explore
                                                    RiderTab.HISTORY -> Icons.Default.History
                                                    RiderTab.EARNINGS -> Icons.Default.AccountBalanceWallet
                                                    RiderTab.PROFILE -> Icons.Default.Person
                                                },
                                                contentDescription = tab.label
                                            )
                                        }
                                    },
                                    label = {
                                        Text(
                                            text = tab.label,
                                            style = MaterialTheme.typography.labelSmall
                                        )
                                    },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = MaterialTheme.colorScheme.onPrimary,
                                        selectedTextColor = MaterialTheme.colorScheme.primary,
                                        indicatorColor = MaterialTheme.colorScheme.primary,
                                        unselectedIconColor = ext.textMuted,
                                        unselectedTextColor = ext.textMuted
                                    ),
                                    modifier = Modifier.testTag("nav_tab_${tab.id}")
                                )
                            }
                        }
                    }
                }
            ) { innerPadding ->
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                ) {
                    if (isExpandedScreen) {
                        NavigationRail(
                            containerColor = ext.cardElevated,
                            modifier = Modifier.border(1.dp, ext.borderSubtle)
                        ) {
                            RiderTab.entries.forEach { tab ->
                                val selected = state.activeTab == tab
                                NavigationRailItem(
                                    selected = selected,
                                    onClick = { viewModel.selectTab(tab) },
                                    icon = {
                                        Icon(
                                            imageVector = when (tab) {
                                                RiderTab.ACTIVE -> Icons.Default.LocalShipping
                                                RiderTab.MAP -> Icons.Default.Explore
                                                RiderTab.HISTORY -> Icons.Default.History
                                                RiderTab.EARNINGS -> Icons.Default.AccountBalanceWallet
                                                RiderTab.PROFILE -> Icons.Default.Person
                                            },
                                            contentDescription = tab.label
                                        )
                                    },
                                    label = { Text(tab.label) },
                                    modifier = Modifier.testTag("rail_tab_${tab.id}")
                                )
                            }
                        }
                    }

                    Box(modifier = Modifier.weight(1f)) {
                        when (state.activeTab) {
                            RiderTab.ACTIVE -> ActiveTripsTabComposable(
                                state = state,
                                activeTrips = activeTrips,
                                onAcceptTrip = viewModel::acceptTripBatch,
                                onOpenPassTrip = { id -> viewModel.setModalState(passTripId = id) },
                                onVerifyPickup = viewModel::verifyStorePickup,
                                onCompleteDeliveryPin = { tripId, pin ->
                                    viewModel.completeTripDeliveryWithPin(tripId, pin, "PIN")
                                },
                                onOpenQrScanner = { id -> viewModel.setModalState(qrTripId = id) },
                                onOpenCashCalculator = { id -> viewModel.setModalState(cashChangeTripId = id) },
                                onOpenSos = { id -> viewModel.setModalState(sosTripId = id) },
                                onStartInAppCall = viewModel::startInAppCall,
                                onOpenInAppChat = viewModel::openInAppChat,
                                onRefreshOrders = viewModel::syncWithFirebaseBackend,
                                onExpandInAppCall = viewModel::expandInAppCall,
                                onToggleCallMute = viewModel::toggleInAppCallMute,
                                onToggleCallSpeaker = viewModel::toggleInAppCallSpeaker,
                                onEndInAppCall = viewModel::endInAppCall
                            )

                            RiderTab.MAP -> MapViewTabComposable(
                                state = state,
                                activeTrips = activeTrips,
                                onRefreshGps = {
                                    val perms = buildList {
                                        add(Manifest.permission.ACCESS_FINE_LOCATION)
                                        add(Manifest.permission.ACCESS_COARSE_LOCATION)
                                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                            add(Manifest.permission.POST_NOTIFICATIONS)
                                        }
                                    }.toTypedArray()
                                    permissionLauncher.launch(perms)
                                },
                                onToggleAutoGps = viewModel::toggleAutoGps
                            )

                            RiderTab.HISTORY -> HistoryTabComposable(
                                completedTrips = completedTrips,
                                stores = state.stores,
                                baseFee = state.adminSettings.riderBaseFee,
                                perKmRate = state.adminSettings.riderPerKmRate
                            )

                            RiderTab.EARNINGS -> EarningsTabComposable(
                                state = state,
                                financials = financials,
                                completedTrips = completedTrips,
                                onOpenSettlementModal = { viewModel.setModalState(settlement = true) },
                                onOpenPayoutModal = { viewModel.setModalState(payout = true) }
                            )

                            RiderTab.PROFILE -> ProfileTabComposable(
                                state = state,
                                onSetDarkMode = viewModel::setDarkMode,
                                onOpenBatteryTipsModal = { viewModel.setModalState(batteryTips = true) },
                                onOpenSecurityModal = { viewModel.setModalState(security = true) },
                                onOpenFeedbackModal = { viewModel.setModalState(feedback = true) },
                                onOpenRatingsModal = { viewModel.setModalState(ratings = true) },
                                onToggleVoice = viewModel::toggleVoiceAnnouncements,
                                onToggleAutoGps = viewModel::toggleAutoGps,
                                onSaveProfile = viewModel::updateRiderProfile,
                                onSignOut = viewModel::signOut
                            )
                        }
                    }
                }
            }
        }

        // All Native Modals & Dialogs
        FleetModalsHost(
            state = state,
            activeTrips = activeTrips,
            financials = financials,
            onSetDarkMode = viewModel::setDarkMode,
            onCloseBatteryTips = { viewModel.setModalState(batteryTips = false) },
            onCloseSecurityModal = { viewModel.setModalState(security = false) },
            onCloseSettlementModal = { viewModel.setModalState(settlement = false) },
            onSubmitSettlement = viewModel::submitCodSettlement,
            onClosePayoutModal = { viewModel.setModalState(payout = false) },
            onSubmitPayout = viewModel::requestEarningsPayout,
            onCloseFeedbackModal = { viewModel.setModalState(feedback = false) },
            onSubmitFeedback = viewModel::submitFeedback,
            onCloseRatingsModal = { viewModel.setModalState(ratings = false) },
            onClosePassTrip = { viewModel.setModalState(passTripId = null) },
            onConfirmPassTrip = viewModel::passTripBatch,
            onCloseSos = { viewModel.setModalState(sosTripId = null) },
            onConfirmSos = viewModel::triggerSosAlert,
            onCloseQrScanner = { viewModel.setModalState(qrTripId = null) },
            onQrDecoded = viewModel::handleQrScannedForTrip,
            onCloseCashChange = { viewModel.setModalState(cashChangeTripId = null) },
            onToggleAutoGps = viewModel::toggleAutoGps,
            onCloseNotificationsModal = { viewModel.setModalState(notifications = false) },
            onMarkAllNotificationsRead = viewModel::markAllNotificationsRead,
            onClearAllNotifications = viewModel::clearAllNotifications,
            onToggleCallMute = viewModel::toggleInAppCallMute,
            onToggleCallSpeaker = viewModel::toggleInAppCallSpeaker,
            onToggleCallHold = viewModel::toggleInAppCallHold,
            onMinimizeInAppCall = viewModel::minimizeInAppCall,
            onEndInAppCall = viewModel::endInAppCall,
            onAcceptIncomingCall = viewModel::acceptIncomingInAppCall,
            onMicPermissionGranted = viewModel::startCallHardwareVoiceBridge,
            onStartInAppCallForTrip = viewModel::startInAppCall,
            onOpenInAppChatForTrip = viewModel::openInAppChat,
            onCloseInAppChat = viewModel::closeInAppChat,
            onSendInAppChatMessage = viewModel::sendInAppChatMessage
        )

        // Floating Toast Stack
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 68.dp, start = 16.dp, end = 16.dp)
                .widthIn(max = 460.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            state.toasts.forEach { t ->
                AnimatedVisibility(visible = true, enter = fadeIn(), exit = fadeOut()) {
                    val accent = when (t.type) {
                        ToastType.SUCCESS -> ext.success
                        ToastType.DANGER -> ext.danger
                        ToastType.WARNING -> ext.warning
                        ToastType.INFO -> ext.info
                    }
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = ext.cardElevated,
                        shadowElevation = 8.dp,
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.5.dp, accent, RoundedCornerShape(14.dp))
                            .clickable { viewModel.dismissToast(t.id) }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = when (t.type) {
                                    ToastType.SUCCESS -> Icons.Default.CheckCircle
                                    ToastType.DANGER -> Icons.Default.Error
                                    ToastType.WARNING -> Icons.Default.Warning
                                    ToastType.INFO -> Icons.Default.Info
                                },
                                contentDescription = null,
                                tint = accent,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                text = t.msg,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
            }
        }
    }
}
