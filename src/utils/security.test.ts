import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeQrSecurityThreat,
  canCompleteCodDelivery,
  clearAuthThrottle,
  clearSecurityEvents,
  computeIntegrityTag,
  escapeHtml,
  getSafeExternalUrl,
  getSafeMapsUrl,
  getSafeTelHref,
  getSafeWhatsAppUrl,
  getSecurityEvents,
  hasSequentialDigitPattern,
  recordAuthFailure,
  recordSecurityEvent,
  sanitizeFirebaseAuthError,
  sanitizeInput,
  validatePasswordStrength,
  verifyUpiSecurity,
  ALLOWED_MAP_HOSTS,
} from './security';
import {validateDeliveryQrPayload, validateSettlementUtr} from './riderLogic';

test('escapeHtml and sanitizeInput neutralize XSS, bidi spoofing, control chars, and dangerous schemes', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('xss')">`),
    '&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;',
  );
  // Strips RTL override (\u202E), zero-width space (\u200B), and javascript: scheme
  assert.equal(
    sanitizeInput(`Bipin\u202E\u200B javascript:alert(1) <script>ok</script>`),
    'Bipin alert(1) scriptok/script',
  );
  // Enforces bounded length
  assert.equal(sanitizeInput('a'.repeat(500), 100).length, 100);
});

test('safe URL validators block javascript/data/http phishing links and allow trusted hosts only', () => {
  assert.equal(getSafeExternalUrl('javascript:alert(1)', ALLOWED_MAP_HOSTS), '');
  assert.equal(getSafeExternalUrl('data:text/html,<script>', ALLOWED_MAP_HOSTS), '');
  assert.equal(getSafeExternalUrl('http://evil.example.com/maps', ALLOWED_MAP_HOSTS), '');
  assert.equal(getSafeExternalUrl('https://evil.example.com/?q=maps', ALLOWED_MAP_HOSTS), '');
  assert.equal(
    getSafeExternalUrl('https://www.google.com/maps/dir/?api=1&destination=26.45,89.97', ALLOWED_MAP_HOSTS),
    'https://www.google.com/maps/dir/?api=1&destination=26.45,89.97',
  );

  // Fallback safely generates Google Maps URL even if RTDB locationLink was tampered
  assert.equal(
    getSafeMapsUrl('javascript:alert(document.cookie)', 26.4524, 89.9723, 'Ward 3'),
    'https://www.google.com/maps/dir/?api=1&destination=26.4524,89.9723',
  );

  assert.equal(getSafeWhatsAppUrl('9876543210', 'Hello!'), 'https://wa.me/919876543210?text=Hello!');
  assert.equal(getSafeWhatsAppUrl('123'), '');
  assert.equal(getSafeTelHref('+91 98765-43210'), 'tel:919876543210');
  assert.equal(getSafeTelHref('javascript:123'), '');
});

test('analyzeQrSecurityThreat and validateDeliveryQrPayload block phishing links, XSS URIs, oversized payloads, and expired QRs', () => {
  const trip = {
    tripId: 'trip_demo_route_902',
    deliveryOtp: '6412',
    orders: [{orderId: 'ord_demo_201', deliveryOtp: '6412'}],
  };

  assert.equal(analyzeQrSecurityThreat('javascript:fetch("https://evil.com")').safe, false);
  assert.equal(analyzeQrSecurityThreat('http://fake-gossaigaon-pay.com/?otp=6412').safe, false);
  assert.equal(analyzeQrSecurityThreat('https://phishing.example/claim?otp=6412').safe, false);
  assert.equal(analyzeQrSecurityThreat('x'.repeat(600)).safe, false);

  const expiredJson = JSON.stringify({
    tripId: 'trip_demo_route_902',
    otp: '6412',
    expiresAt: 1000,
  });
  assert.equal(analyzeQrSecurityThreat(expiredJson, 5000).safe, false);
  assert.equal(analyzeQrSecurityThreat(expiredJson, 500).safe, true);

  // validateDeliveryQrPayload rejects phishing URL even when query string contains valid tripId & otp
  const res = validateDeliveryQrPayload(
    'https://evil-phisher.com/pay?tripId=trip_demo_route_902&otp=6412',
    trip,
  );
  assert.equal(res.valid, false);
  assert.match(res.reason || '', /untrusted external link/i);
});

test('hasSequentialDigitPattern and validateSettlementUtr catch scam/fake UTR patterns', () => {
  assert.equal(hasSequentialDigitPattern('234567890123'), true);
  assert.equal(hasSequentialDigitPattern('987654321098'), true);
  assert.equal(hasSequentialDigitPattern('121212121212'), true);
  assert.equal(hasSequentialDigitPattern('123123123123'), true);
  assert.equal(hasSequentialDigitPattern('412893471923'), false);

  const existing = {s1: {amount: 100, mode: 'UPI', utr: '412893471923', status: 'APPROVED'}};
  assert.equal(validateSettlementUtr('234567890123', existing).valid, false);
  assert.equal(validateSettlementUtr('987654321098', existing).valid, false);
  assert.equal(validateSettlementUtr('454545454545', existing).valid, false);
  assert.equal(validateSettlementUtr('519283746510', existing).valid, true);
});

test('verifyUpiSecurity flags scam handles and profile-mismatch payout UPI changes', () => {
  assert.equal(verifyUpiSecurity('scamrefund@paytm').valid, false);
  assert.equal(verifyUpiSecurity('fakeadmin@ybl').valid, false);

  const same = verifyUpiSecurity('9876543210@paytm', '9876543210@paytm');
  assert.equal(same.valid, true);
  assert.equal(same.isDifferentFromProfile, false);

  const swapped = verifyUpiSecurity('attacker99@ybl', '9876543210@paytm');
  assert.equal(swapped.valid, true);
  assert.equal(swapped.isDifferentFromProfile, true);
  assert.ok(swapped.warning);
});

test('canCompleteCodDelivery blocks explicitly short cash tender and allows blank or sufficient cash', () => {
  assert.deepEqual(canCompleteCodDelivery(true, 500, '0'), {allowed: true, shortBy: 0});
  assert.deepEqual(canCompleteCodDelivery(false, 420, ''), {allowed: true, shortBy: 0});
  assert.deepEqual(canCompleteCodDelivery(false, 420, '500'), {allowed: true, shortBy: 0});

  const short = canCompleteCodDelivery(false, 420, '400');
  assert.equal(short.allowed, false);
  assert.equal(short.shortBy, 20);
  assert.match(short.reason || '', /COD Cash Guard/i);
});

test('validatePasswordStrength and auth sanitization protect registration and login errors', () => {
  assert.equal(validatePasswordStrength('123456').valid, false);
  assert.equal(validatePasswordStrength('password123').valid, false);
  assert.equal(validatePasswordStrength('onlyletters').valid, false);
  assert.equal(validatePasswordStrength('Rider2026').valid, true);
  assert.equal(validatePasswordStrength('Gossaigaon@2026').label, 'Very Strong');

  assert.match(
    sanitizeFirebaseAuthError({code: 'auth/wrong-password'}),
    /Invalid email or password/i,
  );
  assert.doesNotMatch(
    sanitizeFirebaseAuthError({message: 'Firebase: internal stack token XYZ'}),
    /stack token XYZ/,
  );

  // Integrity tag is deterministic and detects mutation
  assert.equal(computeIntegrityTag('abc'), computeIntegrityTag('abc'));
  assert.notEqual(computeIntegrityTag('abc'), computeIntegrityTag('abd'));

  // Auth throttle helpers safe in Node (no window storage)
  clearAuthThrottle();
  assert.equal(recordAuthFailure(1000).locked, false);
  clearSecurityEvents();
  assert.deepEqual(getSecurityEvents(), []);
  assert.equal(recordSecurityEvent('QR_PHISHING', 'high', 'Blocked phishing URL').length, 1);
});

test('persistent auth throttle, PIN guard integrity check, and security event buffer detect tampering', () => {
  const memLocal = new Map<string, string>();
  const memSession = new Map<string, string>();
  const prevWindow = (globalThis as unknown as {window?: unknown}).window;
  (globalThis as unknown as {window: unknown}).window = {
    localStorage: {
      getItem: (k: string) => memLocal.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memLocal.set(k, v);
      },
      removeItem: (k: string) => {
        memLocal.delete(k);
      },
    },
    sessionStorage: {
      getItem: (k: string) => memSession.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memSession.set(k, v);
      },
      removeItem: (k: string) => {
        memSession.delete(k);
      },
    },
  };

  try {
    clearAuthThrottle();
    for (let i = 0; i < 4; i++) {
      assert.equal(recordAuthFailure(10_000 + i).locked, false);
    }
    const fifth = recordAuthFailure(10_005);
    assert.equal(fifth.locked, true);
    assert.equal(fifth.justLocked, true);
    assert.equal(fifth.remainingSec, 30);

    // Tampering with stored localStorage payload triggers defensive lock
    memLocal.set('gb_sec_auth_throttle_v1', JSON.stringify({d: {fails: 0, lockedUntil: 0}, sig: 'tampered'}));
    const tampered = recordAuthFailure(11_000);
    assert.equal(tampered.locked, true);

    clearAuthThrottle();
    assert.equal(recordAuthFailure(20_000).fails, 1);

    // Security event ring buffer caps at 15 items
    clearSecurityEvents();
    for (let i = 0; i < 18; i++) {
      recordSecurityEvent('QR_PHISHING', 'high', `Event ${i}`);
    }
    const events = getSecurityEvents();
    assert.equal(events.length, 15);
    assert.equal(events[0].summary, 'Event 17');
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as unknown as {window?: unknown}).window;
    } else {
      (globalThis as unknown as {window: unknown}).window = prevWindow;
    }
  }
});
