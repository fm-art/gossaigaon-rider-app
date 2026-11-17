import type {
  AccessGateStatus,
  AccountStatus,
  ApprovalStatus,
  DeliveryUserProfile,
  RiderData,
} from '../types/rider';
import {isValidIndianMobile, sanitizeText} from './riderLogic';
import {stripUnsafeControlChars, validatePasswordStrength} from './security';

export const PENDING_APPROVAL_MESSAGE =
  'Your delivery account is waiting for Admin approval.';

export const CHUTKI_AUTH_THEME = {
  primaryGreen: '#2E9E4F',
  buttonGreen: '#108329',
  background: '#FFFFFF',
  inputBackground: '#F8FAFC',
  text: '#1F2933',
} as const;

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface CreateAccountInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  profilePhoto?: string;
}

export interface AccessGateEvaluation {
  gate: AccessGateStatus;
  approvalStatus: ApprovalStatus;
  accountStatus: AccountStatus;
  headline: string;
  message: string;
  reason?: string;
  needsPhoneCompletion: boolean;
}

export function isValidEmailAddress(email: unknown): boolean {
  const clean = stripUnsafeControlChars(email).trim();
  if (!clean || clean.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean);
}

export function normalizeIndianPhone(rawPhone: unknown): string {
  const digits = String(rawPhone ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

export function sanitizeProfilePhotoValue(rawPhoto: unknown): string {
  const raw = stripUnsafeControlChars(rawPhoto).trim();
  if (!raw) return '';
  if (raw.startsWith('data:image/')) {
    // Bound inline data URI size to protect Realtime Database writes
    if (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(raw) && raw.length <= 180_000) {
      return raw;
    }
    return '';
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' && raw.length <= 1024) {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

export function validateSignInFields(email: string, password: string): ValidationResult {
  const cleanEmail = stripUnsafeControlChars(email).trim();
  if (!isValidEmailAddress(cleanEmail)) {
    return {valid: false, reason: 'Please enter a valid email address.'};
  }
  if (!password || password.length < 6) {
    return {valid: false, reason: 'Please enter your account password.'};
  }
  return {valid: true};
}

export function validateCreateAccountFields(input: CreateAccountInput): ValidationResult {
  const fullName = sanitizeText(input.fullName.trim());
  const email = stripUnsafeControlChars(input.email).trim();
  const normalizedPhone = normalizeIndianPhone(input.phone);

  if (fullName.length < 2) {
    return {valid: false, reason: 'Please enter your full name (at least 2 characters).'};
  }
  if (!isValidEmailAddress(email)) {
    return {valid: false, reason: 'Please enter a valid email address.'};
  }
  if (!isValidIndianMobile(normalizedPhone)) {
    return {valid: false, reason: 'Please enter a valid 10-digit mobile number.'};
  }
  const pwCheck = validatePasswordStrength(input.password);
  if (!pwCheck.valid) {
    return {
      valid: false,
      reason: pwCheck.reason || 'Choose a stronger password (min 8 chars with letters and numbers).',
    };
  }
  if (input.password !== input.confirmPassword) {
    return {valid: false, reason: 'Password and Confirm Password do not match.'};
  }
  return {valid: true};
}

export function buildNewDeliveryUserProfile(params: {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  profilePhoto?: string;
  authProvider: 'password' | 'google';
  emailVerified?: boolean;
  nowMs?: number;
}): DeliveryUserProfile {
  const now = params.nowMs ?? Date.now();
  return {
    uid: params.uid,
    fullName: sanitizeText(params.fullName.trim()) || 'Delivery Partner',
    email: stripUnsafeControlChars(params.email).trim().toLowerCase(),
    phone: normalizeIndianPhone(params.phone),
    profilePhoto: sanitizeProfilePhotoValue(params.profilePhoto),
    approvalStatus: 'pending',
    accountStatus: 'active',
    authProvider: params.authProvider,
    emailVerified: Boolean(params.emailVerified),
    createdAt: now,
    updatedAt: now,
  };
}

export function buildCompatibleDeliveryPartnerRecord(
  profile: DeliveryUserProfile,
  existing?: RiderData | null,
): RiderData {
  return {
    uid: profile.uid,
    name: existing?.name || profile.fullName,
    fullName: profile.fullName,
    email: profile.email,
    phone: existing?.phone || profile.phone,
    profilePhoto: profile.profilePhoto || existing?.profilePhoto || '',
    approved: existing?.approved === true,
    approvalStatus: profile.approvalStatus,
    accountStatus: profile.accountStatus,
    authProvider: profile.authProvider,
    suspended: existing?.suspended === true || profile.accountStatus === 'suspended' || profile.approvalStatus === 'suspended',
    online: existing?.online === true && existing?.approved === true && existing?.suspended !== true,
    lat: existing?.lat ?? 26.4524,
    lng: existing?.lng ?? 89.9723,
    lastSeen: profile.updatedAt,
    createdAt: existing?.createdAt ?? profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function buildGoogleDeliveryUserProfile(params: {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  phoneNumber?: string | null;
  emailVerified?: boolean;
  nowMs?: number;
}): DeliveryUserProfile {
  return buildNewDeliveryUserProfile({
    uid: params.uid,
    fullName: params.displayName || params.email?.split('@')[0] || 'Delivery Partner',
    email: params.email || '',
    phone: params.phoneNumber || '',
    profilePhoto: params.photoURL || '',
    authProvider: 'google',
    emailVerified: params.emailVerified ?? true,
    nowMs: params.nowMs,
  });
}

export function mergeDeliveryProfiles(
  deliveryUser: Partial<DeliveryUserProfile> | null | undefined,
  deliveryPartner: RiderData | null | undefined,
  fallback?: {uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null},
): RiderData | null {
  if (!deliveryUser && !deliveryPartner) return null;

  const isSuspended =
    deliveryPartner?.suspended === true ||
    deliveryUser?.accountStatus === 'suspended' ||
    deliveryUser?.approvalStatus === 'suspended' ||
    deliveryPartner?.approvalStatus === 'suspended' ||
    deliveryPartner?.accountStatus === 'suspended';

  let resolvedApproval: ApprovalStatus = 'pending';
  if (isSuspended) {
    resolvedApproval = 'suspended';
  } else if (
    deliveryUser?.approvalStatus === 'rejected' ||
    deliveryPartner?.approvalStatus === 'rejected'
  ) {
    resolvedApproval = 'rejected';
  } else if (
    deliveryUser?.approvalStatus === 'approved' ||
    deliveryPartner?.approvalStatus === 'approved' ||
    deliveryPartner?.approved === true
  ) {
    resolvedApproval = 'approved';
  }

  const accountStatus: AccountStatus = isSuspended ? 'suspended' : 'active';
  const fullName =
    deliveryUser?.fullName ||
    deliveryPartner?.fullName ||
    deliveryPartner?.name ||
    fallback?.displayName ||
    'Delivery Partner';

  return {
    ...deliveryPartner,
    uid: deliveryUser?.uid || deliveryPartner?.uid || fallback?.uid,
    name: deliveryPartner?.name || fullName,
    fullName,
    email: deliveryUser?.email || deliveryPartner?.email || fallback?.email || '',
    phone: deliveryUser?.phone || deliveryPartner?.phone || '',
    profilePhoto:
      deliveryUser?.profilePhoto ||
      deliveryPartner?.profilePhoto ||
      sanitizeProfilePhotoValue(fallback?.photoURL),
    approvalStatus: resolvedApproval,
    accountStatus,
    authProvider: deliveryUser?.authProvider || deliveryPartner?.authProvider || 'password',
    approved: resolvedApproval === 'approved' && accountStatus === 'active',
    suspended: accountStatus === 'suspended',
    rejectionReason: deliveryUser?.rejectionReason || deliveryPartner?.rejectionReason || deliveryPartner?.adminNote,
    createdAt: deliveryUser?.createdAt || deliveryPartner?.createdAt,
    updatedAt: Math.max(deliveryUser?.updatedAt || 0, deliveryPartner?.updatedAt || 0) || undefined,
  };
}

export function evaluateDeliveryAccessGate(params: {
  profileLoaded: boolean;
  deliveryUser?: Partial<DeliveryUserProfile> | null;
  deliveryPartner?: RiderData | null;
}): AccessGateEvaluation {
  if (!params.profileLoaded) {
    return {
      gate: 'LOADING',
      approvalStatus: 'pending',
      accountStatus: 'active',
      headline: 'Checking Account Access',
      message: 'Verifying your Chutki delivery partner status...',
      needsPhoneCompletion: false,
    };
  }

  const merged = mergeDeliveryProfiles(params.deliveryUser, params.deliveryPartner);
  const phone = normalizeIndianPhone(merged?.phone || '');
  const needsPhoneCompletion = !isValidIndianMobile(phone);

  if (!merged) {
    return {
      gate: 'PENDING',
      approvalStatus: 'pending',
      accountStatus: 'active',
      headline: 'Approval Pending',
      message: PENDING_APPROVAL_MESSAGE,
      needsPhoneCompletion: true,
    };
  }

  if (merged.accountStatus === 'suspended' || merged.approvalStatus === 'suspended' || merged.suspended === true) {
    return {
      gate: 'SUSPENDED',
      approvalStatus: 'suspended',
      accountStatus: 'suspended',
      headline: 'Account Suspended',
      message:
        'Your delivery account has been suspended or deactivated by Admin. Contact support to reactivate your account.',
      reason: merged.rejectionReason || merged.adminNote,
      needsPhoneCompletion: false,
    };
  }

  if (merged.approvalStatus === 'rejected') {
    return {
      gate: 'REJECTED',
      approvalStatus: 'rejected',
      accountStatus: 'active',
      headline: 'Registration Rejected',
      message:
        'Your delivery partner application was rejected by Admin. Review any remarks below or contact Chutki Support.',
      reason: merged.rejectionReason || merged.adminNote,
      needsPhoneCompletion: false,
    };
  }

  if (merged.approvalStatus === 'approved' && merged.approved === true) {
    return {
      gate: 'APPROVED',
      approvalStatus: 'approved',
      accountStatus: 'active',
      headline: 'Approved & Active',
      message: 'Your Chutki delivery account is approved.',
      needsPhoneCompletion,
    };
  }

  return {
    gate: 'PENDING',
    approvalStatus: 'pending',
    accountStatus: 'active',
    headline: 'Waiting for Admin Approval',
    message: PENDING_APPROVAL_MESSAGE,
    needsPhoneCompletion,
  };
}
