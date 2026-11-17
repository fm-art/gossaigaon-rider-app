package com.example.domain

import com.example.model.*
import org.json.JSONObject
import java.net.URI
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.*

object RiderDomainLogic {

    private val TRUSTED_UPI_HANDLES = setOf(
        "paytm", "ybl", "ibl", "axl", "okaxis", "okhdfcbank", "okicici", "oksbi",
        "upi", "apl", "fbl", "sbi", "hdfcbank", "icici", "axisbank", "kotak",
        "indus", "federal", "barodampay", "mahb", "cnrb", "pnb", "upi"
    )

    fun sanitizeInput(raw: String?, maxLen: Int = 240): String {
        if (raw.isNullOrBlank()) return ""
        return raw
            .replace(Regex("[<>\"'`\\\\]"), "")
            .replace(Regex("\\s+"), " ")
            .trim()
            .take(maxLen)
    }

    fun isValidIndianMobile(phone: String): Boolean {
        val digits = phone.filter { it.isDigit() }.takeLast(10)
        return Regex("^[6-9]\\d{9}$").matches(digits)
    }

    fun verifyUpiSecurity(upi: String): Pair<Boolean, String?> {
        val clean = upi.trim().lowercase(Locale.ROOT)
        if (!Regex("^[a-z0-9._-]{2,64}@[a-z0-9]{2,32}$").matches(clean)) {
            return false to "Enter a valid UPI ID format (e.g., 9876543210@paytm)"
        }
        val handle = clean.substringAfter("@")
        if (handle !in TRUSTED_UPI_HANDLES) {
            return false to "Untrusted UPI bank handle @$handle blocked by Scam Shield."
        }
        return true to null
    }

    data class PasswordStrength(
        val valid: Boolean,
        val score: Int,
        val label: String,
        val reason: String? = null
    )

    fun validatePasswordStrength(password: String): PasswordStrength {
        if (password.length < 8) {
            return PasswordStrength(false, 1, "Weak", "Minimum 8 characters required")
        }
        val hasLetter = password.any { it.isLetter() }
        val hasDigit = password.any { it.isDigit() }
        val hasUpper = password.any { it.isUpperCase() }
        val hasSpecial = password.any { !it.isLetterOrDigit() }

        if (!hasLetter || !hasDigit) {
            return PasswordStrength(false, 2, "Fair", "Must include both letters and numbers")
        }
        var score = 3
        if (password.length >= 10 && (hasUpper || hasSpecial)) score = 4
        val label = when (score) {
            4 -> "Strong"
            3 -> "Good"
            else -> "Fair"
        }
        return PasswordStrength(true, score, label, null)
    }

    fun calculateDistanceKm(
        lat1: Double?,
        lon1: Double?,
        lat2: Double?,
        lon2: Double?
    ): Double? {
        if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null
        if (!lat1.isFinite() || !lon1.isFinite() || !lat2.isFinite() || !lon2.isFinite()) return null
        if (lat1 == 0.0 || lon1 == 0.0 || lat2 == 0.0 || lon2 == 0.0) return null

        val r = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
            sin(dLon / 2).pow(2)
        return r * (2 * atan2(sqrt(a), sqrt(1 - a)))
    }

    fun getStorePickupCode(order: OrderRecord, orderId: String): String {
        if (order.pickupOtp.isNotBlank()) return order.pickupOtp
        val cleanId = orderId.ifBlank { order.orderId }
        var hash = 0
        for (ch in cleanId) {
            hash = (hash shl 5) - hash + ch.code
        }
        return ((abs(hash) % 9000) + 1000).toString()
    }

    private fun hasSequentialDigits(str: String): Boolean {
        val asc = "01234567890123456789"
        val desc = "98765432109876543210"
        return asc.contains(str) || desc.contains(str)
    }

    fun validateSettlementUtr(
        utr: String,
        allSettlements: Map<String, SettlementRecord>
    ): Pair<Boolean, String?> {
        val clean = utr.replace("\\s+".toRegex(), "").trim()
        if (!Regex("^\\d{12}$").matches(clean)) {
            return false to "UTR number must be an exact 12-digit bank reference!"
        }
        if (Regex("^(\\d)\\1{11}$").matches(clean) ||
            clean == "123456789012" ||
            clean.startsWith("0000") ||
            hasSequentialDigits(clean)
        ) {
            return false to "Fake or sequential UTR pattern blocked by Scam Shield!"
        }
        val duplicate = allSettlements.values.any {
            it.utr.replace("\\s+".toRegex(), "").trim() == clean
        }
        if (duplicate) {
            return false to "This 12-digit UTR has already been submitted!"
        }
        return true to null
    }

    fun calculateOrderDistanceKm(
        order: OrderRecord,
        stores: Map<String, StoreInfo> = emptyMap()
    ): Double {
        order.distanceKm?.takeIf { it > 0.0 && it.isFinite() }?.let {
            return (it * 100.0).roundToInt() / 100.0
        }

        val store = stores[order.restaurantId]
        val storeLat = store?.lat ?: 26.4539
        val storeLng = store?.lng ?: 89.9741

        val directKm = calculateDistanceKm(storeLat, storeLng, order.customerLat, order.customerLng)
        if (directKm != null && directKm > 0.05) {
            // Apply 1.25x road-network factor for Gossaigaon street routing, minimum 0.5 km
            val roadKm = max(0.5, directKm * 1.25)
            return (roadKm * 100.0).roundToInt() / 100.0
        }

        // Deterministic distance fallback based on customer address & orderId when GPS coords are absent
        val seedStr = "${order.address.lowercase(Locale.ROOT)}_${order.orderId}"
        var hash = 0
        for (ch in seedStr) {
            hash = (hash shl 5) - hash + ch.code
        }
        val tenths = (abs(hash) % 38) + 8 // 0.8 km to 4.5 km
        return tenths / 10.0
    }

    fun calculateOrderDistanceFeeBreakdown(
        order: OrderRecord,
        stores: Map<String, StoreInfo> = emptyMap(),
        baseFee: Double = 20.0,
        perKmRate: Double = 10.0
    ): OrderDistanceFeeBreakdown {
        val distanceKm = calculateOrderDistanceKm(order, stores)
        val cleanBase = if (baseFee > 0.0) baseFee else 20.0
        val cleanRate = if (perKmRate > 0.0) perKmRate else 10.0
        val distancePay = (distanceKm * cleanRate).roundToInt().toDouble()
        val computedTotal = cleanBase + distancePay
        val finalFee = order.riderEarnedFee?.takeIf { it > 0.0 } ?: computedTotal

        return OrderDistanceFeeBreakdown(
            orderId = order.orderId,
            distanceKm = distanceKm,
            basePay = cleanBase,
            perKmRate = cleanRate,
            distancePay = distancePay,
            totalRiderFee = finalFee,
            formulaLabel = "Base ₹${cleanBase.toInt()} + ${"%.1f".format(distanceKm)} km × ₹${cleanRate.toInt()}/km (+₹${distancePay.toInt()})"
        )
    }

    fun getRiderFeeForOrder(
        order: OrderRecord,
        baseFee: Double,
        stores: Map<String, StoreInfo> = emptyMap(),
        perKmRate: Double = 10.0
    ): Double {
        return calculateOrderDistanceFeeBreakdown(
            order = order,
            stores = stores,
            baseFee = baseFee,
            perKmRate = perKmRate
        ).totalRiderFee
    }

    fun isTripPickedUp(trip: TripGroup): Boolean {
        return trip.orders.any {
            it.status in setOf("PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED") ||
                it.storePickupVerifiedAt != null
        }
    }

    fun getOrderTripGroupId(order: OrderRecord, fallbackOrderId: String = order.orderId): String {
        val id = fallbackOrderId.ifBlank { order.orderId }
        return order.batchGroupId.ifBlank {
            "${order.customerUid.ifBlank { "cust" }}_${order.deliveryOtp.ifBlank { id }}"
        }
    }

    fun getTripsGrouped(assignedOrders: Map<String, OrderRecord>): Pair<List<TripGroup>, List<TripGroup>> {
        val activeMap = linkedMapOf<String, MutableList<OrderRecord>>()
        val completedMap = linkedMapOf<String, MutableList<OrderRecord>>()

        assignedOrders.forEach { (id, rawOrder) ->
            val order = rawOrder.copy(orderId = id.ifBlank { rawOrder.orderId })
            val isCompleted = order.status == "DELIVERED" || order.status == "CANCELLED"
            val groupKey = getOrderTripGroupId(order, order.orderId)
            val target = if (isCompleted) completedMap else activeMap
            target.getOrPut(groupKey) { mutableListOf() }.add(order)
        }

        fun buildGroups(map: Map<String, List<OrderRecord>>): List<TripGroup> {
            return map.map { (tripId, list) ->
                val first = list.first()
                TripGroup(
                    tripId = tripId,
                    customerUid = first.customerUid,
                    phone = first.phone,
                    address = first.address.ifBlank { "Gossaigaon" },
                    customerLat = first.customerLat,
                    customerLng = first.customerLng,
                    locationLink = first.locationLink,
                    deliveryOtp = first.deliveryOtp,
                    paymentMode = first.paymentMode.ifBlank { "COD" },
                    paymentStatus = first.paymentStatus.ifBlank { "COD" },
                    emergencyAlert = list.any { it.emergencyAlert },
                    emergencyDetails = list.firstOrNull { it.emergencyDetails.isNotBlank() }?.emergencyDetails.orEmpty(),
                    assignedAt = list.minOfOrNull { it.assignedAt } ?: System.currentTimeMillis(),
                    orders = list
                )
            }.sortedByDescending { it.assignedAt }
        }

        return buildGroups(activeMap) to buildGroups(completedMap)
    }

    fun calculateFinancialSummary(
        assignedOrders: Map<String, OrderRecord>,
        riderSettlements: Map<String, SettlementRecord>,
        myRiderPayouts: Map<String, RiderPayoutRecord>,
        baseRiderFeePerTrip: Double,
        stores: Map<String, StoreInfo> = emptyMap(),
        perKmRate: Double = 10.0
    ): FinancialSummary {
        var totalCodCollected = 0.0
        var totalRiderEarned = 0.0
        var totalDistanceKm = 0.0
        var totalDistanceBonus = 0.0

        assignedOrders.values.forEach { o ->
            if (o.status == "DELIVERED") {
                val breakdown = calculateOrderDistanceFeeBreakdown(
                    order = o,
                    stores = stores,
                    baseFee = baseRiderFeePerTrip,
                    perKmRate = perKmRate
                )
                totalRiderEarned += breakdown.totalRiderFee
                totalDistanceKm += breakdown.distanceKm
                totalDistanceBonus += breakdown.distancePay
                if (o.paymentMode != "UPI" && o.paymentMode != "WALLET") {
                    totalCodCollected += o.totalAmount
                }
            }
        }

        val totalDeposited = riderSettlements.values
            .filter { it.status == "APPROVED" }
            .sumOf { it.amount }

        val netCashInHand = max(0.0, totalCodCollected - totalDeposited)

        val totalPaidPayout = myRiderPayouts.values
            .filter { it.status == "PAID" }
            .sumOf { it.amount }

        val availablePayoutBalance = max(0.0, totalRiderEarned - totalPaidPayout)

        return FinancialSummary(
            totalCodCollected = totalCodCollected,
            totalDeposited = totalDeposited,
            netCashInHand = netCashInHand,
            totalRiderEarned = totalRiderEarned,
            totalDistanceKm = (totalDistanceKm * 100.0).roundToInt() / 100.0,
            totalDistanceBonusEarned = totalDistanceBonus,
            totalRiderPaidPayout = totalPaidPayout,
            availablePayoutBalance = availablePayoutBalance
        )
    }

    fun evaluateBatteryGpsPolicy(
        battery: BatteryStatusSnapshot,
        hasActiveDelivery: Boolean,
        autoGpsEnabled: Boolean
    ): GpsTrackingPolicy {
        if (!autoGpsEnabled) {
            return GpsTrackingPolicy(
                mode = BatteryGpsMode.MANUAL_PAUSED,
                intervalMs = 0L,
                enableHighAccuracy = false,
                badgeLabel = "Manual GPS",
                reason = "Automatic GPS refresh paused for maximum battery preservation."
            )
        }
        val pct = battery.levelPercent.coerceIn(0, 100)
        if (!battery.supported || battery.charging || pct > 25) {
            return GpsTrackingPolicy(
                mode = BatteryGpsMode.HIGH_ACCURACY,
                intervalMs = 5000L,
                enableHighAccuracy = true,
                badgeLabel = "5s High-Precision",
                reason = if (battery.charging) {
                    "Device charging — full 5s high-accuracy telemetry active."
                } else {
                    "Battery healthy ($pct%) — full 5s high-accuracy telemetry active."
                }
            )
        }
        if (pct <= 15) {
            return if (hasActiveDelivery) {
                GpsTrackingPolicy(
                    mode = BatteryGpsMode.CRITICAL_SAVER,
                    intervalMs = 25000L,
                    enableHighAccuracy = true,
                    badgeLabel = "25s Safe Saver",
                    reason = "Critical battery ($pct%) — 25s sync preserves active trip safety."
                )
            } else {
                GpsTrackingPolicy(
                    mode = BatteryGpsMode.CRITICAL_SAVER,
                    intervalMs = 45000L,
                    enableHighAccuracy = false,
                    badgeLabel = "45s Deep Saver",
                    reason = "Critical battery ($pct%) — 45s coarse sync preserves standby power."
                )
            }
        }
        return if (hasActiveDelivery) {
            GpsTrackingPolicy(
                mode = BatteryGpsMode.POWER_SAVER,
                intervalMs = 15000L,
                enableHighAccuracy = true,
                badgeLabel = "15s Eco Telemetry",
                reason = "Low battery ($pct%) — 15s Eco GPS maintains active route tracking."
            )
        } else {
            GpsTrackingPolicy(
                mode = BatteryGpsMode.POWER_SAVER,
                intervalMs = 20000L,
                enableHighAccuracy = true,
                badgeLabel = "20s Eco Telemetry",
                reason = "Low battery ($pct%) — 20s polling extends long-shift endurance."
            )
        }
    }

    fun calculateOptimalDeliverySequence(
        trip: TripGroup,
        stores: Map<String, StoreInfo>,
        riderLat: Double,
        riderLng: Double
    ): OptimalTripSequence {
        val orders = trip.orders
        val isPicked = { o: OrderRecord ->
            o.status in setOf("PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED")
        }
        val completedPickups = orders.filter(isPicked)
        val pendingPickups = orders.filter { !isPicked(it) && it.status != "CANCELLED" }.toMutableList()

        // Naive distance calculation
        var naiveLat = riderLat
        var naiveLng = riderLng
        var naiveKm = 0.0
        pendingPickups.forEach { o ->
            val st = stores[o.restaurantId]
            if (st != null) {
                val d = calculateDistanceKm(naiveLat, naiveLng, st.lat, st.lng) ?: 0.0
                naiveKm += d
                naiveLat = st.lat
                naiveLng = st.lng
            }
        }
        if (trip.customerLat != null && trip.customerLng != null) {
            naiveKm += calculateDistanceKm(naiveLat, naiveLng, trip.customerLat, trip.customerLng) ?: 0.0
        }

        val steps = mutableListOf<OptimalSequenceStop>()
        val orderedPickupIds = mutableListOf<String>()

        completedPickups.forEach { o ->
            val st = stores[o.restaurantId]
            orderedPickupIds.add(o.orderId)
            steps.add(
                OptimalSequenceStop(
                    stepNumber = steps.size + 1,
                    type = "PICKUP",
                    title = st?.name ?: "Store",
                    subtitle = st?.address ?: "Picked up",
                    orderIds = listOf(o.orderId),
                    lat = st?.lat,
                    lng = st?.lng,
                    legDistanceKm = 0.0,
                    cumulativeDistanceKm = 0.0,
                    isCompleted = true,
                    isCurrent = false
                )
            )
        }

        var currLat = riderLat
        var currLng = riderLng
        var cumulativeKm = 0.0

        while (pendingPickups.isNotEmpty()) {
            var bestIdx = 0
            var bestDist = Double.MAX_VALUE
            for (i in pendingPickups.indices) {
                val st = stores[pendingPickups[i].restaurantId]
                if (st != null) {
                    val d = calculateDistanceKm(currLat, currLng, st.lat, st.lng) ?: Double.MAX_VALUE
                    if (d < bestDist) {
                        bestDist = d
                        bestIdx = i
                    }
                }
            }
            val chosen = pendingPickups.removeAt(bestIdx)
            val st = stores[chosen.restaurantId]
            val leg = if (bestDist != Double.MAX_VALUE) (bestDist * 100.0).roundToInt() / 100.0 else null
            if (leg != null && st != null) {
                cumulativeKm += leg
                currLat = st.lat
                currLng = st.lng
            }
            val itemCount = chosen.items.sumOf { max(1, it.qty) }
            orderedPickupIds.add(chosen.orderId)
            steps.add(
                OptimalSequenceStop(
                    stepNumber = steps.size + 1,
                    type = "PICKUP",
                    title = st?.name ?: "Store",
                    subtitle = "$itemCount ${if (itemCount == 1) "item" else "items"} • ${st?.address ?: "Pickup"}",
                    orderIds = listOf(chosen.orderId),
                    lat = st?.lat,
                    lng = st?.lng,
                    legDistanceKm = leg,
                    cumulativeDistanceKm = (cumulativeKm * 100.0).roundToInt() / 100.0,
                    isCompleted = false,
                    isCurrent = false
                )
            )
        }

        val activeDropOrders = orders.filter { it.status != "DELIVERED" && it.status != "CANCELLED" }
        if (activeDropOrders.isNotEmpty()) {
            val dropDist = calculateDistanceKm(currLat, currLng, trip.customerLat, trip.customerLng)
            val leg = dropDist?.let { (it * 100.0).roundToInt() / 100.0 }
            if (leg != null) cumulativeKm += leg
            val storeNames = activeDropOrders.mapNotNull { stores[it.restaurantId]?.name }.distinct()
            steps.add(
                OptimalSequenceStop(
                    stepNumber = steps.size + 1,
                    type = "DROPOFF",
                    title = trip.address,
                    subtitle = if (activeDropOrders.size > 1) {
                        "Deliver ${activeDropOrders.size} orders (${storeNames.joinToString(" + ")})"
                    } else {
                        "Deliver order from ${storeNames.firstOrNull() ?: "Store"}"
                    },
                    orderIds = activeDropOrders.map { it.orderId },
                    lat = trip.customerLat,
                    lng = trip.customerLng,
                    legDistanceKm = leg,
                    cumulativeDistanceKm = (cumulativeKm * 100.0).roundToInt() / 100.0,
                    isCompleted = false,
                    isCurrent = false
                )
            )
        }

        val firstPending = steps.indexOfFirst { !it.isCompleted }
        val finalSteps = steps.mapIndexed { idx, s ->
            if (idx == firstPending) s.copy(isCurrent = true) else s
        }

        val totalRem = (cumulativeKm * 100.0).roundToInt() / 100.0
        val naiveRem = (naiveKm * 100.0).roundToInt() / 100.0
        val saved = max(0.0, ((naiveKm - cumulativeKm) * 100.0).roundToInt() / 100.0)

        return OptimalTripSequence(
            isMultiOrder = orders.size > 1,
            steps = finalSteps,
            orderedPickupOrderIds = orderedPickupIds,
            totalRemainingDistanceKm = totalRem,
            naiveRemainingDistanceKm = naiveRem,
            distanceSavedKm = saved
        )
    }

    fun buildDeliveryQrPayload(tripId: String, deliveryOtp: String): String {
        return JSONObject().apply {
            put("app", "gossaigaon-bazar")
            put("type", "DELIVERY_VERIFY")
            put("tripId", tripId.trim())
            put("otp", deliveryOtp.trim())
        }.toString()
    }

    data class QrValidationResult(
        val valid: Boolean,
        val matchedOtp: String? = null,
        val reason: String? = null
    )

    fun validateDeliveryQrPayload(rawQrText: String, trip: TripGroup): QrValidationResult {
        val raw = rawQrText.trim()
        if (raw.isEmpty()) {
            return QrValidationResult(false, reason = "Empty or unreadable QR code.")
        }
        val lower = raw.lowercase(Locale.ROOT)
        if (lower.startsWith("upi://") || lower.contains("javascript:") || lower.contains("<script")) {
            return QrValidationResult(
                false,
                reason = "SCAM SHIELD ALERT: Payment/collect or script QR blocked! Never scan UPI collect codes to receive money."
            )
        }

        val expectedOtp = trip.deliveryOtp.trim()
        val orderIds = trip.orders.map { it.orderId.trim() }.toSet()

        var scannedTripId = ""
        var scannedOrderId = ""
        var scannedOtp = ""

        if (raw.startsWith("{") && raw.endsWith("}")) {
            try {
                val obj = JSONObject(raw)
                scannedTripId = obj.optString("tripId", obj.optString("batchGroupId", "")).trim()
                scannedOrderId = obj.optString("orderId", "").trim()
                scannedOtp = obj.optString(
                    "otp",
                    obj.optString("pin", obj.optString("deliveryOtp", obj.optString("code", "")))
                ).trim()
            } catch (_: Exception) {
                return QrValidationResult(false, reason = "Invalid customer QR JSON payload.")
            }
        } else if (raw.startsWith("GBZ-DELIVER:", ignoreCase = true)) {
            val parts = raw.split(":")
            scannedTripId = parts.getOrNull(1)?.trim().orEmpty()
            scannedOtp = parts.getOrNull(2)?.trim().orEmpty()
        } else if (raw.contains("otp=") || raw.contains("pin=") || raw.contains("://")) {
            try {
                val normalized = if (raw.contains("://")) raw else "https://verify.local/?$raw"
                val uri = URI(normalized)
                val query = uri.rawQuery.orEmpty()
                val params = query.split("&").mapNotNull {
                    val kv = it.split("=", limit = 2)
                    if (kv.size == 2) kv[0] to kv[1] else null
                }.toMap()
                scannedTripId = (params["tripId"] ?: params["batchGroupId"]).orEmpty().trim()
                scannedOrderId = params["orderId"].orEmpty().trim()
                scannedOtp = (params["otp"] ?: params["pin"] ?: params["deliveryOtp"] ?: params["code"]).orEmpty().trim()
            } catch (_: Exception) {
                return QrValidationResult(false, reason = "Malformed QR verification URL.")
            }
        } else if (Regex("^\\d{4,6}$").matches(raw)) {
            scannedOtp = raw
        } else {
            return QrValidationResult(
                false,
                reason = "Unrecognized QR format. Ask customer to show the Gossaigaon order QR."
            )
        }

        if (scannedTripId.isNotEmpty() && scannedTripId != trip.tripId && scannedTripId !in orderIds) {
            return QrValidationResult(false, reason = "This QR code belongs to a different trip.")
        }
        if (scannedOrderId.isNotEmpty() && scannedOrderId != trip.tripId && scannedOrderId !in orderIds) {
            return QrValidationResult(false, reason = "This QR code does not match any order in this batch.")
        }

        val targetOtp = expectedOtp.ifEmpty {
            trip.orders.firstOrNull()?.deliveryOtp.orEmpty().trim()
        }
        if (targetOtp.isNotEmpty()) {
            if (scannedOtp.isEmpty()) {
                return QrValidationResult(false, reason = "QR code does not contain a delivery PIN.")
            }
            if (scannedOtp != targetOtp) {
                return QrValidationResult(false, reason = "Delivery PIN mismatch ($scannedOtp != expected).")
            }
            return QrValidationResult(true, matchedOtp = scannedOtp)
        }
        return QrValidationResult(true, matchedOtp = scannedOtp.ifEmpty { "VERIFIED" })
    }

    fun calculateLast7DaysPerformance(
        completedTrips: List<TripGroup>,
        baseFee: Double,
        stores: Map<String, StoreInfo> = emptyMap(),
        perKmRate: Double = 10.0,
        nowMs: Long = System.currentTimeMillis()
    ): List<DailyPerformancePoint> {
        val dayFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val shortDayFmt = SimpleDateFormat("EEE", Locale.US)
        val fullDateFmt = SimpleDateFormat("d MMM", Locale.US)

        val cal = Calendar.getInstance().apply {
            timeInMillis = nowMs
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        val buckets = mutableListOf<DailyPerformancePoint>()
        val indexByKey = mutableMapOf<String, Int>()

        for (offset in 6 downTo 0) {
            val c = (cal.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -offset) }
            val date = c.time
            val key = dayFmt.format(date)
            val label = if (offset == 0) "Today" else shortDayFmt.format(date)
            val full = fullDateFmt.format(date)
            indexByKey[key] = buckets.size
            buckets.add(DailyPerformancePoint(key, label, full, 0.0, 0))
        }

        completedTrips.forEach { trip ->
            val delivered = trip.orders.filter { it.status == "DELIVERED" }
            if (delivered.isEmpty()) return@forEach
            val ts = delivered.maxOfOrNull { max(it.updatedAt, it.createdAt) } ?: trip.assignedAt
            val key = dayFmt.format(Date(ts))
            val idx = indexByKey[key] ?: return@forEach
            val earned = delivered.sumOf { getRiderFeeForOrder(it, baseFee, stores, perKmRate) }
            val old = buckets[idx]
            buckets[idx] = old.copy(
                earnings = old.earnings + earned,
                trips = old.trips + 1
            )
        }
        return buckets
    }

    fun buildDeliveredHistoryEntries(
        completedTrips: List<TripGroup>,
        stores: Map<String, StoreInfo>,
        baseFee: Double,
        perKmRate: Double = 10.0
    ): List<DeliveredHistoryEntry> {
        val fmt = SimpleDateFormat("d MMM yyyy, h:mm a", Locale.US)
        return completedTrips.mapNotNull { trip ->
            val delivered = trip.orders.filter { it.status == "DELIVERED" }
            if (delivered.isEmpty()) return@mapNotNull null
            val deliveredAt = delivered.maxOfOrNull { max(it.updatedAt, it.createdAt) } ?: trip.assignedAt
            val breakdowns = delivered.map { o ->
                val stName = stores[o.restaurantId]?.name ?: "Store"
                val feeInfo = calculateOrderDistanceFeeBreakdown(o, stores, baseFee, perKmRate)
                val count = o.items.sumOf { max(1, it.qty) }
                HistoryOrderBreakdown(
                    orderId = o.orderId,
                    storeName = stName,
                    distanceKm = feeInfo.distanceKm,
                    earning = feeInfo.totalRiderFee,
                    billAmount = o.totalAmount,
                    itemCount = count
                )
            }
            val totalDist = (breakdowns.sumOf { it.distanceKm } * 100.0).roundToInt() / 100.0
            DeliveredHistoryEntry(
                tripId = trip.tripId,
                shortId = "#${trip.tripId.takeLast(6)}",
                deliveredAt = deliveredAt,
                dateLabel = fmt.format(Date(deliveredAt)),
                storeNames = breakdowns.map { it.storeName }.distinct(),
                customerLocation = trip.address,
                paymentMode = trip.paymentMode,
                totalDistanceKm = totalDist,
                totalEarnings = breakdowns.sumOf { it.earning },
                totalBillAmount = breakdowns.sumOf { it.billAmount },
                orderBreakdowns = breakdowns
            )
        }.sortedByDescending { it.deliveredAt }
    }

    fun buildOrderVolumeHeatmap(
        allOrders: Map<String, OrderRecord>,
        stores: Map<String, StoreInfo>
    ): List<HeatmapPoint> {
        data class Cluster(
            var sumLat: Double,
            var sumLng: Double,
            var lat: Double,
            var lng: Double,
            var count: Int,
            var totalValue: Double,
            val labels: MutableMap<String, Int> = mutableMapOf()
        )

        val clusters = mutableListOf<Cluster>()
        allOrders.values.forEach { o ->
            if (o.status != "DELIVERED") return@forEach
            val st = stores[o.restaurantId]
            val lat = o.customerLat ?: st?.lat ?: return@forEach
            val lng = o.customerLng ?: st?.lng ?: return@forEach
            val rawLabel = o.address.ifBlank { st?.address ?: "Gossaigaon Bazar" }
                .replace(Regex(",\\s*Gossaigaon(\\s*Bazar)?$", RegexOption.IGNORE_CASE), "")
                .trim()

            val match = clusters.minByOrNull {
                calculateDistanceKm(it.lat, it.lng, lat, lng) ?: Double.MAX_VALUE
            }?.takeIf {
                (calculateDistanceKm(it.lat, it.lng, lat, lng) ?: Double.MAX_VALUE) <= 0.28
            }

            if (match != null) {
                match.sumLat += lat
                match.sumLng += lng
                match.count += 1
                match.totalValue += o.totalAmount
                match.lat = match.sumLat / match.count
                match.lng = match.sumLng / match.count
                match.labels[rawLabel] = (match.labels[rawLabel] ?: 0) + 1
            } else {
                clusters.add(
                    Cluster(
                        sumLat = lat,
                        sumLng = lng,
                        lat = lat,
                        lng = lng,
                        count = 1,
                        totalValue = o.totalAmount,
                        labels = mutableMapOf(rawLabel to 1)
                    )
                )
            }
        }

        val maxCount = clusters.maxOfOrNull { it.count }?.coerceAtLeast(1) ?: 1
        return clusters.mapIndexed { idx, c ->
            val topLabel = c.labels.maxByOrNull { it.value }?.key ?: "Gossaigaon"
            HeatmapPoint(
                id = "heat_$idx",
                lat = c.lat,
                lng = c.lng,
                weight = (c.count.toFloat() / maxCount.toFloat()).coerceIn(0.2f, 1f),
                orderCount = c.count,
                areaLabel = topLabel,
                totalValue = c.totalValue
            )
        }.sortedByDescending { it.orderCount }
    }

    fun calculateWeeklyLeaderboard(
        allOrders: Map<String, OrderRecord>,
        allRiders: Map<String, RiderData>,
        currentUid: String,
        baseFee: Double,
        stores: Map<String, StoreInfo> = emptyMap(),
        perKmRate: Double = 10.0,
        nowMs: Long = System.currentTimeMillis()
    ): WeeklyLeaderboardData {
        val cal = Calendar.getInstance().apply {
            timeInMillis = nowMs
            val dow = get(Calendar.DAY_OF_WEEK)
            val diff = if (dow == Calendar.SUNDAY) 6 else dow - Calendar.MONDAY
            add(Calendar.DAY_OF_YEAR, -diff)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val weekStart = cal.timeInMillis
        val weekEnd = weekStart + 7 * 24 * 3600 * 1000L - 1L
        val fmt = SimpleDateFormat("d MMM", Locale.US)
        val rangeLabel = "${fmt.format(Date(weekStart))} – ${fmt.format(Date(weekEnd))}"

        data class Acc(
            val trips: MutableSet<String> = mutableSetOf(),
            var orders: Int = 0,
            var earnings: Double = 0.0
        )

        val stats = mutableMapOf<String, Acc>()
        allOrders.forEach { (id, o) ->
            if (o.status != "DELIVERED" || o.deliveryUid.isNullOrBlank()) return@forEach
            val ts = max(o.updatedAt, o.createdAt)
            if (ts !in weekStart..weekEnd) return@forEach
            val uid = o.deliveryUid
            val tripKey = o.batchGroupId.ifBlank { "${o.customerUid}_${o.deliveryOtp}_$id" }
            val acc = stats.getOrPut(uid) { Acc() }
            acc.trips.add(tripKey)
            acc.orders += 1
            acc.earnings += getRiderFeeForOrder(o, baseFee, stores, perKmRate)
        }

        val ranked = stats.mapNotNull { (uid, acc) ->
            if (acc.trips.isEmpty()) return@mapNotNull null
            val profile = allRiders[uid]
            LeaderboardEntry(
                rank = 0,
                riderUid = uid,
                name = profile?.name ?: "Rider #${uid.takeLast(4)}",
                vehicle = profile?.vehicle ?: "Two-Wheeler",
                ratingAvg = profile?.ratingAvg ?: 4.9,
                deliveredTrips = acc.trips.size,
                deliveredOrders = acc.orders,
                weeklyEarnings = acc.earnings,
                isCurrentRider = uid == currentUid
            )
        }.sortedWith(
            compareByDescending<LeaderboardEntry> { it.deliveredTrips }
                .thenByDescending { it.deliveredOrders }
                .thenByDescending { it.weeklyEarnings }
                .thenByDescending { it.ratingAvg }
        ).mapIndexed { index, entry -> entry.copy(rank = index + 1) }

        val currentEntry = ranked.find { it.isCurrentRider } ?: allRiders[currentUid]?.let { me ->
            LeaderboardEntry(
                rank = ranked.size + 1,
                riderUid = currentUid,
                name = me.name,
                vehicle = me.vehicle,
                ratingAvg = me.ratingAvg,
                deliveredTrips = 0,
                deliveredOrders = 0,
                weeklyEarnings = 0.0,
                isCurrentRider = true
            )
        }

        return WeeklyLeaderboardData(
            weekRangeLabel = rangeLabel,
            topRiders = ranked.take(10),
            currentRiderEntry = currentEntry,
            totalFleetTripsThisWeek = ranked.sumOf { it.deliveredTrips }
        )
    }

    fun summarizeTodayRouteTrail(points: List<RoutePoint>): RouteTrailSummary {
        val sorted = points.sortedBy { it.time }
        var totalKm = 0.0
        for (i in 1 until sorted.size) {
            totalKm += calculateDistanceKm(
                sorted[i - 1].lat,
                sorted[i - 1].lng,
                sorted[i].lat,
                sorted[i].lng
            ) ?: 0.0
        }
        val first = sorted.firstOrNull()
        val last = sorted.lastOrNull()
        val durationMin = if (first != null && last != null) {
            max(0, ((last.time - first.time) / 60000L).toInt())
        } else 0
        val fmt = SimpleDateFormat("hh:mm a", Locale.US)
        return RouteTrailSummary(
            points = sorted,
            pointCount = sorted.size,
            totalDistanceKm = (totalKm * 100.0).roundToInt() / 100.0,
            durationMinutes = durationMin,
            startTimeLabel = first?.let { fmt.format(Date(it.time)) } ?: "--:--",
            endTimeLabel = last?.let { fmt.format(Date(it.time)) } ?: "--:--"
        )
    }
}
