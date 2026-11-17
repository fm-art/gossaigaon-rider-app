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

export interface RiderData {
  name?: string;
  email?: string;
  phone?: string;
  upiId?: string;
  vehicle?: string;
  approved?: boolean;
  online?: boolean;
  suspended?: boolean;
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
  deliveryUid?: string | null;
  restaurantId?: string;
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
  name?: string;
  address?: string;
  phone?: string;
  lat?: number;
  lng?: number;
}

export interface TripGroup {
  tripId: string;
  customerUid?: string;
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
}

export type ToastType = 'success' | 'danger' | 'info' | 'warning';

export interface ToastMessage {
  id: number;
  msg: string;
  type: ToastType;
}
