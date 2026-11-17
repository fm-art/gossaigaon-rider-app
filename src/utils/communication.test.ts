import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type {OrderRecord, OrderWithId, StoreInfo, TripChatMessage} from '../types/rider';
import {
  buildAnswerCallPatch,
  buildCustomerOutgoingCallPayload,
  buildDeclineCallPatch,
  buildEndCallPatch,
  buildRestaurantOutgoingCallPayload,
  buildRiderChatMessagePayload,
  canCommunicateWithCustomer,
  canCommunicateWithRestaurant,
  countUnreadChannelMessages,
  filterOrderChannelMessages,
  formatCallDuration,
  generateCallId,
  isOrderEligibleForCommunication,
  validateIncomingCallPopup,
} from './communicationLogic';
import {resolveRtcIceServers} from './webrtcVoiceEngine';

const sampleStores: Record<string, StoreInfo> = {
  store_1: {
    name: 'Bazar Fresh Kitchen',
    ownerUid: 'rest_owner_1',
    image: 'https://cdn.example.com/store1.jpg',
    address: 'Main Road, Gossaigaon',
  },
  store_2: {
    name: 'Green Mart',
    restaurantUid: 'rest_owner_2',
  },
};

function makeActiveOrder(overrides: Partial<OrderRecord> = {}): OrderWithId {
  return {
    orderId: 'order_1001',
    batchGroupId: 'batch_900',
    deliveryUid: 'rider_1',
    customerUid: 'cust_1',
    customerName: 'Aarav Ray',
    customerPhoto: 'https://cdn.example.com/cust1.jpg',
    restaurantId: 'store_1',
    restaurantUid: 'rest_owner_1',
    restaurantName: 'Bazar Fresh Kitchen',
    riderAccepted: true,
    status: 'READY_FOR_PICKUP',
    totalAmount: 450,
    ...overrides,
  };
}

test('Communication eligibility enforces auth, approval, ownership, acceptance, and active status', () => {
  const active = makeActiveOrder({status: 'PICKED_UP'});
  assert.equal(
    isOrderEligibleForCommunication({riderUid: 'rider_1', isRiderApproved: true, order: active}),
    true,
  );
  assert.equal(
    isOrderEligibleForCommunication({riderUid: 'rider_1', isRiderApproved: false, order: active}),
    false,
  );
  assert.equal(
    isOrderEligibleForCommunication({riderUid: 'rider_other', isRiderApproved: true, order: active}),
    false,
  );
  assert.equal(
    isOrderEligibleForCommunication({
      riderUid: 'rider_1',
      isRiderApproved: true,
      order: makeActiveOrder({riderAccepted: false}),
    }),
    false,
  );

  for (const status of ['accepted_by_rider', 'ready_for_pickup', 'picked_up', 'out_for_delivery']) {
    const order = makeActiveOrder({status});
    assert.equal(
      canCommunicateWithCustomer({riderUid: 'rider_1', isRiderApproved: true, order}),
      true,
    );
    assert.equal(
      canCommunicateWithRestaurant({
        riderUid: 'rider_1',
        isRiderApproved: true,
        order,
        stores: sampleStores,
      }),
      true,
    );
  }

  for (const terminal of ['DELIVERED', 'CANCELLED', 'COMPLETED']) {
    const order = makeActiveOrder({status: terminal});
    assert.equal(
      canCommunicateWithCustomer({riderUid: 'rider_1', isRiderApproved: true, order}),
      false,
    );
    assert.equal(
      canCommunicateWithRestaurant({
        riderUid: 'rider_1',
        isRiderApproved: true,
        order,
        stores: sampleStores,
      }),
      false,
    );
  }
});

test('Outgoing Customer & Restaurant call payloads follow required RTDB structure without exposing phone numbers', () => {
  const nowMs = 1763360000000;
  const callId = generateCallId(nowMs);
  assert.ok(callId.startsWith(`call_${nowMs}_`));

  const order = makeActiveOrder({phone: '9999988888'});
  const custCall = buildCustomerOutgoingCallPayload({
    callId,
    order,
    riderUid: 'rider_1',
    riderName: 'Bipin Rider',
    riderPhoto: 'https://cdn.example.com/rider1.jpg',
    nowMs,
  });

  assert.equal(custCall.callRecord.callId, callId);
  assert.equal(custCall.callRecord.tripId, 'batch_900');
  assert.equal(custCall.callRecord.orderId, 'order_1001');
  assert.equal(custCall.callRecord.callerRole, 'RIDER');
  assert.equal(custCall.callRecord.calleeRole, 'CUSTOMER');
  assert.equal(custCall.callRecord.customerUid, 'cust_1');
  assert.equal(custCall.callRecord.status, 'RINGING');
  assert.equal(custCall.callRecord.customerAnswered, false);
  assert.equal(custCall.callRecord.startedAt, nowMs);
  assert.equal(custCall.inboxRecord.customerUid, 'cust_1');
  assert.equal('phone' in custCall.callRecord, false);
  assert.equal(JSON.stringify(custCall).includes('9999988888'), false);

  const restCall = buildRestaurantOutgoingCallPayload({
    callId,
    order,
    stores: sampleStores,
    riderUid: 'rider_1',
    riderName: 'Bipin Rider',
    nowMs,
  });

  assert.equal(restCall.callRecord.callerRole, 'RIDER');
  assert.equal(restCall.callRecord.calleeRole, 'RESTAURANT');
  assert.equal(restCall.callRecord.restaurantUid, 'rest_owner_1');
  assert.equal(restCall.callRecord.restaurantName, 'Bazar Fresh Kitchen');
  assert.equal(restCall.callRecord.restaurantAnswered, false);
  assert.equal(restCall.inboxRecord.restaurantUid, 'rest_owner_1');
});

test('Incoming call popup validation enforces role, RINGING state, ownership, restaurant auth, and <= 60s expiry', () => {
  const now = 1763360050000;
  const assignedOrders: Record<string, OrderRecord> = {
    order_1001: makeActiveOrder({status: 'OUT_FOR_DELIVERY'}),
  };

  // Valid incoming customer call
  const validCustomer = validateIncomingCallPopup({
    inboxEntry: {
      callId: 'call_cust_1',
      orderId: 'order_1001',
      callerRole: 'CUSTOMER',
      riderUid: 'rider_1',
      customerUid: 'cust_1',
      customerLabel: 'Aarav Ray',
      status: 'RINGING',
      startedAt: now - 5000,
      updatedAt: now - 5000,
    },
    inAppCall: null,
    riderUid: 'rider_1',
    assignedOrders,
    stores: sampleStores,
    nowMs: now,
  });
  assert.equal(validCustomer.valid, true);
  assert.equal(validCustomer.callerRole, 'CUSTOMER');

  // Expired (> 60s)
  const expiredCall = validateIncomingCallPopup({
    inboxEntry: {
      callId: 'call_cust_old',
      orderId: 'order_1001',
      callerRole: 'CUSTOMER',
      riderUid: 'rider_1',
      customerUid: 'cust_1',
      status: 'RINGING',
      updatedAt: now - 65_000,
    },
    inAppCall: null,
    riderUid: 'rider_1',
    assignedOrders,
    stores: sampleStores,
    nowMs: now,
  });
  assert.equal(expiredCall.valid, false);

  // Unauthorized restaurant UID
  const rogueRest = validateIncomingCallPopup({
    inboxEntry: {
      callId: 'call_rest_rogue',
      orderId: 'order_1001',
      callerRole: 'RESTAURANT',
      riderUid: 'rider_1',
      restaurantUid: 'rogue_store_999',
      status: 'RINGING',
      updatedAt: now - 3000,
    },
    inAppCall: null,
    riderUid: 'rider_1',
    assignedOrders,
    stores: sampleStores,
    nowMs: now,
  });
  assert.equal(rogueRest.valid, false);

  // Valid authorized restaurant call
  const validRest = validateIncomingCallPopup({
    inboxEntry: {
      callId: 'call_rest_1',
      orderId: 'order_1001',
      callerRole: 'RESTAURANT',
      riderUid: 'rider_1',
      restaurantUid: 'rest_owner_1',
      restaurantName: 'Bazar Fresh Kitchen',
      status: 'RINGING',
      updatedAt: now - 2000,
    },
    inAppCall: null,
    riderUid: 'rider_1',
    assignedOrders,
    stores: sampleStores,
    nowMs: now,
  });
  assert.equal(validRest.valid, true);
  assert.equal(validRest.callerRole, 'RESTAURANT');
});

test('Answer, decline, end patches and real call duration timer formatting are genuine', () => {
  const ansCust = buildAnswerCallPatch({callerRole: 'CUSTOMER', nowMs: 1000});
  assert.equal(ansCust.status, 'CONNECTED');
  assert.equal(ansCust.customerAnswered, true);

  const ansRest = buildAnswerCallPatch({callerRole: 'RESTAURANT', nowMs: 1000});
  assert.equal(ansRest.status, 'CONNECTED');
  assert.equal(ansRest.restaurantAnswered, true);

  const decCust = buildDeclineCallPatch({callerRole: 'CUSTOMER', nowMs: 2000});
  assert.equal(decCust.status, 'DECLINED');
  assert.equal(decCust.customerAnswered, false);

  const endCall = buildEndCallPatch({status: 'ENDED', reason: 'HUNG_UP', nowMs: 3000});
  assert.equal(endCall.status, 'ENDED');
  assert.equal(endCall.endedAt, 3000);

  // Never simulate elapsed time before actual WebRTC connection
  assert.equal(formatCallDuration(null, 50000), '00:00');
  assert.equal(formatCallDuration(10000, 10000), '00:00');
  assert.equal(formatCallDuration(10000, 75000), '01:05');
});

test('Dual-channel chat strictly isolates RIDER_CUSTOMER and RIDER_RESTAURANT and counts unreads accurately', () => {
  const built = buildRiderChatMessagePayload({
    messageId: 'msg_1',
    riderUid: 'rider_1',
    receiverUid: 'cust_1',
    channel: 'RIDER_CUSTOMER',
    rawText: '<b>Arriving</b> in 2 mins',
    nowMs: 1000,
  });
  assert.equal(built.valid, true);
  assert.equal(built.payload?.channel, 'RIDER_CUSTOMER');
  assert.equal(built.payload?.senderRole, 'RIDER');
  assert.equal(built.payload?.message.includes('<b>'), false);

  const rawMsgs: Record<string, Partial<TripChatMessage>> = {
    m1: {
      messageId: 'm1',
      senderUid: 'cust_1',
      senderRole: 'CUSTOMER',
      receiverUid: 'rider_1',
      channel: 'RIDER_CUSTOMER',
      messageType: 'TEXT',
      message: 'Call at gate',
      timestamp: 100,
      status: 'DELIVERED',
    },
    m2: {
      messageId: 'm2',
      senderUid: 'rest_owner_1',
      senderRole: 'RESTAURANT',
      receiverUid: 'rider_1',
      channel: 'RIDER_RESTAURANT',
      messageType: 'TEXT',
      message: 'Parcel packed on counter 2',
      timestamp: 200,
      status: 'SENT',
    },
    m3: {
      messageId: 'm3',
      senderUid: 'cust_1',
      senderRole: 'CUSTOMER',
      receiverUid: 'rider_1',
      channel: 'RIDER_CUSTOMER',
      messageType: 'TEXT',
      message: 'Already read note',
      timestamp: 300,
      status: 'READ',
    },
    // Malicious cross-channel spoofed record
    m4: {
      messageId: 'm4',
      senderUid: 'cust_1',
      senderRole: 'CUSTOMER',
      receiverUid: 'rider_1',
      channel: 'RIDER_RESTAURANT',
      messageType: 'TEXT',
      message: 'Spoofed cross-channel message',
      timestamp: 400,
      status: 'SENT',
    },
  };

  const customerThread = filterOrderChannelMessages(
    rawMsgs,
    'RIDER_CUSTOMER',
    'rider_1',
    'cust_1',
  );
  assert.equal(customerThread.length, 2);
  assert.equal(
    customerThread.some((m) => m.message.includes('Parcel packed')),
    false,
  );

  const restaurantThread = filterOrderChannelMessages(
    rawMsgs,
    'RIDER_RESTAURANT',
    'rider_1',
    'rest_owner_1',
  );
  assert.equal(restaurantThread.length, 1);
  assert.equal(restaurantThread[0]?.message, 'Parcel packed on counter 2');

  assert.equal(countUnreadChannelMessages(rawMsgs, 'RIDER_CUSTOMER', 'rider_1', 'cust_1'), 1);
  assert.equal(
    countUnreadChannelMessages(rawMsgs, 'RIDER_RESTAURANT', 'rider_1', 'rest_owner_1'),
    1,
  );
});

test('WebRTC ICE server resolver includes STUN and dynamic TURN without hardcoded credentials', () => {
  const defaultIce = resolveRtcIceServers();
  assert.equal(defaultIce.length, 2);
  assert.equal(
    defaultIce.some((s) => String(s.urls).includes('stun.l.google.com')),
    true,
  );

  const withTurn = resolveRtcIceServers({
    dynamicTurnServers: [
      {urls: 'turn:turn.chutki.example:3478', username: 'u1', credential: 'c1'},
    ],
  });
  assert.equal(withTurn.length, 3);
  assert.equal(withTurn[2]?.username, 'u1');
});

test('database.rules.json defines valid JSON and strict zero-trust rules for VoIP and dual-channel chat', () => {
  const rulesPath = path.resolve(process.cwd(), 'database.rules.json');
  const raw = fs.readFileSync(rulesPath, 'utf8');
  const parsed = JSON.parse(raw) as {rules: Record<string, Record<string, unknown>>};

  assert.equal(parsed.rules['.read'], false);
  assert.equal(parsed.rules['.write'], false);
  assert.ok(parsed.rules.deliveryUsers);
  assert.ok(parsed.rules.inAppCalls);
  assert.ok(parsed.rules.riderCallInbox);
  assert.ok(parsed.rules.customerCallInbox);
  assert.ok(parsed.rules.restaurantCallInbox);
  assert.ok(parsed.rules.tripChats);

  const inAppOrderRule = parsed.rules.inAppCalls.$orderId as Record<string, unknown>;
  assert.equal(typeof inAppOrderRule['.read'], 'string');
  assert.equal(typeof inAppOrderRule['.write'], 'string');
  assert.ok(inAppOrderRule.webrtc);

  const chatMessagesRule = (parsed.rules.tripChats.$orderId as Record<string, unknown>)
    .messages as Record<string, unknown>;
  assert.deepEqual(chatMessagesRule['.indexOn'], [
    'channel',
    'timestamp',
    'senderUid',
    'receiverUid',
  ]);
  assert.equal(
    String(chatMessagesRule['.read']).includes("query.orderByChild == 'channel'"),
    true,
  );
});
