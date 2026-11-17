package com.example

import com.example.domain.RiderDomainLogic
import com.example.model.BatteryStatusSnapshot
import com.example.model.OrderRecord
import com.example.model.SettlementRecord
import com.example.model.TripGroup
import org.junit.Assert.*
import org.junit.Test

class RiderDomainLogicTest {

    @Test
    fun `validateSettlementUtr blocks sequential and duplicate UTRs`() {
        val existing = mapOf(
            "s1" to SettlementRecord(id = "s1", utr = "412895631478", amount = 200.0)
        )
        val (seqValid, _) = RiderDomainLogic.validateSettlementUtr("123456789012", existing)
        assertFalse(seqValid)

        val (dupValid, _) = RiderDomainLogic.validateSettlementUtr("412895631478", existing)
        assertFalse(dupValid)

        val (goodValid, _) = RiderDomainLogic.validateSettlementUtr("839204716529", existing)
        assertTrue(goodValid)
    }

    @Test
    fun `validateDeliveryQrPayload blocks UPI scam codes and validates genuine QR`() {
        val trip = TripGroup(
            tripId = "trip_live_902",
            deliveryOtp = "6412",
            orders = listOf(OrderRecord(orderId = "ord_1", deliveryOtp = "6412"))
        )

        val scamCheck = RiderDomainLogic.validateDeliveryQrPayload("upi://pay?pa=scammer@ybl&am=500", trip)
        assertFalse(scamCheck.valid)

        val genuinePayload = RiderDomainLogic.buildDeliveryQrPayload(trip.tripId, trip.deliveryOtp)
        val genuineCheck = RiderDomainLogic.validateDeliveryQrPayload(genuinePayload, trip)
        assertTrue(genuineCheck.valid)
        assertEquals("6412", genuineCheck.matchedOtp)
    }

    @Test
    fun `evaluateBatteryGpsPolicy adapts interval to battery level`() {
        val high = RiderDomainLogic.evaluateBatteryGpsPolicy(
            BatteryStatusSnapshot(true, 85, false),
            hasActiveDelivery = true,
            autoGpsEnabled = true
        )
        assertEquals(5000L, high.intervalMs)

        val saver = RiderDomainLogic.evaluateBatteryGpsPolicy(
            BatteryStatusSnapshot(true, 18, false),
            hasActiveDelivery = true,
            autoGpsEnabled = true
        )
        assertEquals(15000L, saver.intervalMs)
    }
}
