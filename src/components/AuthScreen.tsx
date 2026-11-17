import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {Capacitor} from '@capacitor/core';
import {FirebaseAuthentication} from '@capacitor-firebase/authentication';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
  type User,
} from 'firebase/auth';
import {get, ref, set} from 'firebase/database';
import {auth, db, googleProvider} from '../config/firebase';
import {
  CHUTKI_AUTH_THEME,
  PENDING_APPROVAL_MESSAGE,
  buildCompatibleDeliveryPartnerRecord,
  buildGoogleDeliveryUserProfile,
  buildNewDeliveryUserProfile,
  isValidEmailAddress,
  normalizeIndianPhone,
  sanitizeProfilePhotoValue,
  validateCreateAccountFields,
  validateSignInFields,
} from '../utils/authLogic';
import {
  clearAuthThrottle,
  readAuthThrottle,
  recordAuthFailure,
  recordSecurityEvent,
  sanitizeFirebaseAuthError,
  validatePasswordStrength,
} from '../utils/security';
import {PWAInstallButton} from './PWAInstallButton';

interface AuthScreenProps {
  initialNotice?: {type: 'error' | 'success' | 'warning'; text: string} | null;
  onDemoEnter?: () => void;
}

type AuthViewMode = 'signin' | 'create' | 'forgot';

function ChutkiLogoMark() {
  return (
    <div className="chutki-brand-badge" aria-hidden="true">
      <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
        <path
          d="M11 10.5C11 8.567 12.567 7 14.5 7H21.5C23.433 7 25 8.567 25 10.5V11H11V10.5Z"
          stroke="white"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <rect
          x="6.5"
          y="11"
          width="23"
          height="19"
          rx="5.5"
          fill="white"
          fillOpacity="0.16"
          stroke="white"
          strokeWidth="2.2"
        />
        <path
          d="M19.5 14.5L14.5 21H18.2L16.8 26.5L22 19.6H18.2L19.5 14.5Z"
          fill="#FFFFFF"
        />
      </svg>
    </div>
  );
}

function GoogleGIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.94 1.19 15.23 0 12 0A12 12 0 0 0 1.28 6.61l4 3.1C6.23 6.87 8.88 4.76 12 4.76Z"
      />
    </svg>
  );
}

async function compressAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported image format.'));
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable.'));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = Math.max(0, (img.width - minSide) / 2);
        const sy = Math.max(0, (img.height - minSide) / 2);
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(sanitizeProfilePhotoValue(canvas.toDataURL('image/jpeg', 0.78)));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export async function provisionGoogleDeliveryProfileIfNeeded(user: User): Promise<void> {
  const userRef = ref(db, `deliveryUsers/${user.uid}`);
  const partnerRef = ref(db, `deliveryPartners/${user.uid}`);
  const [userSnap, partnerSnap] = await Promise.all([get(userRef), get(partnerRef)]);

  if (userSnap.exists()) {
    const existing = userSnap.val() as Record<string, unknown>;
    if (!partnerSnap.exists()) {
      const profile = buildGoogleDeliveryUserProfile({
        uid: user.uid,
        displayName: String(existing.fullName || user.displayName || ''),
        email: String(existing.email || user.email || ''),
        photoURL: String(existing.profilePhoto || user.photoURL || ''),
        phoneNumber: String(existing.phone || user.phoneNumber || ''),
        emailVerified: user.emailVerified,
      });
      await set(partnerRef, buildCompatibleDeliveryPartnerRecord(profile));
    }
    return;
  }

  if (partnerSnap.exists()) {
    const partner = partnerSnap.val() as Record<string, unknown>;
    const derivedStatus =
      partner.suspended === true
        ? 'suspended'
        : partner.approved === true
          ? 'approved'
          : partner.approvalStatus === 'rejected'
            ? 'rejected'
            : 'pending';
    await set(userRef, {
      uid: user.uid,
      fullName: String(partner.name || user.displayName || 'Delivery Partner'),
      email: String(partner.email || user.email || '').toLowerCase(),
      phone: normalizeIndianPhone(partner.phone || user.phoneNumber || ''),
      profilePhoto: sanitizeProfilePhotoValue(partner.profilePhoto || user.photoURL || ''),
      approvalStatus: derivedStatus,
      accountStatus: partner.suspended === true ? 'suspended' : 'active',
      authProvider: 'google',
      emailVerified: user.emailVerified,
      createdAt: Number(partner.createdAt || Date.now()),
      updatedAt: Date.now(),
    });
    return;
  }

  const profile = buildGoogleDeliveryUserProfile({
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    phoneNumber: user.phoneNumber,
    emailVerified: user.emailVerified,
  });

  await Promise.all([
    set(userRef, profile),
    set(partnerRef, buildCompatibleDeliveryPartnerRecord(profile)),
  ]);
}

export function AuthScreen({initialNotice, onDemoEnter}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthViewMode>('signin');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Sign In state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Create Account state
  const [fullName, setFullName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Forgot Password state
  const [resetEmail, setResetEmail] = useState('');

  const [throttleInfo, setThrottleInfo] = useState(() => readAuthThrottle());

  useEffect(() => {
    if (!initialNotice) return;
    if (initialNotice.type === 'error') {
      setAuthError(initialNotice.text);
      setAuthSuccess('');
    } else {
      setAuthSuccess(initialNotice.text);
      setAuthError('');
    }
  }, [initialNotice]);

  useEffect(() => {
    if (!throttleInfo.locked) return;
    const timer = window.setInterval(() => {
      setThrottleInfo(readAuthThrottle(Date.now()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [throttleInfo.locked]);

  const passwordStrength = useMemo(
    () => validatePasswordStrength(signupPassword),
    [signupPassword],
  );

  const switchMode = (next: AuthViewMode) => {
    setAuthError('');
    setAuthSuccess('');
    if (next === 'forgot' && loginEmail.trim() && !resetEmail) {
      setResetEmail(loginEmail.trim());
    }
    setMode(next);
  };

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAuthError('Please select a valid image file (JPG, PNG, or WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAuthError('Profile photo must be smaller than 5 MB.');
      return;
    }
    try {
      const compact = await compressAvatarFile(file);
      setProfilePhoto(compact);
      setAuthError('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to process image.');
    }
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    const currentThrottle = readAuthThrottle(Date.now());
    setThrottleInfo(currentThrottle);
    if (currentThrottle.locked) {
      setAuthError(
        `🛡️ Too many failed attempts. Sign-in locked for ${currentThrottle.remainingSec}s.`,
      );
      return;
    }

    const cleanEmail = loginEmail.trim();
    const validation = validateSignInFields(cleanEmail, loginPassword);
    if (!validation.valid) {
      setAuthError(validation.reason || 'Enter a valid email and password.');
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, loginPassword);
      clearAuthThrottle();
    } catch (err) {
      const failure = recordAuthFailure(Date.now());
      setThrottleInfo(readAuthThrottle(Date.now()));
      if (failure.justLocked) {
        recordSecurityEvent(
          'BRUTE_FORCE',
          'high',
          `Login locked ${failure.remainingSec}s after ${failure.fails} failed attempts`,
        );
      }
      setAuthError(
        failure.locked
          ? `🛡️ Security Lockout: Wait ${failure.remainingSec}s before retrying.`
          : `${sanitizeFirebaseAuthError(err)}${
              failure.fails >= 3 ? ` (${Math.max(0, 5 - failure.fails)} tries left)` : ''
            }`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAccount = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    const validation = validateCreateAccountFields({
      fullName,
      email: signupEmail,
      phone: signupPhone,
      password: signupPassword,
      confirmPassword,
      profilePhoto,
    });
    if (!validation.valid) {
      setAuthError(validation.reason || 'Please check all registration fields.');
      return;
    }

    const normalizedPhone = normalizeIndianPhone(signupPhone);
    const cleanEmail = signupEmail.trim().toLowerCase();

    setSubmitting(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, signupPassword);
      try {
        const phoneIndexRef = ref(db, `riderPhoneIndex/${normalizedPhone}`);
        const phoneSnap = await get(phoneIndexRef);
        if (phoneSnap.exists() && phoneSnap.val() !== cred.user.uid) {
          await cred.user.delete().catch(() => undefined);
          setAuthError('This mobile number is already linked to another delivery account.');
          return;
        }
        await set(phoneIndexRef, cred.user.uid).catch(() => undefined);

        const profile = buildNewDeliveryUserProfile({
          uid: cred.user.uid,
          fullName,
          email: cleanEmail,
          phone: normalizedPhone,
          profilePhoto,
          authProvider: 'password',
          emailVerified: cred.user.emailVerified,
        });

        await Promise.all([
          updateProfile(cred.user, {
            displayName: profile.fullName,
          }).catch(() => undefined),
          set(ref(db, `deliveryUsers/${cred.user.uid}`), profile),
          set(
            ref(db, `deliveryPartners/${cred.user.uid}`),
            buildCompatibleDeliveryPartnerRecord(profile),
          ),
        ]);

        await sendEmailVerification(cred.user).catch(() => undefined);
        setAuthSuccess(
          `Account created! Verification email sent. ${PENDING_APPROVAL_MESSAGE}`,
        );
      } catch (innerErr) {
        setAuthError(
          innerErr instanceof Error ? innerErr.message : sanitizeFirebaseAuthError(innerErr),
        );
      }
    } catch (err) {
      setAuthError(sanitizeFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading || submitting) return;
    setAuthError('');
    setAuthSuccess('');
    setGoogleLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const nativeRes = await FirebaseAuthentication.signInWithGoogle();
        const idToken = nativeRes.credential?.idToken;
        if (!idToken) {
          throw new Error(
            'Google Sign-In did not return an ID token. Verify SHA-1 in Firebase Console.',
          );
        }
        const credential = GoogleAuthProvider.credential(idToken);
        const userCred = await signInWithCredential(auth, credential);
        await provisionGoogleDeliveryProfileIfNeeded(userCred.user);
        clearAuthThrottle();
        return;
      }

      const result = await signInWithPopup(auth, googleProvider);
      await provisionGoogleDeliveryProfileIfNeeded(result.user);
      clearAuthThrottle();
    } catch (err) {
      const code = (err as {code?: string} | null)?.code || '';
      if (!Capacitor.isNativePlatform() && code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr) {
          setAuthError(sanitizeFirebaseAuthError(redirectErr));
        }
      } else {
        setAuthError(
          err instanceof Error && !code
            ? err.message
            : sanitizeFirebaseAuthError(err),
        );
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handlePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    const cleanEmail = resetEmail.trim();
    if (!isValidEmailAddress(cleanEmail)) {
      setAuthError('Please enter the registered email address for your delivery account.');
      return;
    }

    setSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setAuthSuccess(
        `Password reset link sent to ${cleanEmail}. Check your inbox and spam folder, then return to Sign In.`,
      );
    } catch (err) {
      const code = (err as {code?: string} | null)?.code || '';
      if (code === 'auth/user-not-found') {
        setAuthError('No delivery account found with this email address.');
      } else {
        setAuthError(sanitizeFirebaseAuthError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const strengthColor =
    passwordStrength.score >= 4
      ? '#108329'
      : passwordStrength.score === 3
        ? '#2E9E4F'
        : passwordStrength.score === 2
          ? '#D97706'
          : '#DC2626';

  return (
    <div className="chutki-auth-backdrop" style={{backgroundColor: CHUTKI_AUTH_THEME.background}}>
      <div id="auth-screen" role="main" aria-label="Chutki Delivery Partner Authentication">
        <div className="chutki-brand-hero">
          <ChutkiLogoMark />
          <h1>Chutki</h1>
          <p>Local Grocery SuperApp &bull; 15-Mins Express</p>
          <span className="chutki-partner-pill">
            <i className="fa-solid fa-motorcycle" aria-hidden="true" />
            Delivery Partner App
          </span>
        </div>

        {mode !== 'forgot' && (
          <div className="chutki-auth-tabs" role="tablist" aria-label="Authentication Mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              id="tab-login-btn"
              className={`chutki-auth-tab ${mode === 'signin' ? 'active' : ''}`}
              onClick={() => switchMode('signin')}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'create'}
              id="tab-signup-btn"
              className={`chutki-auth-tab ${mode === 'create' ? 'active' : ''}`}
              onClick={() => switchMode('create')}
            >
              Create Account
            </button>
          </div>
        )}

        {throttleInfo.locked && mode === 'signin' && (
          <div className="chutki-alert error" data-testid="auth-lock-banner" role="alert" style={{marginTop: 0, marginBottom: '0.9rem'}}>
            <i className="fa-solid fa-shield-halved" style={{marginTop: '2px'}} />
            <span>
              Security pause active — wait <strong className="tabular-nums">{throttleInfo.remainingSec}s</strong> before trying again.
            </span>
          </div>
        )}

        {mode === 'signin' && (
          <form id="login-form" onSubmit={handleSignIn} noValidate>
            <div className="chutki-form-group">
              <label className="chutki-form-label" htmlFor="login-email">
                Email Address
              </label>
              <div className="chutki-input-wrap">
                <i className="fa-regular fa-envelope chutki-input-icon" aria-hidden="true" />
                <input
                  id="login-email"
                  type="email"
                  className="chutki-input"
                  placeholder="partner@chutki.in"
                  autoComplete="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="chutki-form-group" style={{marginBottom: '0.5rem'}}>
              <label className="chutki-form-label" htmlFor="login-password">
                Password
              </label>
              <div className="chutki-input-wrap">
                <i className="fa-solid fa-lock chutki-input-icon" aria-hidden="true" />
                <input
                  id="login-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  className="chutki-input with-eye"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="chutki-eye-btn"
                  aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                >
                  <i className={showLoginPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} />
                </button>
              </div>
            </div>

            <div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem'}}>
              <button
                type="button"
                id="btn-forgot-password"
                className="chutki-link-btn"
                onClick={() => switchMode('forgot')}
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              id="btn-continue-app"
              className="chutki-btn-primary"
              disabled={submitting || googleLoading || throttleInfo.locked}
            >
              {submitting ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" /> Signing In...
                </>
              ) : throttleInfo.locked ? (
                `Wait ${throttleInfo.remainingSec}s`
              ) : (
                'Continue to App'
              )}
            </button>

            <div className="chutki-divider">OR</div>

            <button
              type="button"
              id="btn-continue-google"
              className="chutki-btn-google"
              disabled={googleLoading || submitting}
              onClick={() => void handleGoogleSignIn()}
            >
              <GoogleGIcon />
              <span>{googleLoading ? 'Opening Google...' : 'Continue with Google'}</span>
            </button>
          </form>
        )}

        {mode === 'create' && (
          <form id="signup-form" onSubmit={handleCreateAccount} noValidate>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '0.7rem 0.85rem',
                borderRadius: '14px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                marginBottom: '0.95rem',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: profilePhoto ? '#FFFFFF' : 'rgba(46, 158, 79, 0.14)',
                  border: '1.5px solid rgba(46, 158, 79, 0.35)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: '#108329',
                }}
              >
                {profilePhoto ? (
                  <img
                    src={profilePhoto}
                    alt="Rider avatar preview"
                    style={{width: '100%', height: '100%', objectFit: 'cover'}}
                  />
                ) : (
                  <i className="fa-solid fa-camera" />
                )}
              </div>
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{fontSize: '0.78rem', fontWeight: 700, color: '#1F2933'}}>
                  Profile Photo <span style={{color: '#64748B', fontWeight: 600}}>(Optional)</span>
                </div>
                <div style={{fontSize: '0.7rem', color: '#64748B', marginTop: '2px'}}>
                  Helps customers &amp; hub verify your identity
                </div>
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                style={{display: 'none'}}
                onChange={(e) => void handlePhotoChange(e)}
              />
              {profilePhoto ? (
                <button
                  type="button"
                  className="chutki-link-btn"
                  style={{color: '#DC2626', fontSize: '0.75rem'}}
                  onClick={() => {
                    setProfilePhoto('');
                    if (photoInputRef.current) photoInputRef.current.value = '';
                  }}
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  className="chutki-link-btn"
                  style={{fontSize: '0.76rem'}}
                  onClick={() => photoInputRef.current?.click()}
                >
                  Upload
                </button>
              )}
            </div>

            <div className="chutki-form-group">
              <label className="chutki-form-label" htmlFor="signup-name">
                Full Name
              </label>
              <div className="chutki-input-wrap">
                <i className="fa-regular fa-user chutki-input-icon" aria-hidden="true" />
                <input
                  id="signup-name"
                  type="text"
                  className="chutki-input"
                  placeholder="Enter your full name"
                  autoComplete="name"
                  maxLength={80}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="chutki-form-group">
              <label className="chutki-form-label" htmlFor="signup-email">
                Email Address
              </label>
              <div className="chutki-input-wrap">
                <i className="fa-regular fa-envelope chutki-input-icon" aria-hidden="true" />
                <input
                  id="signup-email"
                  type="email"
                  className="chutki-input"
                  placeholder="partner@gmail.com"
                  autoComplete="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="chutki-form-group">
              <label className="chutki-form-label" htmlFor="signup-phone">
                Mobile Number
              </label>
              <div className="chutki-input-wrap">
                <i className="fa-solid fa-phone chutki-input-icon" aria-hidden="true" />
                <input
                  id="signup-phone"
                  type="tel"
                  inputMode="numeric"
                  className="chutki-input"
                  placeholder="10-digit mobile number"
                  autoComplete="tel"
                  maxLength={13}
                  value={signupPhone}
                  onChange={(e) => setSignupPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="chutki-form-group">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <label className="chutki-form-label" htmlFor="signup-password">
                  Password
                </label>
                {signupPassword.length > 0 && (
                  <span
                    data-testid="password-strength-label"
                    style={{fontSize: '0.72rem', fontWeight: 800, color: strengthColor}}
                  >
                    {passwordStrength.label}
                  </span>
                )}
              </div>
              <div className="chutki-input-wrap">
                <i className="fa-solid fa-lock chutki-input-icon" aria-hidden="true" />
                <input
                  id="signup-password"
                  type={showSignupPassword ? 'text' : 'password'}
                  className="chutki-input with-eye"
                  placeholder="Min 8 chars (letters + numbers)"
                  autoComplete="new-password"
                  minLength={8}
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="chutki-eye-btn"
                  aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowSignupPassword((prev) => !prev)}
                >
                  <i className={showSignupPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} />
                </button>
              </div>
              {signupPassword.length > 0 && !passwordStrength.valid && (
                <div style={{fontSize: '0.72rem', color: '#B91C1C', marginTop: '4px', fontWeight: 600}}>
                  {passwordStrength.reason}
                </div>
              )}
            </div>

            <div className="chutki-form-group">
              <label className="chutki-form-label" htmlFor="signup-confirm-password">
                Confirm Password
              </label>
              <div className="chutki-input-wrap">
                <i className="fa-solid fa-shield-check chutki-input-icon" aria-hidden="true" />
                <input
                  id="signup-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="chutki-input with-eye"
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="chutki-eye-btn"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                >
                  <i className={showConfirmPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'} />
                </button>
              </div>
              {confirmPassword.length > 0 && signupPassword !== confirmPassword && (
                <div style={{fontSize: '0.72rem', color: '#B91C1C', marginTop: '4px', fontWeight: 600}}>
                  Passwords do not match.
                </div>
              )}
            </div>

            <button
              type="submit"
              id="btn-create-account"
              className="chutki-btn-primary"
              style={{marginTop: '0.35rem'}}
              disabled={submitting || googleLoading}
            >
              {submitting ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" /> Creating Account...
                </>
              ) : (
                'Create Delivery Account'
              )}
            </button>

            <div className="chutki-divider">OR</div>

            <button
              type="button"
              id="btn-google-signup"
              className="chutki-btn-google"
              disabled={googleLoading || submitting}
              onClick={() => void handleGoogleSignIn()}
            >
              <GoogleGIcon />
              <span>{googleLoading ? 'Opening Google...' : 'Continue with Google'}</span>
            </button>

            <p style={{fontSize: '0.72rem', color: '#64748B', textAlign: 'center', marginTop: '0.85rem', lineHeight: 1.4}}>
              New delivery partner accounts require Admin verification before order access is enabled.
            </p>
          </form>
        )}

        {mode === 'forgot' && (
          <form id="forgot-password-form" onSubmit={handlePasswordReset} noValidate>
            <div style={{marginBottom: '1rem'}}>
              <button
                type="button"
                className="chutki-link-btn"
                onClick={() => switchMode('signin')}
              >
                <i className="fa-solid fa-arrow-left" style={{marginRight: '6px'}} />
                Return to Sign In
              </button>
              <h2 style={{fontSize: '1.15rem', fontWeight: 800, color: '#1F2933', marginTop: '0.65rem'}}>
                Reset Password
              </h2>
              <p style={{fontSize: '0.8rem', color: '#64748B', marginTop: '0.25rem', lineHeight: 1.4}}>
                Enter your registered delivery partner email and we&apos;ll send a Firebase password reset link.
              </p>
            </div>

            <div className="chutki-form-group">
              <label className="chutki-form-label" htmlFor="reset-email">
                Registered Email Address
              </label>
              <div className="chutki-input-wrap">
                <i className="fa-regular fa-envelope chutki-input-icon" aria-hidden="true" />
                <input
                  id="reset-email"
                  type="email"
                  className="chutki-input"
                  placeholder="partner@chutki.in"
                  autoComplete="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              id="btn-send-reset"
              className="chutki-btn-primary"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" /> Sending Link...
                </>
              ) : (
                'Send Password Reset Email'
              )}
            </button>
          </form>
        )}

        {authError && (
          <div className="chutki-alert error" id="auth-error" role="alert">
            <i className="fa-solid fa-circle-exclamation" style={{marginTop: '2px', flexShrink: 0}} />
            <span>{authError}</span>
          </div>
        )}

        {authSuccess && (
          <div className="chutki-alert success" id="auth-success" role="status">
            <i className="fa-solid fa-circle-check" style={{marginTop: '2px', flexShrink: 0}} />
            <span>{authSuccess}</span>
          </div>
        )}

        <div style={{marginTop: '1rem'}}>
          <PWAInstallButton />
        </div>

        {onDemoEnter && (
          <button type="button" onClick={onDemoEnter} style={{display: 'none'}}>
            Demo
          </button>
        )}
      </div>
    </div>
  );
}
