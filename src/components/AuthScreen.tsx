import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {get, ref, set, update} from 'firebase/database';
import {auth, db} from '../config/firebase';
import {isValidIndianMobile, isValidUpiId, sanitizeText} from '../utils/riderLogic';
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
  pendingVerificationUser?: User | null;
  onVerificationConfirmed?: () => void;
  onDemoEnter?: () => void;
}

async function ensureGoogleRiderRecord(user: User): Promise<void> {
  const riderRef = ref(db, `deliveryPartners/${user.uid}`);
  const snap = await get(riderRef);
  if (!snap.exists()) {
    const cleanName = sanitizeText((user.displayName || 'Rider').trim()) || 'Rider';
    await set(riderRef, {
      name: cleanName,
      email: (user.email || '').trim(),
      phone: (user.phoneNumber || '').trim(),
      upiId: '',
      vehicle: '',
      approved: false,
      suspended: false,
      online: false,
      lat: 26.4524,
      lng: 89.9723,
      lastSeen: Date.now(),
    });
  } else {
    await update(riderRef, {lastSeen: Date.now()});
  }
}

export function AuthScreen({
  pendingVerificationUser = null,
  onVerificationConfirmed,
  onDemoEnter,
}: AuthScreenProps) {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupUpi, setSignupUpi] = useState('');
  const [signupVehicle, setSignupVehicle] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const [resendCooldownSec, setResendCooldownSec] = useState(0);
  const [checkingVerification, setCheckingVerification] = useState(false);

  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCooldownSec, setResetCooldownSec] = useState(0);

  const [throttleInfo, setThrottleInfo] = useState(() => readAuthThrottle());

  useEffect(() => {
    if (!throttleInfo.locked) return;
    const timer = window.setInterval(() => {
      const next = readAuthThrottle(Date.now());
      setThrottleInfo(next);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [throttleInfo.locked]);

  useEffect(() => {
    if (resendCooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldownSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldownSec]);

  useEffect(() => {
    if (resetCooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setResetCooldownSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resetCooldownSec]);

  // Capture Google Sign-In redirect result if popup fell back to redirect
  useEffect(() => {
    let active = true;
    void getRedirectResult(auth)
      .then(async (result) => {
        if (!active || !result?.user) return;
        await ensureGoogleRiderRecord(result.user);
        clearAuthThrottle();
      })
      .catch((err) => {
        if (!active) return;
        setAuthError(sanitizeFirebaseAuthError(err));
      });
    return () => {
      active = false;
    };
  }, []);

  const passwordStrength = useMemo(
    () => validatePasswordStrength(signupPassword),
    [signupPassword],
  );

  const handleToggleTab = (next: 'login' | 'signup') => {
    setAuthError('');
    setAuthNotice('');
    setForgotPasswordOpen(false);
    setTab(next);
  };

  const handleOpenForgotPassword = () => {
    setAuthError('');
    setAuthNotice('');
    setResetEmail(loginEmail.trim());
    setForgotPasswordOpen(true);
  };

  const handleBackToLogin = () => {
    setAuthError('');
    setAuthNotice('');
    setForgotPasswordOpen(false);
  };

  const handlePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    if (resetCooldownSec > 0) return;
    setAuthError('');
    setAuthNotice('');

    const cleanEmail = resetEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setAuthError('Enter a valid registered email address.');
      return;
    }

    setSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setLoginEmail(cleanEmail);
      setResetCooldownSec(60);
      setAuthNotice(
        `If an account exists for ${cleanEmail}, a password reset link has been sent. Check Inbox & Spam.`,
      );
    } catch (err) {
      const code = (err as {code?: string} | null)?.code || '';
      if (code === 'auth/user-not-found') {
        setLoginEmail(cleanEmail);
        setResetCooldownSec(60);
        setAuthNotice(
          `If an account exists for ${cleanEmail}, a password reset link has been sent. Check Inbox & Spam.`,
        );
      } else if (code === 'auth/invalid-email') {
        setAuthError('Enter a valid registered email address.');
      } else {
        setAuthError(sanitizeFirebaseAuthError(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthNotice('');

    const currentThrottle = readAuthThrottle(Date.now());
    setThrottleInfo(currentThrottle);
    if (currentThrottle.locked) {
      setAuthError(
        `🛡️ Too many failed attempts. Login locked for ${currentThrottle.remainingSec}s.`,
      );
      return;
    }

    const cleanEmail = loginEmail.trim();
    if (!cleanEmail || !loginPassword) {
      setAuthError('Enter your registered email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, loginPassword);
      clearAuthThrottle();
      if (!cred.user.emailVerified) {
        try {
          await sendEmailVerification(cred.user);
          setResendCooldownSec(60);
          setAuthNotice(
            `Verification link sent to ${cred.user.email || cleanEmail}. Please verify your email before starting your shift.`,
          );
        } catch {
          setAuthNotice(
            `Please verify ${cred.user.email || cleanEmail} from your inbox, then tap Refresh & Continue.`,
          );
        }
      }
    } catch (err) {
      const failure = recordAuthFailure(Date.now());
      const updated = readAuthThrottle(Date.now());
      setThrottleInfo(updated);
      if (failure.justLocked) {
        recordSecurityEvent(
          'BRUTE_FORCE',
          'high',
          `Login locked ${failure.remainingSec}s after ${failure.fails} failed attempts`,
        );
      }
      setAuthError(
        failure.locked
          ? `🛡️ Security Lockout: Wait ${failure.remainingSec}s before next sign-in attempt.`
          : `${sanitizeFirebaseAuthError(err)}${
              failure.fails >= 3 ? ` (${Math.max(0, 5 - failure.fails)} tries left)` : ''
            }`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthNotice('');
    const name = sanitizeText(signupName.trim());
    const email = signupEmail.trim();
    const phone = signupPhone.trim();
    const upiId = sanitizeText(signupUpi.trim());
    const vehicle = sanitizeText(signupVehicle.trim());
    const password = signupPassword;

    if (name.length < 2) {
      setAuthError('Enter your full rider name (at least 2 characters).');
      return;
    }
    if (!isValidIndianMobile(phone)) {
      setAuthError('Enter a valid 10-digit Indian mobile number!');
      return;
    }
    if (!isValidUpiId(upiId)) {
      setAuthError('Enter a valid, trusted UPI ID (e.g. 9876543210@paytm)!');
      return;
    }
    if (vehicle.length < 3) {
      setAuthError('Enter your vehicle details.');
      return;
    }
    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      setAuthError(pwCheck.reason || 'Choose a stronger password.');
      return;
    }

    setSubmitting(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await set(ref(db, 'deliveryPartners/' + cred.user.uid), {
        name,
        email,
        phone,
        upiId,
        vehicle,
        approved: false,
        suspended: false,
        online: false,
        lat: 26.4524,
        lng: 89.9723,
        lastSeen: Date.now(),
      });
      try {
        await sendEmailVerification(cred.user);
        setResendCooldownSec(60);
        setAuthNotice(
          `Account created! A verification email was sent to ${email}. Open the link in your inbox, then tap Verify & Continue.`,
        );
      } catch {
        setAuthNotice(
          `Account created! Tap Resend Verification Email to send a verification link to ${email}.`,
        );
      }
    } catch (err) {
      setAuthError(sanitizeFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleDirectLogin = useCallback(async () => {
    setAuthError('');
    setAuthNotice('');
    setSubmitting(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({prompt: 'select_account'});
    try {
      const result = await signInWithPopup(auth, provider);
      await ensureGoogleRiderRecord(result.user);
      clearAuthThrottle();
    } catch (err) {
      const code = (err as {code?: string} | null)?.code || '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr) {
          setAuthError(sanitizeFirebaseAuthError(redirectErr));
        }
      } else {
        setAuthError(sanitizeFirebaseAuthError(err));
      }
    } finally {
      setSubmitting(false);
    }
  }, []);

  const handleResendVerification = async () => {
    if (!pendingVerificationUser || resendCooldownSec > 0) return;
    setAuthError('');
    setAuthNotice('');
    setSubmitting(true);
    try {
      await sendEmailVerification(pendingVerificationUser);
      setResendCooldownSec(60);
      setAuthNotice(
        `Fresh verification link sent to ${pendingVerificationUser.email || 'your email'}. Check Inbox & Spam.`,
      );
    } catch (err) {
      setAuthError(sanitizeFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckVerified = async () => {
    if (!pendingVerificationUser) return;
    setAuthError('');
    setAuthNotice('');
    setCheckingVerification(true);
    try {
      await pendingVerificationUser.reload();
      if (auth.currentUser?.emailVerified || pendingVerificationUser.emailVerified) {
        clearAuthThrottle();
        onVerificationConfirmed?.();
      } else {
        setAuthError('Email not verified yet. Open the verification link in your inbox and try again.');
      }
    } catch (err) {
      setAuthError(sanitizeFirebaseAuthError(err));
    } finally {
      setCheckingVerification(false);
    }
  };

  const handleCancelVerification = async () => {
    setAuthError('');
    setAuthNotice('');
    await signOut(auth);
  };

  const strengthColor =
    passwordStrength.score >= 4
      ? '#34d399'
      : passwordStrength.score === 3
        ? '#38bdf8'
        : passwordStrength.score === 2
          ? '#fbbf24'
          : '#f87171';

  return (
    <div id="auth-screen">
      <div className="brand-hero">
        <i className="fa-solid fa-person-biking" />
        <h1>Gossaigaon Fleet</h1>
        <p>🛡️ Protected Rider Terminal · Anti-Scam &amp; Encryption</p>
      </div>

      {pendingVerificationUser ? (
        <div
          data-testid="email-verification-panel"
          style={{
            background: 'rgba(15, 23, 42, 0.72)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '16px',
            padding: '1.1rem',
            marginBottom: '0.75rem',
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.6rem'}}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '11px',
                background: 'rgba(56, 189, 248, 0.14)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i className="fa-solid fa-envelope-circle-check" />
            </div>
            <div>
              <div style={{fontSize: '0.96rem', fontWeight: 800, color: '#f8fafc'}}>
                Verify Your Email
              </div>
              <div style={{fontSize: '0.74rem', color: 'var(--text-muted)'}}>
                {pendingVerificationUser.email || 'Registered rider email'}
              </div>
            </div>
          </div>

          <p style={{fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: '0.85rem'}}>
            To protect your rider payouts and trip OTPs, click the verification link sent to your email address before entering the terminal.
          </p>

          {authNotice && (
            <div
              data-testid="email-verification-notice"
              style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#6ee7b7',
                borderRadius: '10px',
                padding: '0.55rem 0.75rem',
                fontSize: '0.74rem',
                fontWeight: 600,
                marginBottom: '0.85rem',
              }}
            >
              {authNotice}
            </div>
          )}

          <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
            <button
              type="button"
              data-testid="check-email-verified-btn"
              className="btn btn-primary"
              disabled={checkingVerification || submitting}
              onClick={() => void handleCheckVerified()}
            >
              <i className="fa-solid fa-circle-check" />{' '}
              {checkingVerification ? 'Checking Status...' : "I've Verified — Continue"}
            </button>

            <button
              type="button"
              data-testid="resend-verification-btn"
              className="btn btn-outline btn-sm"
              style={{borderColor: 'rgba(56, 189, 248, 0.4)', color: '#7dd3fc'}}
              disabled={submitting || resendCooldownSec > 0}
              onClick={() => void handleResendVerification()}
            >
              <i className="fa-solid fa-paper-plane" />{' '}
              {resendCooldownSec > 0
                ? `Resend Link in ${resendCooldownSec}s`
                : 'Resend Verification Email'}
            </button>

            <button
              type="button"
              data-testid="cancel-verification-btn"
              className="btn btn-outline btn-sm"
              style={{color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.35)'}}
              onClick={() => void handleCancelVerification()}
            >
              <i className="fa-solid fa-arrow-left" /> Use Another Account
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="auth-tabs" role="tablist" aria-label="Authentication Mode">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'login'}
              className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
              id="tab-login-btn"
              onClick={() => handleToggleTab('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'signup'}
              className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
              id="tab-signup-btn"
              onClick={() => handleToggleTab('signup')}
            >
              Register Rider
            </button>
          </div>

          {throttleInfo.locked && tab === 'login' && (
            <div
              data-testid="auth-lock-banner"
              role="alert"
              style={{
                background: 'rgba(239, 68, 68, 0.14)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                color: '#fecaca',
                borderRadius: '12px',
                padding: '0.65rem 0.85rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                marginBottom: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="fa-solid fa-shield-halved" style={{color: '#f87171'}} />
              <span>
                Brute-force protection active — wait{' '}
                <strong className="tabular-nums">{throttleInfo.remainingSec}s</strong> before retrying.
              </span>
            </div>
          )}

          {forgotPasswordOpen ? (
            <div
              data-testid="forgot-password-panel"
              style={{
                background: 'rgba(15, 23, 42, 0.72)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '16px',
                padding: '1.1rem',
                marginBottom: '0.75rem',
              }}
            >
              <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.6rem'}}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '11px',
                    background: 'rgba(56, 189, 248, 0.14)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    color: '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <i className="fa-solid fa-key" />
                </div>
                <div>
                  <div style={{fontSize: '0.96rem', fontWeight: 800, color: '#f8fafc'}}>
                    Reset Password
                  </div>
                  <div style={{fontSize: '0.74rem', color: 'var(--text-muted)'}}>
                    Receive a secure Firebase reset link
                  </div>
                </div>
              </div>

              <p style={{fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: '0.85rem'}}>
                Enter your registered rider email address. We will send you a link to set a new password.
              </p>

              {authNotice && (
                <div
                  data-testid="reset-password-notice"
                  style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    color: '#6ee7b7',
                    borderRadius: '10px',
                    padding: '0.55rem 0.75rem',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    marginBottom: '0.85rem',
                  }}
                >
                  {authNotice}
                </div>
              )}

              <form id="forgot-password-form" onSubmit={handlePasswordReset}>
                <div className="form-group">
                  <label htmlFor="reset-email">Registered Email</label>
                  <input
                    type="email"
                    id="reset-email"
                    data-testid="reset-password-email-input"
                    className="form-input"
                    placeholder="rider@gossaigaonbazar.com"
                    autoComplete="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  <button
                    type="submit"
                    data-testid="send-reset-link-btn"
                    className="btn btn-primary"
                    disabled={submitting || resetCooldownSec > 0}
                  >
                    <i className="fa-solid fa-paper-plane" />{' '}
                    {submitting
                      ? 'Sending Reset Link...'
                      : resetCooldownSec > 0
                        ? `Resend Link in ${resetCooldownSec}s`
                        : 'Send Reset Link'}
                  </button>
                  <button
                    type="button"
                    data-testid="back-to-login-btn"
                    className="btn btn-outline btn-sm"
                    onClick={handleBackToLogin}
                  >
                    <i className="fa-solid fa-arrow-left" /> Back to Sign In
                  </button>
                </div>
              </form>
            </div>
          ) : tab === 'login' ? (
            <form id="login-form" onSubmit={handleLogin}>
              <div className="form-group">
                <label htmlFor="login-email">Registered Email</label>
                <input
                  type="email"
                  id="login-email"
                  className="form-input"
                  placeholder="rider@gossaigaonbazar.com"
                  autoComplete="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <label htmlFor="login-password" style={{marginBottom: 0}}>Password</label>
                  <button
                    type="button"
                    data-testid="forgot-password-btn"
                    onClick={handleOpenForgotPassword}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: '4px 2px',
                      color: '#38bdf8',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>
                <input
                  type="password"
                  id="login-password"
                  className="form-input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                style={{marginTop: '0.5rem'}}
                disabled={submitting || throttleInfo.locked}
              >
                <i className="fa-solid fa-shield-halved" />{' '}
                {throttleInfo.locked
                  ? `Locked (${throttleInfo.remainingSec}s)`
                  : 'Start Protected Shift'}
              </button>
            </form>
          ) : (
            <form id="signup-form" onSubmit={handleSignup}>
              <div className="form-group">
                <label htmlFor="signup-name">Rider Full Name</label>
                <input
                  type="text"
                  id="signup-name"
                  className="form-input"
                  placeholder="e.g. Bipin Brahma"
                  autoComplete="name"
                  maxLength={80}
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="signup-email">Email Address</label>
                <input
                  type="email"
                  id="signup-email"
                  className="form-input"
                  placeholder="rider@gmail.com"
                  autoComplete="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="signup-phone">10-Digit Mobile Number</label>
                <input
                  type="tel"
                  id="signup-phone"
                  className="form-input"
                  placeholder="9876543210"
                  autoComplete="tel"
                  maxLength={10}
                  value={signupPhone}
                  onChange={(e) => setSignupPhone(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="signup-upi">Your UPI ID for Earnings Payout</label>
                <input
                  type="text"
                  id="signup-upi"
                  className="form-input"
                  placeholder="e.g. 9876543210@paytm"
                  maxLength={80}
                  value={signupUpi}
                  onChange={(e) => setSignupUpi(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="signup-vehicle">Vehicle Details (Bike / Scooter / Cycle)</label>
                <input
                  type="text"
                  id="signup-vehicle"
                  className="form-input"
                  placeholder="Hero Splendor - AS-16-XXXX"
                  maxLength={80}
                  value={signupVehicle}
                  onChange={(e) => setSignupVehicle(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <label htmlFor="signup-password">Set Strong Password</label>
                  {signupPassword.length > 0 && (
                    <span
                      data-testid="password-strength-label"
                      style={{fontSize: '0.7rem', fontWeight: 800, color: strengthColor}}
                    >
                      {passwordStrength.label}
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  id="signup-password"
                  className="form-input"
                  placeholder="Min 8 chars (letters + numbers)"
                  autoComplete="new-password"
                  minLength={8}
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  required
                />
                {signupPassword.length > 0 && !passwordStrength.valid && (
                  <div style={{fontSize: '0.72rem', color: '#fca5a5', marginTop: '4px'}}>
                    {passwordStrength.reason}
                  </div>
                )}
              </div>
              <button type="submit" className="btn btn-primary" style={{marginTop: '0.5rem'}} disabled={submitting}>
                <i className="fa-solid fa-id-card" /> Register Rider Account
              </button>
            </form>
          )}

          {/* Direct Google Sign-In Divider & Button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              margin: '1rem 0 0.85rem',
              color: 'var(--text-muted)',
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <div style={{flex: 1, height: '1px', background: 'var(--border)'}} />
            <span>or</span>
            <div style={{flex: 1, height: '1px', background: 'var(--border)'}} />
          </div>

          <button
            type="button"
            data-testid="google-login-btn"
            className="btn btn-outline"
            style={{
              background: '#ffffff',
              color: '#0f172a',
              borderColor: 'rgba(255, 255, 255, 0.25)',
              fontWeight: 800,
              gap: '10px',
            }}
            disabled={submitting}
            onClick={() => void handleGoogleDirectLogin()}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>
        </>
      )}

      <div className="error-msg" id="auth-error" role="alert">
        {authError}
      </div>

      <PWAInstallButton />
      {onDemoEnter && (
        <button type="button" onClick={onDemoEnter} style={{display: 'none'}}>
          Demo
        </button>
      )}
    </div>
  );
}
