import type {
  AdminSettings,
  FeedbackRecord,
  OrderItem,
  OrderRecord,
  OrderWithId,
  PreferredShiftHours,
  RiderData,
  RiderPayoutRecord,
  RiderRating,
  SettlementRecord,
  StoreInfo,
  TripGroup,
} from '../types/rider';
import {
  analyzeQrSecurityThreat,
  hasSequentialDigitPattern,
  sanitizeInput,
  verifyUpiSecurity,
} from './security';

export function sanitizeText(str: unknown): string {
  return sanitizeInput(str, 240);
}

export function isValidIndianMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(String(phone || '').replace(/\D/g, '').slice(-10));
}

export function isValidUpiId(upi: string): boolean {
  return verifyUpiSecurity(upi).valid;
}

export function formatWhatsAppUrl(rawPhone: string): string {
  const c = String(rawPhone || '').replace(/\D/g, '');
  return c ? (c.length === 10 ? '91' + c : c) : '';
}

export function calculateDistanceKm(
  lat1: unknown,
  lon1: unknown,
  lat2: unknown,
  lon2: unknown,
): number | null {
  const aLat = Number(lat1);
  const aLon = Number(lon1);
  const bLat = Number(lat2);
  const bLon = Number(lon2);
  if (
    lat1 === null ||
    lat1 === undefined ||
    lon1 === null ||
    lon1 === undefined ||
    lat2 === null ||
    lat2 === undefined ||
    lon2 === null ||
    lon2 === undefined ||
    lat1 === '' ||
    lon1 === '' ||
    lat2 === '' ||
    lon2 === '' ||
    !Number.isFinite(aLat) ||
    !Number.isFinite(aLon) ||
    !Number.isFinite(bLat) ||
    !Number.isFinite(bLon)
  ) {
    return null;
  }
  const R = 6371;
  const dLat = (bLat - aLat) * (Math.PI / 180);
  const dLon = (bLon - aLon) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * (Math.PI / 180)) *
      Math.cos(bLat * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function getStorePickupCode(order: OrderRecord | null | undefined, orderId: string): string {
  if (order && order.pickupOtp) return String(order.pickupOtp);
  const cleanId = String(orderId || '');
  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) {
    hash = (hash << 5) - hash + cleanId.charCodeAt(i);
    hash |= 0;
  }
  return String((Math.abs(hash) % 9000) + 1000);
}

export function validateSettlementUtr(
  utr: string,
  allSettlements: Record<string, SettlementRecord>,
): {valid: boolean; reason?: string} {
  const cleanUtr = String(utr || '').replace(/\s+/g, '').trim();
  if (!/^\d{12}$/.test(cleanUtr)) {
    return {valid: false, reason: 'UTR number exact 12 digits ka hona chahiye!'};
  }
  if (
    /^(\d)\1{11}$/.test(cleanUtr) ||
    cleanUtr === '123456789012' ||
    cleanUtr.startsWith('0000') ||
    hasSequentialDigitPattern(cleanUtr)
  ) {
    return {valid: false, reason: '🚨 Fake or sequential UTR pattern blocked by Scam Shield!'};
  }
  if (
    Object.values(allSettlements || {}).some(
      (s) => String(s.utr || '').replace(/\s+/g, '').trim() === cleanUtr,
    )
  ) {
    return {valid: false, reason: '🚨 Yeh UTR pehle se use ho chuka hai!'};
  }
  return {valid: true};
}

export function getRiderFeeForOrder(order: OrderRecord | null | undefined, baseRiderFeePerTrip: number): number {
  return order && order.deliveryCharge !== undefined && Number(order.deliveryCharge) > 0
    ? Number(order.deliveryCharge)
    : baseRiderFeePerTrip;
}

export function normalizeOrderItems(items: OrderRecord['items']): OrderItem[] {
  if (!items) return [];
  return Array.isArray(items) ? items : Object.values(items);
}

export function isTripPickedUp(trip: TripGroup | null | undefined): boolean {
  return Boolean(
    trip &&
      Array.isArray(trip.orders) &&
      trip.orders.some(
        (o) =>
          ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(o.status || '') ||
          Boolean(o.storePickupVerifiedAt),
      ),
  );
}

export function getTripsGrouped(assignedOrders: Record<string, OrderRecord>): {
  activeTrips: TripGroup[];
  completedTrips: TripGroup[];
} {
  const activeTripsMap: Record<string, TripGroup> = {};
  const completedTripsMap: Record<string, TripGroup> = {};

  Object.entries(assignedOrders || {}).forEach(([orderId, o]) => {
    const isCompleted = o.status === 'DELIVERED' || o.status === 'CANCELLED';
    const groupKey = o.batchGroupId || `${o.customerUid || 'cust'}_${o.deliveryOtp || o.createdAt || orderId}`;
    const targetMap = isCompleted ? completedTripsMap : activeTripsMap;

    if (!targetMap[groupKey]) {
      targetMap[groupKey] = {
        tripId: groupKey,
        customerUid: o.customerUid,
        customerName: o.customerName || o.customerLabel,
        customerPhoto: o.customerPhoto,
        phone: o.phone || '',
        address: o.address || 'Gossaigaon',
        customerLat: o.customerLat ?? null,
        customerLng: o.customerLng ?? null,
        locationLink: o.locationLink || '',
        deliveryOtp: o.deliveryOtp || '',
        paymentMode: o.paymentMode || 'COD',
        paymentStatus: o.paymentStatus || 'COD',
        emergencyAlert: Boolean(o.emergencyAlert),
        emergencyDetails: o.emergencyDetails || '',
        assignedAt: o.assignedAt || o.createdAt || Date.now(),
        orders: [],
      };
    }

    targetMap[groupKey].orders.push({orderId, ...o});
  });

  return {
    activeTrips: Object.values(activeTripsMap),
    completedTrips: Object.values(completedTripsMap),
  };
}

export interface SortedStoreStop {
  order: OrderWithId;
  store: StoreInfo;
  distance: number;
  isPickedUp: boolean;
}

export function sortStoreStops(
  orders: OrderWithId[],
  stores: Record<string, StoreInfo>,
  riderCurrentLat: number,
  riderCurrentLng: number,
): SortedStoreStop[] {
  return orders
    .map((o) => {
      const st = stores[o.restaurantId || ''] || {};
      const d =
        riderCurrentLat && st.lat !== undefined && st.lng !== undefined
          ? calculateDistanceKm(riderCurrentLat, riderCurrentLng, st.lat, st.lng)
          : 999;
      return {
        order: o,
        store: st,
        distance: d !== null ? d : 999,
        isPickedUp: o.status === 'PICKED_UP' || o.status === 'OUT_FOR_DELIVERY',
      };
    })
    .sort((a, b) => (a.isPickedUp !== b.isPickedUp ? (a.isPickedUp ? 1 : -1) : a.distance - b.distance));
}

export interface FinancialSummary {
  totalCodCollected: number;
  totalDeposited: number;
  netCashInHand: number;
  totalRiderEarned: number;
  totalRiderPaidPayout: number;
  availablePayoutBalance: number;
}

export function calculateFinancialSummary(
  assignedOrders: Record<string, OrderRecord>,
  riderSettlements: Record<string, SettlementRecord>,
  myRiderPayouts: Record<string, RiderPayoutRecord>,
  baseRiderFeePerTrip: number,
): FinancialSummary {
  let totalCodCollected = 0;
  let totalRiderEarned = 0;

  Object.values(assignedOrders || {}).forEach((o) => {
    if (o.status === 'DELIVERED') {
      totalRiderEarned += getRiderFeeForOrder(o, baseRiderFeePerTrip);
      if (o.paymentMode !== 'UPI' && o.paymentMode !== 'WALLET') {
        totalCodCollected += Number(o.totalAmount || 0);
      }
    }
  });

  let totalDeposited = 0;
  Object.values(riderSettlements || {}).forEach((s) => {
    if (s.status === 'APPROVED') {
      totalDeposited += Number(s.amount || 0);
    }
  });

  const netCashInHand = Math.max(0, totalCodCollected - totalDeposited);

  let totalRiderPaidPayout = 0;
  Object.values(myRiderPayouts || {}).forEach((p) => {
    if (p.status === 'PAID') {
      totalRiderPaidPayout += Number(p.amount || 0);
    }
  });

  const availablePayoutBalance = Math.max(0, totalRiderEarned - totalRiderPaidPayout);

  return {
    totalCodCollected,
    totalDeposited,
    netCashInHand,
    totalRiderEarned,
    totalRiderPaidPayout,
    availablePayoutBalance,
  };
}

export type BatteryGpsMode = 'HIGH_ACCURACY' | 'POWER_SAVER' | 'CRITICAL_SAVER' | 'MANUAL_PAUSED';

export const AUTO_GPS_STORAGE_KEY = 'gb_auto_gps_enabled_v1';

export function readAutoGpsEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    const raw = localStorage.getItem(AUTO_GPS_STORAGE_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function saveAutoGpsEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(AUTO_GPS_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage errors
  }
}

export interface BatteryStatusSnapshot {
  supported: boolean;
  levelPercent: number | null;
  charging: boolean;
}

export interface GpsTrackingPolicy {
  mode: BatteryGpsMode;
  intervalMs: number;
  enableHighAccuracy: boolean;
  maximumAgeMs: number;
  timeoutMs: number;
  minWatchDispatchMs: number;
  minDistanceMeters: number;
  badgeLabel: string;
  reason: string;
}

export function evaluateBatteryGpsPolicy(
  battery: BatteryStatusSnapshot,
  hasActiveDelivery: boolean,
  autoGpsEnabled = true,
): GpsTrackingPolicy {
  if (!autoGpsEnabled) {
    return {
      mode: 'MANUAL_PAUSED',
      intervalMs: 0,
      enableHighAccuracy: false,
      maximumAgeMs: 0,
      timeoutMs: 4500,
      minWatchDispatchMs: 0,
      minDistanceMeters: 0,
      badgeLabel: 'Manual Only',
      reason:
        'Automatic GPS refresh paused for critical battery preservation. Tap My GPS on Map for a manual fix.',
    };
  }

  const hasKnownLevel =
    battery.supported &&
    battery.levelPercent !== null &&
    Number.isFinite(battery.levelPercent);

  if (!hasKnownLevel || battery.charging || (battery.levelPercent as number) > 25) {
    return {
      mode: 'HIGH_ACCURACY',
      intervalMs: 5000,
      enableHighAccuracy: true,
      maximumAgeMs: 2000,
      timeoutMs: 4500,
      minWatchDispatchMs: 3000,
      minDistanceMeters: 0,
      badgeLabel: '5s High Accuracy',
      reason: battery.charging
        ? 'Device charging — full 5s high-accuracy GPS active.'
        : 'Battery healthy — full 5s high-accuracy GPS active.',
    };
  }

  const pct = Math.max(0, Math.min(100, Math.round(battery.levelPercent as number)));

  if (pct <= 15) {
    return hasActiveDelivery
      ? {
          mode: 'CRITICAL_SAVER',
          intervalMs: 25000,
          enableHighAccuracy: true,
          maximumAgeMs: 15000,
          timeoutMs: 9000,
          minWatchDispatchMs: 20000,
          minDistanceMeters: 30,
          badgeLabel: '25s Safe Saver',
          reason: `Critical battery (${pct}%) — 25s GPS sync keeps active trip safety accuracy.`,
        }
      : {
          mode: 'CRITICAL_SAVER',
          intervalMs: 45000,
          enableHighAccuracy: false,
          maximumAgeMs: 30000,
          timeoutMs: 9000,
          minWatchDispatchMs: 35000,
          minDistanceMeters: 40,
          badgeLabel: '45s Deep Saver',
          reason: `Critical battery (${pct}%) — 45s coarse sync preserves battery until next order.`,
        };
  }

  return hasActiveDelivery
    ? {
        mode: 'POWER_SAVER',
        intervalMs: 15000,
        enableHighAccuracy: true,
        maximumAgeMs: 10000,
        timeoutMs: 7000,
        minWatchDispatchMs: 12000,
        minDistanceMeters: 15,
        badgeLabel: '15s Eco GPS',
        reason: `Low battery (${pct}%) — 15s Eco GPS maintains accurate route tracking.`,
      }
    : {
        mode: 'POWER_SAVER',
        intervalMs: 20000,
        enableHighAccuracy: true,
        maximumAgeMs: 12000,
        timeoutMs: 7000,
        minWatchDispatchMs: 16000,
        minDistanceMeters: 25,
        badgeLabel: '20s Eco GPS',
        reason: `Low battery (${pct}%) — reduced to 20s GPS polling to extend shift battery.`,
      };
}

export function shouldShowPowerBankBanner(battery: BatteryStatusSnapshot): boolean {
  if (!battery.supported || battery.charging) return false;
  if (battery.levelPercent === null || !Number.isFinite(battery.levelPercent)) return false;
  return battery.levelPercent < 15;
}

export function selectNearestEligibleRider(
  allRiders: Record<string, RiderData>,
  currentUid: string,
  tripOrders: OrderWithId[],
  storeLat: number,
  storeLng: number,
): string | null {
  const eligibleRiders = Object.entries(allRiders || {}).filter(
    ([uid, r]) =>
      uid !== currentUid &&
      r.approved === true &&
      r.online === true &&
      r.suspended !== true &&
      !tripOrders.some((o) => o.rejectedByRiders && o.rejectedByRiders[uid]),
  );

  let nextRiderUid: string | null = null;
  let minDistance = Infinity;
  let fallbackUid: string | null = null;

  eligibleRiders.forEach(([uid, rider]) => {
    const rLat = Number(rider.lat);
    const rLng = Number(rider.lng);
    if (Number.isFinite(rLat) && Number.isFinite(rLng) && rLat !== 0 && rLng !== 0) {
      const dist = calculateDistanceKm(storeLat, storeLng, rLat, rLng);
      if (dist !== null && dist < minDistance) {
        minDistance = dist;
        nextRiderUid = uid;
      }
    } else if (!fallbackUid) {
      fallbackUid = uid;
    }
  });

  return nextRiderUid || fallbackUid;
}

export interface PinGuardState {
  fails: number;
  lockedUntil: number;
}

export function evaluatePinAttempt(
  guard: PinGuardState | undefined,
  expectedPin: string,
  enteredPin: string,
  now: number,
): {
  allowed: boolean;
  lockedSecondsRemaining?: number;
  justLocked?: boolean;
  attemptsLeft?: number;
  nextGuard: PinGuardState;
} {
  const current: PinGuardState = guard ? {...guard} : {fails: 0, lockedUntil: 0};

  if (now < current.lockedUntil) {
    return {
      allowed: false,
      lockedSecondsRemaining: Math.ceil((current.lockedUntil - now) / 1000),
      nextGuard: current,
    };
  }

  if (expectedPin && enteredPin !== String(expectedPin)) {
    const nextFails = current.fails + 1;
    if (nextFails >= 3) {
      return {
        allowed: false,
        justLocked: true,
        attemptsLeft: 0,
        nextGuard: {fails: 0, lockedUntil: now + 60000},
      };
    }
    return {
      allowed: false,
      justLocked: false,
      attemptsLeft: 3 - nextFails,
      nextGuard: {fails: nextFails, lockedUntil: current.lockedUntil},
    };
  }

  return {
    allowed: true,
    nextGuard: {fails: 0, lockedUntil: 0},
  };
}

export function calculateChangeReturn(targetAmount: number, tenderedAmount: number): {
  change: number;
  isShort: boolean;
} {
  const diff = tenderedAmount - targetAmount;
  return {
    change: diff,
    isShort: diff < 0,
  };
}

export interface DeliveryQrValidationResult {
  valid: boolean;
  matchedOtp?: string;
  reason?: string;
}

export function buildDeliveryQrPayload(tripId: string, deliveryOtp: string): string {
  return JSON.stringify({
    app: 'gossaigaon-bazar',
    type: 'DELIVERY_VERIFY',
    tripId: String(tripId || '').trim(),
    otp: String(deliveryOtp || '').trim(),
  });
}

export function validateDeliveryQrPayload(
  rawQrText: string,
  trip: {
    tripId: string;
    deliveryOtp?: string;
    orders?: Array<{orderId: string; deliveryOtp?: string}>;
  },
): DeliveryQrValidationResult {
  const raw = String(rawQrText || '').trim();
  if (!raw) {
    return {valid: false, reason: 'Empty or unreadable QR code.'};
  }

  const threat = analyzeQrSecurityThreat(raw);
  if (!threat.safe) {
    return {valid: false, reason: threat.reason || 'Security alert: unsafe QR blocked.'};
  }

  const expectedOtp = String(trip.deliveryOtp || '').trim();
  const orderIds = new Set((trip.orders || []).map((o) => String(o.orderId || '').trim()));

  let scannedTripId = '';
  let scannedOrderId = '';
  let scannedOtp = '';

  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      scannedTripId = String(parsed.tripId ?? parsed.batchGroupId ?? '').trim();
      scannedOrderId = String(parsed.orderId ?? '').trim();
      scannedOtp = String(
        parsed.otp ?? parsed.pin ?? parsed.deliveryOtp ?? parsed.code ?? '',
      ).trim();
    } catch {
      return {valid: false, reason: 'Invalid customer QR payload format.'};
    }
  } else if (/^GBZ-DELIVER:/i.test(raw)) {
    const parts = raw.split(':');
    scannedTripId = String(parts[1] || '').trim();
    scannedOtp = String(parts[2] || '').trim();
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.includes('otp=') || raw.includes('pin=')) {
    try {
      const normalized = raw.includes('://') ? raw : `https://verify.local/?${raw}`;
      const u = new URL(normalized);
      scannedTripId = String(
        u.searchParams.get('tripId') ?? u.searchParams.get('batchGroupId') ?? '',
      ).trim();
      scannedOrderId = String(u.searchParams.get('orderId') ?? '').trim();
      scannedOtp = String(
        u.searchParams.get('otp') ??
          u.searchParams.get('pin') ??
          u.searchParams.get('deliveryOtp') ??
          u.searchParams.get('code') ??
          '',
      ).trim();
    } catch {
      return {valid: false, reason: 'Invalid QR verification link.'};
    }
  } else if (/^\d{4,6}$/.test(raw)) {
    scannedOtp = raw;
  } else {
    return {
      valid: false,
      reason: 'Unrecognized QR code. Ask customer to show the Gossaigaon order delivery QR.',
    };
  }

  if (scannedTripId && scannedTripId !== trip.tripId && !orderIds.has(scannedTripId)) {
    return {valid: false, reason: 'This QR code belongs to a different trip.'};
  }

  if (scannedOrderId && scannedOrderId !== trip.tripId && !orderIds.has(scannedOrderId)) {
    return {valid: false, reason: 'This QR code does not match any order in this trip.'};
  }

  const matchedOrderOtp = scannedOrderId
    ? String(
        (trip.orders || []).find((o) => o.orderId === scannedOrderId)?.deliveryOtp || '',
      ).trim()
    : '';
  const targetOtp = matchedOrderOtp || expectedOtp;

  if (targetOtp) {
    if (!scannedOtp) {
      return {valid: false, reason: 'QR code does not contain a delivery PIN.'};
    }
    if (scannedOtp !== targetOtp) {
      return {valid: false, reason: 'Invalid customer verification QR code.'};
    }
    return {valid: true, matchedOtp: scannedOtp};
  }

  if (scannedTripId === trip.tripId || (scannedOrderId && orderIds.has(scannedOrderId))) {
    return {valid: true, matchedOtp: scannedOtp || undefined};
  }

  return {valid: false, reason: 'Could not match QR code with this trip.'};
}

export interface DailyPerformancePoint {
  dateKey: string;
  label: string;
  fullDate: string;
  earnings: number;
  trips: number;
}

function toLocalDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function calculateLast7DaysPerformance(
  completedTrips: TripGroup[],
  baseRiderFeePerTrip: number,
  nowMs = Date.now(),
): DailyPerformancePoint[] {
  const anchor = new Date(nowMs);
  anchor.setHours(0, 0, 0, 0);

  const buckets: DailyPerformancePoint[] = [];
  const bucketByKey: Record<string, DailyPerformancePoint> = {};

  for (let offset = 6; offset >= 0; offset--) {
    const dayDate = new Date(anchor);
    dayDate.setDate(anchor.getDate() - offset);
    const dateKey = toLocalDateKey(dayDate.getTime());
    const label =
      offset === 0
        ? 'Today'
        : dayDate.toLocaleDateString('en-IN', {weekday: 'short'});
    const fullDate = dayDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });

    const point: DailyPerformancePoint = {
      dateKey,
      label,
      fullDate,
      earnings: 0,
      trips: 0,
    };
    buckets.push(point);
    bucketByKey[dateKey] = point;
  }

  (completedTrips || []).forEach((trip) => {
    const deliveredOrders = (trip.orders || []).filter((o) => o.status === 'DELIVERED');
    if (deliveredOrders.length === 0) return;

    const ts = deliveredOrders.reduce(
      (max, o) => Math.max(max, Number(o.updatedAt || o.createdAt || trip.assignedAt || 0)),
      0,
    );
    if (!ts) return;

    const key = toLocalDateKey(ts);
    const bucket = bucketByKey[key];
    if (!bucket) return;

    bucket.trips += 1;
    bucket.earnings += deliveredOrders.reduce(
      (sum, o) => sum + getRiderFeeForOrder(o, baseRiderFeePerTrip),
      0,
    );
  });

  return buckets;
}

export interface StoreMapMarker {
  storeId: string;
  name: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  distanceKm: number | null;
  isAssignedStop: boolean;
  isPickedUp: boolean;
  mapsUrl: string;
}

export interface CustomerMapMarker {
  tripId: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  distanceKm: number | null;
  allStoresPickedUp: boolean;
  mapsUrl: string;
}

export interface RiderMapData {
  riderLat: number;
  riderLng: number;
  storeMarkers: StoreMapMarker[];
  customerMarkers: CustomerMapMarker[];
  routePoints: Array<[number, number]>;
  boundsPoints: Array<[number, number]>;
}

export function buildRiderMapPoints(
  riderLat: number,
  riderLng: number,
  stores: Record<string, StoreInfo>,
  activeTrips: TripGroup[],
): RiderMapData {
  const validRiderLat = Number.isFinite(Number(riderLat)) ? Number(riderLat) : 26.4524;
  const validRiderLng = Number.isFinite(Number(riderLng)) ? Number(riderLng) : 89.9723;

  const assignedStoreStatus: Record<string, {assigned: boolean; pickedUp: boolean}> = {};
  const customerMarkers: CustomerMapMarker[] = [];

  (activeTrips || []).forEach((trip) => {
    const tripOrders = trip.orders || [];
    let allPicked = tripOrders.length > 0;

    tripOrders.forEach((o) => {
      const storeId = o.restaurantId || '';
      const isPicked = o.status === 'PICKED_UP' || o.status === 'OUT_FOR_DELIVERY';
      if (!isPicked) allPicked = false;

      if (storeId) {
        if (!assignedStoreStatus[storeId]) {
          assignedStoreStatus[storeId] = {assigned: true, pickedUp: isPicked};
        } else {
          assignedStoreStatus[storeId].pickedUp =
            assignedStoreStatus[storeId].pickedUp && isPicked;
        }
      }
    });

    const cLat = Number(trip.customerLat);
    const cLng = Number(trip.customerLng);
    if (
      trip.customerLat !== null &&
      trip.customerLat !== undefined &&
      trip.customerLng !== null &&
      trip.customerLng !== undefined &&
      Number.isFinite(cLat) &&
      Number.isFinite(cLng) &&
      cLat !== 0 &&
      cLng !== 0
    ) {
      const dist = calculateDistanceKm(validRiderLat, validRiderLng, cLat, cLng);
      customerMarkers.push({
        tripId: trip.tripId,
        address: trip.address || 'Customer Location',
        phone: trip.phone || '',
        lat: cLat,
        lng: cLng,
        distanceKm: dist,
        allStoresPickedUp: allPicked,
        mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${cLat},${cLng}`,
      });
    }
  });

  const storeMarkers: StoreMapMarker[] = [];
  Object.entries(stores || {}).forEach(([storeId, st]) => {
    const sLat = Number(st.lat);
    const sLng = Number(st.lng);
    if (!Number.isFinite(sLat) || !Number.isFinite(sLng) || sLat === 0 || sLng === 0) return;

    const status = assignedStoreStatus[storeId];
    const dist = calculateDistanceKm(validRiderLat, validRiderLng, sLat, sLng);
    storeMarkers.push({
      storeId,
      name: st.name || 'Store',
      address: st.address || 'Gossaigaon Bazar',
      phone: st.phone || '',
      lat: sLat,
      lng: sLng,
      distanceKm: dist,
      isAssignedStop: Boolean(status?.assigned),
      isPickedUp: Boolean(status?.pickedUp),
      mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${sLat},${sLng}`,
    });
  });

  storeMarkers.sort((a, b) => {
    if (a.isAssignedStop !== b.isAssignedStop) return a.isAssignedStop ? -1 : 1;
    if (a.isAssignedStop && b.isAssignedStop && a.isPickedUp !== b.isPickedUp) {
      return a.isPickedUp ? 1 : -1;
    }
    return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
  });

  const routePoints: Array<[number, number]> = [[validRiderLat, validRiderLng]];
  storeMarkers
    .filter((s) => s.isAssignedStop && !s.isPickedUp)
    .forEach((s) => routePoints.push([s.lat, s.lng]));
  customerMarkers.forEach((c) => routePoints.push([c.lat, c.lng]));

  const boundsPoints: Array<[number, number]> = [
    [validRiderLat, validRiderLng],
    ...storeMarkers.map((s) => [s.lat, s.lng] as [number, number]),
    ...customerMarkers.map((c) => [c.lat, c.lng] as [number, number]),
  ];

  return {
    riderLat: validRiderLat,
    riderLng: validRiderLng,
    storeMarkers,
    customerMarkers,
    routePoints: routePoints.length > 1 ? routePoints : [],
    boundsPoints,
  };
}

export interface HistoryOrderBreakdown {
  orderId: string;
  storeName: string;
  earning: number;
  billAmount: number;
  itemCount: number;
}

export interface DeliveredHistoryEntry {
  tripId: string;
  shortId: string;
  deliveredAt: number;
  dateLabel: string;
  storeNames: string[];
  customerLocation: string;
  paymentMode: string;
  totalEarnings: number;
  totalBillAmount: number;
  orderBreakdowns: HistoryOrderBreakdown[];
}

export function buildDeliveredHistoryEntries(
  completedTrips: TripGroup[],
  stores: Record<string, StoreInfo>,
  baseRiderFeePerTrip: number,
): DeliveredHistoryEntry[] {
  const entries: DeliveredHistoryEntry[] = [];

  (completedTrips || []).forEach((trip) => {
    const deliveredOrders = (trip.orders || []).filter((o) => o.status === 'DELIVERED');
    if (deliveredOrders.length === 0) return;

    const deliveredAt = deliveredOrders.reduce(
      (max, o) => Math.max(max, Number(o.updatedAt || o.createdAt || trip.assignedAt || 0)),
      0,
    );

    const storeNameSet = new Set<string>();
    const orderBreakdowns: HistoryOrderBreakdown[] = [];
    let totalEarnings = 0;
    let totalBillAmount = 0;

    deliveredOrders.forEach((o) => {
      const storeName = stores[o.restaurantId || '']?.name || 'Store';
      storeNameSet.add(storeName);
      const earning = getRiderFeeForOrder(o, baseRiderFeePerTrip);
      const billAmount = Number(o.totalAmount || 0);
      const itemCount = normalizeOrderItems(o.items).reduce((s, i) => s + Number(i.qty || 1), 0);

      totalEarnings += earning;
      totalBillAmount += billAmount;
      orderBreakdowns.push({
        orderId: o.orderId,
        storeName,
        earning,
        billAmount,
        itemCount,
      });
    });

    const dateLabel = deliveredAt
      ? new Date(deliveredAt).toLocaleString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'Recent';

    entries.push({
      tripId: trip.tripId,
      shortId: `#${trip.tripId.slice(-6)}`,
      deliveredAt,
      dateLabel,
      storeNames: Array.from(storeNameSet),
      customerLocation: trip.address || 'Gossaigaon',
      paymentMode: trip.paymentMode || 'COD',
      totalEarnings,
      totalBillAmount,
      orderBreakdowns,
    });
  });

  entries.sort((a, b) => b.deliveredAt - a.deliveredAt);
  return entries;
}

export interface OptimalSequenceStop {
  stepNumber: number;
  type: 'PICKUP' | 'DROPOFF';
  title: string;
  subtitle: string;
  orderIds: string[];
  lat: number | null;
  lng: number | null;
  legDistanceKm: number | null;
  cumulativeDistanceKm: number;
  isCompleted: boolean;
  isCurrent: boolean;
}

export interface OptimalTripSequence {
  isMultiOrder: boolean;
  steps: OptimalSequenceStop[];
  orderedPickupOrderIds: string[];
  totalRemainingDistanceKm: number;
  naiveRemainingDistanceKm: number;
  distanceSavedKm: number;
}

function isValidCoord(lat: unknown, lng: unknown): boolean {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return (
    lat !== null &&
    lat !== undefined &&
    lng !== null &&
    lng !== undefined &&
    lat !== '' &&
    lng !== '' &&
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    nLat !== 0 &&
    nLng !== 0
  );
}

export function calculateOptimalDeliverySequence(
  trip: TripGroup,
  stores: Record<string, StoreInfo>,
  riderLat: number,
  riderLng: number,
): OptimalTripSequence {
  const orders = Array.isArray(trip?.orders) ? trip.orders : [];
  const startLat = isValidCoord(riderLat, riderLng) ? Number(riderLat) : 26.4524;
  const startLng = isValidCoord(riderLat, riderLng) ? Number(riderLng) : 89.9723;

  const isOrderPickedUp = (o: OrderWithId) =>
    o.status === 'PICKED_UP' || o.status === 'OUT_FOR_DELIVERY' || o.status === 'DELIVERED';

  const completedPickups = orders.filter((o) => isOrderPickedUp(o));
  const pendingPickups = orders.filter((o) => !isOrderPickedUp(o) && o.status !== 'CANCELLED');

  // Build unique drop-off stops from active orders (handles both same-customer combo and multi-drop)
  interface DropoffCandidate {
    key: string;
    address: string;
    lat: number | null;
    lng: number | null;
    orderIds: string[];
    storeNames: string[];
  }
  const dropoffMap = new Map<string, DropoffCandidate>();
  orders
    .filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED')
    .forEach((o) => {
      const latRaw = o.customerLat ?? trip.customerLat;
      const lngRaw = o.customerLng ?? trip.customerLng;
      const hasCoords = isValidCoord(latRaw, lngRaw);
      const lat = hasCoords ? Number(latRaw) : null;
      const lng = hasCoords ? Number(lngRaw) : null;
      const address = o.address || trip.address || 'Customer Location';
      const key =
        lat !== null && lng !== null
          ? `${lat.toFixed(5)},${lng.toFixed(5)}`
          : `addr:${address.trim().toLowerCase()}`;
      const storeName = stores[o.restaurantId || '']?.name || 'Store';
      const existing = dropoffMap.get(key);
      if (existing) {
        existing.orderIds.push(o.orderId);
        if (!existing.storeNames.includes(storeName)) {
          existing.storeNames.push(storeName);
        }
      } else {
        dropoffMap.set(key, {
          key,
          address,
          lat,
          lng,
          orderIds: [o.orderId],
          storeNames: [storeName],
        });
      }
    });
  const dropoffCandidates = Array.from(dropoffMap.values());

  // Compute naive distance in original order for savings comparison
  let naiveLat = startLat;
  let naiveLng = startLng;
  let naiveKm = 0;
  pendingPickups.forEach((o) => {
    const st = stores[o.restaurantId || ''] || {};
    if (isValidCoord(st.lat, st.lng)) {
      const d = calculateDistanceKm(naiveLat, naiveLng, st.lat, st.lng);
      if (d !== null) naiveKm += d;
      naiveLat = Number(st.lat);
      naiveLng = Number(st.lng);
    }
  });
  dropoffCandidates.forEach((cand) => {
    if (cand.lat !== null && cand.lng !== null) {
      const d = calculateDistanceKm(naiveLat, naiveLng, cand.lat, cand.lng);
      if (d !== null) naiveKm += d;
      naiveLat = cand.lat;
      naiveLng = cand.lng;
    }
  });

  // Greedy nearest-neighbor route construction
  const steps: OptimalSequenceStop[] = [];
  const orderedPickupOrderIds: string[] = [];

  completedPickups.forEach((o) => {
    const st = stores[o.restaurantId || ''] || {};
    orderedPickupOrderIds.push(o.orderId);
    steps.push({
      stepNumber: steps.length + 1,
      type: 'PICKUP',
      title: st.name || 'Store',
      subtitle: st.address || 'Picked up',
      orderIds: [o.orderId],
      lat: isValidCoord(st.lat, st.lng) ? Number(st.lat) : null,
      lng: isValidCoord(st.lat, st.lng) ? Number(st.lng) : null,
      legDistanceKm: 0,
      cumulativeDistanceKm: 0,
      isCompleted: true,
      isCurrent: false,
    });
  });

  let currLat = startLat;
  let currLng = startLng;
  let cumulativeKm = 0;

  const remainingPickups = [...pendingPickups];
  while (remainingPickups.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remainingPickups.length; i++) {
      const st = stores[remainingPickups[i].restaurantId || ''] || {};
      if (isValidCoord(st.lat, st.lng)) {
        const d = calculateDistanceKm(currLat, currLng, st.lat, st.lng);
        if (d !== null && d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
    }

    const [chosen] = remainingPickups.splice(bestIdx, 1);
    const st = stores[chosen.restaurantId || ''] || {};
    const hasCoords = isValidCoord(st.lat, st.lng);
    const legDist = hasCoords && Number.isFinite(bestDist) ? Number(bestDist.toFixed(2)) : null;
    if (legDist !== null) {
      cumulativeKm += legDist;
      currLat = Number(st.lat);
      currLng = Number(st.lng);
    }

    const items = normalizeOrderItems(chosen.items);
    const itemCount = items.reduce((sum, item) => sum + Number(item.qty || 1), 0);
    orderedPickupOrderIds.push(chosen.orderId);

    steps.push({
      stepNumber: steps.length + 1,
      type: 'PICKUP',
      title: st.name || 'Store',
      subtitle: `${itemCount} ${itemCount === 1 ? 'item' : 'items'} • ${st.address || 'Pickup'}`,
      orderIds: [chosen.orderId],
      lat: hasCoords ? Number(st.lat) : null,
      lng: hasCoords ? Number(st.lng) : null,
      legDistanceKm: legDist,
      cumulativeDistanceKm: Number(cumulativeKm.toFixed(2)),
      isCompleted: false,
      isCurrent: false,
    });
  }

  const remainingDropoffs = [...dropoffCandidates];
  while (remainingDropoffs.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remainingDropoffs.length; i++) {
      const cand = remainingDropoffs[i];
      if (cand.lat !== null && cand.lng !== null) {
        const d = calculateDistanceKm(currLat, currLng, cand.lat, cand.lng);
        if (d !== null && d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
    }

    const [chosen] = remainingDropoffs.splice(bestIdx, 1);
    const legDist =
      chosen.lat !== null && chosen.lng !== null && Number.isFinite(bestDist)
        ? Number(bestDist.toFixed(2))
        : null;
    if (legDist !== null) {
      cumulativeKm += legDist;
      currLat = chosen.lat!;
      currLng = chosen.lng!;
    }

    steps.push({
      stepNumber: steps.length + 1,
      type: 'DROPOFF',
      title: chosen.address,
      subtitle:
        chosen.orderIds.length > 1
          ? `Deliver ${chosen.orderIds.length} orders (${chosen.storeNames.join(' + ')})`
          : `Deliver order from ${chosen.storeNames[0]}`,
      orderIds: chosen.orderIds,
      lat: chosen.lat,
      lng: chosen.lng,
      legDistanceKm: legDist,
      cumulativeDistanceKm: Number(cumulativeKm.toFixed(2)),
      isCompleted: false,
      isCurrent: false,
    });
  }

  const firstPendingIdx = steps.findIndex((s) => !s.isCompleted);
  if (firstPendingIdx !== -1) {
    steps[firstPendingIdx].isCurrent = true;
  }

  const totalRemainingDistanceKm = Number(cumulativeKm.toFixed(2));
  const naiveRemainingDistanceKm = Number(naiveKm.toFixed(2));
  const distanceSavedKm = Math.max(0, Number((naiveKm - cumulativeKm).toFixed(2)));

  return {
    isMultiOrder: orders.length > 1,
    steps,
    orderedPickupOrderIds,
    totalRemainingDistanceKm,
    naiveRemainingDistanceKm,
    distanceSavedKm,
  };
}

export interface HeatmapPoint {
  id: string;
  lat: number;
  lng: number;
  weight: number;
  orderCount: number;
  areaLabel: string;
  totalValue: number;
}

export interface OrderVolumeHeatmapData {
  points: HeatmapPoint[];
  maxOrderCount: number;
  totalOrdersAnalyzed: number;
  topHotspots: HeatmapPoint[];
}

export function buildOrderVolumeHeatmap(
  orders: Record<string, OrderRecord> | OrderRecord[],
  stores: Record<string, StoreInfo> = {},
  clusterRadiusKm = 0.28,
): OrderVolumeHeatmapData {
  const orderList = Array.isArray(orders) ? orders : Object.values(orders || {});

  interface RawOrderPoint {
    lat: number;
    lng: number;
    areaLabel: string;
    totalValue: number;
  }

  const rawPoints: RawOrderPoint[] = [];

  orderList.forEach((o) => {
    if (!o || o.status !== 'DELIVERED') return;

    const store = stores[o.restaurantId || ''] || {};
    let lat: number | null = null;
    let lng: number | null = null;
    let areaLabel = '';

    if (isValidCoord(o.customerLat, o.customerLng)) {
      lat = Number(o.customerLat);
      lng = Number(o.customerLng);
      areaLabel = String(o.address || store.address || store.name || 'Gossaigaon Bazar').trim();
    } else if (isValidCoord(store.lat, store.lng)) {
      lat = Number(store.lat);
      lng = Number(store.lng);
      areaLabel = String(store.address || store.name || o.address || 'Gossaigaon Bazar').trim();
    }

    if (lat === null || lng === null) return;

    // Clean concise area label (first segment before ", Gossaigaon" if multi-part, else full)
    const conciseLabel = areaLabel.replace(/,\s*Gossaigaon(\s*Bazar)?$/i, '').trim() || areaLabel;

    rawPoints.push({
      lat,
      lng,
      areaLabel: conciseLabel,
      totalValue: Number(o.totalAmount || 0),
    });
  });

  if (rawPoints.length === 0) {
    return {
      points: [],
      maxOrderCount: 0,
      totalOrdersAnalyzed: 0,
      topHotspots: [],
    };
  }

  // Greedy spatial clustering within clusterRadiusKm
  interface MutableCluster {
    sumLat: number;
    sumLng: number;
    lat: number;
    lng: number;
    orderCount: number;
    totalValue: number;
    labelCounts: Record<string, number>;
  }

  const clusters: MutableCluster[] = [];

  rawPoints.forEach((pt) => {
    let matched: MutableCluster | null = null;
    let bestDist = Infinity;

    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      const d = calculateDistanceKm(c.lat, c.lng, pt.lat, pt.lng);
      if (d !== null && d <= clusterRadiusKm && d < bestDist) {
        bestDist = d;
        matched = c;
      }
    }

    if (matched) {
      matched.sumLat += pt.lat;
      matched.sumLng += pt.lng;
      matched.orderCount += 1;
      matched.totalValue += pt.totalValue;
      matched.lat = matched.sumLat / matched.orderCount;
      matched.lng = matched.sumLng / matched.orderCount;
      matched.labelCounts[pt.areaLabel] = (matched.labelCounts[pt.areaLabel] || 0) + 1;
    } else {
      clusters.push({
        sumLat: pt.lat,
        sumLng: pt.lng,
        lat: pt.lat,
        lng: pt.lng,
        orderCount: 1,
        totalValue: pt.totalValue,
        labelCounts: {[pt.areaLabel]: 1},
      });
    }
  });

  const maxOrderCount = clusters.reduce((m, c) => Math.max(m, c.orderCount), 1);

  const points: HeatmapPoint[] = clusters.map((c, idx) => {
    const dominantLabel =
      Object.entries(c.labelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Gossaigaon';
    return {
      id: `heat_${idx}_${c.lat.toFixed(4)}_${c.lng.toFixed(4)}`,
      lat: Number(c.lat.toFixed(6)),
      lng: Number(c.lng.toFixed(6)),
      weight: Number((c.orderCount / maxOrderCount).toFixed(3)),
      orderCount: c.orderCount,
      areaLabel: dominantLabel,
      totalValue: Number(c.totalValue.toFixed(2)),
    };
  });

  const topHotspots = [...points].sort((a, b) =>
    b.orderCount !== a.orderCount ? b.orderCount - a.orderCount : b.totalValue - a.totalValue,
  );

  return {
    points,
    maxOrderCount,
    totalOrdersAnalyzed: rawPoints.length,
    topHotspots,
  };
}

export interface LeaderboardEntry {
  rank: number;
  riderUid: string;
  name: string;
  vehicle: string;
  ratingAvg: number;
  deliveredTrips: number;
  deliveredOrders: number;
  weeklyEarnings: number;
  isCurrentRider: boolean;
}

export interface WeeklyLeaderboardData {
  weekStartMs: number;
  weekEndMs: number;
  weekRangeLabel: string;
  topRiders: LeaderboardEntry[];
  currentRiderEntry: LeaderboardEntry | null;
  totalFleetTripsThisWeek: number;
}

export function getCurrentWeekStartMs(nowMs = Date.now()): number {
  const anchor = new Date(nowMs);
  const day = anchor.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  anchor.setDate(anchor.getDate() - diffToMonday);
  anchor.setHours(0, 0, 0, 0);
  return anchor.getTime();
}

export function calculateWeeklyLeaderboard(
  allOrders: Record<string, OrderRecord>,
  allRiders: Record<string, RiderData>,
  currentRiderUid: string,
  baseRiderFeePerTrip: number,
  nowMs = Date.now(),
  limit = 10,
): WeeklyLeaderboardData {
  const weekStartMs = getCurrentWeekStartMs(nowMs);
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000 - 1;

  const startLabel = new Date(weekStartMs).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
  const endLabel = new Date(weekEndMs).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
  const weekRangeLabel = `${startLabel} – ${endLabel}`;

  interface RiderAccumulator {
    tripKeys: Set<string>;
    deliveredOrders: number;
    weeklyEarnings: number;
  }

  const statsByRider = new Map<string, RiderAccumulator>();

  Object.entries(allOrders || {}).forEach(([orderId, o]) => {
    if (!o || o.status !== 'DELIVERED' || !o.deliveryUid) return;
    const ts = Number(o.updatedAt || o.createdAt || o.assignedAt || 0);
    if (!ts || ts < weekStartMs || ts > weekEndMs) return;

    const uid = String(o.deliveryUid);
    const tripKey =
      o.batchGroupId || `${o.customerUid || 'cust'}_${o.deliveryOtp || o.createdAt || orderId}`;

    let acc = statsByRider.get(uid);
    if (!acc) {
      acc = {tripKeys: new Set<string>(), deliveredOrders: 0, weeklyEarnings: 0};
      statsByRider.set(uid, acc);
    }
    acc.tripKeys.add(tripKey);
    acc.deliveredOrders += 1;
    acc.weeklyEarnings += getRiderFeeForOrder(o, baseRiderFeePerTrip);
  });

  const unsorted: Array<Omit<LeaderboardEntry, 'rank'>> = [];

  statsByRider.forEach((acc, uid) => {
    const profile = allRiders?.[uid] || {};
    const deliveredTrips = acc.tripKeys.size;
    if (deliveredTrips <= 0) return;

    unsorted.push({
      riderUid: uid,
      name: profile.name || `Rider #${uid.slice(-4)}`,
      vehicle: profile.vehicle || 'Two-Wheeler',
      ratingAvg: Number(profile.ratingAvg || 5.0),
      deliveredTrips,
      deliveredOrders: acc.deliveredOrders,
      weeklyEarnings: Number(acc.weeklyEarnings.toFixed(2)),
      isCurrentRider: Boolean(currentRiderUid && uid === currentRiderUid),
    });
  });

  unsorted.sort((a, b) => {
    if (b.deliveredTrips !== a.deliveredTrips) return b.deliveredTrips - a.deliveredTrips;
    if (b.deliveredOrders !== a.deliveredOrders) return b.deliveredOrders - a.deliveredOrders;
    if (b.weeklyEarnings !== a.weeklyEarnings) return b.weeklyEarnings - a.weeklyEarnings;
    if (b.ratingAvg !== a.ratingAvg) return b.ratingAvg - a.ratingAvg;
    return a.name.localeCompare(b.name);
  });

  const ranked: LeaderboardEntry[] = unsorted.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));

  const topRiders = ranked.slice(0, limit);
  const existingCurrent = ranked.find((r) => r.isCurrentRider) || null;
  let currentRiderEntry = existingCurrent;
  if (!currentRiderEntry && currentRiderUid && allRiders?.[currentRiderUid]) {
    const me = allRiders[currentRiderUid];
    currentRiderEntry = {
      rank: ranked.length + 1,
      riderUid: currentRiderUid,
      name: me.name || 'You',
      vehicle: me.vehicle || 'Two-Wheeler',
      ratingAvg: Number(me.ratingAvg || 5.0),
      deliveredTrips: 0,
      deliveredOrders: 0,
      weeklyEarnings: 0,
      isCurrentRider: true,
    };
  }

  const totalFleetTripsThisWeek = ranked.reduce((sum, r) => sum + r.deliveredTrips, 0);

  return {
    weekStartMs,
    weekEndMs,
    weekRangeLabel,
    topRiders,
    currentRiderEntry,
    totalFleetTripsThisWeek,
  };
}

export function parseTimeToMinutes(hhmm: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isValidShiftHours(
  startTime: string,
  endTime: string,
): {valid: boolean; reason?: string} {
  const s = parseTimeToMinutes(startTime);
  const e = parseTimeToMinutes(endTime);
  if (s === null || e === null) {
    return {valid: false, reason: 'Enter valid start and end shift times (HH:MM).'};
  }
  if (s === e) {
    return {valid: false, reason: 'Shift start and end times cannot be identical.'};
  }
  return {valid: true};
}

export function formatShiftTime12h(hhmm: string): string {
  const mins = parseTimeToMinutes(hhmm);
  if (mins === null) return hhmm || '--:--';
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export interface ShiftComplianceStatus {
  configured: boolean;
  enabled: boolean;
  isWithinShift: boolean;
  isOvertimeOnDuty: boolean;
  startTime: string;
  endTime: string;
  windowLabel: string;
}

export function evaluateShiftCompliance(
  preferredShift: PreferredShiftHours | undefined | null,
  isOnline: boolean,
  nowMs = Date.now(),
): ShiftComplianceStatus {
  const startTime = preferredShift?.startTime || '08:00';
  const endTime = preferredShift?.endTime || '20:00';
  const validation = isValidShiftHours(startTime, endTime);
  const configured = Boolean(preferredShift && validation.valid);
  const enabled = Boolean(configured && preferredShift?.enabled);
  const windowLabel = `${formatShiftTime12h(startTime)} – ${formatShiftTime12h(endTime)}`;

  if (!enabled) {
    return {
      configured,
      enabled: false,
      isWithinShift: true,
      isOvertimeOnDuty: false,
      startTime,
      endTime,
      windowLabel,
    };
  }

  const startMin = parseTimeToMinutes(startTime)!;
  const endMin = parseTimeToMinutes(endTime)!;
  const d = new Date(nowMs);
  const nowMin = d.getHours() * 60 + d.getMinutes();

  const isWithinShift =
    startMin < endMin
      ? nowMin >= startMin && nowMin < endMin
      : nowMin >= startMin || nowMin < endMin;

  return {
    configured: true,
    enabled: true,
    isWithinShift,
    isOvertimeOnDuty: Boolean(isOnline) && !isWithinShift,
    startTime,
    endTime,
    windowLabel,
  };
}

export function getDemoSeedState(now = Date.now()): {
  riderData: RiderData;
  stores: Record<string, StoreInfo>;
  assignedOrders: Record<string, OrderRecord>;
  allOrders: Record<string, OrderRecord>;
  allRiders: Record<string, RiderData>;
  allSettlements: Record<string, SettlementRecord>;
  riderSettlements: Record<string, SettlementRecord>;
  myRiderPayouts: Record<string, RiderPayoutRecord>;
  riderRatings: RiderRating[];
  myFeedbacks: Record<string, FeedbackRecord>;
  adminSettings: AdminSettings;
} {
  const dayMs = 24 * 60 * 60 * 1000;
  const weekStartMs = getCurrentWeekStartMs(now);
  const stores: Record<string, StoreInfo> = {
    store_freshmart: {
      name: 'FreshMart Grocery',
      address: 'Station Road, Gossaigaon Bazar',
      phone: '9864011223',
      lat: 26.4539,
      lng: 89.9741,
    },
    store_bazar_dairy: {
      name: 'Bazar Dairy & Bakery',
      address: 'Main Market Lane, Gossaigaon',
      phone: '9864099887',
      lat: 26.4551,
      lng: 89.9702,
    },
    store_green_basket: {
      name: 'Green Basket Organics',
      address: 'Railway Crossing Road, Gossaigaon',
      phone: '9864055443',
      lat: 26.4543,
      lng: 89.9746,
    },
  };

  const assignedOrders: Record<string, OrderRecord> = {
    ord_demo_101: {
      batchGroupId: 'trip_demo_multi_901',
      customerUid: 'cust_demo_1',
      deliveryUid: 'demo_rider_uid',
      restaurantId: 'store_freshmart',
      phone: '9954012345',
      address: 'Ward No. 3, Near Civil Hospital, Gossaigaon',
      customerLat: 26.4582,
      customerLng: 89.9788,
      deliveryOtp: '4829',
      pickupOtp: '7192',
      paymentMode: 'COD',
      paymentStatus: 'COD',
      status: 'READY_FOR_PICKUP',
      totalAmount: 420,
      deliveryCharge: 35,
      items: [
        {name: 'Basmati Rice 5kg', qty: 1},
        {name: 'Mustard Oil 1L', qty: 2},
      ],
      riderAccepted: null,
      assignedAt: now,
      createdAt: now - 120000,
    },
    ord_demo_201: {
      batchGroupId: 'trip_demo_route_902',
      customerUid: 'cust_demo_5',
      deliveryUid: 'demo_rider_uid',
      restaurantId: 'store_bazar_dairy',
      phone: '9954077889',
      address: 'Ward No. 5, College Para, Gossaigaon',
      customerLat: 26.4578,
      customerLng: 89.971,
      deliveryOtp: '6412',
      pickupOtp: '3104',
      paymentMode: 'UPI',
      paymentStatus: 'VERIFIED',
      status: 'READY_FOR_PICKUP',
      totalAmount: 185,
      deliveryCharge: 25,
      items: [{name: 'A2 Cow Ghee 500ml', qty: 1}],
      riderAccepted: true,
      riderAcceptedAt: now - 45000,
      assignedAt: now - 60000,
      createdAt: now - 180000,
    },
    ord_demo_202: {
      batchGroupId: 'trip_demo_route_902',
      customerUid: 'cust_demo_5',
      deliveryUid: 'demo_rider_uid',
      restaurantId: 'store_freshmart',
      phone: '9954077889',
      address: 'Ward No. 5, College Para, Gossaigaon',
      customerLat: 26.4578,
      customerLng: 89.971,
      deliveryOtp: '6412',
      pickupOtp: '5290',
      paymentMode: 'UPI',
      paymentStatus: 'VERIFIED',
      status: 'READY_FOR_PICKUP',
      totalAmount: 290,
      deliveryCharge: 25,
      items: [{name: 'Masoor Dal 2kg', qty: 1}],
      riderAccepted: true,
      riderAcceptedAt: now - 45000,
      assignedAt: now - 60000,
      createdAt: now - 180000,
    },
    ord_demo_203: {
      batchGroupId: 'trip_demo_route_902',
      customerUid: 'cust_demo_5',
      deliveryUid: 'demo_rider_uid',
      restaurantId: 'store_green_basket',
      phone: '9954077889',
      address: 'Ward No. 5, College Para, Gossaigaon',
      customerLat: 26.4578,
      customerLng: 89.971,
      deliveryOtp: '6412',
      pickupOtp: '8841',
      paymentMode: 'UPI',
      paymentStatus: 'VERIFIED',
      status: 'READY_FOR_PICKUP',
      totalAmount: 210,
      deliveryCharge: 25,
      items: [{name: 'Organic Vegetables Combo', qty: 1}],
      riderAccepted: true,
      riderAcceptedAt: now - 45000,
      assignedAt: now - 60000,
      createdAt: now - 180000,
    },
    ord_demo_completed_1: {
      batchGroupId: 'trip_demo_done_501',
      customerUid: 'cust_demo_0',
      deliveryUid: 'demo_rider_uid',
      restaurantId: 'store_bazar_dairy',
      phone: '9954088776',
      address: 'Padmabil Road, Gossaigaon',
      customerLat: 26.4562,
      customerLng: 89.9695,
      deliveryOtp: '1122',
      paymentMode: 'COD',
      paymentStatus: 'COD',
      status: 'DELIVERED',
      totalAmount: 650,
      deliveryCharge: 45,
      items: [{name: 'Full Cream Milk 2L', qty: 2}],
      riderAccepted: true,
      createdAt: now - 3600000,
      updatedAt: now - 1800000,
    },
    ord_demo_completed_d1: {
      batchGroupId: 'trip_demo_done_401',
      customerUid: 'cust_demo_2',
      deliveryUid: 'demo_rider_uid',
      restaurantId: 'store_freshmart',
      phone: '9954011122',
      address: 'College Road, Gossaigaon',
      customerLat: 26.4576,
      customerLng: 89.9714,
      deliveryOtp: '2233',
      paymentMode: 'UPI',
      paymentStatus: 'VERIFIED',
      status: 'DELIVERED',
      totalAmount: 310,
      deliveryCharge: 90,
      items: [{name: 'Atta 5kg', qty: 1}],
      riderAccepted: true,
      createdAt: now - dayMs,
      updatedAt: now - dayMs,
    },
    ord_demo_completed_d2: {
      batchGroupId: 'trip_demo_done_402',
      customerUid: 'cust_demo_3',
      deliveryUid: 'demo_rider_uid',
      restaurantId: 'store_bazar_dairy',
      phone: '9954033344',
      address: 'Station Para, Gossaigaon',
      customerLat: 26.4543,
      customerLng: 89.9742,
      deliveryOtp: '3344',
      paymentMode: 'UPI',
      paymentStatus: 'VERIFIED',
      status: 'DELIVERED',
      totalAmount: 240,
      deliveryCharge: 60,
      items: [{name: 'Paneer 500g', qty: 1}],
      riderAccepted: true,
      createdAt: now - 2 * dayMs,
      updatedAt: now - 2 * dayMs,
    },
    ord_demo_completed_d4: {
      batchGroupId: 'trip_demo_done_403',
      customerUid: 'cust_demo_4',
      deliveryUid: 'demo_rider_uid',
      restaurantId: 'store_freshmart',
      phone: '9954055566',
      address: 'Habrubil, Gossaigaon',
      customerLat: 26.451,
      customerLng: 89.9765,
      deliveryOtp: '4455',
      paymentMode: 'UPI',
      paymentStatus: 'VERIFIED',
      status: 'DELIVERED',
      totalAmount: 480,
      deliveryCharge: 120,
      items: [{name: 'Refined Oil 2L', qty: 2}],
      riderAccepted: true,
      createdAt: now - 4 * dayMs,
      updatedAt: now - 4 * dayMs,
    },
  };

  // Gossaigaon-wide historical delivered orders (for demand heatmap visualization in demo mode)
  const allOrders: Record<string, OrderRecord> = {
    ...assignedOrders,
    ord_hist_station_1: {
      deliveryUid: 'other_rider_1',
      restaurantId: 'store_freshmart',
      address: 'Station Road Bazar, Gossaigaon',
      customerLat: 26.4541,
      customerLng: 89.9744,
      status: 'DELIVERED',
      totalAmount: 540,
      updatedAt: now - dayMs,
    },
    ord_hist_station_2: {
      deliveryUid: 'other_rider_2',
      restaurantId: 'store_green_basket',
      address: 'Station Para, Gossaigaon',
      customerLat: 26.4545,
      customerLng: 89.9747,
      status: 'DELIVERED',
      totalAmount: 380,
      updatedAt: now - 2 * dayMs,
    },
    ord_hist_station_3: {
      deliveryUid: 'other_rider_1',
      restaurantId: 'store_freshmart',
      address: 'Railway Crossing, Gossaigaon',
      customerLat: 26.4539,
      customerLng: 89.9749,
      status: 'DELIVERED',
      totalAmount: 610,
      updatedAt: now - 3 * dayMs,
    },
    ord_hist_station_4: {
      deliveryUid: 'other_rider_3',
      restaurantId: 'store_green_basket',
      address: 'Station Road, Gossaigaon',
      customerLat: 26.4542,
      customerLng: 89.974,
      status: 'DELIVERED',
      totalAmount: 295,
      updatedAt: now - 3 * dayMs,
    },
    ord_hist_college_1: {
      deliveryUid: 'other_rider_2',
      restaurantId: 'store_bazar_dairy',
      address: 'College Para, Ward 5, Gossaigaon',
      customerLat: 26.4577,
      customerLng: 89.9712,
      status: 'DELIVERED',
      totalAmount: 420,
      updatedAt: now - dayMs,
    },
    ord_hist_college_2: {
      deliveryUid: 'other_rider_1',
      restaurantId: 'store_freshmart',
      address: 'College Road, Gossaigaon',
      customerLat: 26.4574,
      customerLng: 89.9716,
      status: 'DELIVERED',
      totalAmount: 510,
      updatedAt: now - 4 * dayMs,
    },
    ord_hist_civil_1: {
      deliveryUid: 'other_rider_3',
      restaurantId: 'store_freshmart',
      address: 'Civil Hospital Ward 3, Gossaigaon',
      customerLat: 26.4581,
      customerLng: 89.9785,
      status: 'DELIVERED',
      totalAmount: 490,
      updatedAt: now - 2 * dayMs,
    },
    ord_hist_civil_2: {
      deliveryUid: 'other_rider_2',
      restaurantId: 'store_bazar_dairy',
      address: 'Civil Hospital Road, Gossaigaon',
      customerLat: 26.4584,
      customerLng: 89.9789,
      status: 'DELIVERED',
      totalAmount: 360,
      updatedAt: Math.max(weekStartMs + 3600000, now - 5 * 3600000),
    },
  };

  // Add current-week delivered trips across 10 fellow riders so Leaderboard ranks Top 10 out of 11
  const demoFleetTripTargets: Array<{uid: string; trips: number; lat: number; lng: number; addr: string}> = [
    {uid: 'other_rider_1', trips: 9, lat: 26.4541, lng: 89.9744, addr: 'Station Para, Gossaigaon'}, // +3 existing = 12
    {uid: 'other_rider_2', trips: 7, lat: 26.4577, lng: 89.9712, addr: 'College Road, Gossaigaon'}, // +3 existing = 10
    {uid: 'other_rider_4', trips: 9, lat: 26.4542, lng: 89.9741, addr: 'Station Para, Gossaigaon'},
    {uid: 'other_rider_5', trips: 7, lat: 26.4575, lng: 89.9715, addr: 'College Road, Gossaigaon'},
    {uid: 'other_rider_6', trips: 6, lat: 26.4582, lng: 89.9786, addr: 'Civil Hospital Ward 3, Gossaigaon'},
    {uid: 'other_rider_7', trips: 5, lat: 26.4544, lng: 89.9745, addr: 'Station Para, Gossaigaon'},
    {uid: 'other_rider_3', trips: 1, lat: 26.4581, lng: 89.9785, addr: 'Civil Hospital Ward 3, Gossaigaon'}, // +2 existing = 3
    {uid: 'other_rider_8', trips: 2, lat: 26.451, lng: 89.9765, addr: 'Habrubil, Gossaigaon'},
    {uid: 'other_rider_9', trips: 2, lat: 26.4576, lng: 89.9713, addr: 'College Road, Gossaigaon'},
    {uid: 'other_rider_10', trips: 1, lat: 26.454, lng: 89.9743, addr: 'Station Para, Gossaigaon'},
  ];

  demoFleetTripTargets.forEach((spec) => {
    for (let i = 0; i < spec.trips; i++) {
      const id = `ord_week_${spec.uid}_${i + 1}`;
      allOrders[id] = {
        batchGroupId: `trip_week_${spec.uid}_${i + 1}`,
        deliveryUid: spec.uid,
        restaurantId: i % 2 === 0 ? 'store_freshmart' : 'store_bazar_dairy',
        address: spec.addr,
        customerLat: spec.lat,
        customerLng: spec.lng,
        status: 'DELIVERED',
        totalAmount: 240 + i * 35,
        deliveryCharge: 35,
        updatedAt: Math.max(weekStartMs + 1000, now - (i + 1) * 1800000),
      };
    }
  });

  const dayStartMs = new Date(
    new Date(now).getFullYear(),
    new Date(now).getMonth(),
    new Date(now).getDate(),
    0,
    1,
    0,
    0,
  ).getTime();
  const todayPointTime = (minsAgo: number) => Math.max(dayStartMs, now - minsAgo * 60000);

  const riderData: RiderData = {
    name: 'Bipin Brahma',
    email: 'bipin@gossaigaonbazar.com',
    phone: '9876543210',
    upiId: '9876543210@paytm',
    vehicle: 'Hero Splendor - AS-16-4821',
    approved: true,
    online: true,
    suspended: false,
    ratingAvg: 4.9,
    ratingCount: 18,
    lat: 26.4524,
    lng: 89.9723,
    lastSeen: now,
    recentRoute: [
      {lat: 26.4514, lng: 89.9708, time: todayPointTime(52)},
      {lat: 26.4523, lng: 89.9719, time: todayPointTime(45)},
      {lat: 26.4539, lng: 89.9741, time: todayPointTime(38)},
      {lat: 26.4551, lng: 89.9702, time: todayPointTime(31)},
      {lat: 26.4562, lng: 89.9695, time: todayPointTime(24)},
      {lat: 26.4576, lng: 89.9714, time: todayPointTime(17)},
      {lat: 26.4582, lng: 89.9756, time: todayPointTime(10)},
      {lat: 26.4556, lng: 89.9744, time: todayPointTime(5)},
      {lat: 26.4524, lng: 89.9723, time: todayPointTime(1)},
    ],
    preferredShift: {
      enabled: true,
      startTime: '08:00',
      endTime: '20:00',
    },
  };

  const allRiders: Record<string, RiderData> = {
    demo_rider_uid: riderData,
    other_rider_1: {name: 'Ranjit Basumatary', vehicle: 'Honda Shine', ratingAvg: 4.9, approved: true},
    other_rider_2: {name: 'Pranab Narzary', vehicle: 'Bajaj Pulsar', ratingAvg: 4.8, approved: true},
    other_rider_3: {name: 'Sanjib Brahma', vehicle: 'TVS Apache', ratingAvg: 4.7, approved: true},
    other_rider_4: {name: 'Dipankar Roy', vehicle: 'Hero Passion Pro', ratingAvg: 4.9, approved: true},
    other_rider_5: {name: 'Kamal Koch', vehicle: 'Honda Activa', ratingAvg: 4.8, approved: true},
    other_rider_6: {name: 'Bikash Rabha', vehicle: 'Bajaj Platina', ratingAvg: 4.7, approved: true},
    other_rider_7: {name: 'Anupam Sarma', vehicle: 'Hero Glamour', ratingAvg: 4.8, approved: true},
    other_rider_8: {name: 'Rahul Mushahary', vehicle: 'TVS Raider', ratingAvg: 4.6, approved: true},
    other_rider_9: {name: 'Jitu Barman', vehicle: 'Honda SP 125', ratingAvg: 4.7, approved: true},
    other_rider_10: {name: 'Niharika Das', vehicle: 'Suzuki Access', ratingAvg: 4.9, approved: true},
  };

  return {
    riderData,
    stores,
    assignedOrders,
    allOrders,
    allRiders,
    allSettlements: {
      settle_1: {
        riderUid: 'demo_rider_uid',
        riderName: 'Bipin Brahma',
        amount: 200,
        mode: 'UPI',
        utr: '412893471923',
        status: 'APPROVED',
        createdAt: now - 1800000,
      },
    },
    riderSettlements: {
      settle_1: {
        riderUid: 'demo_rider_uid',
        riderName: 'Bipin Brahma',
        amount: 200,
        mode: 'UPI',
        utr: '412893471923',
        status: 'APPROVED',
        createdAt: now - 1800000,
      },
    },
    myRiderPayouts: {
      pay_1: {
        riderUid: 'demo_rider_uid',
        riderName: 'Bipin Brahma',
        riderUpiId: '9876543210@paytm',
        amount: 20,
        status: 'PAID',
        adminRef: 'UTR991122',
        createdAt: now - 7200000,
      },
    },
    riderRatings: [
      {
        customerName: 'Ramesh Narzary',
        rating: 5,
        comment: 'Super fast delivery and polite behavior!',
        createdAt: now - 1800000,
      },
    ],
    myFeedbacks: {
      fb_1: {
        role: 'RIDER',
        uid: 'demo_rider_uid',
        subject: 'Route pin verification working smoothly',
        message: 'Customer GPS pin was accurate near Civil Hospital.',
        status: 'RESOLVED',
        adminReply: 'Great work Bipin! Keep riding safe.',
        createdAt: now - 5400000,
      },
    },
    adminSettings: {
      upiId: 'gossaigaonbazar@apl',
      riderBaseFee: 25,
      maxRiderCashLimit: 3000,
      riderAcceptTimeoutSec: 45,
      minRiderPayout: 10,
      maxRiderPayout: 10000,
      minRiderCodDeposit: 10,
      maxRiderCodDeposit: 25000,
      allowRiderPassTrip: true,
      allowRiderSos: true,
      riderAnnouncement: 'Evening peak bonus +₹10 active across Gossaigaon Bazar!',
      supportHours: '7:00 AM - 10:30 PM',
      supportPhone: '9876500000',
      supportWhatsapp: '9876500000',
    },
  };
}
