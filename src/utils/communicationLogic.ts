import type {
  CallInboxRecord,
  CallParticipantRole,
  ChatChannel,
  InAppCallRecord,
  InAppCallStatus,
  OrderRecord,
  OrderWithId,
  StoreInfo,
  TripChatMessage,
} from '../types/rider';
import {sanitizeText} from './riderLogic';

export const INCOMING_CALL_FRESHNESS_MS = 60_000;
export const OUTGOING_RING_TIMEOUT_MS = 45_000;
export const MAX_CHAT_MESSAGE_LENGTH = 500;

export const ELIGIBLE_COMMUNICATION_STATUSES = new Set([
  'ACCEPTED_BY_RIDER',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  // Existing order lifecycle pre-pickup states once riderAccepted === true
  'ACCEPTED',
  'PREPARING',
  'PLACED',
  'ASSIGNED',
]);

export function normalizeOrderStatusForComms(rawStatus: unknown): string {
  return String(rawStatus || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export function resolveCustomerIdentity(order: OrderRecord | null | undefined): {
  uid: string;
  label: string;
  photo: string;
} {
  const uid = String(order?.customerUid || '').trim();
  const rawLabel = sanitizeText(order?.customerName || order?.customerLabel || '').trim();
  return {
    uid,
    label: rawLabel || (uid ? `Customer #${uid.slice(-4)}` : 'Customer'),
    photo: sanitizeText(order?.customerPhoto || '').trim(),
  };
}

export function resolveRestaurantIdentity(
  order: OrderRecord | null | undefined,
  stores: Record<string, StoreInfo>,
): {
  uid: string;
  name: string;
  photo: string;
} {
  const storeId = String(order?.restaurantId || '').trim();
  const store = (storeId ? stores[storeId] : undefined) || {};
  const uid = String(
    order?.restaurantUid || store.restaurantUid || store.ownerUid || store.uid || storeId,
  ).trim();
  const name =
    sanitizeText(order?.restaurantName || store.name || '').trim() || 'Partner Store';
  const photo = sanitizeText(
    order?.restaurantPhoto || store.image || store.photoURL || store.logo || '',
  ).trim();
  return {uid, name, photo};
}

export function isOrderEligibleForCommunication(params: {
  riderUid: string | null | undefined;
  isRiderApproved: boolean;
  order: OrderRecord | null | undefined;
}): boolean {
  const riderUid = String(params.riderUid || '').trim();
  const order = params.order;
  if (!riderUid || !params.isRiderApproved || !order) return false;
  if (String(order.deliveryUid || '').trim() !== riderUid) return false;
  if (order.riderAccepted !== true) return false;

  const status = normalizeOrderStatusForComms(order.status);
  if (status === 'DELIVERED' || status === 'CANCELLED' || status === 'COMPLETED') {
    return false;
  }
  return ELIGIBLE_COMMUNICATION_STATUSES.has(status);
}

export function canCommunicateWithCustomer(params: {
  riderUid: string | null | undefined;
  isRiderApproved: boolean;
  order: OrderRecord | null | undefined;
}): boolean {
  if (!isOrderEligibleForCommunication(params)) return false;
  return Boolean(resolveCustomerIdentity(params.order).uid);
}

export function canCommunicateWithRestaurant(params: {
  riderUid: string | null | undefined;
  isRiderApproved: boolean;
  order: OrderRecord | null | undefined;
  stores: Record<string, StoreInfo>;
}): boolean {
  if (!isOrderEligibleForCommunication(params)) return false;
  return Boolean(resolveRestaurantIdentity(params.order, params.stores).uid);
}

export function generateCallId(nowMs = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `call_${nowMs}_${rand}`;
}

export function buildCustomerOutgoingCallPayload(params: {
  callId?: string;
  order: OrderWithId;
  riderUid: string;
  riderName: string;
  riderPhoto?: string;
  nowMs?: number;
}): {
  callRecord: InAppCallRecord;
  inboxRecord: CallInboxRecord;
} {
  const now = params.nowMs ?? Date.now();
  const callId = params.callId || generateCallId(now);
  const customer = resolveCustomerIdentity(params.order);
  const tripId = String(params.order.batchGroupId || params.order.orderId);
  const riderName = sanitizeText(params.riderName || 'Chutki Rider');

  const callRecord: InAppCallRecord = {
    callId,
    tripId,
    orderId: params.order.orderId,
    callerRole: 'RIDER',
    calleeRole: 'CUSTOMER',
    riderUid: params.riderUid,
    riderName,
    riderPhoto: params.riderPhoto || '',
    customerUid: customer.uid,
    customerLabel: customer.label,
    customerPhoto: customer.photo,
    status: 'RINGING',
    customerAnswered: false,
    isMuted: false,
    isOnHold: false,
    startedAt: now,
    updatedAt: now,
  };

  const inboxRecord: CallInboxRecord = {
    callId,
    tripId,
    orderId: params.order.orderId,
    callerRole: 'RIDER',
    calleeRole: 'CUSTOMER',
    riderUid: params.riderUid,
    riderName,
    customerUid: customer.uid,
    customerLabel: customer.label,
    callerPhoto: params.riderPhoto || '',
    status: 'RINGING',
    customerAnswered: false,
    isMuted: false,
    isOnHold: false,
    startedAt: now,
    updatedAt: now,
  };

  return {callRecord, inboxRecord};
}

export function buildRestaurantOutgoingCallPayload(params: {
  callId?: string;
  order: OrderWithId;
  stores: Record<string, StoreInfo>;
  riderUid: string;
  riderName: string;
  riderPhoto?: string;
  nowMs?: number;
}): {
  callRecord: InAppCallRecord;
  inboxRecord: CallInboxRecord;
} {
  const now = params.nowMs ?? Date.now();
  const callId = params.callId || generateCallId(now);
  const restaurant = resolveRestaurantIdentity(params.order, params.stores);
  const tripId = String(params.order.batchGroupId || params.order.orderId);
  const riderName = sanitizeText(params.riderName || 'Chutki Rider');

  const callRecord: InAppCallRecord = {
    callId,
    tripId,
    orderId: params.order.orderId,
    callerRole: 'RIDER',
    calleeRole: 'RESTAURANT',
    riderUid: params.riderUid,
    riderName,
    riderPhoto: params.riderPhoto || '',
    restaurantUid: restaurant.uid,
    restaurantName: restaurant.name,
    restaurantPhoto: restaurant.photo,
    status: 'RINGING',
    restaurantAnswered: false,
    isMuted: false,
    isOnHold: false,
    startedAt: now,
    updatedAt: now,
  };

  const inboxRecord: CallInboxRecord = {
    callId,
    tripId,
    orderId: params.order.orderId,
    callerRole: 'RIDER',
    calleeRole: 'RESTAURANT',
    riderUid: params.riderUid,
    riderName,
    restaurantUid: restaurant.uid,
    restaurantName: restaurant.name,
    callerPhoto: params.riderPhoto || '',
    status: 'RINGING',
    restaurantAnswered: false,
    isMuted: false,
    isOnHold: false,
    startedAt: now,
    updatedAt: now,
  };

  return {callRecord, inboxRecord};
}

export interface IncomingCallValidationResult {
  valid: boolean;
  reason?: string;
  callerRole?: 'CUSTOMER' | 'RESTAURANT';
  callId?: string;
  orderId?: string;
  displayName?: string;
  displayPhoto?: string;
}

export function validateIncomingCallPopup(params: {
  inboxEntry: Partial<CallInboxRecord> | null | undefined;
  inAppCall: Partial<InAppCallRecord> | null | undefined;
  riderUid: string;
  assignedOrders: Record<string, OrderRecord>;
  stores: Record<string, StoreInfo>;
  nowMs?: number;
}): IncomingCallValidationResult {
  const now = params.nowMs ?? Date.now();
  const entry = params.inboxEntry;
  const call = params.inAppCall;
  if (!entry || !entry.callId || !entry.orderId) {
    return {valid: false, reason: 'Missing call inbox metadata.'};
  }
  const source = call && call.callId === entry.callId ? call : entry;
  const callerRole = source.callerRole;
  if (callerRole !== 'CUSTOMER' && callerRole !== 'RESTAURANT') {
    return {valid: false, reason: 'Ignored non-incoming callerRole.'};
  }
  if (source.status !== 'RINGING') {
    return {valid: false, reason: `Call status is ${source.status}, not RINGING.`};
  }
  if (!source.callId || String(source.callId).trim().length < 5) {
    return {valid: false, reason: 'Invalid callId.'};
  }
  if (String(source.riderUid || '') !== params.riderUid) {
    return {valid: false, reason: 'Call riderUid does not match logged-in rider.'};
  }
  const updatedAt = Number(source.updatedAt || source.startedAt || 0);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0 || Math.abs(now - updatedAt) > INCOMING_CALL_FRESHNESS_MS) {
    return {valid: false, reason: 'Incoming call invitation expired (> 60s).'};
  }

  const order = params.assignedOrders[entry.orderId];
  if (!order || String(order.deliveryUid || '') !== params.riderUid) {
    return {valid: false, reason: 'Order does not belong to logged-in rider.'};
  }

  const status = normalizeOrderStatusForComms(order.status);
  if (status === 'DELIVERED' || status === 'CANCELLED') {
    return {valid: false, reason: 'Order already completed or cancelled.'};
  }

  if (callerRole === 'CUSTOMER') {
    const customer = resolveCustomerIdentity(order);
    if (source.customerUid && customer.uid && source.customerUid !== customer.uid) {
      return {valid: false, reason: 'Customer UID mismatch on order.'};
    }
    return {
      valid: true,
      callerRole: 'CUSTOMER',
      callId: String(source.callId),
      orderId: entry.orderId,
      displayName: sanitizeText(source.customerLabel || customer.label) || 'Customer',
      displayPhoto: sanitizeText(
        (call?.customerPhoto || entry.callerPhoto || customer.photo || '').trim(),
      ),
    };
  }

  // RESTAURANT caller verification
  const restaurant = resolveRestaurantIdentity(order, params.stores);
  const incomingRestUid = String(source.restaurantUid || '').trim();
  const validRestaurantCandidates = new Set(
    [
      order.restaurantUid,
      order.restaurantId,
      restaurant.uid,
      params.stores[order.restaurantId || '']?.ownerUid,
      params.stores[order.restaurantId || '']?.restaurantUid,
    ]
      .filter(Boolean)
      .map((v) => String(v).trim()),
  );
  if (!incomingRestUid || !validRestaurantCandidates.has(incomingRestUid)) {
    return {valid: false, reason: 'Restaurant is not authorized for this order.'};
  }

  return {
    valid: true,
    callerRole: 'RESTAURANT',
    callId: String(source.callId),
    orderId: entry.orderId,
    displayName: sanitizeText(source.restaurantName || restaurant.name) || 'Restaurant',
    displayPhoto: sanitizeText(
      (call?.restaurantPhoto || entry.callerPhoto || restaurant.photo || '').trim(),
    ),
  };
}

export function buildAnswerCallPatch(params: {
  callerRole: 'CUSTOMER' | 'RESTAURANT';
  nowMs?: number;
}): Partial<InAppCallRecord> {
  const now = params.nowMs ?? Date.now();
  if (params.callerRole === 'CUSTOMER') {
    return {
      status: 'CONNECTED',
      customerAnswered: true,
      connectedAt: now,
      updatedAt: now,
    };
  }
  return {
    status: 'CONNECTED',
    restaurantAnswered: true,
    connectedAt: now,
    updatedAt: now,
  };
}

export function buildDeclineCallPatch(params: {
  callerRole: 'CUSTOMER' | 'RESTAURANT';
  nowMs?: number;
}): Partial<InAppCallRecord> {
  const now = params.nowMs ?? Date.now();
  if (params.callerRole === 'CUSTOMER') {
    return {
      status: 'DECLINED',
      customerAnswered: false,
      endedAt: now,
      updatedAt: now,
      endReason: 'DECLINED_BY_RIDER',
    };
  }
  return {
    status: 'DECLINED',
    restaurantAnswered: false,
    endedAt: now,
    updatedAt: now,
    endReason: 'DECLINED_BY_RIDER',
  };
}

export function buildEndCallPatch(params: {
  status?: InAppCallStatus;
  reason?: string;
  nowMs?: number;
}): Partial<InAppCallRecord> {
  const now = params.nowMs ?? Date.now();
  return {
    status: params.status || 'ENDED',
    endedAt: now,
    updatedAt: now,
    endReason: params.reason || 'HANGUP',
  };
}

export function buildRiderChatMessagePayload(params: {
  messageId: string;
  riderUid: string;
  receiverUid: string;
  channel: ChatChannel;
  rawText: string;
  nowMs?: number;
}): {valid: boolean; reason?: string; payload?: TripChatMessage} {
  const cleaned = sanitizeText(params.rawText).trim();
  if (!cleaned) {
    return {valid: false, reason: 'Please enter a message before sending.'};
  }
  if (cleaned.length > MAX_CHAT_MESSAGE_LENGTH) {
    return {
      valid: false,
      reason: `Message cannot exceed ${MAX_CHAT_MESSAGE_LENGTH} characters.`,
    };
  }
  if (!params.riderUid || !params.receiverUid) {
    return {valid: false, reason: 'Participant identity missing for this chat.'};
  }

  const now = params.nowMs ?? Date.now();
  return {
    valid: true,
    payload: {
      messageId: params.messageId,
      senderUid: params.riderUid,
      senderRole: 'RIDER',
      receiverUid: params.receiverUid,
      channel: params.channel,
      messageType: 'TEXT',
      message: cleaned,
      timestamp: now,
      status: 'SENT',
    },
  };
}

export function filterOrderChannelMessages(
  rawMessages: Record<string, Partial<TripChatMessage>> | null | undefined,
  channel: ChatChannel,
  riderUid: string,
  peerUid: string,
): TripChatMessage[] {
  if (!rawMessages || !riderUid) return [];
  const expectedPeerRole: CallParticipantRole =
    channel === 'RIDER_CUSTOMER' ? 'CUSTOMER' : 'RESTAURANT';

  return Object.entries(rawMessages)
    .map(([id, msg]) => ({
      messageId: String(msg.messageId || id),
      senderUid: String(msg.senderUid || ''),
      senderRole: (msg.senderRole || 'RIDER') as CallParticipantRole,
      receiverUid: String(msg.receiverUid || ''),
      channel: msg.channel as ChatChannel,
      messageType: 'TEXT' as const,
      message: sanitizeText(msg.message || ''),
      timestamp: Number(msg.timestamp || 0),
      status: (msg.status || 'SENT') as TripChatMessage['status'],
      deliveredAt: msg.deliveredAt ? Number(msg.deliveredAt) : undefined,
      readAt: msg.readAt ? Number(msg.readAt) : undefined,
      clientMsgId: msg.clientMsgId,
    }))
    .filter((m) => {
      if (m.channel !== channel) return false;
      if (!m.message) return false;
      const isValidParticipantPair =
        (m.senderUid === riderUid &&
          m.senderRole === 'RIDER' &&
          (!peerUid || m.receiverUid === peerUid)) ||
        (m.receiverUid === riderUid &&
          m.senderRole === expectedPeerRole &&
          (!peerUid || m.senderUid === peerUid));
      return isValidParticipantPair;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function countUnreadChannelMessages(
  rawMessages: Record<string, Partial<TripChatMessage>> | null | undefined,
  channel: ChatChannel,
  riderUid: string,
  peerUid = '',
): number {
  const list = filterOrderChannelMessages(rawMessages, channel, riderUid, peerUid);
  return list.filter(
    (m) => m.senderUid !== riderUid && m.receiverUid === riderUid && m.status !== 'READ',
  ).length;
}

export function formatCallDuration(connectedAtMs: number | null | undefined, nowMs = Date.now()): string {
  if (!connectedAtMs || !Number.isFinite(connectedAtMs) || nowMs <= connectedAtMs) {
    return '00:00';
  }
  const totalSec = Math.max(0, Math.floor((nowMs - connectedAtMs) / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}
