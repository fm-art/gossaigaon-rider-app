import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CHUTKI_AUTH_THEME,
  PENDING_APPROVAL_MESSAGE,
  buildCompatibleDeliveryPartnerRecord,
  buildGoogleDeliveryUserProfile,
  buildNewDeliveryUserProfile,
  evaluateDeliveryAccessGate,
  mergeDeliveryProfiles,
  normalizeIndianPhone,
  sanitizeProfilePhotoValue,
  validateCreateAccountFields,
  validateSignInFields,
} from './authLogic';
import {sanitizeFirebaseAuthError} from './security';

test('Chutki auth theme constants and exact pending message match specification', () => {
  assert.equal(CHUTKI_AUTH_THEME.primaryGreen, '#2E9E4F');
  assert.equal(CHUTKI_AUTH_THEME.buttonGreen, '#108329');
  assert.equal(CHUTKI_AUTH_THEME.background, '#FFFFFF');
  assert.equal(CHUTKI_AUTH_THEME.inputBackground, '#F8FAFC');
  assert.equal(CHUTKI_AUTH_THEME.text, '#1F2933');
  assert.equal(
    PENDING_APPROVAL_MESSAGE,
    'Your delivery account is waiting for Admin approval.',
  );
});

test('Sign In validation checks email format and password presence', () => {
  assert.equal(validateSignInFields('bad-email', 'Rider@2026').valid, false);
  assert.equal(validateSignInFields('rider@chutki.in', '').valid, false);
  assert.equal(validateSignInFields('rider@chutki.in', '12345').valid, false);
  assert.equal(validateSignInFields('rider@chutki.in', 'Rider@2026').valid, true);
});

test('Create Account validation enforces full name, email, 10-digit phone, strong password, and matching confirmation', () => {
  assert.equal(normalizeIndianPhone('+91 98765-43210'), '9876543210');

  assert.equal(
    validateCreateAccountFields({
      fullName: 'A',
      email: 'rider@chutki.in',
      phone: '9876543210',
      password: 'Rider@2026',
      confirmPassword: 'Rider@2026',
    }).valid,
    false,
  );

  assert.equal(
    validateCreateAccountFields({
      fullName: 'Bipin Brahma',
      email: 'invalid',
      phone: '9876543210',
      password: 'Rider@2026',
      confirmPassword: 'Rider@2026',
    }).valid,
    false,
  );

  assert.equal(
    validateCreateAccountFields({
      fullName: 'Bipin Brahma',
      email: 'rider@chutki.in',
      phone: '12345',
      password: 'Rider@2026',
      confirmPassword: 'Rider@2026',
    }).valid,
    false,
  );

  assert.equal(
    validateCreateAccountFields({
      fullName: 'Bipin Brahma',
      email: 'rider@chutki.in',
      phone: '9876543210',
      password: 'Rider@2026',
      confirmPassword: 'Mismatch@2026',
    }).valid,
    false,
  );

  assert.equal(
    validateCreateAccountFields({
      fullName: 'Bipin Brahma',
      email: 'rider@chutki.in',
      phone: '+91 9876543210',
      password: 'Rider@2026',
      confirmPassword: 'Rider@2026',
    }).valid,
    true,
  );
});

test('New Email & Google accounts are strictly provisioned with pending approval and never store passwords', () => {
  const emailUser = buildNewDeliveryUserProfile({
    uid: 'uid_email_1',
    fullName: 'Rahul Das',
    email: 'RAHUL@chutki.in',
    phone: '+91 9876543210',
    profilePhoto: 'https://lh3.googleusercontent.com/avatar.png',
    authProvider: 'password',
    emailVerified: false,
    nowMs: 1700000000000,
  });

  assert.equal(emailUser.approvalStatus, 'pending');
  assert.equal(emailUser.accountStatus, 'active');
  assert.equal(emailUser.email, 'rahul@chutki.in');
  assert.equal(emailUser.phone, '9876543210');
  assert.equal('password' in emailUser, false);

  const compatPartner = buildCompatibleDeliveryPartnerRecord(emailUser);
  assert.equal(compatPartner.approved, false);
  assert.equal(compatPartner.suspended, false);
  assert.equal(compatPartner.online, false);

  const googleUser = buildGoogleDeliveryUserProfile({
    uid: 'uid_google_1',
    displayName: 'Ananya Roy',
    email: 'ananya@gmail.com',
    photoURL: 'https://lh3.googleusercontent.com/a/photo',
    nowMs: 1700000001000,
  });
  assert.equal(googleUser.approvalStatus, 'pending');
  assert.equal(googleUser.authProvider, 'google');
  assert.equal(googleUser.accountStatus, 'active');
  assert.equal(buildCompatibleDeliveryPartnerRecord(googleUser).approved, false);
});

test('sanitizeProfilePhotoValue allows https URLs and compact image data URIs but blocks javascript URIs', () => {
  assert.equal(sanitizeProfilePhotoValue('javascript:alert(1)'), '');
  assert.equal(sanitizeProfilePhotoValue('http://insecure.example/a.jpg'), '');
  assert.equal(
    sanitizeProfilePhotoValue('https://lh3.googleusercontent.com/a/photo.png'),
    'https://lh3.googleusercontent.com/a/photo.png',
  );
  assert.equal(
    sanitizeProfilePhotoValue('data:image/jpeg;base64,AAAA'),
    'data:image/jpeg;base64,AAAA',
  );
});

test('evaluateDeliveryAccessGate enforces Loading, Pending, Rejected, Suspended, and Approved states', () => {
  assert.equal(evaluateDeliveryAccessGate({profileLoaded: false}).gate, 'LOADING');

  const pendingEval = evaluateDeliveryAccessGate({
    profileLoaded: true,
    deliveryUser: {
      uid: 'u1',
      fullName: 'New Rider',
      approvalStatus: 'pending',
      accountStatus: 'active',
      phone: '',
    },
    deliveryPartner: {approved: false},
  });
  assert.equal(pendingEval.gate, 'PENDING');
  assert.equal(pendingEval.message, PENDING_APPROVAL_MESSAGE);
  assert.equal(pendingEval.needsPhoneCompletion, true);

  const rejectedEval = evaluateDeliveryAccessGate({
    profileLoaded: true,
    deliveryUser: {
      uid: 'u2',
      approvalStatus: 'rejected',
      accountStatus: 'active',
      rejectionReason: 'Invalid driving license',
    },
  });
  assert.equal(rejectedEval.gate, 'REJECTED');
  assert.equal(rejectedEval.reason, 'Invalid driving license');

  // Suspended must override even if approved was previously true
  const suspendedEval = evaluateDeliveryAccessGate({
    profileLoaded: true,
    deliveryUser: {
      uid: 'u3',
      approvalStatus: 'approved',
      accountStatus: 'suspended',
    },
    deliveryPartner: {
      approved: true,
      suspended: true,
    },
  });
  assert.equal(suspendedEval.gate, 'SUSPENDED');

  const approvedEval = evaluateDeliveryAccessGate({
    profileLoaded: true,
    deliveryUser: {
      uid: 'u4',
      approvalStatus: 'approved',
      accountStatus: 'active',
      phone: '9876543210',
    },
    deliveryPartner: {
      approved: true,
      suspended: false,
    },
  });
  assert.equal(approvedEval.gate, 'APPROVED');
  assert.equal(approvedEval.needsPhoneCompletion, false);

  const merged = mergeDeliveryProfiles(
    {uid: 'u5', approvalStatus: 'approved', accountStatus: 'active', fullName: 'Suresh'},
    {approved: true, suspended: false, phone: '9876543210'},
  );
  assert.equal(merged?.approved, true);
  assert.equal(merged?.fullName, 'Suresh');
});

test('sanitizeFirebaseAuthError handles Google OAuth, disabled account, expired session, and duplicate email', () => {
  assert.match(sanitizeFirebaseAuthError({code: 'auth/user-disabled'}), /disabled or suspended/i);
  assert.match(sanitizeFirebaseAuthError({code: 'auth/popup-closed-by-user'}), /cancelled/i);
  assert.match(sanitizeFirebaseAuthError({code: 'auth/unauthorized-domain'}), /authorized/i);
  assert.match(sanitizeFirebaseAuthError({code: 'auth/email-already-in-use'}), /already registered/i);
  assert.match(sanitizeFirebaseAuthError({code: 'auth/user-token-expired'}), /expired/i);
});

test('database.rules.json parses cleanly and enforces approval-gated reads and self-approval prevention', () => {
  const rulesPath = path.resolve(process.cwd(), 'database.rules.json');
  const raw = fs.readFileSync(rulesPath, 'utf8');
  const parsed = JSON.parse(raw) as {
    rules: Record<string, Record<string, unknown>>;
  };

  assert.equal(parsed.rules['.read'], false);
  assert.equal(parsed.rules['.write'], false);
  assert.ok(parsed.rules.deliveryUsers);
  assert.ok(parsed.rules.riderPhoneIndex);
  assert.equal(parsed.rules.riderPhoneIndex['.read'], false);
  assert.match(String(parsed.rules.orders['.read']), /approvalStatus/);
  assert.match(String(parsed.rules.settlements['.read']), /approvalStatus/);
  assert.match(String(parsed.rules.riderPayouts['.read']), /approvalStatus/);
  const userWrite = String((parsed.rules.deliveryUsers.$uid as Record<string, unknown>)['.write']);
  assert.match(userWrite, /approvalStatus.*pending/);
  assert.match(userWrite, /!newData\.hasChild\('isAdmin'\)/);
});
