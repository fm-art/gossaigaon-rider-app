package com.example.data

import com.example.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

data class LiveFleetSnapshot(
    val riderData: RiderData?,
    val stores: Map<String, StoreInfo>,
    val assignedOrders: Map<String, OrderRecord>,
    val allOrders: Map<String, OrderRecord>,
    val allRiders: Map<String, RiderData>,
    val settlements: Map<String, SettlementRecord>,
    val payouts: Map<String, RiderPayoutRecord>,
    val ratings: List<RiderRating>,
    val feedbacks: Map<String, FeedbackRecord>,
    val adminSettings: AdminSettings
)

object FirebaseRestClient {

    private const val FIREBASE_API_KEY = "AIzaSyCuJLxRCdhAVZoN81-5weEFnSU4nDr98lo"
    private const val RTDB_BASE_URL = "https://test-2a0d0-default-rtdb.firebaseio.com"
    private const val AUTH_BASE_URL = "https://identitytoolkit.googleapis.com/v1"

    sealed class ApiResult<out T> {
        data class Success<T>(val data: T) : ApiResult<T>()
        data class Error(val message: String, val code: String = "") : ApiResult<Nothing>()
    }

    suspend fun signInWithEmailPassword(email: String, password: String): ApiResult<AuthUserSession> =
        withContext(Dispatchers.IO) {
            val payload = JSONObject().apply {
                put("email", email.trim())
                put("password", password)
                put("returnSecureToken", true)
            }
            when (val res = postJson("$AUTH_BASE_URL/accounts:signInWithPassword?key=$FIREBASE_API_KEY", payload)) {
                is ApiResult.Success -> {
                    val uid = res.data.optString("localId")
                    val idToken = res.data.optString("idToken")
                    val displayName = res.data.optString("displayName", "Rider")
                    val verified = fetchEmailVerified(idToken)
                    ApiResult.Success(
                        AuthUserSession(
                            uid = uid,
                            email = email.trim(),
                            displayName = displayName.ifBlank { "Rider" },
                            idToken = idToken,
                            emailVerified = verified
                        )
                    )
                }
                is ApiResult.Error -> res
            }
        }

    suspend fun signUpWithEmailPassword(
        name: String,
        email: String,
        phone: String,
        upiId: String,
        vehicle: String,
        password: String
    ): ApiResult<AuthUserSession> = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("email", email.trim())
            put("password", password)
            put("displayName", name.trim())
            put("returnSecureToken", true)
        }
        when (val res = postJson("$AUTH_BASE_URL/accounts:signUp?key=$FIREBASE_API_KEY", payload)) {
            is ApiResult.Success -> {
                val uid = res.data.optString("localId")
                val idToken = res.data.optString("idToken")
                val riderJson = JSONObject().apply {
                    put("name", name.trim())
                    put("email", email.trim())
                    put("phone", phone.trim())
                    put("upiId", upiId.trim())
                    put("vehicle", vehicle.trim())
                    put("approved", true)
                    put("suspended", false)
                    put("online", false)
                    put("lat", 26.4524)
                    put("lng", 89.9723)
                    put("lastSeen", System.currentTimeMillis())
                }
                putRtdbJson("deliveryPartners/$uid", idToken, riderJson)
                sendVerificationEmail(idToken)
                ApiResult.Success(
                    AuthUserSession(
                        uid = uid,
                        email = email.trim(),
                        displayName = name.trim(),
                        idToken = idToken,
                        emailVerified = false
                    )
                )
            }
            is ApiResult.Error -> res
        }
    }

    suspend fun sendVerificationEmail(idToken: String): ApiResult<Boolean> = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("requestType", "VERIFY_EMAIL")
            put("idToken", idToken)
        }
        when (val res = postJson("$AUTH_BASE_URL/accounts:sendOobCode?key=$FIREBASE_API_KEY", payload)) {
            is ApiResult.Success -> ApiResult.Success(true)
            is ApiResult.Error -> res
        }
    }

    suspend fun sendPasswordResetEmail(email: String): ApiResult<Boolean> = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply {
            put("requestType", "PASSWORD_RESET")
            put("email", email.trim())
        }
        when (val res = postJson("$AUTH_BASE_URL/accounts:sendOobCode?key=$FIREBASE_API_KEY", payload)) {
            is ApiResult.Success -> ApiResult.Success(true)
            is ApiResult.Error -> {
                if (res.code.contains("EMAIL_NOT_FOUND")) {
                    ApiResult.Success(true)
                } else {
                    res
                }
            }
        }
    }

    suspend fun fetchEmailVerified(idToken: String): Boolean = withContext(Dispatchers.IO) {
        val payload = JSONObject().apply { put("idToken", idToken) }
        when (val res = postJson("$AUTH_BASE_URL/accounts:lookup?key=$FIREBASE_API_KEY", payload)) {
            is ApiResult.Success -> {
                val users = res.data.optJSONArray("users")
                if (users != null && users.length() > 0) {
                    users.getJSONObject(0).optBoolean("emailVerified", false)
                } else false
            }
            is ApiResult.Error -> false
        }
    }

    suspend fun fetchLiveFleetSnapshot(uid: String, idToken: String): LiveFleetSnapshot = withContext(Dispatchers.IO) {
        val riderObj = getRtdbJsonObject("deliveryPartners/$uid", idToken)
        val riderData = riderObj?.let { parseRiderData(uid, it) }

        val storesObj = getRtdbJsonObject("restaurants", idToken)
            ?: getRtdbJsonObject("stores", idToken)
        val stores = mutableMapOf<String, StoreInfo>()
        storesObj?.keys()?.forEach { key ->
            val st = storesObj.optJSONObject(key)
            if (st != null) {
                stores[key] = StoreInfo(
                    storeId = key,
                    name = st.optString("name", "Store"),
                    address = st.optString("address", "Gossaigaon"),
                    phone = st.optString("phone", ""),
                    lat = st.optDouble("lat", 26.4539),
                    lng = st.optDouble("lng", 89.9741)
                )
            }
        }

        val ordersObj = getRtdbJsonObject("orders", idToken)
        val allOrders = mutableMapOf<String, OrderRecord>()
        val assignedOrders = mutableMapOf<String, OrderRecord>()
        ordersObj?.keys()?.forEach { orderId ->
            val o = ordersObj.optJSONObject(orderId)
            if (o != null) {
                val record = parseOrderRecord(orderId, o)
                allOrders[orderId] = record
                if (record.deliveryUid == uid) {
                    assignedOrders[orderId] = record
                }
            }
        }

        val ridersObj = getRtdbJsonObject("deliveryPartners", idToken)
        val allRiders = mutableMapOf<String, RiderData>()
        ridersObj?.keys()?.forEach { rUid ->
            val r = ridersObj.optJSONObject(rUid)
            if (r != null) {
                allRiders[rUid] = parseRiderData(rUid, r)
            }
        }

        val settlementsObj = getRtdbJsonObject("riderSettlements", idToken)
        val settlements = mutableMapOf<String, SettlementRecord>()
        settlementsObj?.keys()?.forEach { sId ->
            val s = settlementsObj.optJSONObject(sId)
            if (s != null && s.optString("riderUid") == uid) {
                settlements[sId] = SettlementRecord(
                    id = sId,
                    riderUid = s.optString("riderUid"),
                    riderName = s.optString("riderName"),
                    amount = s.optDouble("amount", 0.0),
                    mode = s.optString("mode", "UPI"),
                    utr = s.optString("utr", ""),
                    status = s.optString("status", "PENDING_VERIFICATION"),
                    createdAt = s.optLong("createdAt", System.currentTimeMillis())
                )
            }
        }

        val payoutsObj = getRtdbJsonObject("riderPayouts", idToken)
        val payouts = mutableMapOf<String, RiderPayoutRecord>()
        payoutsObj?.keys()?.forEach { pId ->
            val p = payoutsObj.optJSONObject(pId)
            if (p != null && p.optString("riderUid") == uid) {
                payouts[pId] = RiderPayoutRecord(
                    id = pId,
                    riderUid = p.optString("riderUid"),
                    riderName = p.optString("riderName"),
                    riderPhone = p.optString("riderPhone"),
                    riderUpiId = p.optString("riderUpiId"),
                    amount = p.optDouble("amount", 0.0),
                    status = p.optString("status", "REQUESTED"),
                    adminRef = p.optString("adminRef", ""),
                    createdAt = p.optLong("createdAt", System.currentTimeMillis())
                )
            }
        }

        val settingsObj = getRtdbJsonObject("adminSettings", idToken)
        val adminSettings = if (settingsObj != null) {
            AdminSettings(
                upiId = settingsObj.optString("upiId", "gossaigaonbazar@sbi"),
                riderBaseFee = settingsObj.optDouble("riderBaseFee", 20.0),
                riderPerKmRate = settingsObj.optDouble("riderPerKmRate", 10.0),
                deliveryCharge = settingsObj.optDouble("deliveryCharge", 30.0),
                maxRiderCashLimit = settingsObj.optDouble("maxRiderCashLimit", 2000.0),
                riderAcceptTimeoutSec = settingsObj.optInt("riderAcceptTimeoutSec", 90),
                minRiderPayout = settingsObj.optDouble("minRiderPayout", 100.0),
                maxRiderPayout = settingsObj.optDouble("maxRiderPayout", 10000.0),
                minRiderCodDeposit = settingsObj.optDouble("minRiderCodDeposit", 50.0),
                maxRiderCodDeposit = settingsObj.optDouble("maxRiderCodDeposit", 50000.0),
                allowRiderPassTrip = settingsObj.optBoolean("allowRiderPassTrip", true),
                allowRiderSos = settingsObj.optBoolean("allowRiderSos", true),
                riderAnnouncement = settingsObj.optString("riderAnnouncement", ""),
                supportHours = settingsObj.optString("supportHours", "7:00 AM – 10:00 PM IST"),
                supportPhone = settingsObj.optString("supportPhone", ""),
                supportWhatsapp = settingsObj.optString("supportWhatsapp", "")
            )
        } else {
            AdminSettings(riderAnnouncement = "")
        }

        LiveFleetSnapshot(
            riderData = riderData,
            stores = stores,
            assignedOrders = assignedOrders,
            allOrders = allOrders,
            allRiders = allRiders,
            settlements = settlements,
            payouts = payouts,
            ratings = emptyList(),
            feedbacks = emptyMap(),
            adminSettings = adminSettings
        )
    }

    private fun parseRiderData(uid: String, obj: JSONObject): RiderData {
        val routeList = mutableListOf<RoutePoint>()
        val rawRoute = obj.opt("recentRoute")
        if (rawRoute is JSONArray) {
            for (i in 0 until rawRoute.length()) {
                val pt = rawRoute.optJSONObject(i)
                if (pt != null) {
                    routeList.add(
                        RoutePoint(
                            lat = pt.optDouble("lat", 26.4524),
                            lng = pt.optDouble("lng", 89.9723),
                            time = pt.optLong("time", 0L)
                        )
                    )
                }
            }
        }
        val shiftObj = obj.optJSONObject("preferredShift")
        val shift = if (shiftObj != null) {
            PreferredShiftHours(
                enabled = shiftObj.optBoolean("enabled", false),
                startTime = shiftObj.optString("startTime", "08:00"),
                endTime = shiftObj.optString("endTime", "20:00")
            )
        } else {
            PreferredShiftHours(enabled = false)
        }

        return RiderData(
            uid = uid,
            name = obj.optString("name", "Rider"),
            email = obj.optString("email", ""),
            phone = obj.optString("phone", ""),
            upiId = obj.optString("upiId", ""),
            vehicle = obj.optString("vehicle", ""),
            approved = obj.optBoolean("approved", true),
            online = obj.optBoolean("online", false),
            suspended = obj.optBoolean("suspended", false),
            lat = obj.optDouble("lat", 26.4524),
            lng = obj.optDouble("lng", 89.9723),
            lastSeen = obj.optLong("lastSeen", System.currentTimeMillis()),
            recentRoute = routeList,
            ratingAvg = obj.optDouble("ratingAvg", 5.0),
            ratingCount = obj.optInt("ratingCount", 0),
            preferredShift = shift
        )
    }

    private fun parseOrderRecord(orderId: String, o: JSONObject): OrderRecord {
        val itemsList = mutableListOf<OrderItem>()
        val rawItems = o.opt("items")
        if (rawItems is JSONArray) {
            for (i in 0 until rawItems.length()) {
                val itObj = rawItems.optJSONObject(i)
                if (itObj != null) {
                    itemsList.add(
                        OrderItem(
                            name = itObj.optString("name", "Item"),
                            qty = itObj.optInt("qty", 1),
                            price = itObj.optDouble("price", 0.0)
                        )
                    )
                }
            }
        } else if (rawItems is JSONObject) {
            rawItems.keys().forEach { k ->
                val itObj = rawItems.optJSONObject(k)
                if (itObj != null) {
                    itemsList.add(
                        OrderItem(
                            name = itObj.optString("name", "Item"),
                            qty = itObj.optInt("qty", 1),
                            price = itObj.optDouble("price", 0.0)
                        )
                    )
                }
            }
        }

        val cLat = o.optDouble("customerLat", Double.NaN).takeIf { !it.isNaN() }
        val cLng = o.optDouble("customerLng", Double.NaN).takeIf { !it.isNaN() }
        val explicitDist = o.optDouble("distanceKm", Double.NaN).takeIf { !it.isNaN() && it > 0.0 }
        val explicitEarned = o.optDouble("riderEarnedFee", Double.NaN).takeIf { !it.isNaN() && it > 0.0 }

        return OrderRecord(
            orderId = orderId,
            batchGroupId = o.optString("batchGroupId", ""),
            customerUid = o.optString("customerUid", ""),
            deliveryUid = o.optString("deliveryUid", "").takeIf { it.isNotBlank() },
            restaurantId = o.optString("restaurantId", ""),
            phone = o.optString("phone", ""),
            address = o.optString("address", "Gossaigaon"),
            customerLat = cLat,
            customerLng = cLng,
            locationLink = o.optString("locationLink", ""),
            deliveryOtp = o.optString("deliveryOtp", ""),
            pickupOtp = o.optString("pickupOtp", ""),
            paymentMode = o.optString("paymentMode", "COD"),
            paymentStatus = o.optString("paymentStatus", "COD"),
            status = o.optString("status", "READY_FOR_PICKUP"),
            totalAmount = o.optDouble("totalAmount", 0.0),
            deliveryCharge = o.optDouble("deliveryCharge", 0.0),
            distanceKm = explicitDist,
            riderEarnedFee = explicitEarned,
            items = itemsList,
            riderAccepted = if (o.has("riderAccepted") && !o.isNull("riderAccepted")) o.optBoolean("riderAccepted") else null,
            assignedAt = o.optLong("assignedAt", o.optLong("createdAt", System.currentTimeMillis())),
            createdAt = o.optLong("createdAt", System.currentTimeMillis()),
            updatedAt = o.optLong("updatedAt", System.currentTimeMillis())
        )
    }

    private fun getRtdbJsonObject(path: String, idToken: String): JSONObject? {
        return try {
            val authQuery = if (idToken.isNotBlank()) "?auth=$idToken" else ""
            val url = URL("$RTDB_BASE_URL/$path.json$authQuery")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 6000
                readTimeout = 6000
            }
            if (conn.responseCode in 200..299) {
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                if (body.isNotBlank() && body != "null" && body.trim().startsWith("{")) {
                    JSONObject(body)
                } else null
            } else null
        } catch (_: Exception) {
            null
        }
    }

    suspend fun putRtdbJson(path: String, idToken: String, json: JSONObject): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val authQuery = if (idToken.isNotBlank()) "?auth=$idToken" else ""
                val url = URL("$RTDB_BASE_URL/$path.json$authQuery")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "PUT"
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    connectTimeout = 6000
                    readTimeout = 6000
                }
                OutputStreamWriter(conn.outputStream).use { it.write(json.toString()) }
                conn.responseCode in 200..299
            } catch (_: Exception) {
                false
            }
        }

    suspend fun patchRtdbJson(path: String, idToken: String, json: JSONObject): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val authQuery = if (idToken.isNotBlank()) "?auth=$idToken" else ""
                val url = URL("$RTDB_BASE_URL/$path.json$authQuery")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "PATCH"
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    connectTimeout = 6000
                    readTimeout = 6000
                }
                OutputStreamWriter(conn.outputStream).use { it.write(json.toString()) }
                conn.responseCode in 200..299
            } catch (_: Exception) {
                false
            }
        }

    suspend fun fetchTripChatMessages(
        tripId: String,
        idToken: String,
        orderIds: List<String> = emptyList()
    ): List<InAppChatMessage> = withContext(Dispatchers.IO) {
        val keysToCheck = (listOf(tripId) + orderIds).map { it.replace(Regex("[.#$\\[\\]/]"), "_") }.distinct()
        val byId = linkedMapOf<String, InAppChatMessage>()
        keysToCheck.forEach { safeKey ->
            val obj = getRtdbJsonObject("tripChats/$safeKey/messages", idToken)
            obj?.keys()?.forEach { key ->
                val m = obj.optJSONObject(key)
                if (m != null) {
                    byId[key] = InAppChatMessage(
                        id = key,
                        tripId = tripId,
                        senderRole = m.optString("senderRole", "RIDER"),
                        senderName = m.optString("senderName", "Rider"),
                        text = m.optString("text", ""),
                        timestamp = m.optLong("timestamp", 0L),
                        status = m.optString("status", "DELIVERED")
                    )
                }
            }
        }
        byId.values.sortedBy { it.timestamp }
    }

    suspend fun sendTripChatMessage(
        tripId: String,
        idToken: String,
        message: InAppChatMessage,
        orderIds: List<String> = emptyList()
    ): Boolean = withContext(Dispatchers.IO) {
        val safeTrip = tripId.replace(Regex("[.#$\\[\\]/]"), "_")
        val json = JSONObject().apply {
            put("id", message.id)
            put("tripId", tripId)
            put("senderRole", message.senderRole)
            put("senderName", message.senderName)
            put("text", message.text)
            put("timestamp", message.timestamp)
            put("status", message.status)
        }
        val ok = putRtdbJson("tripChats/$safeTrip/messages/${message.id}", idToken, json)
        orderIds.forEach { oid ->
            val safeOid = oid.replace(Regex("[.#$\\[\\]/]"), "_")
            if (safeOid.isNotBlank() && safeOid != safeTrip) {
                putRtdbJson("tripChats/$safeOid/messages/${message.id}", idToken, json)
            }
        }
        ok
    }

    data class RemoteCallSignalingSnapshot(
        val callId: String,
        val tripId: String,
        val callerRole: String,
        val customerUid: String,
        val customerLabel: String,
        val dropAddress: String,
        val status: String,
        val customerAnswered: Boolean,
        val isOnHold: Boolean,
        val updatedAt: Long
    )

    suspend fun syncInAppCallSignaling(
        callSession: InAppCallSession,
        riderUid: String,
        riderName: String,
        idToken: String,
        orderIds: List<String> = emptyList()
    ): Boolean = withContext(Dispatchers.IO) {
        val safeTrip = callSession.tripId.replace(Regex("[.#$\\[\\]/]"), "_")
        val now = System.currentTimeMillis()
        val json = JSONObject().apply {
            put("callId", callSession.callId)
            put("tripId", callSession.tripId)
            put("orderId", orderIds.firstOrNull() ?: callSession.tripId)
            put("callerRole", callSession.callerRole)
            put("riderUid", riderUid)
            put("riderName", riderName)
            put("customerUid", callSession.customerUid)
            put("customerLabel", callSession.customerLabel)
            put("dropAddress", callSession.dropAddress)
            put("status", callSession.status.name)
            put("customerAnswered", callSession.status == InAppCallStatus.CONNECTED)
            put("isMuted", callSession.isMuted)
            put("isOnHold", callSession.isOnHold)
            put("startedAt", callSession.startedAt)
            put("updatedAt", now)
        }
        val ok = patchRtdbJson("inAppCalls/$safeTrip", idToken, json)
        orderIds.forEach { oid ->
            val safeOid = oid.replace(Regex("[.#$\\[\\]/]"), "_")
            if (safeOid.isNotBlank() && safeOid != safeTrip) {
                patchRtdbJson("inAppCalls/$safeOid", idToken, json)
            }
        }
        if (callSession.customerUid.isNotBlank()) {
            val safeCust = callSession.customerUid.replace(Regex("[.#$\\[\\]/]"), "_")
            patchRtdbJson("customerCallInbox/$safeCust", idToken, json)
        }
        if (riderUid.isNotBlank()) {
            val safeRider = riderUid.replace(Regex("[.#$\\[\\]/]"), "_")
            patchRtdbJson("riderCallInbox/$safeRider", idToken, json)
        }
        ok
    }

    suspend fun fetchInAppCallState(
        tripId: String,
        idToken: String,
        orderIds: List<String> = emptyList()
    ): RemoteCallSignalingSnapshot? = withContext(Dispatchers.IO) {
        val keys = (listOf(tripId) + orderIds).map { it.replace(Regex("[.#$\\[\\]/]"), "_") }.distinct()
        var best: RemoteCallSignalingSnapshot? = null
        keys.forEach { safeKey ->
            val obj = getRtdbJsonObject("inAppCalls/$safeKey", idToken)
            if (obj != null) {
                val callId = obj.optString("callId", "")
                if (callId.isNotBlank()) {
                    val snap = RemoteCallSignalingSnapshot(
                        callId = callId,
                        tripId = obj.optString("tripId", tripId),
                        callerRole = obj.optString("callerRole", "RIDER"),
                        customerUid = obj.optString("customerUid", ""),
                        customerLabel = obj.optString("customerLabel", "Customer"),
                        dropAddress = obj.optString("dropAddress", "Gossaigaon"),
                        status = obj.optString("status", "RINGING"),
                        customerAnswered = obj.optBoolean("customerAnswered", false) ||
                            obj.optString("status", "") in setOf("CONNECTED", "ACCEPTED", "IN_CALL"),
                        isOnHold = obj.optBoolean("isOnHold", false),
                        updatedAt = obj.optLong("updatedAt", 0L)
                    )
                    if (best == null || snap.updatedAt >= (best?.updatedAt ?: 0L)) {
                        best = snap
                    }
                }
            }
        }
        best
    }

    suspend fun fetchIncomingRiderCall(
        riderUid: String,
        idToken: String
    ): RemoteCallSignalingSnapshot? = withContext(Dispatchers.IO) {
        if (riderUid.isBlank()) return@withContext null
        val safeRider = riderUid.replace(Regex("[.#$\\[\\]/]"), "_")
        val obj = getRtdbJsonObject("riderCallInbox/$safeRider", idToken) ?: return@withContext null
        val callId = obj.optString("callId", "")
        val status = obj.optString("status", "")
        val callerRole = obj.optString("callerRole", "")
        if (callId.isBlank() || callerRole != "CUSTOMER" || status != "RINGING") return@withContext null
        val updatedAt = obj.optLong("updatedAt", 0L)
        if (System.currentTimeMillis() - updatedAt > 45_000L) return@withContext null
        RemoteCallSignalingSnapshot(
            callId = callId,
            tripId = obj.optString("tripId", obj.optString("orderId", "")),
            callerRole = callerRole,
            customerUid = obj.optString("customerUid", ""),
            customerLabel = obj.optString("customerLabel", "Customer"),
            dropAddress = obj.optString("dropAddress", "Gossaigaon"),
            status = status,
            customerAnswered = false,
            isOnHold = false,
            updatedAt = updatedAt
        )
    }

    suspend fun pushVoiceAudioPacket(
        tripId: String,
        senderRole: String,
        pcmBase64: String,
        seq: Long,
        idToken: String
    ): Boolean = withContext(Dispatchers.IO) {
        val safeTrip = tripId.replace(Regex("[.#$\\[\\]/]"), "_")
        val roleKey = senderRole.lowercase()
        val payload = JSONObject().apply {
            put("seq", seq)
            put("pcm", pcmBase64)
            put("ts", System.currentTimeMillis())
        }
        putRtdbJson("inAppCalls/$safeTrip/audioStream/$roleKey", idToken, payload)
    }

    suspend fun pullVoiceAudioPacket(
        tripId: String,
        remoteRole: String,
        idToken: String
    ): Pair<Long, String>? = withContext(Dispatchers.IO) {
        val safeTrip = tripId.replace(Regex("[.#$\\[\\]/]"), "_")
        val roleKey = remoteRole.lowercase()
        val obj = getRtdbJsonObject("inAppCalls/$safeTrip/audioStream/$roleKey", idToken) ?: return@withContext null
        val seq = obj.optLong("seq", -1L)
        val pcm = obj.optString("pcm", "")
        if (seq >= 0L && pcm.isNotBlank()) seq to pcm else null
    }

    private fun postJson(endpoint: String, payload: JSONObject): ApiResult<JSONObject> {
        return try {
            val url = URL(endpoint)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                connectTimeout = 8000
                readTimeout = 8000
            }
            OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code in 200..299) {
                ApiResult.Success(if (text.isNotBlank()) JSONObject(text) else JSONObject())
            } else {
                val errCode = runCatching {
                    JSONObject(text).optJSONObject("error")?.optString("message").orEmpty()
                }.getOrDefault("")
                ApiResult.Error(mapFriendlyAuthError(errCode), errCode)
            }
        } catch (_: Exception) {
            ApiResult.Error("Network error: please check your internet connection and try again.")
        }
    }

    private fun mapFriendlyAuthError(rawCode: String): String {
        return when {
            rawCode.contains("INVALID_LOGIN_CREDENTIALS") ||
                rawCode.contains("INVALID_PASSWORD") ||
                rawCode.contains("EMAIL_NOT_FOUND") ->
                "Invalid email or password. Please check your credentials."
            rawCode.contains("EMAIL_EXISTS") ->
                "This email is already registered. Please Sign In instead."
            rawCode.contains("TOO_MANY_ATTEMPTS") ->
                "Too many attempts detected. Please wait a minute before retrying."
            rawCode.contains("USER_DISABLED") ->
                "This rider account has been suspended by Gossaigaon Fleet Admin."
            rawCode.contains("INVALID_EMAIL") ->
                "Please enter a valid email address."
            else -> "Authentication failed. Please verify your credentials and internet connection."
        }
    }
}
