export type SecurityEventCategory =
  | 'BRUTE_FORCE'
  | 'QR_PHISHING'
  | 'SCAM_UTR'
  | 'COD_GUARD'
  | 'URL_BLOCK'
  | 'ACCOUNT_CHANGE'
  | 'SESSION_LOCK';

export type SecuritySeverity = 'high' | 'medium' | 'info';

export interface SecurityEvent {
  id: string;
  ts: number;
  category: SecurityEventCategory;
  severity: SecuritySeverity;
  summary: string;
}

export interface PinGuardRecord {
  fails: number;
  lockedUntil: number;
}

export interface AuthThrottleState {
  fails: number;
  lockedUntil: number;
}

export interface PasswordStrengthResult {
  valid: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  reason?: string;
}

export interface QrThreatAnalysis {
  safe: boolean;
  threatType?: 'OVERSIZED' | 'XSS_URI' | 'PHISHING_URL' | 'EXPIRED_QR';
  reason?: string;
}

export interface UpiSecurityCheck {
  valid: boolean;
  suspicious: boolean;
  isDifferentFromProfile: boolean;
  reason?: string;
  warning?: string;
}

export interface CodGuardResult {
  allowed: boolean;
  shortBy: number;
  reason?: string;
}

const PIN_GUARDS_KEY = 'gb_sec_pin_guards_v1';
const AUTH_THROTTLE_KEY = 'gb_sec_auth_throttle_v1';
const SECURITY_EVENTS_KEY = 'gb_sec_events_v1';
const IDLE_LOCK_PREF_KEY = 'gb_sec_idle_lock_v1';
const INTEGRITY_SALT = 'gbz_fleet_sec_2026';

export const ALLOWED_MAP_HOSTS = new Set([
  'www.google.com',
  'maps.google.com',
  'maps.app.goo.gl',
]);

export const ALLOWED_WHATSAPP_HOSTS = new Set([
  'wa.me',
  'api.whatsapp.com',
]);

export const ALLOWED_QR_HOSTS = new Set([
  'gossaigaonbazar.com',
  'www.gossaigaonbazar.com',
  'gossaigaon.app',
  'verify.local',
]);

const SUSPICIOUS_UPI_KEYWORDS = [
  'testupi',
  'fake',
  'scam',
  'fraud',
  'phish',
  'hacker',
  'adminrefund',
  'cashbackwin',
  'lottery',
];

const WEAK_PASSWORDS = new Set([
  '123456',
  '12345678',
  '123456789',
  'password',
  'password123',
  'qwerty',
  'qwerty123',
  'rider123',
  'admin123',
  '11111111',
  '00000000',
]);

export function stripUnsafeControlChars(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');
}

export function sanitizeInput(value: unknown, maxLength = 240): string {
  const cleaned = stripUnsafeControlChars(value)
    .replace(/[<>"'`]/g, '')
    .replace(/(?:javascript|vbscript|data):/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return maxLength > 0 && cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

export function escapeHtml(value: unknown): string {
  return stripUnsafeControlChars(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

export function computeIntegrityTag(payload: string): string {
  let hash = 0x811c9dc5;
  const input = `${INTEGRITY_SALT}:${payload}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function getSafeStorage(kind: 'local' | 'session'): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function getSafeExternalUrl(rawUrl: unknown, allowedHosts: Set<string>): string {
  const raw = stripUnsafeControlChars(rawUrl).trim();
  if (!raw || raw.length > 1024) return '';
  if (/^(?:javascript|data|vbscript|file):/i.test(raw)) return '';

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return '';
    const host = parsed.hostname.toLowerCase();
    if (!allowedHosts.has(host)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function getSafeMapsUrl(
  rawUrl: unknown,
  fallbackLat?: number | null,
  fallbackLng?: number | null,
  fallbackAddress?: string,
): string {
  const validated = getSafeExternalUrl(rawUrl, ALLOWED_MAP_HOSTS);
  if (validated) return validated;

  const nLat = Number(fallbackLat);
  const nLng = Number(fallbackLng);
  if (
    fallbackLat !== null &&
    fallbackLat !== undefined &&
    fallbackLng !== null &&
    fallbackLng !== undefined &&
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    nLat !== 0 &&
    nLng !== 0
  ) {
    return `https://www.google.com/maps/dir/?api=1&destination=${nLat},${nLng}`;
  }

  const cleanAddr = sanitizeInput(fallbackAddress || 'Gossaigaon', 140) || 'Gossaigaon';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleanAddr)}`;
}

export function getSafeWhatsAppUrl(rawPhone: unknown, prefillText?: string): string {
  const digits = String(rawPhone ?? '').replace(/\D/g, '');
  if (!digits || digits.length < 10 || digits.length > 15) return '';
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  const base = `https://wa.me/${normalized}`;
  if (!prefillText) return base;
  const cleanText = sanitizeInput(prefillText, 240);
  return `${base}?text=${encodeURIComponent(cleanText)}`;
}

export function getSafeTelHref(rawPhone: unknown): string {
  const digits = String(rawPhone ?? '').replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return `tel:${digits}`;
}

export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const raw = String(password || '');
  if (raw.length < 8) {
    return {
      valid: false,
      score: raw.length >= 6 ? 1 : 0,
      label: 'Weak',
      reason: 'Password must be at least 8 characters long.',
    };
  }
  if (WEAK_PASSWORDS.has(raw.toLowerCase())) {
    return {
      valid: false,
      score: 0,
      label: 'Weak',
      reason: 'Common or easily guessed passwords are blocked for rider security.',
    };
  }

  let classes = 0;
  if (/[a-z]/.test(raw)) classes++;
  if (/[A-Z]/.test(raw)) classes++;
  if (/\d/.test(raw)) classes++;
  if (/[^a-zA-Z0-9]/.test(raw)) classes++;

  if (classes < 2 || !/\d/.test(raw)) {
    return {
      valid: false,
      score: 1,
      label: 'Weak',
      reason: 'Include letters and at least one number (e.g. Rider@2026).',
    };
  }

  if (classes >= 4 && raw.length >= 10) {
    return {valid: true, score: 4, label: 'Very Strong'};
  }
  if (classes >= 3) {
    return {valid: true, score: 3, label: 'Strong'};
  }
  return {valid: true, score: 2, label: 'Fair'};
}

export function readAuthThrottle(nowMs = Date.now()): AuthThrottleState & {
  locked: boolean;
  remainingSec: number;
} {
  const store = getSafeStorage('local');
  if (!store) return {fails: 0, lockedUntil: 0, locked: false, remainingSec: 0};

  try {
    const raw = store.getItem(AUTH_THROTTLE_KEY);
    if (!raw) return {fails: 0, lockedUntil: 0, locked: false, remainingSec: 0};
    const parsed = JSON.parse(raw) as {d?: AuthThrottleState; sig?: string};
    const serialized = JSON.stringify(parsed.d || {});
    if (!parsed.d || parsed.sig !== computeIntegrityTag(serialized)) {
      // Tampered throttle state -> enforce short defensive cooldown
      return {fails: 5, lockedUntil: nowMs + 30000, locked: true, remainingSec: 30};
    }
    const fails = Math.max(0, Number(parsed.d.fails || 0));
    const lockedUntil = Math.max(0, Number(parsed.d.lockedUntil || 0));
    const locked = nowMs < lockedUntil;
    const remainingSec = locked ? Math.ceil((lockedUntil - nowMs) / 1000) : 0;
    return {fails, lockedUntil, locked, remainingSec};
  } catch {
    return {fails: 0, lockedUntil: 0, locked: false, remainingSec: 0};
  }
}

export function writeAuthThrottle(state: AuthThrottleState): void {
  const store = getSafeStorage('local');
  if (!store) return;
  try {
    const clean: AuthThrottleState = {
      fails: Math.max(0, Math.floor(state.fails)),
      lockedUntil: Math.max(0, Math.floor(state.lockedUntil)),
    };
    const serialized = JSON.stringify(clean);
    store.setItem(AUTH_THROTTLE_KEY, JSON.stringify({d: clean, sig: computeIntegrityTag(serialized)}));
  } catch {
    // ignore storage errors
  }
}

export function recordAuthFailure(nowMs = Date.now()): {
  fails: number;
  locked: boolean;
  remainingSec: number;
  justLocked: boolean;
} {
  const current = readAuthThrottle(nowMs);
  if (current.locked) {
    return {
      fails: current.fails,
      locked: true,
      remainingSec: current.remainingSec,
      justLocked: false,
    };
  }

  const nextFails = current.fails + 1;
  let lockDurationMs = 0;
  if (nextFails >= 10) lockDurationMs = 300_000;
  else if (nextFails >= 7) lockDurationMs = 120_000;
  else if (nextFails >= 5) lockDurationMs = 30_000;

  const lockedUntil = lockDurationMs > 0 ? nowMs + lockDurationMs : 0;
  writeAuthThrottle({fails: nextFails, lockedUntil});

  return {
    fails: nextFails,
    locked: lockDurationMs > 0,
    remainingSec: lockDurationMs > 0 ? Math.ceil(lockDurationMs / 1000) : 0,
    justLocked: lockDurationMs > 0,
  };
}

export function clearAuthThrottle(): void {
  const store = getSafeStorage('local');
  if (!store) return;
  try {
    store.removeItem(AUTH_THROTTLE_KEY);
  } catch {
    // ignore
  }
}

export function loadPinGuards(nowMs = Date.now()): Record<string, PinGuardRecord> {
  const store = getSafeStorage('session');
  if (!store) return {};
  try {
    const raw = store.getItem(PIN_GUARDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {d?: Record<string, PinGuardRecord>; sig?: string};
    const serialized = JSON.stringify(parsed.d || {});
    if (!parsed.d || parsed.sig !== computeIntegrityTag(serialized)) {
      return {};
    }
    const cleaned: Record<string, PinGuardRecord> = {};
    Object.entries(parsed.d).forEach(([k, v]) => {
      if (v && (v.fails > 0 || v.lockedUntil > nowMs)) {
        cleaned[k] = {
          fails: Math.max(0, Number(v.fails || 0)),
          lockedUntil: Math.max(0, Number(v.lockedUntil || 0)),
        };
      }
    });
    return cleaned;
  } catch {
    return {};
  }
}

export function savePinGuards(guards: Record<string, PinGuardRecord>): void {
  const store = getSafeStorage('session');
  if (!store) return;
  try {
    const serialized = JSON.stringify(guards);
    store.setItem(PIN_GUARDS_KEY, JSON.stringify({d: guards, sig: computeIntegrityTag(serialized)}));
  } catch {
    // ignore
  }
}

export function analyzeQrSecurityThreat(rawQrText: unknown, nowMs = Date.now()): QrThreatAnalysis {
  const raw = stripUnsafeControlChars(rawQrText).trim();
  if (!raw) {
    return {safe: false, threatType: 'XSS_URI', reason: 'Empty or unreadable QR code.'};
  }
  if (raw.length > 512) {
    return {
      safe: false,
      threatType: 'OVERSIZED',
      reason: '🛡️ Blocked oversized QR payload (possible buffer/injection attempt).',
    };
  }

  if (
    /^(?:javascript|vbscript|data|file):/i.test(raw) ||
    /<script\b|<iframe\b|onerror\s*=|onload\s*=/i.test(raw)
  ) {
    return {
      safe: false,
      threatType: 'XSS_URI',
      reason: '🛡️ Security Alert: Malicious script/URI blocked in QR code.',
    };
  }

  // Check URLs inside QR payload
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const proto = parsed.protocol.toLowerCase();
      if (proto === 'http:') {
        return {
          safe: false,
          threatType: 'PHISHING_URL',
          reason: '🛡️ Blocked insecure HTTP phishing link in QR code.',
        };
      }
      if (proto === 'https:' && !ALLOWED_QR_HOSTS.has(parsed.hostname.toLowerCase())) {
        return {
          safe: false,
          threatType: 'PHISHING_URL',
          reason: `🛡️ Blocked untrusted external link (${parsed.hostname}) in QR code.`,
        };
      }
      if (proto !== 'https:' && proto !== 'gossaigaon:') {
        return {
          safe: false,
          threatType: 'PHISHING_URL',
          reason: '🛡️ Blocked unsupported protocol in QR code.',
        };
      }
    } catch {
      return {
        safe: false,
        threatType: 'PHISHING_URL',
        reason: '🛡️ Blocked malformed URL in QR code.',
      };
    }
  }

  // Check optional expiration timestamp on JSON QR payloads
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const expRaw = parsed.expiresAt ?? parsed.exp;
      if (expRaw !== undefined && expRaw !== null && expRaw !== '') {
        const expNum = Number(expRaw);
        if (Number.isFinite(expNum) && expNum > 0 && nowMs > expNum) {
          return {
            safe: false,
            threatType: 'EXPIRED_QR',
            reason: '🛡️ Expired verification QR code. Ask customer to refresh their screen.',
          };
        }
      }
    } catch {
      // Malformed JSON will be handled cleanly by validateDeliveryQrPayload
    }
  }

  return {safe: true};
}

export function hasSequentialDigitPattern(digits: string): boolean {
  if (!/^\d{12}$/.test(digits)) return false;

  // Repeating pairs or triplets e.g. 121212121212 or 123123123123
  if (/^(\d{2})\1{5}$/.test(digits) || /^(\d{3})\1{3}$/.test(digits) || /^(\d{4})\1{2}$/.test(digits)) {
    return true;
  }

  // Check 6+ consecutive ascending or descending digits
  let ascRun = 1;
  let descRun = 1;
  for (let i = 1; i < digits.length; i++) {
    const prev = digits.charCodeAt(i - 1);
    const curr = digits.charCodeAt(i);
    if (curr - prev === 1) {
      ascRun++;
      descRun = 1;
    } else if (prev - curr === 1) {
      descRun++;
      ascRun = 1;
    } else {
      ascRun = 1;
      descRun = 1;
    }
    if (ascRun >= 6 || descRun >= 6) return true;
  }

  // Reject single unique digit repeated or <= 2 distinct digits across all 12 positions
  const uniqueDigits = new Set(digits.split(''));
  if (uniqueDigits.size <= 2) return true;

  return false;
}

export function verifyUpiSecurity(upiId: string, expectedProfileUpi?: string): UpiSecurityCheck {
  const clean = stripUnsafeControlChars(upiId).trim();
  if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(clean)) {
    return {
      valid: false,
      suspicious: false,
      isDifferentFromProfile: false,
      reason: 'Enter a valid UPI ID (e.g. 9876543210@paytm).',
    };
  }

  const lower = clean.toLowerCase();
  const suspicious = SUSPICIOUS_UPI_KEYWORDS.some((kw) => lower.includes(kw));
  const cleanExpected = stripUnsafeControlChars(expectedProfileUpi || '').trim().toLowerCase();
  const isDifferentFromProfile = Boolean(cleanExpected && cleanExpected !== lower);

  if (suspicious) {
    return {
      valid: false,
      suspicious: true,
      isDifferentFromProfile,
      reason: '🛡️ Suspicious or unverified UPI handle blocked by Scam Shield.',
    };
  }

  return {
    valid: true,
    suspicious: false,
    isDifferentFromProfile,
    warning: isDifferentFromProfile
      ? '⚠️ Payout UPI differs from your saved Profile UPI. Confirm this belongs to you before submitting.'
      : undefined,
  };
}

export function canCompleteCodDelivery(
  isPrepaid: boolean,
  targetAmount: number,
  rawCashTendered: string,
): CodGuardResult {
  if (isPrepaid) return {allowed: true, shortBy: 0};
  const trimmed = String(rawCashTendered || '').trim();
  if (!trimmed) {
    // Allow confirmation if rider did not enter cash calculator input
    return {allowed: true, shortBy: 0};
  }

  const tendered = Number(trimmed);
  if (!Number.isFinite(tendered) || tendered < 0) {
    return {
      allowed: false,
      shortBy: Math.max(0, targetAmount),
      reason: 'Enter a valid cash amount collected from customer.',
    };
  }

  if (tendered < targetAmount) {
    const shortBy = Number((targetAmount - tendered).toFixed(2));
    return {
      allowed: false,
      shortBy,
      reason: `🛡️ COD Cash Guard: ₹${shortBy.toFixed(2)} short! Collect full ₹${targetAmount.toFixed(2)} before completing trip.`,
    };
  }

  return {allowed: true, shortBy: 0};
}

export function sanitizeFirebaseAuthError(err: unknown): string {
  const code = (err as {code?: string} | null)?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Invalid email or password. Repeated failures will trigger a security lock.';
    case 'auth/too-many-requests':
      return '🛡️ Account temporarily rate-limited due to too many attempts. Wait before retrying.';
    case 'auth/email-already-in-use':
      return 'This email is already registered. Sign in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters with letters and numbers.';
    case 'auth/network-request-failed':
      return 'Network unavailable. Check your internet connection.';
    default:
      return 'Authentication error. Please verify your details and try again.';
  }
}

export function getSecurityEvents(): SecurityEvent[] {
  const store = getSafeStorage('session');
  if (!store) return [];
  try {
    const raw = store.getItem(SECURITY_EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SecurityEvent[]) : [];
  } catch {
    return [];
  }
}

export function recordSecurityEvent(
  category: SecurityEventCategory,
  severity: SecuritySeverity,
  summary: string,
): SecurityEvent[] {
  const nextItem: SecurityEvent = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    category,
    severity,
    summary: sanitizeInput(summary, 180),
  };
  const existing = getSecurityEvents();
  const next = [nextItem, ...existing].slice(0, 15);
  const store = getSafeStorage('session');
  if (store) {
    try {
      store.setItem(SECURITY_EVENTS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }
  return next;
}

export function clearSecurityEvents(): void {
  const store = getSafeStorage('session');
  if (!store) return;
  try {
    store.removeItem(SECURITY_EVENTS_KEY);
  } catch {
    // ignore
  }
}

export function readIdleLockEnabled(): boolean {
  const store = getSafeStorage('local');
  if (!store) return true;
  try {
    const raw = store.getItem(IDLE_LOCK_PREF_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function saveIdleLockEnabled(enabled: boolean): void {
  const store = getSafeStorage('local');
  if (!store) return;
  try {
    store.setItem(IDLE_LOCK_PREF_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}
