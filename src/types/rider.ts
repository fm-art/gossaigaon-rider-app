export type RiderTab = 'active' | 'map' | 'history' | 'earnings' | 'profile';

export interface RoutePoint {
  lat: number;
  lng: number;
  time: number;
}

export interface PreferredShiftHours {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type AccountStatus = 'active' | 'suspended';
export type AuthProviderType = 'password' | 'google';
export type AccessGateStatus = 'LOADING' | 'PENDING' | 'REJECTED' | 'SUSPENDED' | 'APPROVED';

export interface DeliveryUserProfile {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  profilePhoto: string;
  approvalStatus: ApprovalStatus;
  accountStatus: AccountStatus;
  authProvider: AuthProviderType;
  emailVerified?: boolean;
  rejectionReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RiderData {
  uid?: string;
  name?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  profilePhoto?: string;
  upiId?: string;
  vehicle?: string;
  approved?: boolean;
  approvalStatus?: ApprovalStatus;
  accountStatus?: AccountStatus;
  authProvider?: AuthProviderType;
  online?: boolean;
  suspended?: boolean;
  rejectionReason?: string;
  adminNote?: string;
  lat?: number;
  lng?: number;
  lastSeen?: number;
  lastLocationUpdate?: number;
  recentRoute?: RoutePoint[];
  ratingAvg?: number;
  ratingCount?: number;
  fcmToken?: string;
  preferredShift?: PreferredShiftHours;
  createdAt?: number;
  updatedAt?: number;
}

export interface OrderItem {
  name: string;
  qty: number;
  price?: number;
}

export interface RejectionRecord {
  riderName?: string;
  riderPhone?: string;
  reason?: string;
  timestamp?: number;
}

export interface OrderRecord {
  orderId?: string;
  batchGroupId?: string;
  customerUid?: string;
  customerName?: string;
  customerLabel?: string;
  customerPhoto?: string;
  deliveryUid?: string | null;
  restaurantId?: string;
  restaurantUid?: string;
  restaurantName?: string;
  restaurantPhoto?: string;
  phone?: string;
  address?: string;
  customerLat?: number | null;
  customerLng?: number | null;
  locationLink?: string;
  deliveryOtp?: string;
  pickupOtp?: string;
  paymentMode?: string;
  paymentStatus?: string;
  status?: string;
  totalAmount?: number;
  deliveryCharge?: number;
  items?: OrderItem[] | Record<string, OrderItem>;
  riderAccepted?: boolean | null;
  riderAcceptedAt?: number | null;
  assignedAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
  storePickupVerifiedAt?: number;
  emergencyAlert?: boolean;
  emergencyDetails?: string;
  rejectedByRiders?: Record<string, RejectionRecord>;
  riderLat?: number;
  riderLng?: number;
  lastLocationUpdate?: number;
  verificationMethod?: string;
  verifiedAt?: number;
}

export interface OrderWithId extends OrderRecord {
  orderId: string;
}

export interface StoreInfo {
  uid?: string;
  ownerUid?: string;
  restaurantUid?: string;
  name?: string;
  address?: string;
  phone?: string;
  image?: string;
  photoURL?: string;
  logo?: string;
  lat?: number;
  lng?: number;
}

export interface TripGroup {
  tripId: string;
  customerUid?: string;
  customerName?: string;
  customerPhoto?: string;
  phone: string;
  address: string;
  customerLat: number | null;
  customerLng: number | null;
  locationLink: string;
  deliveryOtp: string;
  paymentMode: string;
  paymentStatus: string;
  emergencyAlert: boolean;
  emergencyDetails: string;
  assignedAt: number;
  orders: OrderWithId[];
}

export type CallParticipantRole = 'RIDER' | 'CUSTOMER' | 'RESTAURANT';

export type InAppCallStatus =
  | 'RINGING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'ENDED'
  | 'DECLINED'
  | 'BUSY'
  | 'MISSED'
  | 'FAILED';

export interface WebRtcSdpPayload {
  callId: string;
  type: 'offer' | 'answer';
  sdp: string;
  createdByUid?: string;
  updatedAt: number;
}

export interface WebRtcIceCandidatePayload {
  callId: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
  createdAt: number;
}

export interface InAppCallWebRtcNode {
  offer?: WebRtcSdpPayload | null;
  answer?: WebRtcSdpPayload | null;
  callerCandidates?: Record<string, WebRtcIceCandidatePayload>;
  receiverCandidates?: Record<string, WebRtcIceCandidatePayload>;
}

export interface InAppCallRecord {
  callId: string;
  tripId: string;
  orderId: string;
  callerRole: CallParticipantRole;
  calleeRole?: CallParticipantRole;
  riderUid: string;
  riderName: string;
  riderPhoto?: string;
  customerUid?: string;
  customerLabel?: string;
  customerPhoto?: string;
  restaurantUid?: string;
  restaurantName?: string;
  restaurantPhoto?: string;
  status: InAppCallStatus;
  customerAnswered?: boolean;
  restaurantAnswered?: boolean;
  isMuted: boolean;
  isOnHold: boolean;
  startedAt: number;
  connectedAt?: number;
  endedAt?: number;
  updatedAt: number;
  endReason?: string;
  webrtc?: InAppCallWebRtcNode;
}

export interface CallInboxRecord {
  callId: string;
  tripId: string;
  orderId: string;
  callerRole: CallParticipantRole;
  calleeRole?: CallParticipantRole;
  riderUid: string;
  riderName: string;
  customerUid?: string;
  customerLabel?: string;
  restaurantUid?: string;
  restaurantName?: string;
  callerPhoto?: string;
  status: InAppCallStatus;
  customerAnswered?: boolean;
  restaurantAnswered?: boolean;
  isMuted?: boolean;
  isOnHold?: boolean;
  startedAt: number;
  updatedAt: number;
}

export type ChatChannel = 'RIDER_CUSTOMER' | 'RIDER_RESTAURANT';
export type ChatMessageStatus = 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface TripChatMessage {
  messageId: string;
  senderUid: string;
  senderRole: CallParticipantRole;
  receiverUid: string;
  channel: ChatChannel;
  messageType: 'TEXT';
  message: string;
  timestamp: number;
  status: ChatMessageStatus;
  deliveredAt?: number;
  readAt?: number;
  clientMsgId?: string;
}

export interface SettlementRecord {
  riderUid?: string;
  riderName?: string;
  amount: number;
  mode: string;
  utr?: string;
  status: string;
  createdAt?: number;
}

export interface RiderPayoutRecord {
  riderUid?: string;
  riderName?: string;
  riderPhone?: string;
  riderUpiId?: string;
  amount: number;
  status: string;
  adminRef?: string;
  createdAt?: number;
}

export interface RiderRating {
  customerName?: string;
  rating?: number;
  comment?: string;
  createdAt?: number;
}

export interface FeedbackRecord {
  role?: string;
  uid?: string;
  name?: string;
  phone?: string;
  subject: string;
  message: string;
  status: string;
  adminReply?: string;
  createdAt?: number;
}

export interface AdminSettings {
  upiId?: string;
  riderBaseFee?: number;
  deliveryCharge?: number;
  maxRiderCashLimit?: number;
  riderAcceptTimeoutSec?: number;
  minRiderPayout?: number;
  maxRiderPayout?: number;
  minRiderCodDeposit?: number;
  maxRiderCodDeposit?: number;
  allowRiderPassTrip?: boolean;
  allowRiderSos?: boolean;
  riderAnnouncement?: string;
  supportHours?: string;
  supportPhone?: string;
  supportWhatsapp?: string;
  webrtcIceServers?: RTCIceServer[];
}

export type ToastType = 'success' | 'danger' | 'info' | 'warning';

export interface ToastMessage {
  id: number;
  msg: string;
  type: ToastType;
}
