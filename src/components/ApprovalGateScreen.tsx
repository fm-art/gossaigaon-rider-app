import {useState, type FormEvent} from 'react';
import {sendEmailVerification, type User} from 'firebase/auth';
import {get, ref, set, update} from 'firebase/database';
import {db} from '../config/firebase';
import type {AdminSettings, RiderData} from '../types/rider';
import {
  PENDING_APPROVAL_MESSAGE,
  normalizeIndianPhone,
  type AccessGateEvaluation,
} from '../utils/authLogic';
import {isValidIndianMobile} from '../utils/riderLogic';
import {getSafeTelHref, getSafeWhatsAppUrl} from '../utils/security';

interface ApprovalGateScreenProps {
  user: User;
  riderData: RiderData | null;
  evaluation: AccessGateEvaluation;
  adminSettings: AdminSettings;
  onRefreshStatus: () => Promise<void>;
  onSignOut: () => void;
  onNotify: (msg: string, type?: 'success' | 'danger' | 'info' | 'warning') => void;
}

export function ApprovalGateScreen({
  user,
  riderData,
  evaluation,
  adminSettings,
  onRefreshStatus,
  onSignOut,
  onNotify,
}: ApprovalGateScreenProps) {
  const [checking, setChecking] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [phoneInput, setPhoneInput] = useState(riderData?.phone || '');
  const [savingPhone, setSavingPhone] = useState(false);
  const [inlineNotice, setInlineNotice] = useState<{type: 'success' | 'error'; text: string} | null>(null);

  const supportTelHref = getSafeTelHref(adminSettings.supportPhone);
  const supportWaHref = getSafeWhatsAppUrl(
    adminSettings.supportWhatsapp || adminSettings.supportPhone,
    `Hello Chutki Admin, please review my delivery account (${user.email || user.uid}).`,
  );

  const displayName =
    riderData?.fullName || riderData?.name || user.displayName || 'Delivery Partner';
  const displayEmail = riderData?.email || user.email || '';
  const displayPhone = riderData?.phone || '';
  const displayPhoto = riderData?.profilePhoto || user.photoURL || '';
  const isPasswordProvider =
    (riderData?.authProvider || 'password') === 'password' &&
    user.providerData.some((p) => p.providerId === 'password');

  const handleRefresh = async () => {
    setChecking(true);
    setInlineNotice(null);
    try {
      await onRefreshStatus();
    } finally {
      setChecking(false);
    }
  };

  const handleResendVerification = async () => {
    setResendingEmail(true);
    setInlineNotice(null);
    try {
      await sendEmailVerification(user);
      setInlineNotice({
        type: 'success',
        text: `Verification email sent to ${user.email}. Please check your inbox.`,
      });
    } catch {
      setInlineNotice({
        type: 'error',
        text: 'Could not send verification email right now. Please wait a moment and try again.',
      });
    } finally {
      setResendingEmail(false);
    }
  };

  const handleSaveMobile = async (e: FormEvent) => {
    e.preventDefault();
    setInlineNotice(null);
    const normalized = normalizeIndianPhone(phoneInput);
    if (!isValidIndianMobile(normalized)) {
      setInlineNotice({
        type: 'error',
        text: 'Please enter a valid 10-digit Indian mobile number.',
      });
      return;
    }

    setSavingPhone(true);
    try {
      const indexRef = ref(db, `riderPhoneIndex/${normalized}`);
      const snap = await get(indexRef);
      if (snap.exists() && snap.val() !== user.uid) {
        setInlineNotice({
          type: 'error',
          text: 'This mobile number is already registered with another delivery account.',
        });
        return;
      }
      await set(indexRef, user.uid).catch(() => undefined);
      const now = Date.now();
      await Promise.all([
        update(ref(db, `deliveryUsers/${user.uid}`), {
          phone: normalized,
          updatedAt: now,
        }),
        update(ref(db, `deliveryPartners/${user.uid}`), {
          phone: normalized,
          updatedAt: now,
        }),
      ]);
      onNotify('Mobile number saved for Admin verification.', 'success');
      setInlineNotice({
        type: 'success',
        text: 'Mobile number saved. Admin can now view your contact number.',
      });
    } catch {
      setInlineNotice({
        type: 'error',
        text: 'Unable to save mobile number right now. Please try again.',
      });
    } finally {
      setSavingPhone(false);
    }
  };

  const badgeConfig =
    evaluation.gate === 'REJECTED'
      ? {bg: '#FEF2F2', border: '#FECACA', color: '#B91C1C', icon: 'fa-circle-xmark', label: 'Application Rejected'}
      : evaluation.gate === 'SUSPENDED'
        ? {bg: '#FEF2F2', border: '#FECACA', color: '#B91C1C', icon: 'fa-ban', label: 'Account Suspended'}
        : evaluation.gate === 'LOADING'
          ? {bg: '#F1F5F9', border: '#E2E8F0', color: '#334155', icon: 'fa-spinner fa-spin', label: 'Verifying Account'}
          : {bg: '#FFFBEB', border: '#FDE68A', color: '#B45309', icon: 'fa-clock', label: 'Pending Admin Approval'};

  return (
    <div className="chutki-auth-backdrop">
      <div id="approval-gate-screen" role="main" aria-label="Delivery Account Verification">
        <div style={{textAlign: 'center', marginBottom: '1.15rem'}}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '18px',
              margin: '0 auto 0.75rem',
              background: 'linear-gradient(145deg, #2E9E4F 0%, #108329 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.45rem',
              boxShadow: '0 10px 22px rgba(16, 131, 41, 0.2)',
            }}
          >
            <i className="fa-solid fa-shield-halved" />
          </div>
          <h1 style={{fontSize: '1.35rem', fontWeight: 900, color: '#1F2933'}}>
            Chutki Delivery Partner
          </h1>
          <p style={{fontSize: '0.78rem', fontWeight: 600, color: '#64748B', marginTop: '2px'}}>
            Local Grocery SuperApp &bull; 15-Mins Express
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '1rem',
          }}
        >
          <span
            data-testid="approval-status-badge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '0.42rem 0.9rem',
              borderRadius: '999px',
              background: badgeConfig.bg,
              border: `1px solid ${badgeConfig.border}`,
              color: badgeConfig.color,
              fontSize: '0.78rem',
              fontWeight: 800,
            }}
          >
            <i className={`fa-solid ${badgeConfig.icon}`} />
            {badgeConfig.label}
          </span>
        </div>

        {evaluation.gate === 'LOADING' ? (
          <div style={{textAlign: 'center', padding: '1rem 0', color: '#475569', fontSize: '0.86rem', fontWeight: 600}}>
            {evaluation.message}
          </div>
        ) : (
          <>
            <div
              data-testid="approval-gate-message"
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                padding: '1rem',
                textAlign: 'center',
                marginBottom: '1rem',
              }}
            >
              <div style={{fontSize: '1rem', fontWeight: 800, color: '#1F2933', marginBottom: '0.35rem'}}>
                {evaluation.gate === 'PENDING' ? PENDING_APPROVAL_MESSAGE : evaluation.headline}
              </div>
              <p style={{fontSize: '0.8rem', color: '#475569', lineHeight: 1.45}}>
                {evaluation.gate === 'PENDING'
                  ? 'Our Chutki Admin team will review your profile details shortly. Order assignments stay locked until approved.'
                  : evaluation.message}
              </p>
              {evaluation.reason && (
                <div
                  style={{
                    marginTop: '0.65rem',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '10px',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.76rem',
                    color: '#B91C1C',
                    fontWeight: 700,
                  }}
                >
                  Admin Remark: {evaluation.reason}
                </div>
              )}
            </div>

            {/* Rider summary card */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '0.8rem 0.9rem',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                marginBottom: '0.95rem',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: 'rgba(46, 158, 79, 0.14)',
                  color: '#108329',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {displayPhoto ? (
                  <img
                    src={displayPhoto}
                    alt={displayName}
                    style={{width: '100%', height: '100%', objectFit: 'cover'}}
                  />
                ) : (
                  <i className="fa-solid fa-user" />
                )}
              </div>
              <div style={{flex: 1, minWidth: 0}}>
                <div
                  style={{
                    fontSize: '0.88rem',
                    fontWeight: 800,
                    color: '#1F2933',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {displayName}
                </div>
                {displayEmail && (
                  <div
                    style={{
                      fontSize: '0.74rem',
                      color: '#64748B',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {displayEmail}
                  </div>
                )}
                <div style={{fontSize: '0.73rem', color: '#475569', marginTop: '2px', fontWeight: 600}}>
                  {displayPhone ? `Mobile: ${displayPhone}` : 'Mobile number not added yet'}
                </div>
              </div>
            </div>

            {/* Email verification prompt for email/password accounts */}
            {isPasswordProvider && !user.emailVerified && evaluation.gate === 'PENDING' && (
              <div className="chutki-alert warning" style={{marginTop: 0, marginBottom: '0.9rem', flexDirection: 'column', gap: '8px'}}>
                <div style={{display: 'flex', gap: '8px', alignItems: 'flex-start'}}>
                  <i className="fa-solid fa-envelope-open-text" style={{marginTop: '2px'}} />
                  <span>
                    Please verify your email address ({user.email}) using the link sent to your inbox.
                  </span>
                </div>
                <div style={{display: 'flex', gap: '8px', width: '100%'}}>
                  <button
                    type="button"
                    className="chutki-link-btn"
                    disabled={resendingEmail}
                    onClick={() => void handleResendVerification()}
                    style={{fontSize: '0.75rem'}}
                  >
                    {resendingEmail ? 'Sending...' : 'Resend Verification Email'}
                  </button>
                  <span style={{color: '#CBD5E1'}}>|</span>
                  <button
                    type="button"
                    className="chutki-link-btn"
                    onClick={() => void handleRefresh()}
                    style={{fontSize: '0.75rem'}}
                  >
                    I&apos;ve Verified
                  </button>
                </div>
              </div>
            )}

            {/* Complete missing mobile number for Google Sign-In riders */}
            {evaluation.gate === 'PENDING' && evaluation.needsPhoneCompletion && (
              <form
                onSubmit={handleSaveMobile}
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '14px',
                  padding: '0.85rem',
                  marginBottom: '0.95rem',
                }}
              >
                <label className="chutki-form-label" htmlFor="gate-mobile-input">
                  Add Mobile Number for Admin Review
                </label>
                <div style={{display: 'flex', gap: '8px'}}>
                  <input
                    id="gate-mobile-input"
                    type="tel"
                    inputMode="numeric"
                    className="chutki-input"
                    style={{paddingLeft: '0.85rem', minHeight: '42px'}}
                    placeholder="10-digit mobile"
                    maxLength={13}
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    required
                  />
                  <button
                    type="submit"
                    className="chutki-btn-primary"
                    style={{width: 'auto', minHeight: '42px', padding: '0 1rem', fontSize: '0.82rem'}}
                    disabled={savingPhone}
                  >
                    {savingPhone ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            )}

            {inlineNotice && (
              <div
                className={`chutki-alert ${inlineNotice.type === 'error' ? 'error' : 'success'}`}
                style={{marginTop: 0, marginBottom: '0.9rem'}}
                role="status"
              >
                <i
                  className={`fa-solid ${
                    inlineNotice.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'
                  }`}
                  style={{marginTop: '2px'}}
                />
                <span>{inlineNotice.text}</span>
              </div>
            )}

            <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
              <button
                type="button"
                id="btn-check-approval"
                className="chutki-btn-primary"
                disabled={checking}
                onClick={() => void handleRefresh()}
              >
                <i className={`fa-solid ${checking ? 'fa-spinner fa-spin' : 'fa-rotate'}`} />
                {checking ? 'Checking Status...' : 'Check Approval Status'}
              </button>

              {(supportTelHref || supportWaHref) && (
                <div style={{display: 'flex', gap: '8px'}}>
                  {supportTelHref && (
                    <a
                      href={supportTelHref}
                      className="chutki-btn-google"
                      style={{minHeight: '42px', fontSize: '0.82rem', textDecoration: 'none'}}
                    >
                      <i className="fa-solid fa-phone" style={{color: '#108329'}} />
                      Call Admin
                    </a>
                  )}
                  {supportWaHref && (
                    <a
                      href={supportWaHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="chutki-btn-google"
                      style={{minHeight: '42px', fontSize: '0.82rem', textDecoration: 'none'}}
                    >
                      <i className="fa-brands fa-whatsapp" style={{color: '#2E9E4F'}} />
                      WhatsApp Support
                    </a>
                  )}
                </div>
              )}

              <button
                type="button"
                id="btn-gate-signout"
                className="chutki-btn-google"
                style={{color: '#DC2626', borderColor: '#FECACA', minHeight: '42px', fontSize: '0.84rem'}}
                onClick={onSignOut}
              >
                <i className="fa-solid fa-right-from-bracket" /> Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
