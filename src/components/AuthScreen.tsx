import {useEffect, useMemo, useState, type FormEvent} from 'react';
import {createUserWithEmailAndPassword, signInWithEmailAndPassword} from 'firebase/auth';
import {ref, set} from 'firebase/database';
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
  onDemoEnter?: () => void;
}

export function AuthScreen({onDemoEnter}: AuthScreenProps) {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupUpi, setSignupUpi] = useState('');
  const [signupVehicle, setSignupVehicle] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const [throttleInfo, setThrottleInfo] = useState(() => readAuthThrottle());

  useEffect(() => {
    if (!throttleInfo.locked) return;
    const timer = window.setInterval(() => {
      const next = readAuthThrottle(Date.now());
      setThrottleInfo(next);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [throttleInfo.locked]);

  const passwordStrength = useMemo(
    () => validatePasswordStrength(signupPassword),
    [signupPassword],
  );

  const handleToggleTab = (next: 'login' | 'signup') => {
    setAuthError('');
    setTab(next);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');

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
      await signInWithEmailAndPassword(auth, cleanEmail, loginPassword);
      clearAuthThrottle();
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
    } catch (err) {
      setAuthError(sanitizeFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
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

      {tab === 'login' ? (
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
            <label htmlFor="login-password">Password</label>
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
