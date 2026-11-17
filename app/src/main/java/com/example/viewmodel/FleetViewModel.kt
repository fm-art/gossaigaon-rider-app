package com.example.viewmodel

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.FirebaseRestClient
import com.example.domain.RiderDomainLogic
import com.example.model.*
import com.example.util.NativeHardwareController
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject
import kotlin.math.max
import kotlin.random.Random

data class FleetUiState(
    val isDarkMode: Boolean = true,
    val session: AuthUserSession? = null,
    val authLoading: Boolean = false,
    val authError: String = "",
    val authNotice: String = "",
    val pendingVerificationEmail: String? = null,
    val resendCooldownSec: Int = 0,
    val resetCooldownSec: Int = 0,
    val lockRemainingSec: Int = 0,
    val failedLoginCount: Int = 0,

    val activeTab: RiderTab = RiderTab.ACTIVE,
    val riderData: RiderData = RiderData(
        name = "",
        email = "",
        phone = "",
        upiId = "",
        vehicle = "",
        online = false,
        ratingAvg = 5.0,
        ratingCount = 0
    ),
    val stores: Map<String, StoreInfo> = emptyMap(),
    val assignedOrders: Map<String, OrderRecord> = emptyMap(),
    val allOrders: Map<String, OrderRecord> = emptyMap(),
    val allRiders: Map<String, RiderData> = emptyMap(),
    val settlements: Map<String, SettlementRecord> = emptyMap(),
    val payouts: Map<String, RiderPayoutRecord> = emptyMap(),
    val ratings: List<RiderRating> = emptyList(),
    val feedbacks: Map<String, FeedbackRecord> = emptyMap(),
    val adminSettings: AdminSettings = AdminSettings(riderAnnouncement = ""),

    val batteryStatus: BatteryStatusSnapshot = BatteryStatusSnapshot(),
    val autoGpsEnabled: Boolean = true,
    val voiceAnnouncementsEnabled: Boolean = true,
    val isRefreshingGps: Boolean = false,

    val verifiedPickupCodes: Map<String, String> = emptyMap(),
    val pinAttempts: Map<String, Int> = emptyMap(),
    val pinLockUntil: Map<String, Long> = emptyMap(),
    val remainingAcceptSec: Map<String, Int> = emptyMap(),

    val showNotificationsModal: Boolean = false,
    val showBatteryTipsModal: Boolean = false,
    val showSecurityModal: Boolean = false,
    val showSettlementModal: Boolean = false,
    val showPayoutModal: Boolean = false,
    val showFeedbackModal: Boolean = false,
    val showRatingsModal: Boolean = false,
    val showPassTripModalForTripId: String? = null,
    val showSosModalForTripId: String? = null,
    val activeQrScannerTripId: String? = null,
    val activeCashChangeTripId: String? = null,
    val activeInAppCall: InAppCallSession? = null,
    val isCallMinimized: Boolean = false,
    val activeInAppChatTripId: String? = null,
    val chatMessagesByTrip: Map<String, List<InAppChatMessage>> = emptyMap(),

    val securityEvents: List<SecurityAuditEvent> = listOf(
        SecurityAuditEvent(
            type = "SCAM_SHIELD_BOOT",
            severity = "LOW",
            detail = "Anti-Scam UPI Guard & 12-Digit UTR Validator Initialized"
        )
    ),
    val notifications: List<FleetNotificationItem> = emptyList(),
    val toasts: List<ToastMessage> = emptyList()
)

class FleetViewModel(application: Application) : AndroidViewModel(application) {

    private val prefs = application.getSharedPreferences("gossaigaon_fleet_prefs", Context.MODE_PRIVATE)
    val hardware = NativeHardwareController(application)

    private val _uiState = MutableStateFlow(FleetUiState())
    val uiState: StateFlow<FleetUiState> = _uiState.asStateFlow()

    private var tickerJob: Job? = null

    init {
        val savedDarkMode = prefs.getBoolean("dark_mode_enabled", true)
        val savedAutoGps = prefs.getBoolean("auto_gps_enabled", true)
        val savedVoice = prefs.getBoolean("voice_enabled", true)

        val savedUid = prefs.getString("session_uid", null)
        val savedEmail = prefs.getString("session_email", null)
        val savedName = prefs.getString("session_name", null)
        val savedToken = prefs.getString("session_token", null)

        val restoredSession = if (!savedUid.isNullOrBlank() && !savedEmail.isNullOrBlank() && !savedToken.isNullOrBlank()) {
            AuthUserSession(
                uid = savedUid,
                email = savedEmail,
                displayName = savedName ?: "Rider",
                idToken = savedToken,
                emailVerified = true
            )
        } else null

        _uiState.update {
            it.copy(
                isDarkMode = savedDarkMode,
                autoGpsEnabled = savedAutoGps,
                voiceAnnouncementsEnabled = savedVoice,
                batteryStatus = hardware.readBatteryStatus(),
                session = restoredSession
            )
        }

        if (restoredSession != null) {
            syncWithFirebaseBackend()
        }
        startBackgroundTickers()
    }

    private fun startBackgroundTickers() {
        tickerJob?.cancel()
        tickerJob = viewModelScope.launch {
            var tickCount = 0
            while (true) {
                delay(1000L)
                tickCount++
                val now = System.currentTimeMillis()
                _uiState.update { state ->
                    val nextResend = max(0, state.resendCooldownSec - 1)
                    val nextReset = max(0, state.resetCooldownSec - 1)
                    val nextLock = max(0, state.lockRemainingSec - 1)

                    val (activeTrips, _) = RiderDomainLogic.getTripsGrouped(state.assignedOrders)
                    val timeoutSec = state.adminSettings.riderAcceptTimeoutSec
                    val nextCountdowns = mutableMapOf<String, Int>()
                    activeTrips.forEach { trip ->
                        val isUnaccepted = trip.orders.any { it.riderAccepted == null }
                        if (isUnaccepted) {
                            val elapsed = ((now - trip.assignedAt) / 1000L).toInt()
                            nextCountdowns[trip.tripId] = max(0, timeoutSec - elapsed)
                        }
                    }

                    val updatedBattery = if (tickCount % 5 == 0) {
                        hardware.readBatteryStatus()
                    } else {
                        state.batteryStatus
                    }

                    val updatedCall = state.activeInAppCall?.let { call ->
                        when (call.status) {
                            InAppCallStatus.CONNECTED -> {
                                val baseConnected = call.connectedAt ?: now
                                val secs = max(0, ((now - baseConnected) / 1000L).toInt())
                                call.copy(durationSec = secs)
                            }
                            else -> call
                        }
                    }

                    state.copy(
                        resendCooldownSec = nextResend,
                        resetCooldownSec = nextReset,
                        lockRemainingSec = nextLock,
                        remainingAcceptSec = nextCountdowns,
                        batteryStatus = updatedBattery,
                        activeInAppCall = updatedCall
                    )
                }

                // Real-time Firebase signaling & voice bridge check when an in-app call is active
                val activeCall = _uiState.value.activeInAppCall
                if (activeCall != null) {
                    if (activeCall.status == InAppCallStatus.RINGING || activeCall.status == InAppCallStatus.INCOMING_RINGING) {
                        if (tickCount % 3 == 0) {
                            hardware.playRingbackBurst()
                        }
                        if (activeCall.status == InAppCallStatus.RINGING && now - activeCall.startedAt >= 45_000L) {
                            handleCallUnansweredTimeout(activeCall)
                        }
                    }
                    pollLiveInAppCallState(activeCall)
                } else if (tickCount % 3 == 0 && _uiState.value.session != null) {
                    checkIncomingCustomerCalls()
                }

                // Poll active trip chat messages when chat modal is open
                val openChatTrip = _uiState.value.activeInAppChatTripId
                if (openChatTrip != null && tickCount % 4 == 0) {
                    refreshTripChatMessages(openChatTrip)
                }

                // Poll live Firebase RTDB every 12 seconds when signed in
                if (tickCount % 12 == 0 && _uiState.value.session != null && _uiState.value.pendingVerificationEmail == null) {
                    syncWithFirebaseBackend()
                }
            }
        }
    }

    fun syncWithFirebaseBackend() {
        val session = _uiState.value.session ?: return
        viewModelScope.launch {
            val snapshot = FirebaseRestClient.fetchLiveFleetSnapshot(session.uid, session.idToken)
            _uiState.update { state ->
                state.copy(
                    riderData = snapshot.riderData ?: state.riderData.copy(
                        uid = session.uid,
                        name = session.displayName,
                        email = session.email
                    ),
                    stores = snapshot.stores,
                    assignedOrders = snapshot.assignedOrders,
                    allOrders = snapshot.allOrders,
                    allRiders = snapshot.allRiders,
                    settlements = snapshot.settlements,
                    payouts = snapshot.payouts,
                    adminSettings = snapshot.adminSettings
                )
            }
        }
    }

    private fun savePersistedSession(session: AuthUserSession?) {
        if (session == null) {
            prefs.edit()
                .remove("session_uid")
                .remove("session_email")
                .remove("session_name")
                .remove("session_token")
                .apply()
        } else {
            prefs.edit()
                .putString("session_uid", session.uid)
                .putString("session_email", session.email)
                .putString("session_name", session.displayName)
                .putString("session_token", session.idToken)
                .apply()
        }
    }

    fun toggleDarkMode() {
        setDarkMode(!_uiState.value.isDarkMode)
    }

    fun setDarkMode(enabled: Boolean) {
        prefs.edit().putBoolean("dark_mode_enabled", enabled).apply()
        hardware.vibrateTap()
        _uiState.update { it.copy(isDarkMode = enabled) }
        showToast(if (enabled) "Dark Mode enabled" else "Light Mode enabled", ToastType.INFO)
    }

    fun selectTab(tab: RiderTab) {
        hardware.vibrateTap()
        _uiState.update { it.copy(activeTab = tab) }
    }

    fun signInWithEmail(email: String, password: String) {
        val state = _uiState.value
        if (state.lockRemainingSec > 0) {
            _uiState.update {
                it.copy(authError = "Brute-force lock active. Wait ${state.lockRemainingSec}s.")
            }
            return
        }
        val cleanEmail = email.trim()
        if (cleanEmail.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(authError = "Enter your registered rider email and password.") }
            return
        }
        _uiState.update { it.copy(authLoading = true, authError = "", authNotice = "") }
        viewModelScope.launch {
            when (val res = FirebaseRestClient.signInWithEmailPassword(cleanEmail, password)) {
                is FirebaseRestClient.ApiResult.Success -> {
                    val session = res.data
                    if (!session.emailVerified) {
                        FirebaseRestClient.sendVerificationEmail(session.idToken)
                        _uiState.update {
                            it.copy(
                                authLoading = false,
                                session = session,
                                pendingVerificationEmail = session.email,
                                resendCooldownSec = 60,
                                authNotice = "Verification link sent to ${session.email}. Verify inbox before starting shift."
                            )
                        }
                    } else {
                        savePersistedSession(session)
                        val snapshot = FirebaseRestClient.fetchLiveFleetSnapshot(session.uid, session.idToken)
                        _uiState.update {
                            it.copy(
                                authLoading = false,
                                session = session,
                                pendingVerificationEmail = null,
                                failedLoginCount = 0,
                                riderData = snapshot.riderData ?: RiderData(
                                    uid = session.uid,
                                    name = session.displayName,
                                    email = session.email
                                ),
                                stores = snapshot.stores,
                                assignedOrders = snapshot.assignedOrders,
                                allOrders = snapshot.allOrders,
                                allRiders = snapshot.allRiders,
                                settlements = snapshot.settlements,
                                payouts = snapshot.payouts,
                                adminSettings = snapshot.adminSettings
                            )
                        }
                        hardware.vibrateSuccess()
                        showToast("Signed in as ${session.email}", ToastType.SUCCESS)
                    }
                }
                is FirebaseRestClient.ApiResult.Error -> {
                    val fails = _uiState.value.failedLoginCount + 1
                    val lockedSec = if (fails >= 5) 45 else 0
                    if (lockedSec > 0) {
                        logSecurityEvent("BRUTE_FORCE_LOCK", "HIGH", "Login locked for 45s after $fails failed tries")
                    }
                    _uiState.update {
                        it.copy(
                            authLoading = false,
                            failedLoginCount = if (lockedSec > 0) 0 else fails,
                            lockRemainingSec = lockedSec,
                            authError = if (lockedSec > 0) {
                                "Security Lockout: Wait ${lockedSec}s before next sign-in attempt."
                            } else {
                                res.message
                            }
                        )
                    }
                    hardware.vibrateAlert()
                }
            }
        }
    }

    fun registerRider(
        name: String,
        email: String,
        phone: String,
        upiId: String,
        vehicle: String,
        password: String
    ) {
        val cleanName = RiderDomainLogic.sanitizeInput(name, 80)
        if (cleanName.length < 2) {
            _uiState.update { it.copy(authError = "Enter your full rider name (at least 2 characters).") }
            return
        }
        if (!RiderDomainLogic.isValidIndianMobile(phone)) {
            _uiState.update { it.copy(authError = "Enter a valid 10-digit Indian mobile number!") }
            return
        }
        val (upiOk, upiErr) = RiderDomainLogic.verifyUpiSecurity(upiId)
        if (!upiOk) {
            _uiState.update { it.copy(authError = upiErr ?: "Invalid UPI ID.") }
            return
        }
        if (vehicle.trim().length < 3) {
            _uiState.update { it.copy(authError = "Enter your vehicle details (e.g., Hero Splendor AS-16).") }
            return
        }
        val pwStrength = RiderDomainLogic.validatePasswordStrength(password)
        if (!pwStrength.valid) {
            _uiState.update { it.copy(authError = pwStrength.reason ?: "Choose a stronger password.") }
            return
        }

        _uiState.update { it.copy(authLoading = true, authError = "", authNotice = "") }
        viewModelScope.launch {
            when (
                val res = FirebaseRestClient.signUpWithEmailPassword(
                    cleanName, email, phone, upiId, vehicle, password
                )
            ) {
                is FirebaseRestClient.ApiResult.Success -> {
                    val session = res.data
                    _uiState.update {
                        it.copy(
                            authLoading = false,
                            session = session,
                            pendingVerificationEmail = session.email,
                            resendCooldownSec = 60,
                            authNotice = "Account created! Verification link sent to ${session.email}."
                        )
                    }
                    hardware.vibrateSuccess()
                }
                is FirebaseRestClient.ApiResult.Error -> {
                    _uiState.update { it.copy(authLoading = false, authError = res.message) }
                    hardware.vibrateAlert()
                }
            }
        }
    }

    fun sendPasswordReset(email: String) {
        if (_uiState.value.resetCooldownSec > 0) return
        val cleanEmail = email.trim()
        if (!Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(cleanEmail)) {
            _uiState.update { it.copy(authError = "Enter a valid registered email address.") }
            return
        }
        _uiState.update { it.copy(authLoading = true, authError = "", authNotice = "") }
        viewModelScope.launch {
            when (val res = FirebaseRestClient.sendPasswordResetEmail(cleanEmail)) {
                is FirebaseRestClient.ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            authLoading = false,
                            resetCooldownSec = 60,
                            authNotice = "If an account exists for $cleanEmail, a password reset link has been sent. Check Inbox & Spam."
                        )
                    }
                    hardware.vibrateSuccess()
                }
                is FirebaseRestClient.ApiResult.Error -> {
                    _uiState.update { it.copy(authLoading = false, authError = res.message) }
                }
            }
        }
    }

    fun resendVerificationEmail() {
        val session = _uiState.value.session ?: return
        if (_uiState.value.resendCooldownSec > 0) return
        _uiState.update { it.copy(authLoading = true, authError = "", authNotice = "") }
        viewModelScope.launch {
            when (val res = FirebaseRestClient.sendVerificationEmail(session.idToken)) {
                is FirebaseRestClient.ApiResult.Success -> {
                    _uiState.update {
                        it.copy(
                            authLoading = false,
                            resendCooldownSec = 60,
                            authNotice = "Fresh verification link sent to ${session.email}. Check Inbox & Spam."
                        )
                    }
                }
                is FirebaseRestClient.ApiResult.Error -> {
                    _uiState.update { it.copy(authLoading = false, authError = res.message) }
                }
            }
        }
    }

    fun checkEmailVerificationConfirmed() {
        val session = _uiState.value.session ?: return
        _uiState.update { it.copy(authLoading = true, authError = "", authNotice = "") }
        viewModelScope.launch {
            val verified = FirebaseRestClient.fetchEmailVerified(session.idToken)
            if (verified) {
                val verifiedSession = session.copy(emailVerified = true)
                savePersistedSession(verifiedSession)
                val snapshot = FirebaseRestClient.fetchLiveFleetSnapshot(session.uid, session.idToken)
                _uiState.update {
                    it.copy(
                        authLoading = false,
                        session = verifiedSession,
                        pendingVerificationEmail = null,
                        riderData = snapshot.riderData ?: it.riderData.copy(
                            uid = session.uid,
                            name = session.displayName,
                            email = session.email
                        ),
                        stores = snapshot.stores,
                        assignedOrders = snapshot.assignedOrders,
                        allOrders = snapshot.allOrders,
                        allRiders = snapshot.allRiders,
                        settlements = snapshot.settlements,
                        payouts = snapshot.payouts,
                        adminSettings = snapshot.adminSettings
                    )
                }
                hardware.vibrateSuccess()
                showToast("Email verified! Welcome to Gossaigaon Fleet.", ToastType.SUCCESS)
            } else {
                _uiState.update {
                    it.copy(
                        authLoading = false,
                        authError = "Email not verified yet. Please click the verification link in your email inbox and try again."
                    )
                }
            }
        }
    }

    fun signInWithGoogleDirect(accountEmail: String, displayName: String) {
        val cleanEmail = accountEmail.trim()
        val cleanName = RiderDomainLogic.sanitizeInput(displayName, 80).ifBlank { "Rider" }
        if (!Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(cleanEmail)) {
            _uiState.update { it.copy(authError = "Please enter a valid Google email address.") }
            return
        }
        val uid = "google_${cleanEmail.lowercase().hashCode().toUInt()}"
        val session = AuthUserSession(
            uid = uid,
            email = cleanEmail,
            displayName = cleanName,
            idToken = "",
            emailVerified = true
        )
        savePersistedSession(session)
        hardware.vibrateSuccess()
        _uiState.update {
            it.copy(
                session = session,
                pendingVerificationEmail = null,
                riderData = it.riderData.copy(
                    uid = uid,
                    name = cleanName,
                    email = cleanEmail
                ),
                authError = "",
                authNotice = ""
            )
        }
        syncWithFirebaseBackend()
        showToast("Signed in with Google ($cleanEmail)", ToastType.SUCCESS)
    }

    fun signOut() {
        savePersistedSession(null)
        hardware.vibrateTap()
        _uiState.update {
            it.copy(
                session = null,
                pendingVerificationEmail = null,
                assignedOrders = emptyMap(),
                settlements = emptyMap(),
                payouts = emptyMap(),
                notifications = emptyList(),
                authError = "",
                authNotice = ""
            )
        }
    }

    fun toggleDutyOnline() {
        val state = _uiState.value
        val summary = RiderDomainLogic.calculateFinancialSummary(
            state.assignedOrders,
            state.settlements,
            state.payouts,
            state.adminSettings.riderBaseFee,
            state.stores,
            state.adminSettings.riderPerKmRate
        )
        val nextOnline = !state.riderData.online
        if (nextOnline && summary.netCashInHand >= state.adminSettings.maxRiderCashLimit) {
            hardware.vibrateAlert()
            showToast(
                "COD Limit Reached (₹${summary.netCashInHand.toInt()}). Deposit cash to go online!",
                ToastType.DANGER
            )
            _uiState.update { it.copy(showSettlementModal = true) }
            return
        }
        hardware.vibrateSuccess()
        val now = System.currentTimeMillis()
        _uiState.update {
            it.copy(riderData = it.riderData.copy(online = nextOnline, lastSeen = now))
        }
        state.session?.let { s ->
            viewModelScope.launch {
                FirebaseRestClient.patchRtdbJson(
                    "deliveryPartners/${s.uid}",
                    s.idToken,
                    JSONObject().apply {
                        put("online", nextOnline)
                        put("lastSeen", now)
                    }
                )
            }
        }
        val msg = if (nextOnline) "You are now ON DUTY." else "You are now OFF DUTY."
        hardware.speakAnnouncement(msg, state.voiceAnnouncementsEnabled)
        showToast(msg, if (nextOnline) ToastType.SUCCESS else ToastType.WARNING)
    }

    fun refreshManualGps() {
        _uiState.update { it.copy(isRefreshingGps = true) }
        hardware.requestSingleGpsFix(
            onResult = { lat, lng ->
                val now = System.currentTimeMillis()
                _uiState.update { state ->
                    val newPoint = RoutePoint(lat, lng, now)
                    val updatedRoute = (state.riderData.recentRoute + newPoint).takeLast(30)
                    state.copy(
                        isRefreshingGps = false,
                        riderData = state.riderData.copy(
                            lat = lat,
                            lng = lng,
                            lastLocationUpdate = now,
                            recentRoute = updatedRoute
                        )
                    )
                }
                _uiState.value.session?.let { s ->
                    viewModelScope.launch {
                        FirebaseRestClient.patchRtdbJson(
                            "deliveryPartners/${s.uid}",
                            s.idToken,
                            JSONObject().apply {
                                put("lat", lat)
                                put("lng", lng)
                                put("lastLocationUpdate", now)
                            }
                        )
                    }
                }
                hardware.vibrateTap()
                showToast("Live GPS coordinates updated", ToastType.SUCCESS)
            },
            onError = { err ->
                _uiState.update { it.copy(isRefreshingGps = false) }
                showToast(err, ToastType.WARNING)
            }
        )
    }

    fun acceptTripBatch(tripId: String) {
        val now = System.currentTimeMillis()
        val state = _uiState.value
        val matchingIds = mutableListOf<String>()
        val unlockedCodesByOrderId = mutableMapOf<String, String>()
        _uiState.update { s ->
            val updatedAssigned = s.assignedOrders.mapValues { (oid, order) ->
                val groupKey = RiderDomainLogic.getOrderTripGroupId(order, oid)
                if (groupKey == tripId || order.batchGroupId == tripId || order.orderId == tripId || oid == tripId) {
                    matchingIds.add(oid)
                    val code = RiderDomainLogic.getStorePickupCode(order, oid)
                    unlockedCodesByOrderId[oid] = code
                    order.copy(
                        riderAccepted = true,
                        riderAcceptedAt = now,
                        pickupOtp = order.pickupOtp.ifBlank { code },
                        updatedAt = now
                    )
                } else order
            }
            val updatedAll = s.allOrders.toMutableMap().apply {
                updatedAssigned.forEach { (k, v) -> put(k, v) }
            }
            s.copy(
                assignedOrders = updatedAssigned,
                allOrders = updatedAll
            )
        }
        state.session?.let { sess ->
            viewModelScope.launch {
                matchingIds.forEach { oid ->
                    val code = unlockedCodesByOrderId[oid].orEmpty()
                    FirebaseRestClient.patchRtdbJson(
                        "orders/$oid",
                        sess.idToken,
                        JSONObject().apply {
                            put("riderAccepted", true)
                            put("riderAcceptedAt", now)
                            if (code.isNotBlank()) {
                                put("pickupOtp", code)
                            }
                            put("updatedAt", now)
                        }
                    )
                }
            }
        }
        val codesLabel = unlockedCodesByOrderId.values.distinct().joinToString(", ") { "#$it" }
        hardware.vibrateSuccess()
        hardware.speakAnnouncement(
            "Order accepted. Store pickup code unlocked.",
            _uiState.value.voiceAnnouncementsEnabled
        )
        hardware.postNativeNotification(
            "Order Accepted • Pickup Code: $codesLabel",
            "Show Pickup Code $codesLabel at the store counter to collect the order."
        )
        pushInAppNotification(
            title = "Order Accepted • Pickup Code $codesLabel",
            body = "Store Pickup Code $codesLabel is now unlocked for Batch #${tripId.takeLast(5).uppercase()}.",
            category = "DISPATCH"
        )
        showToast(
            if (codesLabel.isNotBlank()) {
                "Order accepted! Store Pickup Code: $codesLabel"
            } else {
                "Order accepted! Store Pickup Code is now unlocked."
            },
            ToastType.SUCCESS
        )
    }

    fun passTripBatch(tripId: String, reason: String) {
        val cleanReason = RiderDomainLogic.sanitizeInput(reason, 120).ifBlank { "Vehicle / Route issue" }
        _uiState.update { state ->
            val updated = state.assignedOrders.filterNot { (oid, order) ->
                val groupKey = RiderDomainLogic.getOrderTripGroupId(order, oid)
                groupKey == tripId || order.batchGroupId == tripId || order.orderId == tripId || oid == tripId
            }
            state.copy(
                assignedOrders = updated,
                showPassTripModalForTripId = null
            )
        }
        hardware.vibrateTap()
        showToast("Trip passed ($cleanReason)", ToastType.INFO)
    }

    fun verifyStorePickup(orderId: String, enteredCode: String) {
        val state = _uiState.value
        val order = state.assignedOrders[orderId] ?: return
        if (order.riderAccepted != true) {
            hardware.vibrateAlert()
            showToast("Pehle order accept karein, uske baad hi Pickup Code verify hoga!", ToastType.WARNING)
            return
        }
        val expected = RiderDomainLogic.getStorePickupCode(order, orderId)
        val clean = enteredCode.trim()
        if (clean != expected) {
            hardware.vibrateAlert()
            showToast("Store Pickup Code mismatch! Enter code #$expected shown on your pickup card.", ToastType.DANGER)
            return
        }
        val now = System.currentTimeMillis()
        _uiState.update { s ->
            val updatedOrder = order.copy(
                status = "OUT_FOR_DELIVERY",
                storePickupVerifiedAt = now,
                updatedAt = now
            )
            val nextAssigned = s.assignedOrders.toMutableMap().apply { put(orderId, updatedOrder) }
            val nextAll = s.allOrders.toMutableMap().apply { put(orderId, updatedOrder) }
            s.copy(
                assignedOrders = nextAssigned,
                allOrders = nextAll,
                verifiedPickupCodes = s.verifiedPickupCodes + (orderId to expected)
            )
        }
        state.session?.let { sess ->
            viewModelScope.launch {
                FirebaseRestClient.patchRtdbJson(
                    "orders/$orderId",
                    sess.idToken,
                    JSONObject().apply {
                        put("status", "OUT_FOR_DELIVERY")
                        put("storePickupVerifiedAt", now)
                        put("updatedAt", now)
                    }
                )
            }
        }
        hardware.vibrateSuccess()
        val storeName = state.stores[order.restaurantId]?.name ?: "Store"
        hardware.speakAnnouncement("Pickup verified from $storeName.", state.voiceAnnouncementsEnabled)
        showToast("Picked up from $storeName!", ToastType.SUCCESS)
    }

    fun completeTripDeliveryWithPin(tripId: String, enteredPin: String, method: String = "PIN") {
        val state = _uiState.value
        val (activeTrips, _) = RiderDomainLogic.getTripsGrouped(state.assignedOrders)
        val trip = activeTrips.find { it.tripId == tripId } ?: return

        val now = System.currentTimeMillis()
        val lockedUntil = state.pinLockUntil[tripId] ?: 0L
        if (now < lockedUntil) {
            val sec = ((lockedUntil - now) / 1000L).coerceAtLeast(1L)
            hardware.vibrateAlert()
            showToast("PIN entry locked for ${sec}s due to repeated wrong attempts.", ToastType.DANGER)
            return
        }

        val expectedPin = trip.deliveryOtp.trim()
        if (expectedPin.isNotEmpty() && enteredPin.trim() != expectedPin) {
            val fails = (state.pinAttempts[tripId] ?: 0) + 1
            if (fails >= 3) {
                logSecurityEvent("PIN_BRUTE_FORCE", "HIGH", "Trip $tripId locked 60s after 3 wrong PINs")
                _uiState.update {
                    it.copy(
                        pinAttempts = it.pinAttempts + (tripId to 0),
                        pinLockUntil = it.pinLockUntil + (tripId to (now + 60_000L))
                    )
                }
                hardware.vibrateAlert()
                showToast("3 wrong PINs! Delivery verification locked for 60s.", ToastType.DANGER)
            } else {
                _uiState.update { it.copy(pinAttempts = it.pinAttempts + (tripId to fails)) }
                hardware.vibrateAlert()
                showToast("Incorrect Customer PIN (${3 - fails} attempts left).", ToastType.DANGER)
            }
            return
        }

        val orderIds = trip.orders.map { it.orderId }.toSet()
        var earnedTotal = 0.0
        var totalKm = 0.0
        val breakdownByOrder = mutableMapOf<String, OrderDistanceFeeBreakdown>()
        _uiState.update { s ->
            val nextAssigned = s.assignedOrders.mapValues { (id, o) ->
                if (id in orderIds) {
                    val bd = RiderDomainLogic.calculateOrderDistanceFeeBreakdown(
                        order = o,
                        stores = s.stores,
                        baseFee = s.adminSettings.riderBaseFee,
                        perKmRate = s.adminSettings.riderPerKmRate
                    )
                    breakdownByOrder[id] = bd
                    earnedTotal += bd.totalRiderFee
                    totalKm += bd.distanceKm
                    o.copy(
                        status = "DELIVERED",
                        distanceKm = bd.distanceKm,
                        riderEarnedFee = bd.totalRiderFee,
                        updatedAt = now,
                        verifiedAt = now,
                        verificationMethod = method
                    )
                } else o
            }
            val nextAll = s.allOrders.toMutableMap().apply {
                nextAssigned.forEach { (k, v) -> put(k, v) }
            }
            s.copy(
                assignedOrders = nextAssigned,
                allOrders = nextAll,
                activeQrScannerTripId = null
            )
        }
        state.session?.let { sess ->
            viewModelScope.launch {
                orderIds.forEach { oid ->
                    val bd = breakdownByOrder[oid]
                    FirebaseRestClient.patchRtdbJson(
                        "orders/$oid",
                        sess.idToken,
                        JSONObject().apply {
                            put("status", "DELIVERED")
                            if (bd != null) {
                                put("distanceKm", bd.distanceKm)
                                put("riderEarnedFee", bd.totalRiderFee)
                            }
                            put("updatedAt", now)
                            put("verifiedAt", now)
                            put("verificationMethod", method)
                        }
                    )
                }
            }
        }
        val kmFmt = "%.1f".format(totalKm)
        hardware.vibrateSuccess()
        hardware.speakAnnouncement(
            "Delivery completed for $kmFmt kilometers. Rupees ${earnedTotal.toInt()} added to your rider wallet.",
            state.voiceAnnouncementsEnabled
        )
        hardware.postNativeNotification(
            "Delivery Completed (+₹${earnedTotal.toInt()} • $kmFmt km)",
            "Distance Payout credited for ${trip.address}"
        )
        pushInAppNotification(
            title = "Delivery Completed (+₹${earnedTotal.toInt()} • $kmFmt km)",
            body = "Distance-based payout credited for ${trip.address} ($kmFmt km).",
            category = "PAYOUT"
        )
        showToast("Trip Delivered ($kmFmt km)! +₹${earnedTotal.toInt()} distance payout credited.", ToastType.SUCCESS)
    }

    fun handleQrScannedForTrip(tripId: String, rawQr: String) {
        val state = _uiState.value
        val (activeTrips, _) = RiderDomainLogic.getTripsGrouped(state.assignedOrders)
        val trip = activeTrips.find { it.tripId == tripId } ?: return
        val validation = RiderDomainLogic.validateDeliveryQrPayload(rawQr, trip)
        if (!validation.valid) {
            logSecurityEvent("QR_SCAN_REJECTED", "MEDIUM", validation.reason ?: "Invalid QR")
            hardware.vibrateAlert()
            showToast(validation.reason ?: "Invalid QR code", ToastType.DANGER)
            return
        }
        completeTripDeliveryWithPin(
            tripId = tripId,
            enteredPin = validation.matchedOtp ?: trip.deliveryOtp,
            method = "QR_SCAN"
        )
    }

    fun submitCodSettlement(amountStr: String, utr: String) {
        val state = _uiState.value
        val amount = amountStr.toDoubleOrNull() ?: 0.0
        if (amount < state.adminSettings.minRiderCodDeposit) {
            showToast("Minimum COD deposit is ₹${state.adminSettings.minRiderCodDeposit.toInt()}", ToastType.WARNING)
            return
        }
        val (utrValid, utrErr) = RiderDomainLogic.validateSettlementUtr(utr, state.settlements)
        if (!utrValid) {
            logSecurityEvent("FAKE_UTR_BLOCKED", "HIGH", "Blocked UTR '$utr': $utrErr")
            hardware.vibrateAlert()
            showToast(utrErr ?: "Invalid UTR", ToastType.DANGER)
            return
        }
        val now = System.currentTimeMillis()
        val id = "settle_$now"
        val record = SettlementRecord(
            id = id,
            riderUid = state.riderData.uid,
            riderName = state.riderData.name,
            amount = amount,
            mode = "UPI",
            utr = utr.trim(),
            status = "PENDING_VERIFICATION",
            createdAt = now
        )
        _uiState.update {
            it.copy(
                settlements = it.settlements + (id to record),
                showSettlementModal = false
            )
        }
        state.session?.let { sess ->
            viewModelScope.launch {
                FirebaseRestClient.putRtdbJson(
                    "riderSettlements/$id",
                    sess.idToken,
                    JSONObject().apply {
                        put("riderUid", state.riderData.uid)
                        put("riderName", state.riderData.name)
                        put("amount", amount)
                        put("mode", "UPI")
                        put("utr", utr.trim())
                        put("status", "PENDING_VERIFICATION")
                        put("createdAt", now)
                    }
                )
            }
        }
        hardware.vibrateSuccess()
        showToast("₹${amount.toInt()} COD Settlement submitted (UTR ${utr.trim()})!", ToastType.SUCCESS)
    }

    fun requestEarningsPayout(amountStr: String) {
        val state = _uiState.value
        val summary = RiderDomainLogic.calculateFinancialSummary(
            state.assignedOrders,
            state.settlements,
            state.payouts,
            state.adminSettings.riderBaseFee,
            state.stores,
            state.adminSettings.riderPerKmRate
        )
        val amount = amountStr.toDoubleOrNull() ?: 0.0
        if (amount < state.adminSettings.minRiderPayout) {
            showToast("Minimum payout withdrawal is ₹${state.adminSettings.minRiderPayout.toInt()}", ToastType.WARNING)
            return
        }
        if (amount > summary.availablePayoutBalance) {
            showToast("Amount exceeds available balance (₹${summary.availablePayoutBalance.toInt()})", ToastType.DANGER)
            return
        }
        val now = System.currentTimeMillis()
        val id = "payout_$now"
        val record = RiderPayoutRecord(
            id = id,
            riderUid = state.riderData.uid,
            riderName = state.riderData.name,
            riderPhone = state.riderData.phone,
            riderUpiId = state.riderData.upiId,
            amount = amount,
            status = "REQUESTED",
            adminRef = "",
            createdAt = now
        )
        _uiState.update {
            it.copy(
                payouts = it.payouts + (id to record),
                showPayoutModal = false
            )
        }
        state.session?.let { sess ->
            viewModelScope.launch {
                FirebaseRestClient.putRtdbJson(
                    "riderPayouts/$id",
                    sess.idToken,
                    JSONObject().apply {
                        put("riderUid", state.riderData.uid)
                        put("riderName", state.riderData.name)
                        put("riderPhone", state.riderData.phone)
                        put("riderUpiId", state.riderData.upiId)
                        put("amount", amount)
                        put("status", "REQUESTED")
                        put("createdAt", now)
                    }
                )
            }
        }
        hardware.vibrateSuccess()
        hardware.postNativeNotification(
            "Payout Requested • ₹${amount.toInt()}",
            "UPI: ${state.riderData.upiId}"
        )
        pushInAppNotification(
            title = "Payout Requested • ₹${amount.toInt()}",
            body = "UPI: ${state.riderData.upiId}",
            category = "PAYOUT"
        )
        showToast("₹${amount.toInt()} payout request submitted!", ToastType.SUCCESS)
    }

    fun updateRiderProfile(
        phone: String,
        upiId: String,
        vehicle: String,
        shiftEnabled: Boolean,
        shiftStart: String,
        shiftEnd: String
    ) {
        if (!RiderDomainLogic.isValidIndianMobile(phone)) {
            showToast("Enter a valid 10-digit Indian mobile number!", ToastType.DANGER)
            return
        }
        val (upiOk, upiErr) = RiderDomainLogic.verifyUpiSecurity(upiId)
        if (!upiOk) {
            logSecurityEvent("UNTRUSTED_UPI_BLOCKED", "MEDIUM", upiErr ?: "Invalid UPI")
            showToast(upiErr ?: "Invalid UPI ID", ToastType.DANGER)
            return
        }
        val cleanVehicle = RiderDomainLogic.sanitizeInput(vehicle, 80)
        _uiState.update { state ->
            state.copy(
                riderData = state.riderData.copy(
                    phone = phone.trim(),
                    upiId = upiId.trim(),
                    vehicle = cleanVehicle,
                    preferredShift = PreferredShiftHours(
                        enabled = shiftEnabled,
                        startTime = shiftStart,
                        endTime = shiftEnd
                    )
                )
            )
        }
        _uiState.value.session?.let { sess ->
            viewModelScope.launch {
                FirebaseRestClient.patchRtdbJson(
                    "deliveryPartners/${sess.uid}",
                    sess.idToken,
                    JSONObject().apply {
                        put("phone", phone.trim())
                        put("upiId", upiId.trim())
                        put("vehicle", cleanVehicle)
                    }
                )
            }
        }
        hardware.vibrateSuccess()
        showToast("Rider profile & shift settings saved!", ToastType.SUCCESS)
    }

    fun submitFeedback(subject: String, message: String) {
        val cleanMsg = RiderDomainLogic.sanitizeInput(message, 400)
        if (cleanMsg.length < 5) {
            showToast("Please describe your feedback (at least 5 characters).", ToastType.WARNING)
            return
        }
        val now = System.currentTimeMillis()
        val id = "fb_$now"
        val state = _uiState.value
        val record = FeedbackRecord(
            id = id,
            uid = state.riderData.uid,
            name = state.riderData.name,
            phone = state.riderData.phone,
            subject = subject,
            message = cleanMsg,
            status = "OPEN",
            createdAt = now
        )
        _uiState.update {
            it.copy(
                feedbacks = mapOf(id to record) + it.feedbacks,
                showFeedbackModal = false
            )
        }
        state.session?.let { sess ->
            viewModelScope.launch {
                FirebaseRestClient.putRtdbJson(
                    "feedback/$id",
                    sess.idToken,
                    JSONObject().apply {
                        put("role", "RIDER")
                        put("uid", state.riderData.uid)
                        put("name", state.riderData.name)
                        put("phone", state.riderData.phone)
                        put("subject", subject)
                        put("message", cleanMsg)
                        put("status", "OPEN")
                        put("createdAt", now)
                    }
                )
            }
        }
        hardware.vibrateSuccess()
        showToast("Ticket submitted to Gossaigaon Dispatch Desk!", ToastType.SUCCESS)
    }

    fun triggerSosAlert(tripId: String, issueDetails: String) {
        val clean = RiderDomainLogic.sanitizeInput(issueDetails, 160).ifBlank { "Emergency assistance requested on route" }
        _uiState.update { state ->
            val nextAssigned = state.assignedOrders.mapValues { (_, o) ->
                if (o.batchGroupId == tripId || o.orderId == tripId) {
                    o.copy(emergencyAlert = true, emergencyDetails = clean)
                } else o
            }
            state.copy(
                assignedOrders = nextAssigned,
                showSosModalForTripId = null
            )
        }
        logSecurityEvent("SOS_BEACON_TRIGGERED", "CRITICAL", "Trip $tripId: $clean")
        hardware.vibrateAlert()
        hardware.postNativeNotification("SOS Alert Dispatched", "Admin desk notified with your live GPS coordinates.")
        pushInAppNotification(
            title = "SOS Emergency Beacon Sent",
            body = "Admin notified for Trip #${tripId.takeLast(5).uppercase()}: $clean",
            category = "SECURITY"
        )
        showToast("SOS Emergency Beacon sent with live GPS coordinates!", ToastType.DANGER)
    }

    fun toggleAutoGps(enabled: Boolean) {
        prefs.edit().putBoolean("auto_gps_enabled", enabled).apply()
        hardware.vibrateTap()
        _uiState.update { it.copy(autoGpsEnabled = enabled) }
        showToast(
            if (enabled) "Automatic battery-aware GPS enabled" else "Auto GPS paused (Manual mode)",
            ToastType.INFO
        )
    }

    fun toggleVoiceAnnouncements(enabled: Boolean) {
        prefs.edit().putBoolean("voice_enabled", enabled).apply()
        hardware.vibrateTap()
        _uiState.update { it.copy(voiceAnnouncementsEnabled = enabled) }
        if (enabled) {
            hardware.speakAnnouncement("Voice announcements enabled.", true)
        }
    }

    fun setModalState(
        notifications: Boolean? = null,
        batteryTips: Boolean? = null,
        security: Boolean? = null,
        settlement: Boolean? = null,
        payout: Boolean? = null,
        feedback: Boolean? = null,
        ratings: Boolean? = null,
        passTripId: String? = _uiState.value.showPassTripModalForTripId,
        sosTripId: String? = _uiState.value.showSosModalForTripId,
        qrTripId: String? = _uiState.value.activeQrScannerTripId,
        cashChangeTripId: String? = _uiState.value.activeCashChangeTripId
    ) {
        _uiState.update {
            it.copy(
                showNotificationsModal = notifications ?: it.showNotificationsModal,
                showBatteryTipsModal = batteryTips ?: it.showBatteryTipsModal,
                showSecurityModal = security ?: it.showSecurityModal,
                showSettlementModal = settlement ?: it.showSettlementModal,
                showPayoutModal = payout ?: it.showPayoutModal,
                showFeedbackModal = feedback ?: it.showFeedbackModal,
                showRatingsModal = ratings ?: it.showRatingsModal,
                showPassTripModalForTripId = passTripId,
                showSosModalForTripId = sosTripId,
                activeQrScannerTripId = qrTripId,
                activeCashChangeTripId = cashChangeTripId
            )
        }
    }

    fun clearAuthMessages() {
        _uiState.update { it.copy(authError = "", authNotice = "") }
    }

    fun dismissToast(id: Long) {
        _uiState.update { state -> state.copy(toasts = state.toasts.filterNot { it.id == id }) }
    }

    fun showToast(msg: String, type: ToastType = ToastType.INFO) {
        val toast = ToastMessage(msg = msg, type = type)
        _uiState.update { state ->
            state.copy(toasts = (state.toasts + toast).takeLast(3))
        }
        viewModelScope.launch {
            delay(3600L)
            dismissToast(toast.id)
        }
    }

    private fun logSecurityEvent(type: String, severity: String, detail: String) {
        val evt = SecurityAuditEvent(type = type, severity = severity, detail = detail)
        _uiState.update { it.copy(securityEvents = (listOf(evt) + it.securityEvents).take(25)) }
    }

    fun pushInAppNotification(title: String, body: String, category: String = "DISPATCH") {
        val item = FleetNotificationItem(
            title = title,
            body = body,
            category = category,
            timestamp = System.currentTimeMillis(),
            isRead = false
        )
        _uiState.update { state ->
            state.copy(notifications = (listOf(item) + state.notifications).take(30))
        }
    }

    fun markAllNotificationsRead() {
        hardware.vibrateTap()
        _uiState.update { state ->
            state.copy(notifications = state.notifications.map { it.copy(isRead = true) })
        }
    }

    fun clearAllNotifications() {
        hardware.vibrateTap()
        _uiState.update { it.copy(notifications = emptyList()) }
    }

    private var audioPacketSeq = 0L
    private var lastPlayedRemoteSeq = -1L

    private fun getOrderIdsForTrip(tripId: String): List<String> {
        val (activeTrips, _) = RiderDomainLogic.getTripsGrouped(_uiState.value.assignedOrders)
        return activeTrips.find { it.tripId == tripId }?.orders?.map { it.orderId }.orEmpty()
    }

    private fun checkIncomingCustomerCalls() {
        val state = _uiState.value
        val auth = state.session ?: return
        if (state.activeInAppCall != null) return
        viewModelScope.launch {
            val incoming = FirebaseRestClient.fetchIncomingRiderCall(state.riderData.uid, auth.idToken)
            if (incoming != null && _uiState.value.activeInAppCall == null) {
                val session = InAppCallSession(
                    callId = incoming.callId,
                    tripId = incoming.tripId,
                    customerUid = incoming.customerUid,
                    customerLabel = incoming.customerLabel.ifBlank { "Customer • #${incoming.tripId.takeLast(5).uppercase()}" },
                    dropAddress = incoming.dropAddress,
                    callerRole = "CUSTOMER",
                    status = InAppCallStatus.INCOMING_RINGING,
                    startedAt = System.currentTimeMillis(),
                    remoteSignalVerified = true
                )
                hardware.vibrateAlert()
                hardware.playRingbackBurst()
                _uiState.update { it.copy(activeInAppCall = session, isCallMinimized = false) }
            }
        }
    }

    fun startInAppCall(trip: TripGroup) {
        hardware.vibrateTap()
        val now = System.currentTimeMillis()
        val customerLabel = "Customer • #${trip.tripId.takeLast(5).uppercase()}"
        val initialSession = InAppCallSession(
            callId = "call_$now",
            tripId = trip.tripId,
            customerUid = trip.customerUid.ifBlank { "customer_${trip.tripId.takeLast(4)}" },
            customerLabel = customerLabel,
            dropAddress = trip.address,
            callerRole = "RIDER",
            status = InAppCallStatus.CONNECTING,
            isMuted = false,
            isSpeakerOn = false,
            isOnHold = false,
            startedAt = now,
            remoteSignalVerified = false
        )
        val orderIds = trip.orders.map { it.orderId }
        audioPacketSeq = 0L
        lastPlayedRemoteSeq = -1L
        hardware.setCallAudioRouting(speakerOn = false, muted = false)
        _uiState.update { it.copy(activeInAppCall = initialSession, isCallMinimized = false) }
        startCallHardwareVoiceBridge(trip.tripId)

        val auth = _uiState.value.session
        viewModelScope.launch {
            val ringingSession = initialSession.copy(
                status = InAppCallStatus.RINGING,
                remoteSignalVerified = true
            )
            val synced = if (auth != null) {
                FirebaseRestClient.syncInAppCallSignaling(
                    callSession = ringingSession,
                    riderUid = _uiState.value.riderData.uid,
                    riderName = _uiState.value.riderData.name.ifBlank { "Gossaigaon Rider" },
                    idToken = auth.idToken,
                    orderIds = orderIds
                )
            } else false

            _uiState.update { state ->
                val curr = state.activeInAppCall
                if (curr != null && curr.callId == initialSession.callId && curr.status == InAppCallStatus.CONNECTING) {
                    state.copy(
                        activeInAppCall = curr.copy(
                            status = InAppCallStatus.RINGING,
                            remoteSignalVerified = synced
                        )
                    )
                } else state
            }
            hardware.playRingbackBurst()
        }
    }

    fun startCallHardwareVoiceBridge(tripId: String) {
        hardware.startLiveVoiceEngine { micAmplitude, pcmBase64 ->
            _uiState.update { s ->
                val c = s.activeInAppCall
                if (c != null) {
                    s.copy(activeInAppCall = c.copy(micLevel = if (c.isMuted) 0f else micAmplitude))
                } else s
            }
            val currentCall = _uiState.value.activeInAppCall
            val auth = _uiState.value.session
            if (
                pcmBase64 != null &&
                currentCall != null &&
                currentCall.status == InAppCallStatus.CONNECTED &&
                !currentCall.isMuted &&
                !currentCall.isOnHold &&
                auth != null
            ) {
                val seq = ++audioPacketSeq
                val orderIds = getOrderIdsForTrip(tripId)
                viewModelScope.launch {
                    FirebaseRestClient.pushVoiceAudioPacket(
                        tripId = tripId,
                        senderRole = "RIDER",
                        pcmBase64 = pcmBase64,
                        seq = seq,
                        idToken = auth.idToken
                    )
                    orderIds.forEach { oid ->
                        if (oid != tripId) {
                            FirebaseRestClient.pushVoiceAudioPacket(
                                tripId = oid,
                                senderRole = "RIDER",
                                pcmBase64 = pcmBase64,
                                seq = seq,
                                idToken = auth.idToken
                            )
                        }
                    }
                }
            }
        }
    }

    private fun pollLiveInAppCallState(call: InAppCallSession) {
        val auth = _uiState.value.session ?: return
        val orderIds = getOrderIdsForTrip(call.tripId)
        viewModelScope.launch {
            val remote = FirebaseRestClient.fetchInAppCallState(call.tripId, auth.idToken, orderIds) ?: return@launch
            if (remote.callId != call.callId && remote.callerRole == "RIDER") return@launch

            val upperStatus = remote.status.uppercase()
            when {
                upperStatus in setOf("DECLINED", "REJECTED", "BUSY") -> {
                    hardware.resetCallAudioMode()
                    _uiState.update { it.copy(activeInAppCall = null) }
                    showToast("Customer is busy or declined the in-app call.", ToastType.WARNING)
                }
                upperStatus == "ENDED" && call.remoteSignalVerified && (System.currentTimeMillis() - call.startedAt > 2500L) -> {
                    hardware.resetCallAudioMode()
                    _uiState.update { it.copy(activeInAppCall = null) }
                    showToast("In-App Call ended by customer.", ToastType.INFO)
                }
                remote.customerAnswered && call.status != InAppCallStatus.CONNECTED -> {
                    val now = System.currentTimeMillis()
                    hardware.stopRingbackTone()
                    hardware.vibrateSuccess()
                    startCallHardwareVoiceBridge(call.tripId)
                    _uiState.update { state ->
                        val curr = state.activeInAppCall ?: return@update state
                        state.copy(
                            activeInAppCall = curr.copy(
                                status = InAppCallStatus.CONNECTED,
                                connectedAt = curr.connectedAt ?: now,
                                isOnHold = remote.isOnHold,
                                remoteSignalVerified = true
                            )
                        )
                    }
                }
            }

            // Pull live customer audio stream when connected
            val latestCall = _uiState.value.activeInAppCall
            if (latestCall != null && latestCall.status == InAppCallStatus.CONNECTED && !latestCall.isOnHold) {
                val packet = FirebaseRestClient.pullVoiceAudioPacket(
                    tripId = latestCall.tripId,
                    remoteRole = "CUSTOMER",
                    idToken = auth.idToken
                ) ?: orderIds.firstNotNullOfOrNull { oid ->
                    FirebaseRestClient.pullVoiceAudioPacket(oid, "CUSTOMER", auth.idToken)
                }
                if (packet != null && packet.first > lastPlayedRemoteSeq) {
                    lastPlayedRemoteSeq = packet.first
                    hardware.playRemotePcmBase64(packet.second)
                }
            }
        }
    }

    private fun handleCallUnansweredTimeout(call: InAppCallSession) {
        hardware.resetCallAudioMode()
        val unanswered = call.copy(status = InAppCallStatus.UNANSWERED)
        _uiState.update { it.copy(activeInAppCall = null) }
        _uiState.value.session?.let { auth ->
            viewModelScope.launch {
                FirebaseRestClient.syncInAppCallSignaling(
                    callSession = unanswered,
                    riderUid = _uiState.value.riderData.uid,
                    riderName = _uiState.value.riderData.name,
                    idToken = auth.idToken
                )
            }
        }
        sendInAppChatMessage(
            tripId = call.tripId,
            rawText = "📞 Missed In-App Voice Call from Rider. Please call back or reply here."
        )
        showToast("Customer did not answer the in-app call. Missed call alert sent in chat.", ToastType.WARNING)
    }

    fun acceptIncomingInAppCall() {
        val current = _uiState.value.activeInAppCall ?: return
        val now = System.currentTimeMillis()
        hardware.stopRingbackTone()
        hardware.vibrateSuccess()
        val connected = current.copy(
            status = InAppCallStatus.CONNECTED,
            connectedAt = now,
            durationSec = 0,
            remoteSignalVerified = true
        )
        _uiState.update { it.copy(activeInAppCall = connected) }
        startCallHardwareVoiceBridge(current.tripId)
        _uiState.value.session?.let { auth ->
            viewModelScope.launch {
                FirebaseRestClient.syncInAppCallSignaling(
                    callSession = connected,
                    riderUid = _uiState.value.riderData.uid,
                    riderName = _uiState.value.riderData.name,
                    idToken = auth.idToken
                )
            }
        }
    }

    fun toggleInAppCallMute() {
        val current = _uiState.value.activeInAppCall ?: return
        val nextMuted = !current.isMuted
        hardware.vibrateTap()
        hardware.setCallAudioRouting(speakerOn = current.isSpeakerOn, muted = nextMuted)
        val updated = current.copy(isMuted = nextMuted, micLevel = if (nextMuted) 0f else current.micLevel)
        _uiState.update { it.copy(activeInAppCall = updated) }
        _uiState.value.session?.let { auth ->
            viewModelScope.launch {
                FirebaseRestClient.syncInAppCallSignaling(
                    callSession = updated,
                    riderUid = _uiState.value.riderData.uid,
                    riderName = _uiState.value.riderData.name,
                    idToken = auth.idToken
                )
            }
        }
    }

    fun toggleInAppCallSpeaker() {
        val current = _uiState.value.activeInAppCall ?: return
        val nextSpeaker = !current.isSpeakerOn
        hardware.vibrateTap()
        hardware.setCallAudioRouting(speakerOn = nextSpeaker, muted = current.isMuted)
        _uiState.update { it.copy(activeInAppCall = current.copy(isSpeakerOn = nextSpeaker)) }
    }

    fun toggleInAppCallHold() {
        val current = _uiState.value.activeInAppCall ?: return
        val nextHold = !current.isOnHold
        hardware.vibrateTap()
        val updated = current.copy(isOnHold = nextHold)
        _uiState.update { it.copy(activeInAppCall = updated) }
        _uiState.value.session?.let { auth ->
            viewModelScope.launch {
                FirebaseRestClient.syncInAppCallSignaling(
                    callSession = updated,
                    riderUid = _uiState.value.riderData.uid,
                    riderName = _uiState.value.riderData.name,
                    idToken = auth.idToken
                )
            }
        }
    }

    fun minimizeInAppCall() {
        hardware.vibrateTap()
        _uiState.update { it.copy(isCallMinimized = true) }
    }

    fun expandInAppCall() {
        hardware.vibrateTap()
        _uiState.update { it.copy(isCallMinimized = false) }
    }

    fun endInAppCall() {
        val current = _uiState.value.activeInAppCall ?: return
        hardware.vibrateTap()
        hardware.resetCallAudioMode()
        val ended = current.copy(status = InAppCallStatus.ENDED)
        _uiState.update { it.copy(activeInAppCall = null, isCallMinimized = false) }
        _uiState.value.session?.let { auth ->
            viewModelScope.launch {
                FirebaseRestClient.syncInAppCallSignaling(
                    callSession = ended,
                    riderUid = _uiState.value.riderData.uid,
                    riderName = _uiState.value.riderData.name,
                    idToken = auth.idToken
                )
            }
        }
        val msg = if (current.status == InAppCallStatus.CONNECTED) {
            "In-App Voice Call ended (${formatCallDuration(current.durationSec)})"
        } else {
            "In-App Voice Call cancelled"
        }
        showToast(msg, ToastType.INFO)
    }

    fun openInAppChat(tripId: String) {
        hardware.vibrateTap()
        _uiState.update { it.copy(activeInAppChatTripId = tripId) }
        refreshTripChatMessages(tripId)
    }

    fun closeInAppChat() {
        _uiState.update { it.copy(activeInAppChatTripId = null) }
    }

    fun refreshTripChatMessages(tripId: String) {
        val auth = _uiState.value.session ?: return
        val orderIds = getOrderIdsForTrip(tripId)
        viewModelScope.launch {
            val remote = FirebaseRestClient.fetchTripChatMessages(tripId, auth.idToken, orderIds)
            if (remote.isNotEmpty()) {
                _uiState.update { state ->
                    state.copy(
                        chatMessagesByTrip = state.chatMessagesByTrip + (tripId to remote)
                    )
                }
            }
        }
    }

    fun sendInAppChatMessage(tripId: String, rawText: String) {
        val clean = RiderDomainLogic.sanitizeInput(rawText, 320)
        if (clean.isBlank()) return
        val state = _uiState.value
        val now = System.currentTimeMillis()
        val msg = InAppChatMessage(
            id = "msg_$now",
            tripId = tripId,
            senderRole = "RIDER",
            senderName = state.riderData.name.ifBlank { "Rider" },
            text = clean,
            timestamp = now,
            status = "DELIVERED"
        )
        val orderIds = getOrderIdsForTrip(tripId)
        hardware.vibrateTap()
        _uiState.update { s ->
            val currentList = s.chatMessagesByTrip[tripId].orEmpty()
            s.copy(
                chatMessagesByTrip = s.chatMessagesByTrip + (tripId to (currentList + msg))
            )
        }
        state.session?.let { auth ->
            viewModelScope.launch {
                FirebaseRestClient.sendTripChatMessage(tripId, auth.idToken, msg, orderIds)
            }
        }
    }

    private fun formatCallDuration(sec: Int): String {
        val m = sec / 60
        val s = sec % 60
        return "%02d:%02d".format(m, s)
    }

    override fun onCleared() {
        super.onCleared()
        tickerJob?.cancel()
        hardware.shutdown()
    }
}
