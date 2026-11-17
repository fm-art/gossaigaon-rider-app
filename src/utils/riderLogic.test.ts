import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {
  buildDeliveredHistoryEntries,
  buildDeliveryQrPayload,
  buildOrderVolumeHeatmap,
  buildRiderMapPoints,
  calculateChangeReturn,
  calculateDistanceKm,
  calculateFinancialSummary,
  calculateLast7DaysPerformance,
  calculateOptimalDeliverySequence,
  calculateWeeklyLeaderboard,
  AUTO_GPS_STORAGE_KEY,
  readAutoGpsEnabled,
  saveAutoGpsEnabled,
  evaluateBatteryGpsPolicy,
  evaluatePinAttempt,
  evaluateShiftCompliance,
  formatShiftTime12h,
  formatWhatsAppUrl,
  getStorePickupCode,
  getTripsGrouped,
  isTripPickedUp,
  isValidIndianMobile,
  isValidShiftHours,
  isValidUpiId,
  sanitizeText,
  selectNearestEligibleRider,
  shouldShowPowerBankBanner,
  sortStoreStops,
  validateDeliveryQrPayload,
  validateSettlementUtr,
} from './riderLogic';

test('validation helpers validate mobile, UPI, WhatsApp, and sanitization', () => {
  assert.equal(isValidIndianMobile('9876543210'), true);
  assert.equal(isValidIndianMobile('5876543210'), false);
  assert.equal(isValidIndianMobile('98765'), false);

  assert.equal(isValidUpiId('9876543210@paytm'), true);
  assert.equal(isValidUpiId('bipin.brahma@okaxis'), true);
  assert.equal(isValidUpiId('invalid-upi'), false);

  assert.equal(formatWhatsAppUrl('9876543210'), '919876543210');
  assert.equal(formatWhatsAppUrl('+91 98765 43210'), '919876543210');
  assert.equal(sanitizeText('<script>"alert"</script>'), 'scriptalert/script');
});

test('calculateDistanceKm computes Haversine distance and handles invalid coords', () => {
  assert.equal(calculateDistanceKm(26.4524, 89.9723, 26.4524, 89.9723), 0);
  const d = calculateDistanceKm(26.4524, 89.9723, 26.4624, 89.9823);
  assert.ok(d !== null && d > 1.0 && d < 2.0);
  assert.equal(calculateDistanceKm(null, 89.97, 26.45, 89.97), null);
});

test('getStorePickupCode returns explicit pickupOtp or deterministic 4-digit code', () => {
  assert.equal(getStorePickupCode({pickupOtp: '7192'}, 'ord_1'), '7192');
  const codeA = getStorePickupCode({}, 'ord_abc_123');
  const codeB = getStorePickupCode({}, 'ord_abc_123');
  assert.equal(codeA, codeB);
  assert.match(codeA, /^\d{4}$/);
});

test('validateSettlementUtr enforces 12 digits, anti-fraud patterns, and uniqueness', () => {
  const existing = {s1: {amount: 100, mode: 'UPI', utr: '412893471923', status: 'APPROVED'}};
  assert.equal(validateSettlementUtr('12345', existing).valid, false);
  assert.equal(validateSettlementUtr('111111111111', existing).valid, false);
  assert.equal(validateSettlementUtr('123456789012', existing).valid, false);
  assert.equal(validateSettlementUtr('000012345678', existing).valid, false);
  assert.equal(validateSettlementUtr('412893471923', existing).valid, false);
  assert.equal(validateSettlementUtr('512893471999', existing).valid, true);
});

test('getTripsGrouped and isTripPickedUp group multi-store orders and lock cancel after pickup', () => {
  const orders = {
    o1: {batchGroupId: 'b1', status: 'READY_FOR_PICKUP', customerUid: 'c1', totalAmount: 200},
    o2: {batchGroupId: 'b1', status: 'PICKED_UP', customerUid: 'c1', totalAmount: 300},
    o3: {batchGroupId: 'b2', status: 'DELIVERED', customerUid: 'c2', totalAmount: 450},
  };
  const {activeTrips, completedTrips} = getTripsGrouped(orders);
  assert.equal(activeTrips.length, 1);
  assert.equal(activeTrips[0].orders.length, 2);
  assert.equal(isTripPickedUp(activeTrips[0]), true);
  assert.equal(completedTrips.length, 1);
});

test('sortStoreStops orders unpicked stops before picked-up stops by distance', () => {
  const stores = {
    sFar: {name: 'Far', lat: 26.48, lng: 89.99},
    sNear: {name: 'Near', lat: 26.453, lng: 89.973},
    sDone: {name: 'Done', lat: 26.4525, lng: 89.9724},
  };
  const stops = sortStoreStops(
    [
      {orderId: '1', restaurantId: 'sDone', status: 'PICKED_UP'},
      {orderId: '2', restaurantId: 'sFar', status: 'READY_FOR_PICKUP'},
      {orderId: '3', restaurantId: 'sNear', status: 'READY_FOR_PICKUP'},
    ],
    stores,
    26.4524,
    89.9723,
  );
  assert.deepEqual(
    stops.map((s) => s.order.orderId),
    ['3', '2', '1'],
  );
});

test('calculateFinancialSummary computes COD cash in hand and available payout accurately', () => {
  const orders = {
    d1: {status: 'DELIVERED', paymentMode: 'COD', totalAmount: 500, deliveryCharge: 35},
    d2: {status: 'DELIVERED', paymentMode: 'UPI', totalAmount: 300},
    a1: {status: 'OUT_FOR_DELIVERY', paymentMode: 'COD', totalAmount: 900},
  };
  const settlements = {
    s1: {amount: 200, mode: 'UPI', status: 'APPROVED'},
    s2: {amount: 100, mode: 'UPI', status: 'PENDING'},
  };
  const payouts = {
    p1: {amount: 20, status: 'PAID'},
    p2: {amount: 15, status: 'PENDING'},
  };
  const summary = calculateFinancialSummary(orders, settlements, payouts, 25);
  assert.equal(summary.totalCodCollected, 500);
  assert.equal(summary.totalDeposited, 200);
  assert.equal(summary.netCashInHand, 300);
  assert.equal(summary.totalRiderEarned, 60);
  assert.equal(summary.totalRiderPaidPayout, 20);
  assert.equal(summary.availablePayoutBalance, 40);
});

test('selectNearestEligibleRider picks closest approved online non-suspended non-rejecting rider', () => {
  const riders = {
    me: {approved: true, online: true, lat: 26.45, lng: 89.97},
    rOffline: {approved: true, online: false, lat: 26.451, lng: 89.971},
    rRejected: {approved: true, online: true, lat: 26.451, lng: 89.971},
    rFar: {approved: true, online: true, lat: 26.5, lng: 90.0},
    rNear: {approved: true, online: true, lat: 26.453, lng: 89.973},
  };
  const nextUid = selectNearestEligibleRider(
    riders,
    'me',
    [{orderId: 'o1', rejectedByRiders: {rRejected: {reason: 'Declined'}}}],
    26.4524,
    89.9723,
  );
  assert.equal(nextUid, 'rNear');
});

test('evaluatePinAttempt enforces 3-attempt brute-force lock and calculateChangeReturn works', () => {
  let guard = undefined;
  let res = evaluatePinAttempt(guard, '4829', '0000', 1000);
  assert.equal(res.allowed, false);
  assert.equal(res.attemptsLeft, 2);
  guard = res.nextGuard;

  res = evaluatePinAttempt(guard, '4829', '1111', 2000);
  assert.equal(res.allowed, false);
  assert.equal(res.attemptsLeft, 1);
  guard = res.nextGuard;

  res = evaluatePinAttempt(guard, '4829', '2222', 3000);
  assert.equal(res.allowed, false);
  assert.equal(res.justLocked, true);
  guard = res.nextGuard;

  const lockedRes = evaluatePinAttempt(guard, '4829', '4829', 4000);
  assert.equal(lockedRes.allowed, false);
  assert.equal(lockedRes.lockedSecondsRemaining, 59);

  const okRes = evaluatePinAttempt(guard, '4829', '4829', 64000);
  assert.equal(okRes.allowed, true);

  assert.deepEqual(calculateChangeReturn(420, 500), {change: 80, isShort: false});
  assert.deepEqual(calculateChangeReturn(420, 400), {change: -20, isShort: true});
});

test('calculateLast7DaysPerformance aggregates 7 days of delivered trips and excludes cancelled/older trips', () => {
  const now = new Date('2026-11-14T15:00:00').getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const completedTrips = [
    {
      tripId: 't_today',
      phone: '',
      address: '',
      customerLat: null,
      customerLng: null,
      locationLink: '',
      deliveryOtp: '',
      paymentMode: 'COD',
      paymentStatus: 'COD',
      emergencyAlert: false,
      emergencyDetails: '',
      assignedAt: now,
      orders: [
        {orderId: 'o1', status: 'DELIVERED', deliveryCharge: 35, updatedAt: now},
        {orderId: 'o2', status: 'DELIVERED', deliveryCharge: 0, updatedAt: now},
      ],
    },
    {
      tripId: 't_2days_ago',
      phone: '',
      address: '',
      customerLat: null,
      customerLng: null,
      locationLink: '',
      deliveryOtp: '',
      paymentMode: 'UPI',
      paymentStatus: 'VERIFIED',
      emergencyAlert: false,
      emergencyDetails: '',
      assignedAt: now - 2 * dayMs,
      orders: [{orderId: 'o3', status: 'DELIVERED', deliveryCharge: 40, updatedAt: now - 2 * dayMs}],
    },
    {
      tripId: 't_cancelled',
      phone: '',
      address: '',
      customerLat: null,
      customerLng: null,
      locationLink: '',
      deliveryOtp: '',
      paymentMode: 'COD',
      paymentStatus: 'COD',
      emergencyAlert: false,
      emergencyDetails: '',
      assignedAt: now,
      orders: [{orderId: 'o4', status: 'CANCELLED', deliveryCharge: 50, updatedAt: now}],
    },
    {
      tripId: 't_too_old',
      phone: '',
      address: '',
      customerLat: null,
      customerLng: null,
      locationLink: '',
      deliveryOtp: '',
      paymentMode: 'COD',
      paymentStatus: 'COD',
      emergencyAlert: false,
      emergencyDetails: '',
      assignedAt: now - 9 * dayMs,
      orders: [{orderId: 'o5', status: 'DELIVERED', deliveryCharge: 100, updatedAt: now - 9 * dayMs}],
    },
  ];

  const series = calculateLast7DaysPerformance(completedTrips, 25, now);
  assert.equal(series.length, 7);
  assert.equal(series[6].label, 'Today');
  assert.equal(series[6].trips, 1);
  assert.equal(series[6].earnings, 60); // 35 + fallback 25
  assert.equal(series[4].trips, 1);
  assert.equal(series[4].earnings, 40);
  assert.equal(series[0].trips, 0);
  assert.equal(series[0].earnings, 0);
});

test('buildRiderMapPoints builds prioritized store markers, customer dropoffs, and route polyline', () => {
  const stores = {
    sUnassigned: {name: 'Corner Shop', lat: 26.453, lng: 89.973, address: 'Bazar'},
    sAssigned: {name: 'FreshMart', lat: 26.456, lng: 89.976, address: 'Station Rd'},
    sNoCoords: {name: 'No GPS Store'},
  };
  const activeTrips = [
    {
      tripId: 'trip_1',
      phone: '9954012345',
      address: 'Ward 3',
      customerLat: 26.46,
      customerLng: 89.98,
      locationLink: '',
      deliveryOtp: '1234',
      paymentMode: 'COD',
      paymentStatus: 'COD',
      emergencyAlert: false,
      emergencyDetails: '',
      assignedAt: Date.now(),
      orders: [{orderId: 'o1', restaurantId: 'sAssigned', status: 'READY_FOR_PICKUP'}],
    },
  ];

  const mapData = buildRiderMapPoints(26.4524, 89.9723, stores, activeTrips);
  assert.equal(mapData.storeMarkers.length, 2);
  assert.equal(mapData.storeMarkers[0].storeId, 'sAssigned');
  assert.equal(mapData.storeMarkers[0].isAssignedStop, true);
  assert.equal(mapData.storeMarkers[1].isAssignedStop, false);
  assert.equal(mapData.customerMarkers.length, 1);
  assert.equal(mapData.routePoints.length, 3); // rider -> sAssigned -> customer
  assert.equal(mapData.boundsPoints.length, 4); // rider + 2 stores + 1 customer
});

test('buildDeliveredHistoryEntries formats delivered trips newest-first, resolves stores, and excludes cancelled trips', () => {
  const now = new Date('2026-11-14T16:00:00').getTime();
  const stores = {
    s1: {name: 'FreshMart Grocery'},
    s2: {name: 'Bazar Dairy'},
  };
  const completedTrips = [
    {
      tripId: 'trip_older_multi',
      phone: '9876500001',
      address: 'Ward No. 2, Gossaigaon',
      customerLat: null,
      customerLng: null,
      locationLink: '',
      deliveryOtp: '1111',
      paymentMode: 'COD',
      paymentStatus: 'COD',
      emergencyAlert: false,
      emergencyDetails: '',
      assignedAt: now - 3600000,
      orders: [
        {
          orderId: 'o1',
          restaurantId: 's1',
          status: 'DELIVERED',
          totalAmount: 300,
          deliveryCharge: 35,
          items: [{name: 'Rice', qty: 2}],
          updatedAt: now - 3600000,
        },
        {
          orderId: 'o2',
          restaurantId: 's2',
          status: 'DELIVERED',
          totalAmount: 150,
          deliveryCharge: 0,
          items: [{name: 'Milk', qty: 1}],
          updatedAt: now - 3500000,
        },
      ],
    },
    {
      tripId: 'trip_newest',
      phone: '9876500002',
      address: 'Station Road, Gossaigaon',
      customerLat: null,
      customerLng: null,
      locationLink: '',
      deliveryOtp: '2222',
      paymentMode: 'UPI',
      paymentStatus: 'VERIFIED',
      emergencyAlert: false,
      emergencyDetails: '',
      assignedAt: now,
      orders: [
        {
          orderId: 'o3',
          restaurantId: 's_unknown',
          status: 'DELIVERED',
          totalAmount: 220,
          deliveryCharge: 40,
          items: [{name: 'Bread', qty: 3}],
          updatedAt: now,
        },
      ],
    },
    {
      tripId: 'trip_cancelled_only',
      phone: '9876500003',
      address: 'College Road',
      customerLat: null,
      customerLng: null,
      locationLink: '',
      deliveryOtp: '3333',
      paymentMode: 'COD',
      paymentStatus: 'COD',
      emergencyAlert: false,
      emergencyDetails: '',
      assignedAt: now + 1000,
      orders: [
        {
          orderId: 'o4',
          restaurantId: 's1',
          status: 'CANCELLED',
          totalAmount: 500,
          deliveryCharge: 50,
          updatedAt: now + 1000,
        },
      ],
    },
  ];

  const entries = buildDeliveredHistoryEntries(completedTrips, stores, 25);
  assert.equal(entries.length, 2);

  // Newest first
  assert.equal(entries[0].tripId, 'trip_newest');
  assert.equal(entries[0].storeNames[0], 'Store'); // fallback for unknown store
  assert.equal(entries[0].customerLocation, 'Station Road, Gossaigaon');
  assert.equal(entries[0].totalEarnings, 40);
  assert.equal(entries[0].totalBillAmount, 220);
  assert.equal(entries[0].orderBreakdowns[0].itemCount, 3);

  // Older multi-order trip with base fee fallback
  assert.equal(entries[1].tripId, 'trip_older_multi');
  assert.deepEqual(entries[1].storeNames, ['FreshMart Grocery', 'Bazar Dairy']);
  assert.equal(entries[1].totalEarnings, 60); // 35 + fallback 25
  assert.equal(entries[1].totalBillAmount, 450);
  assert.equal(entries[1].orderBreakdowns.length, 2);
});

test('calculateOptimalDeliverySequence uses greedy nearest-neighbor chaining across pickups and dropoffs', () => {
  // Rider at (26.4500, 89.9700)
  // Store A is closest to rider (~0.22 km North-East)
  // Store B is ~0.35 km North-West from rider (closer to rider than Store C, but far from Store A)
  // Store C is ~0.40 km from rider, ONLY ~0.10 km from Store A!
  // Naive / rider-sorted order would be A -> B -> C; greedy chained order MUST be A -> C -> B -> Dropoff.
  const stores = {
    sA: {name: 'Store A', lat: 26.4515, lng: 89.9715, address: 'East Lane'},
    sB: {name: 'Store B', lat: 26.4525, lng: 89.9675, address: 'West Market'},
    sC: {name: 'Store C', lat: 26.4522, lng: 89.9722, address: 'Next to A'},
  };

  const trip = {
    tripId: 'trip_greedy_test',
    phone: '9954012345',
    address: 'Customer West',
    customerLat: 26.4535,
    customerLng: 89.9670,
    locationLink: '',
    deliveryOtp: '1234',
    paymentMode: 'UPI',
    paymentStatus: 'VERIFIED',
    emergencyAlert: false,
    emergencyDetails: '',
    assignedAt: Date.now(),
    orders: [
      {orderId: 'o_b', restaurantId: 'sB', status: 'READY_FOR_PICKUP', items: [{name: 'Milk', qty: 1}]},
      {orderId: 'o_a', restaurantId: 'sA', status: 'READY_FOR_PICKUP', items: [{name: 'Rice', qty: 1}]},
      {orderId: 'o_c', restaurantId: 'sC', status: 'READY_FOR_PICKUP', items: [{name: 'Veg', qty: 2}]},
    ],
  };

  const seq = calculateOptimalDeliverySequence(trip, stores, 26.45, 89.97);
  assert.equal(seq.isMultiOrder, true);
  assert.deepEqual(seq.orderedPickupOrderIds, ['o_a', 'o_c', 'o_b']);
  assert.equal(seq.steps.length, 4); // 3 pickups + 1 deduplicated dropoff
  assert.equal(seq.steps[0].title, 'Store A');
  assert.equal(seq.steps[0].isCurrent, true);
  assert.equal(seq.steps[1].title, 'Store C');
  assert.equal(seq.steps[2].title, 'Store B');
  assert.equal(seq.steps[3].type, 'DROPOFF');
  assert.equal(seq.steps[3].orderIds.length, 3);
  assert.ok(seq.distanceSavedKm > 0);
  assert.ok(seq.totalRemainingDistanceKm < seq.naiveRemainingDistanceKm);
});

test('calculateOptimalDeliverySequence sequences distinct customer dropoffs greedily and marks completed pickups', () => {
  const stores = {
    s1: {name: 'FreshMart', lat: 26.4539, lng: 89.9741},
    s2: {name: 'Bazar Dairy', lat: 26.4551, lng: 89.9702},
  };

  const trip = {
    tripId: 'trip_multidrop',
    phone: '9954012345',
    address: 'Default Addr',
    customerLat: 26.456,
    customerLng: 89.971,
    locationLink: '',
    deliveryOtp: '9999',
    paymentMode: 'COD',
    paymentStatus: 'COD',
    emergencyAlert: false,
    emergencyDetails: '',
    assignedAt: Date.now(),
    orders: [
      {
        orderId: 'o1',
        restaurantId: 's1',
        status: 'PICKED_UP',
        address: 'Far Drop',
        customerLat: 26.465,
        customerLng: 89.985,
      },
      {
        orderId: 'o2',
        restaurantId: 's2',
        status: 'READY_FOR_PICKUP',
        address: 'Near Drop',
        customerLat: 26.456,
        customerLng: 89.971,
      },
    ],
  };

  const seq = calculateOptimalDeliverySequence(trip, stores, 26.4524, 89.9723);
  assert.equal(seq.steps.length, 4); // 1 completed pickup + 1 pending pickup + 2 distinct dropoffs
  assert.equal(seq.steps[0].isCompleted, true);
  assert.equal(seq.steps[1].isCurrent, true);
  assert.equal(seq.steps[1].title, 'Bazar Dairy');
  assert.equal(seq.steps[2].title, 'Near Drop'); // closer to Bazar Dairy than Far Drop
  assert.equal(seq.steps[3].title, 'Far Drop');
});

test('buildOrderVolumeHeatmap clusters historical delivered orders, falls back to store coords, and normalizes weights', () => {
  const stores = {
    s_station: {name: 'FreshMart', address: 'Station Road, Gossaigaon', lat: 26.4539, lng: 89.9741},
  };
  const orders = {
    // 3 delivered orders clustered near Station Road (one using store coord fallback)
    o1: {status: 'DELIVERED', address: 'Station Road, Gossaigaon', customerLat: 26.454, customerLng: 89.9742, totalAmount: 300},
    o2: {status: 'DELIVERED', address: 'Station Para, Gossaigaon', customerLat: 26.4543, customerLng: 89.9746, totalAmount: 250},
    o3: {status: 'DELIVERED', restaurantId: 's_station', totalAmount: 400}, // missing customer coords -> fallback to store
    // 1 delivered order at a separate zone
    o4: {status: 'DELIVERED', address: 'Habrubil, Gossaigaon', customerLat: 26.451, customerLng: 89.9765, totalAmount: 200},
    // Non-delivered orders must be excluded from historical heatmap
    o5_cancelled: {status: 'CANCELLED', address: 'Habrubil', customerLat: 26.451, customerLng: 89.9765, totalAmount: 900},
    o6_active: {status: 'READY_FOR_PICKUP', address: 'Habrubil', customerLat: 26.451, customerLng: 89.9765, totalAmount: 800},
  };

  const heatmap = buildOrderVolumeHeatmap(orders, stores, 0.28);
  assert.equal(heatmap.totalOrdersAnalyzed, 4);
  assert.equal(heatmap.points.length, 2);
  assert.equal(heatmap.maxOrderCount, 3);
  assert.equal(heatmap.topHotspots[0].orderCount, 3);
  assert.equal(heatmap.topHotspots[0].weight, 1);
  assert.equal(heatmap.topHotspots[0].totalValue, 950);
  assert.equal(heatmap.topHotspots[1].areaLabel, 'Habrubil');
  assert.equal(heatmap.topHotspots[1].orderCount, 1);
  assert.ok(heatmap.topHotspots[1].weight > 0.3 && heatmap.topHotspots[1].weight < 0.35);

  const empty = buildOrderVolumeHeatmap({}, stores);
  assert.equal(empty.points.length, 0);
  assert.equal(empty.totalOrdersAnalyzed, 0);
});

test('calculateWeeklyLeaderboard ranks top 10 riders by current-week delivered trips and groups multi-order batches', () => {
  const now = new Date('2026-11-14T15:00:00').getTime(); // Saturday of week Nov 9 - Nov 15
  const dayMs = 24 * 60 * 60 * 1000;

  const allRiders: Record<string, {name: string; vehicle: string; ratingAvg: number}> = {};
  const allOrders: Record<
    string,
    {
      batchGroupId?: string;
      deliveryUid?: string;
      status: string;
      deliveryCharge?: number;
      updatedAt: number;
    }
  > = {};

  // Create 12 riders with 12 down to 1 trips this week
  for (let i = 1; i <= 12; i++) {
    const uid = `r_${i}`;
    allRiders[uid] = {name: `Rider ${i}`, vehicle: 'Bike', ratingAvg: 4.8};
    const tripCount = 13 - i; // r_1 => 12 trips, r_12 => 1 trip
    for (let t = 1; t <= tripCount; t++) {
      allOrders[`ord_${uid}_${t}`] = {
        batchGroupId: `trip_${uid}_${t}`,
        deliveryUid: uid,
        status: 'DELIVERED',
        deliveryCharge: 30,
        updatedAt: now - t * 60000,
      };
    }
  }

  // Add a 2nd order in the SAME batchGroupId for r_11 (should still count as 2 trips, not 3)
  allOrders['ord_r11_batch_extra'] = {
    batchGroupId: 'trip_r_11_1',
    deliveryUid: 'r_11',
    status: 'DELIVERED',
    deliveryCharge: 30,
    updatedAt: now - 60000,
  };

  // Add previous-week order and cancelled order for r_12 (must be excluded)
  allOrders['ord_prev_week'] = {
    batchGroupId: 'trip_old',
    deliveryUid: 'r_12',
    status: 'DELIVERED',
    deliveryCharge: 40,
    updatedAt: now - 8 * dayMs,
  };
  allOrders['ord_cancelled'] = {
    batchGroupId: 'trip_cancel',
    deliveryUid: 'r_12',
    status: 'CANCELLED',
    deliveryCharge: 40,
    updatedAt: now - 10000,
  };

  // Current rider is r_11 (rank 11, outside top 10)
  const board = calculateWeeklyLeaderboard(allOrders, allRiders, 'r_11', 25, now, 10);
  assert.equal(board.topRiders.length, 10);
  assert.equal(board.topRiders[0].riderUid, 'r_1');
  assert.equal(board.topRiders[0].rank, 1);
  assert.equal(board.topRiders[0].deliveredTrips, 12);
  assert.equal(board.topRiders[9].riderUid, 'r_10');
  assert.equal(board.topRiders[9].rank, 10);
  assert.equal(board.topRiders[9].deliveredTrips, 3);

  assert.ok(board.currentRiderEntry);
  assert.equal(board.currentRiderEntry.rank, 11);
  assert.equal(board.currentRiderEntry.deliveredTrips, 2); // batch extra didn't inflate trip count
  assert.equal(board.currentRiderEntry.deliveredOrders, 3);
  assert.equal(board.totalFleetTripsThisWeek, 78); // 12+11+...+1 = 78
});

test('isValidShiftHours, formatShiftTime12h, and evaluateShiftCompliance handle daytime, overnight, boundaries, and toggles', () => {
  assert.equal(isValidShiftHours('08:00', '20:00').valid, true);
  assert.equal(isValidShiftHours('22:00', '06:00').valid, true); // overnight
  assert.equal(isValidShiftHours('09:00', '09:00').valid, false); // identical
  assert.equal(isValidShiftHours('25:00', '20:00').valid, false); // invalid HH

  assert.equal(formatShiftTime12h('00:05'), '12:05 AM');
  assert.equal(formatShiftTime12h('08:00'), '8:00 AM');
  assert.equal(formatShiftTime12h('12:30'), '12:30 PM');
  assert.equal(formatShiftTime12h('20:00'), '8:00 PM');

  const dayShift = {enabled: true, startTime: '08:00', endTime: '20:00'};
  // Exact start boundary (08:00) -> within shift
  assert.equal(
    evaluateShiftCompliance(dayShift, true, new Date('2026-11-14T08:00:00').getTime()).isOvertimeOnDuty,
    false,
  );
  // Exact end boundary (20:00) -> outside shift (end exclusive)
  const atEnd = evaluateShiftCompliance(dayShift, true, new Date('2026-11-14T20:00:00').getTime());
  assert.equal(atEnd.isWithinShift, false);
  assert.equal(atEnd.isOvertimeOnDuty, true);

  // Offline rider outside shift -> NOT overtime on duty
  assert.equal(
    evaluateShiftCompliance(dayShift, false, new Date('2026-11-14T21:30:00').getTime()).isOvertimeOnDuty,
    false,
  );

  // Disabled shift alert -> NOT overtime on duty
  assert.equal(
    evaluateShiftCompliance({...dayShift, enabled: false}, true, new Date('2026-11-14T21:30:00').getTime())
      .isOvertimeOnDuty,
    false,
  );

  // Overnight shift (22:00 - 06:00)
  const nightShift = {enabled: true, startTime: '22:00', endTime: '06:00'};
  assert.equal(
    evaluateShiftCompliance(nightShift, true, new Date('2026-11-14T23:45:00').getTime()).isWithinShift,
    true,
  );
  assert.equal(
    evaluateShiftCompliance(nightShift, true, new Date('2026-11-15T02:15:00').getTime()).isWithinShift,
    true,
  );
  assert.equal(
    evaluateShiftCompliance(nightShift, true, new Date('2026-11-14T14:00:00').getTime()).isOvertimeOnDuty,
    true,
  );
});

test('buildDeliveryQrPayload and validateDeliveryQrPayload verify JSON, URI, prefix, plain PIN, and real QR matrix decode', () => {
  const trip = {
    tripId: 'trip_demo_route_902',
    deliveryOtp: '6412',
    orders: [
      {orderId: 'ord_demo_201', deliveryOtp: '6412'},
      {orderId: 'ord_demo_202', deliveryOtp: '6412'},
    ],
  };

  // Canonical customer app JSON QR
  const jsonPayload = buildDeliveryQrPayload(trip.tripId, '6412');
  assert.equal(validateDeliveryQrPayload(jsonPayload, trip).valid, true);

  // Order-scoped JSON QR
  assert.equal(
    validateDeliveryQrPayload(JSON.stringify({orderId: 'ord_demo_202', pin: '6412'}), trip).valid,
    true,
  );

  // URI and GBZ-DELIVER formats + plain PIN
  assert.equal(
    validateDeliveryQrPayload('gossaigaon://deliver?tripId=trip_demo_route_902&otp=6412', trip).valid,
    true,
  );
  assert.equal(
    validateDeliveryQrPayload('GBZ-DELIVER:trip_demo_route_902:6412', trip).valid,
    true,
  );
  assert.equal(validateDeliveryQrPayload('6412', trip).valid, true);

  // Mismatched tripId, orderId, or wrong PIN must fail with explicit reasons
  assert.equal(
    validateDeliveryQrPayload(buildDeliveryQrPayload('trip_other_999', '6412'), trip).valid,
    false,
  );
  assert.equal(
    validateDeliveryQrPayload(JSON.stringify({orderId: 'ord_unknown', otp: '6412'}), trip).valid,
    false,
  );
  assert.equal(
    validateDeliveryQrPayload(buildDeliveryQrPayload(trip.tripId, '0000'), trip).valid,
    false,
  );
  assert.equal(validateDeliveryQrPayload('random-unrelated-qr-text', trip).valid, false);

  // End-to-end QR encoding (QRCode.create) -> RGBA raster -> jsQR decode -> validateDeliveryQrPayload
  const qr = QRCode.create(jsonPayload, {errorCorrectionLevel: 'M'});
  const size = qr.modules.size;
  const scale = 4;
  const margin = 4;
  const imgSize = (size + margin * 2) * scale;
  const rgba = new Uint8ClampedArray(imgSize * imgSize * 4);
  rgba.fill(255);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.modules.get(r, c)) {
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const y = (r + margin) * scale + dy;
            const x = (c + margin) * scale + dx;
            const idx = (y * imgSize + x) * 4;
            rgba[idx] = 0;
            rgba[idx + 1] = 0;
            rgba[idx + 2] = 0;
            rgba[idx + 3] = 255;
          }
        }
      }
    }
  }
  const decoded = jsQR(rgba, imgSize, imgSize);
  assert.ok(decoded && decoded.data);
  assert.equal(validateDeliveryQrPayload(decoded.data, trip).valid, true);
});

test('evaluateBatteryGpsPolicy reduces GPS frequency at low battery while preserving active delivery accuracy', () => {
  // Healthy battery -> 5s high accuracy
  const healthy = evaluateBatteryGpsPolicy({supported: true, levelPercent: 80, charging: false}, true);
  assert.equal(healthy.mode, 'HIGH_ACCURACY');
  assert.equal(healthy.intervalMs, 5000);
  assert.equal(healthy.enableHighAccuracy, true);

  // Low battery (20%) while charging -> full 5s high accuracy restored
  const chargingLow = evaluateBatteryGpsPolicy({supported: true, levelPercent: 12, charging: true}, false);
  assert.equal(chargingLow.mode, 'HIGH_ACCURACY');
  assert.equal(chargingLow.intervalMs, 5000);

  // Low battery (20%, active delivery) -> 15s Eco GPS with high accuracy preserved
  const lowActive = evaluateBatteryGpsPolicy({supported: true, levelPercent: 20, charging: false}, true);
  assert.equal(lowActive.mode, 'POWER_SAVER');
  assert.equal(lowActive.intervalMs, 15000);
  assert.equal(lowActive.enableHighAccuracy, true);

  // Low battery (20%, idle) -> 20s Eco GPS
  const lowIdle = evaluateBatteryGpsPolicy({supported: true, levelPercent: 20, charging: false}, false);
  assert.equal(lowIdle.mode, 'POWER_SAVER');
  assert.equal(lowIdle.intervalMs, 20000);

  // Critical battery (10%, active delivery) -> 25s Safe Saver still keeps enableHighAccuracy true for safety
  const criticalActive = evaluateBatteryGpsPolicy({supported: true, levelPercent: 10, charging: false}, true);
  assert.equal(criticalActive.mode, 'CRITICAL_SAVER');
  assert.equal(criticalActive.intervalMs, 25000);
  assert.equal(criticalActive.enableHighAccuracy, true);

  // Critical battery (10%, idle) -> 45s Deep Saver balanced coarse sync
  const criticalIdle = evaluateBatteryGpsPolicy({supported: true, levelPercent: 10, charging: false}, false);
  assert.equal(criticalIdle.mode, 'CRITICAL_SAVER');
  assert.equal(criticalIdle.intervalMs, 45000);
  assert.equal(criticalIdle.enableHighAccuracy, false);

  // Unsupported browser Battery API -> safe 5s default
  const unsupported = evaluateBatteryGpsPolicy({supported: false, levelPercent: null, charging: false}, true);
  assert.equal(unsupported.mode, 'HIGH_ACCURACY');
  assert.equal(unsupported.intervalMs, 5000);
});

test('shouldShowPowerBankBanner triggers strictly below 15% when not charging', () => {
  assert.equal(shouldShowPowerBankBanner({supported: false, levelPercent: 10, charging: false}), false);
  assert.equal(shouldShowPowerBankBanner({supported: true, levelPercent: null, charging: false}), false);
  assert.equal(shouldShowPowerBankBanner({supported: true, levelPercent: 16, charging: false}), false);
  assert.equal(shouldShowPowerBankBanner({supported: true, levelPercent: 15, charging: false}), false);
  assert.equal(shouldShowPowerBankBanner({supported: true, levelPercent: 14, charging: false}), true);
  assert.equal(shouldShowPowerBankBanner({supported: true, levelPercent: 5, charging: false}), true);
  assert.equal(shouldShowPowerBankBanner({supported: true, levelPercent: 10, charging: true}), false);
});

test('evaluateBatteryGpsPolicy returns MANUAL_PAUSED and auto-GPS preference persists safely', () => {
  const paused = evaluateBatteryGpsPolicy({supported: true, levelPercent: 90, charging: false}, true, false);
  assert.equal(paused.mode, 'MANUAL_PAUSED');
  assert.equal(paused.intervalMs, 0);
  assert.equal(paused.badgeLabel, 'Manual Only');

  const store = new Map<string, string>();
  const origLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    },
  });

  try {
    assert.equal(readAutoGpsEnabled(), true);
    saveAutoGpsEnabled(false);
    assert.equal(store.get(AUTO_GPS_STORAGE_KEY), '0');
    assert.equal(readAutoGpsEnabled(), false);
    saveAutoGpsEnabled(true);
    assert.equal(readAutoGpsEnabled(), true);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: origLocalStorage,
    });
  }
});
