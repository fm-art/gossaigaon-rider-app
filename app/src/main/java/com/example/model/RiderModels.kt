package com.example.model

enum class RiderTab(val id: String, val label: String) {
    ACTIVE("active", "Active"),
    MAP("map", "Radar Map"),
    HISTORY("history", "History"),
    EARNINGS("earnings", "Wallet"),
    PROFILE("profile", "Cockpit")
}

data class RoutePoint(
    val lat: Double = 26.4524,
    val lng: Double = 89.9723,
    val time: Long = System.currentTimeMillis()
)

data class PreferredShiftHours(
    val enabled: Boolean = true,
    val startTime: String = "08:00",
    val endTime: String = "20:00"
)

data class RiderData(
    val uid: String = "",
    val name: String = "Rider",
    val email: String = "",
    val phone: String = "",
    val upiId: String = "",
    val vehicle: String = "",
    val approved: Boolean = true,
    val online: Boolean = false,
    val suspended: Boolean = false,
    val adminNote: String = "",
    val lat: Double = 26.4524,
    val lng: Double = 89.9723,
    val lastSeen: Long = System.currentTimeMillis(),
    val lastLocationUpdate: Long = System.currentTimeMillis(),
    val recentRoute: List<RoutePoint> = emptyList(),
    val ratingAvg: Double = 4.9,
    val ratingCount: Int = 18,
    val preferredShift: PreferredShiftHours = PreferredShiftHours()
)

data class OrderItem(
    val name: String = "",
    val qty: Int = 1,
    val price: Double = 0.0
)

data class RejectionRecord(
    val riderName: String = "",
    val riderPhone: String = "",
    val reason: String = "",
    val timestamp: Long = 0L
)

data class OrderRecord(
    val orderId: String = "",
    val batchGroupId: String = "",
    val customerUid: String = "",
    val deliveryUid: String? = null,
    val restaurantId: String = "",
    val phone: String = "",
    val address: String = "Gossaigaon",
    val customerLat: Double? = null,
    val customerLng: Double? = null,
    val locationLink: String = "",
    val deliveryOtp: String = "",
    val pickupOtp: String = "",
    val paymentMode: String = "COD",
    val paymentStatus: String = "COD",
    val status: String = "READY_FOR_PICKUP",
    val totalAmount: Double = 0.0,
    val deliveryCharge: Double = 30.0,
    val distanceKm: Double? = null,
    val riderEarnedFee: Double? = null,
    val items: List<OrderItem> = emptyList(),
    val riderAccepted: Boolean? = null,
    val riderAcceptedAt: Long? = null,
    val assignedAt: Long = System.currentTimeMillis(),
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val storePickupVerifiedAt: Long? = null,
    val emergencyAlert: Boolean = false,
    val emergencyDetails: String = "",
    val rejectedByRiders: Map<String, RejectionRecord> = emptyMap(),
    val verificationMethod: String = "",
    val verifiedAt: Long? = null
)

data class StoreInfo(
    val storeId: String = "",
    val name: String = "Store",
    val address: String = "Gossaigaon Bazar",
    val phone: String = "",
    val lat: Double = 26.4539,
    val lng: Double = 89.9741
)

data class TripGroup(
    val tripId: String,
    val customerUid: String = "",
    val phone: String = "",
    val address: String = "Gossaigaon",
    val customerLat: Double? = null,
    val customerLng: Double? = null,
    val locationLink: String = "",
    val deliveryOtp: String = "",
    val paymentMode: String = "COD",
    val paymentStatus: String = "COD",
    val emergencyAlert: Boolean = false,
    val emergencyDetails: String = "",
    val assignedAt: Long = System.currentTimeMillis(),
    val orders: List<OrderRecord> = emptyList()
)

data class SettlementRecord(
    val id: String = "",
    val riderUid: String = "",
    val riderName: String = "",
    val amount: Double = 0.0,
    val mode: String = "UPI",
    val utr: String = "",
    val status: String = "PENDING_VERIFICATION",
    val createdAt: Long = System.currentTimeMillis()
)

data class RiderPayoutRecord(
    val id: String = "",
    val riderUid: String = "",
    val riderName: String = "",
    val riderPhone: String = "",
    val riderUpiId: String = "",
    val amount: Double = 0.0,
    val status: String = "REQUESTED",
    val adminRef: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

data class RiderRating(
    val customerName: String = "Verified Customer",
    val rating: Double = 5.0,
    val comment: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

data class FeedbackRecord(
    val id: String = "",
    val role: String = "RIDER",
    val uid: String = "",
    val name: String = "",
    val phone: String = "",
    val subject: String = "",
    val message: String = "",
    val status: String = "OPEN",
    val adminReply: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

data class AdminSettings(
    val upiId: String = "gossaigaonbazar@sbi",
    val riderBaseFee: Double = 20.0,
    val riderPerKmRate: Double = 10.0,
    val deliveryCharge: Double = 30.0,
    val maxRiderCashLimit: Double = 2000.0,
    val riderAcceptTimeoutSec: Int = 90,
    val minRiderPayout: Double = 100.0,
    val maxRiderPayout: Double = 10000.0,
    val minRiderCodDeposit: Double = 50.0,
    val maxRiderCodDeposit: Double = 50000.0,
    val allowRiderPassTrip: Boolean = true,
    val allowRiderSos: Boolean = true,
    val riderAnnouncement: String = "Monsoon & High-Demand Bonus: +₹10 extra per multi-store batch in Gossaigaon Bazar!",
    val supportHours: String = "7:00 AM – 10:00 PM IST",
    val supportPhone: String = "9864012345",
    val supportWhatsapp: String = "9864012345"
)

enum class ToastType {
    SUCCESS, DANGER, INFO, WARNING
}

data class ToastMessage(
    val id: Long = System.nanoTime(),
    val msg: String,
    val type: ToastType = ToastType.INFO
)

enum class BatteryGpsMode {
    HIGH_ACCURACY, POWER_SAVER, CRITICAL_SAVER, MANUAL_PAUSED
}

data class BatteryStatusSnapshot(
    val supported: Boolean = true,
    val levelPercent: Int = 88,
    val charging: Boolean = false
)

data class GpsTrackingPolicy(
    val mode: BatteryGpsMode,
    val intervalMs: Long,
    val enableHighAccuracy: Boolean,
    val badgeLabel: String,
    val reason: String
)

data class OrderDistanceFeeBreakdown(
    val orderId: String,
    val distanceKm: Double,
    val basePay: Double,
    val perKmRate: Double,
    val distancePay: Double,
    val totalRiderFee: Double,
    val formulaLabel: String
)

data class FinancialSummary(
    val totalCodCollected: Double = 0.0,
    val totalDeposited: Double = 0.0,
    val netCashInHand: Double = 0.0,
    val totalRiderEarned: Double = 0.0,
    val totalDistanceKm: Double = 0.0,
    val totalDistanceBonusEarned: Double = 0.0,
    val totalRiderPaidPayout: Double = 0.0,
    val availablePayoutBalance: Double = 0.0
)

data class OptimalSequenceStop(
    val stepNumber: Int,
    val type: String, // PICKUP or DROPOFF
    val title: String,
    val subtitle: String,
    val orderIds: List<String>,
    val lat: Double?,
    val lng: Double?,
    val legDistanceKm: Double?,
    val cumulativeDistanceKm: Double,
    val isCompleted: Boolean,
    val isCurrent: Boolean
)

data class OptimalTripSequence(
    val isMultiOrder: Boolean,
    val steps: List<OptimalSequenceStop>,
    val orderedPickupOrderIds: List<String>,
    val totalRemainingDistanceKm: Double,
    val naiveRemainingDistanceKm: Double,
    val distanceSavedKm: Double
)

data class DailyPerformancePoint(
    val dateKey: String,
    val label: String,
    val fullDate: String,
    val earnings: Double,
    val trips: Int
)

data class HeatmapPoint(
    val id: String,
    val lat: Double,
    val lng: Double,
    val weight: Float,
    val orderCount: Int,
    val areaLabel: String,
    val totalValue: Double
)

data class LeaderboardEntry(
    val rank: Int,
    val riderUid: String,
    val name: String,
    val vehicle: String,
    val ratingAvg: Double,
    val deliveredTrips: Int,
    val deliveredOrders: Int,
    val weeklyEarnings: Double,
    val isCurrentRider: Boolean
)

data class WeeklyLeaderboardData(
    val weekRangeLabel: String,
    val topRiders: List<LeaderboardEntry>,
    val currentRiderEntry: LeaderboardEntry?,
    val totalFleetTripsThisWeek: Int
)

data class DeliveredHistoryEntry(
    val tripId: String,
    val shortId: String,
    val deliveredAt: Long,
    val dateLabel: String,
    val storeNames: List<String>,
    val customerLocation: String,
    val paymentMode: String,
    val totalDistanceKm: Double,
    val totalEarnings: Double,
    val totalBillAmount: Double,
    val orderBreakdowns: List<HistoryOrderBreakdown>
)

data class HistoryOrderBreakdown(
    val orderId: String,
    val storeName: String,
    val distanceKm: Double,
    val earning: Double,
    val billAmount: Double,
    val itemCount: Int
)

data class RouteTrailSummary(
    val points: List<RoutePoint>,
    val pointCount: Int,
    val totalDistanceKm: Double,
    val durationMinutes: Int,
    val startTimeLabel: String,
    val endTimeLabel: String
)

data class SecurityAuditEvent(
    val id: Long = System.nanoTime(),
    val type: String,
    val severity: String,
    val detail: String,
    val timestamp: Long = System.currentTimeMillis()
)

data class AuthUserSession(
    val uid: String,
    val email: String,
    val displayName: String,
    val idToken: String,
    val emailVerified: Boolean
)

data class FleetNotificationItem(
    val id: String = "notif_${System.nanoTime()}",
    val title: String,
    val body: String,
    val category: String = "DISPATCH", // DISPATCH, PAYOUT, BROADCAST, SECURITY
    val timestamp: Long = System.currentTimeMillis(),
    val isRead: Boolean = false
)

enum class InAppCallStatus {
    CONNECTING,
    RINGING,
    INCOMING_RINGING,
    CONNECTED,
    DECLINED,
    UNANSWERED,
    ENDED
}

data class InAppCallSession(
    val callId: String = "call_${System.currentTimeMillis()}",
    val tripId: String,
    val customerUid: String,
    val customerLabel: String,
    val dropAddress: String,
    val callerRole: String = "RIDER", // RIDER or CUSTOMER
    val status: InAppCallStatus = InAppCallStatus.CONNECTING,
    val isMuted: Boolean = false,
    val isSpeakerOn: Boolean = false,
    val isOnHold: Boolean = false,
    val startedAt: Long = System.currentTimeMillis(),
    val connectedAt: Long? = null,
    val durationSec: Int = 0,
    val micLevel: Float = 0f,
    val remoteSignalVerified: Boolean = false
)

data class InAppChatMessage(
    val id: String = "msg_${System.currentTimeMillis()}",
    val tripId: String,
    val senderRole: String = "RIDER", // RIDER or CUSTOMER
    val senderName: String = "Rider",
    val text: String,
    val timestamp: Long = System.currentTimeMillis(),
    val status: String = "SENT" // SENT, DELIVERED, READ
)
