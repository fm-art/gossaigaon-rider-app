import {memo, useEffect, useMemo, useState, type FormEvent} from 'react';
import type {AdminSettings, FeedbackRecord, PreferredShiftHours, RiderData} from '../types/rider';
import {
  formatShiftTime12h,
  isValidIndianMobile,
  isValidShiftHours,
  isValidUpiId,
  sanitizeText,
  type BatteryStatusSnapshot,
  type GpsTrackingPolicy,
  type ShiftComplianceStatus,
} from '../utils/riderLogic';
import {
  getSafeTelHref,
  getSafeWhatsAppUrl,
  verifyUpiSecurity,
  type SecurityEvent,
} from '../utils/security';
import {PWAInstallButton} from './PWAInstallButton';
import {RecentRouteTrailCard} from './RecentRouteTrailCard';

interface ProfileTabProps {
  riderData: RiderData | null;
  userEmail: string;
  adminSettings: AdminSettings;
  myFeedbacks: Record<string, FeedbackRecord>;
  pushPermission: NotificationPermission | 'unsupported';
  shiftCompliance: ShiftComplianceStatus;
  batteryStatus: BatteryStatusSnapshot;
  gpsPolicy: GpsTrackingPolicy;
  idleLockEnabled: boolean;
  hapticsEnabled: boolean;
  ttsEnabled: boolean;
  autoGpsEnabled: boolean;
  securityEvents: SecurityEvent[];
  onToggleIdleLock: () => void;
  onToggleHaptics: () => void;
  onToggleTts: () => void;
  onToggleAutoGps: () => void;
  onTestTts: () => void;
  onLockTerminal: () => void;
  onClearSecurityEvents: () => void;
  onSaveProfile: (updates: {name: string; phone: string; upiId: string; vehicle: string}) => void;
  onSaveShiftHours: (shift: PreferredShiftHours) => void;
  onOpenFeedbackModal: () => void;
  onEnablePush: () => void;
  onSendTestPush: () => void;
  onLogout: () => void;
  onNotify: (msg: string, type?: 'success' | 'danger' | 'info' | 'warning') => void;
}

export const ProfileTab = memo(function ProfileTab({
  riderData,
  userEmail,
  adminSettings,
  myFeedbacks,
  pushPermission,
  shiftCompliance,
  batteryStatus,
  gpsPolicy,
  idleLockEnabled,
  hapticsEnabled,
  ttsEnabled,
  autoGpsEnabled,
  securityEvents,
  onToggleIdleLock,
  onToggleHaptics,
  onToggleTts,
  onToggleAutoGps,
  onTestTts,
  onLockTerminal,
  onClearSecurityEvents,
  onSaveProfile,
  onSaveShiftHours,
  onOpenFeedbackModal,
  onEnablePush,
  onSendTestPush,
  onLogout,
  onNotify,
}: ProfileTabProps) {
  const [name, setName] = useState(riderData?.name || '');
  const [phone, setPhone] = useState(riderData?.phone || '');
  const [upiId, setUpiId] = useState(riderData?.upiId || '');
  const [vehicle, setVehicle] = useState(riderData?.vehicle || '');

  const [shiftEnabled, setShiftEnabled] = useState<boolean>(
    riderData?.preferredShift?.enabled ?? true,
  );
  const [shiftStart, setShiftStart] = useState<string>(
    riderData?.preferredShift?.startTime || '08:00',
  );
  const [shiftEnd, setShiftEnd] = useState<string>(
    riderData?.preferredShift?.endTime || '20:00',
  );

  useEffect(() => {
    setName(riderData?.name || '');
    setPhone(riderData?.phone || '');
    setUpiId(riderData?.upiId || '');
    setVehicle(riderData?.vehicle || '');
  }, [riderData?.name, riderData?.phone, riderData?.upiId, riderData?.vehicle]);

  useEffect(() => {
    setShiftEnabled(riderData?.preferredShift?.enabled ?? true);
    setShiftStart(riderData?.preferredShift?.startTime || '08:00');
    setShiftEnd(riderData?.preferredShift?.endTime || '20:00');
  }, [
    riderData?.preferredShift?.enabled,
    riderData?.preferredShift?.startTime,
    riderData?.preferredShift?.endTime,
  ]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizeText(name.trim());
    const cleanPhone = phone.trim();
    const cleanUpi = upiId.trim();
    const cleanVehicle = sanitizeText(vehicle.trim());

    if (!isValidIndianMobile(cleanPhone)) {
      onNotify('Valid 10-digit mobile number enter karein!', 'danger');
      return;
    }
    if (!isValidUpiId(cleanUpi)) {
      onNotify('Valid UPI ID enter karein!', 'danger');
      return;
    }

    onSaveProfile({
      name: cleanName,
      phone: cleanPhone,
      upiId: cleanUpi,
      vehicle: cleanVehicle,
    });
  };

  const handleToggleShiftAlert = () => {
    const nextEnabled = !shiftEnabled;
    setShiftEnabled(nextEnabled);
    const check = isValidShiftHours(shiftStart, shiftEnd);
    if (check.valid) {
      onSaveShiftHours({
        enabled: nextEnabled,
        startTime: shiftStart,
        endTime: shiftEnd,
      });
    }
  };

  const handleSaveShift = (e: FormEvent) => {
    e.preventDefault();
    const check = isValidShiftHours(shiftStart, shiftEnd);
    if (!check.valid) {
      onNotify(check.reason || 'Invalid shift hours.', 'danger');
      return;
    }
    onSaveShiftHours({
      enabled: shiftEnabled,
      startTime: shiftStart,
      endTime: shiftEnd,
    });
  };

  const supportTelHref = getSafeTelHref(adminSettings.supportPhone);
  const waHref = getSafeWhatsAppUrl(adminSettings.supportWhatsapp || adminSettings.supportPhone);
  const hasSupportBtns = Boolean(supportTelHref || waHref);
  const profileUpiCheck = useMemo(
    () => verifyUpiSecurity(upiId, riderData?.upiId),
    [upiId, riderData?.upiId],
  );

  const feedbackEntries = useMemo(
    () =>
      Object.entries(myFeedbacks).sort(
        (a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0),
      ),
    [myFeedbacks],
  );

  const isOvernightWindow = shiftStart > shiftEnd;
  const shiftBadgeText = !shiftCompliance.enabled
    ? 'Paused'
    : shiftCompliance.isOvertimeOnDuty
      ? 'Outside Shift'
      : shiftCompliance.isWithinShift
        ? 'Within Shift'
        : 'Off Shift';
  const shiftBadgeClass = !shiftCompliance.enabled
    ? 'settlement-pending'
    : shiftCompliance.isOvertimeOnDuty
      ? 'settlement-rejected'
      : shiftCompliance.isWithinShift
        ? 'settlement-approved'
        : 'settlement-pending';

  return (
    <div id="tab-profile" className="tab-view active">
      <div className="section-header-row">
        <h3 className="section-title">Rider Profile &amp; Preferences</h3>
      </div>

      <div className="responsive-grid-2" style={{marginBottom: '1rem'}}>
        {/* Helpline & Feedback */}
        <div id="rider-support-card" className="surface-card" style={{marginBottom: 0}}>
          <strong style={{color: '#38bdf8', fontSize: '0.9rem', display: 'block', marginBottom: '4px'}}>
            <i className="fa-solid fa-headset" style={{marginRight: '6px'}} />
            Helpline &amp; Feedback
          </strong>
          <p id="rider-helpline-hours" style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px'}}>
            {adminSettings.supportHours
              ? `Hours: ${adminSettings.supportHours}`
              : 'Need hub assistance or want to report an issue?'}
          </p>

          {hasSupportBtns && (
            <div id="rider-support-btns" style={{display: 'flex', gap: '8px', marginBottom: '8px'}}>
              {supportTelHref && (
                <a
                  id="rider-support-call"
                  href={supportTelHref}
                  className="btn btn-outline btn-sm"
                  style={{flex: 1}}
                >
                  <i className="fa-solid fa-phone" /> Call Hub
                </a>
              )}
              {waHref && (
                <a
                  id="rider-support-wa"
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-success btn-sm"
                  style={{flex: 1}}
                >
                  <i className="fa-brands fa-whatsapp" /> WhatsApp
                </a>
              )}
            </div>
          )}

          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{width: '100%', borderColor: 'rgba(56, 189, 248, 0.4)', color: '#7dd3fc'}}
            onClick={onOpenFeedbackModal}
          >
            <i className="fa-solid fa-comment-dots" /> Send Feedback to Admin
          </button>

          {feedbackEntries.length > 0 && (
            <div id="rider-my-feedbacks" style={{marginTop: '10px'}}>
              {feedbackEntries.slice(0, 3).map(([id, f], idx) => (
                <div
                  key={id}
                  style={{
                    borderTop: idx > 0 ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid var(--border)',
                    padding: '0.5rem 0',
                    fontSize: '0.74rem',
                  }}
                >
                  <div style={{display: 'flex', justifyContent: 'space-between'}}>
                    <strong>{f.subject}</strong>
                    <span style={{color: f.status === 'RESOLVED' ? '#34d399' : '#fbbf24', fontWeight: 700}}>
                      {f.status}
                    </span>
                  </div>
                  {f.adminReply && (
                    <div style={{color: '#7dd3fc', marginTop: '2px'}}>Admin: {f.adminReply}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Push Notifications & App Install */}
        <div className="surface-card" style={{marginBottom: 0}}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '6px',
            }}
          >
            <strong style={{color: '#34d399', fontSize: '0.9rem'}}>
              <i className="fa-solid fa-bell" style={{marginRight: '6px'}} />
              Notifications &amp; App
            </strong>
            <span
              className={`settlement-badge ${
                pushPermission === 'granted' ? 'settlement-approved' : 'settlement-pending'
              }`}
            >
              {pushPermission === 'granted'
                ? 'Active'
                : pushPermission === 'denied'
                  ? 'Blocked'
                  : pushPermission === 'unsupported'
                    ? 'Unsupported'
                    : 'Off'}
            </span>
          </div>
          <p style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px'}}>
            Instant alerts for new trips, pickup ready updates, and payouts.
          </p>
          <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
            {pushPermission !== 'granted' ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{flex: 1}}
                onClick={onEnablePush}
              >
                <i className="fa-solid fa-bell" /> Enable Push Alerts
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{flex: 1, borderColor: 'rgba(16, 185, 129, 0.45)', color: '#34d399'}}
                onClick={onSendTestPush}
              >
                <i className="fa-solid fa-paper-plane" /> Send Test Push
              </button>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.55rem 0',
              borderTop: '1px solid var(--border)',
              marginTop: '10px',
            }}
          >
            <div>
              <div style={{fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)'}}>
                Haptic Feedback
              </div>
              <div style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>
                Subtle vibration on duty, accept, and delivery actions
              </div>
            </div>
            <button
              type="button"
              data-testid="haptics-toggle"
              role="switch"
              aria-checked={hapticsEnabled}
              className={`btn btn-sm ${hapticsEnabled ? 'btn-success' : 'btn-outline'}`}
              style={{width: 'auto', minWidth: '68px', padding: '0.3rem 0.7rem'}}
              onClick={onToggleHaptics}
            >
              {hapticsEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              padding: '0.55rem 0',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div>
              <div style={{fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)'}}>
                Voice Trip Alerts (TTS)
              </div>
              <div style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>
                Speaks store name &amp; total distance for new orders
              </div>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0}}>
              <button
                type="button"
                data-testid="test-tts-btn"
                className="btn btn-outline btn-sm"
                style={{
                  width: 'auto',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.72rem',
                  borderColor: 'rgba(56, 189, 248, 0.4)',
                  color: '#7dd3fc',
                }}
                onClick={onTestTts}
                aria-label="Test voice trip announcement"
              >
                <i className="fa-solid fa-volume-high" /> Test
              </button>
              <button
                type="button"
                data-testid="tts-toggle"
                role="switch"
                aria-checked={ttsEnabled}
                className={`btn btn-sm ${ttsEnabled ? 'btn-success' : 'btn-outline'}`}
                style={{width: 'auto', minWidth: '68px', padding: '0.3rem 0.7rem'}}
                onClick={onToggleTts}
              >
                {ttsEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
          <PWAInstallButton />
        </div>

        {/* Preferred Shift Hours */}
        <div
          data-testid="shift-hours-card"
          className="surface-card"
          style={{
            marginBottom: 0,
            borderColor: shiftCompliance.isOvertimeOnDuty ? 'rgba(245, 158, 11, 0.5)' : undefined,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '6px',
            }}
          >
            <strong style={{color: '#fbbf24', fontSize: '0.9rem'}}>
              <i className="fa-solid fa-clock" style={{marginRight: '6px'}} />
              Preferred Shift Hours
            </strong>
            <span data-testid="shift-status-badge" className={`settlement-badge ${shiftBadgeClass}`}>
              {shiftBadgeText}
            </span>
          </div>
          <p style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px'}}>
            Alert if still on duty outside{' '}
            <strong className="tabular-nums" style={{color: 'var(--text-main)'}}>
              {formatShiftTime12h(shiftStart)} – {formatShiftTime12h(shiftEnd)}
            </strong>
            {isOvernightWindow ? ' (Overnight)' : ''}.
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.5rem 0',
              borderTop: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
              marginBottom: '10px',
            }}
          >
            <span style={{fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)'}}>
              Out-of-Shift Duty Alert
            </span>
            <button
              type="button"
              data-testid="shift-hours-toggle"
              role="switch"
              aria-checked={shiftEnabled}
              className={`btn btn-sm ${shiftEnabled ? 'btn-success' : 'btn-outline'}`}
              style={{width: 'auto', minWidth: '68px', padding: '0.3rem 0.7rem'}}
              onClick={handleToggleShiftAlert}
            >
              {shiftEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <form onSubmit={handleSaveShift}>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
              <div className="form-group" style={{marginBottom: '0.65rem'}}>
                <label htmlFor="shift-start-time">Shift Start</label>
                <input
                  type="time"
                  id="shift-start-time"
                  data-testid="shift-start-input"
                  className="form-input"
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{marginBottom: '0.65rem'}}>
                <label htmlFor="shift-end-time">Shift End</label>
                <input
                  type="time"
                  id="shift-end-time"
                  data-testid="shift-end-input"
                  className="form-input"
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              data-testid="save-shift-btn"
              className="btn btn-outline btn-sm"
              style={{width: '100%', borderColor: 'rgba(251, 191, 36, 0.45)', color: '#fbbf24'}}
            >
              <i className="fa-solid fa-business-time" /> Save Shift Hours
            </button>
          </form>
        </div>

        {/* Battery Monitor */}
        <div
          data-testid="battery-monitor-card"
          className="surface-card"
          style={{
            marginBottom: 0,
            borderColor:
              gpsPolicy.mode === 'CRITICAL_SAVER'
                ? 'rgba(239, 68, 68, 0.45)'
                : gpsPolicy.mode === 'POWER_SAVER' || gpsPolicy.mode === 'MANUAL_PAUSED'
                  ? 'rgba(245, 158, 11, 0.45)'
                  : undefined,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '6px',
            }}
          >
            <strong style={{color: gpsPolicy.mode === 'MANUAL_PAUSED' ? '#fbbf24' : '#34d399', fontSize: '0.9rem'}}>
              <i
                className={`fa-solid ${
                  gpsPolicy.mode === 'MANUAL_PAUSED'
                    ? 'fa-location-crosshairs'
                    : batteryStatus.charging
                      ? 'fa-bolt'
                      : gpsPolicy.mode === 'HIGH_ACCURACY'
                        ? 'fa-battery-full'
                        : 'fa-battery-quarter'
                }`}
                style={{marginRight: '6px'}}
              />
              Battery &amp; GPS Saver
            </strong>
            <span
              data-testid="battery-mode-badge"
              className={`settlement-badge ${
                gpsPolicy.mode === 'CRITICAL_SAVER'
                  ? 'settlement-rejected'
                  : gpsPolicy.mode === 'POWER_SAVER' || gpsPolicy.mode === 'MANUAL_PAUSED'
                    ? 'settlement-pending'
                    : 'settlement-approved'
              }`}
            >
              {gpsPolicy.badgeLabel}
            </span>
          </div>

          <p style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px'}}>
            {gpsPolicy.reason}
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '10px',
              padding: '0.55rem 0',
              borderTop: '1px solid var(--border)',
              marginBottom: '0.35rem',
            }}
          >
            <div>
              <div style={{fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)'}}>
                Auto GPS Refresh
              </div>
              <div style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>
                {autoGpsEnabled
                  ? 'Updates live GPS coordinates automatically while on duty'
                  : 'Paused for critical battery saving — tap My GPS on Map'}
              </div>
            </div>
            <button
              type="button"
              data-testid="auto-gps-toggle"
              role="switch"
              aria-checked={autoGpsEnabled}
              aria-label="Toggle automatic GPS coordinate refresh"
              className={`btn btn-sm ${autoGpsEnabled ? 'btn-success' : 'btn-outline'}`}
              style={{width: 'auto', minWidth: '68px', padding: '0.3rem 0.7rem', flexShrink: 0}}
              onClick={onToggleAutoGps}
            >
              {autoGpsEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              borderTop: '1px solid var(--border)',
              paddingTop: '0.65rem',
            }}
          >
            <div>
              <div style={{fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700}}>
                Device Battery
              </div>
              <div
                data-testid="profile-battery-level"
                className="tabular-nums"
                style={{fontSize: '0.9rem', fontWeight: 800, color: '#f8fafc', marginTop: '2px'}}
              >
                {batteryStatus.supported && batteryStatus.levelPercent !== null
                  ? `${batteryStatus.levelPercent}% ${batteryStatus.charging ? '(Charging)' : ''}`
                  : 'Not Reported'}
              </div>
            </div>

            <div>
              <div style={{fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700}}>
                GPS Sync Rate
              </div>
              <div
                data-testid="profile-gps-interval"
                className="tabular-nums"
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  color: gpsPolicy.mode === 'MANUAL_PAUSED' ? '#fbbf24' : '#38bdf8',
                  marginTop: '2px',
                }}
              >
                {gpsPolicy.mode === 'MANUAL_PAUSED'
                  ? 'Manual Only'
                  : `Every ${Math.round(gpsPolicy.intervalMs / 1000)}s (${gpsPolicy.enableHighAccuracy ? 'High Acc' : 'Balanced'})`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* D3 Recent GPS Trail Visualization */}
      <RecentRouteTrailCard recentRoute={riderData?.recentRoute} />

      {/* Security & Scam Shield */}
      <div
        data-testid="security-shield-card"
        className="surface-card"
        style={{borderColor: 'rgba(56, 189, 248, 0.3)'}}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '6px',
          }}
        >
          <strong style={{color: '#38bdf8', fontSize: '0.92rem'}}>
            <i className="fa-solid fa-shield-halved" style={{marginRight: '6px'}} />
            Security &amp; Scam Shield
          </strong>
          <span className="settlement-badge settlement-approved">Protected</span>
        </div>

        <p style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem'}}>
          Active protection against phishing QRs, fake UTRs, brute-force PIN/login attacks, and payout UPI hijacking.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '8px',
            marginBottom: '0.75rem',
          }}
        >
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.24)',
              borderRadius: '10px',
              padding: '0.55rem 0.7rem',
              fontSize: '0.73rem',
            }}
          >
            <div style={{fontWeight: 800, color: '#34d399'}}>PIN &amp; Auth Lock</div>
            <div style={{color: 'var(--text-muted)', marginTop: '2px'}}>3-try PIN &amp; 5-try Login guard</div>
          </div>
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.24)',
              borderRadius: '10px',
              padding: '0.55rem 0.7rem',
              fontSize: '0.73rem',
            }}
          >
            <div style={{fontWeight: 800, color: '#7dd3fc'}}>QR &amp; UTR Scam Filter</div>
            <div style={{color: 'var(--text-muted)', marginTop: '2px'}}>Blocks phishing links &amp; fake UTRs</div>
          </div>
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.24)',
              borderRadius: '10px',
              padding: '0.55rem 0.7rem',
              fontSize: '0.73rem',
            }}
          >
            <div style={{fontWeight: 800, color: '#fbbf24'}}>Blocked Threats</div>
            <div data-testid="security-events-count" className="tabular-nums" style={{color: '#fde68a', marginTop: '2px'}}>
              {securityEvents.length} {securityEvents.length === 1 ? 'event' : 'events'} this session
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.55rem 0',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            marginBottom: '0.75rem',
          }}
        >
          <div>
            <div style={{fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)'}}>
              15-Min Inactivity Screen Lock
            </div>
            <div style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>
              Locks OTPs &amp; payout controls if phone is left unattended
            </div>
          </div>
          <button
            type="button"
            data-testid="idle-lock-toggle"
            role="switch"
            aria-checked={idleLockEnabled}
            className={`btn btn-sm ${idleLockEnabled ? 'btn-success' : 'btn-outline'}`}
            style={{width: 'auto', minWidth: '68px', padding: '0.3rem 0.7rem'}}
            onClick={onToggleIdleLock}
          >
            {idleLockEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {securityEvents.length > 0 && (
          <div
            data-testid="security-events-list"
            style={{
              background: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '0.55rem 0.7rem',
              marginBottom: '0.75rem',
            }}
          >
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
              <span style={{fontSize: '0.7rem', fontWeight: 800, color: '#fca5a5', textTransform: 'uppercase'}}>
                Recent Blocked Activity
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{padding: '0.15rem 0.5rem', minHeight: '24px', fontSize: '0.68rem'}}
                onClick={onClearSecurityEvents}
              >
                Clear
              </button>
            </div>
            {securityEvents.slice(0, 3).map((ev) => (
              <div
                key={ev.id}
                style={{fontSize: '0.72rem', color: '#e2e8f0', padding: '2px 0', lineHeight: 1.35}}
              >
                • {ev.summary}
              </div>
            ))}
          </div>
        )}

        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
          <button
            type="button"
            data-testid="lock-terminal-btn"
            className="btn btn-outline btn-sm"
            style={{flex: 1, borderColor: 'rgba(56, 189, 248, 0.45)', color: '#7dd3fc'}}
            onClick={onLockTerminal}
          >
            <i className="fa-solid fa-lock" /> Lock Terminal Now
          </button>
        </div>
      </div>

      {/* Driver Details Form */}
      <div className="surface-card">
        <form id="profile-form" onSubmit={handleSubmit}>
          <div className="responsive-grid-2">
            <div className="form-group">
              <label htmlFor="prof-name">Driver Full Name</label>
              <input
                type="text"
                id="prof-name"
                className="form-input"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="prof-email">Registered Email</label>
              <input
                type="email"
                id="prof-email"
                className="form-input"
                value={userEmail}
                disabled
                style={{background: '#080d19', color: 'var(--text-muted)'}}
              />
            </div>
            <div className="form-group">
              <label htmlFor="prof-phone">10-Digit Mobile Number</label>
              <input
                type="tel"
                id="prof-phone"
                className="form-input"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="prof-upi">UPI ID for Payouts</label>
              <input
                type="text"
                id="prof-upi"
                className="form-input"
                maxLength={80}
                placeholder="e.g. 9876543210@paytm"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                required
              />
            </div>
          </div>
          {upiId.trim() && profileUpiCheck.isDifferentFromProfile && (
            <div
              data-testid="profile-upi-change-alert"
              role="alert"
              style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fde68a',
                borderRadius: '10px',
                padding: '0.5rem 0.7rem',
                fontSize: '0.73rem',
                fontWeight: 700,
                marginBottom: '0.75rem',
              }}
            >
              ⚠️ Changing your Payout UPI ID affects where your future earnings are sent. Double-check before saving.
            </div>
          )}
          <div className="form-group">
            <label htmlFor="prof-vehicle">Vehicle Information</label>
            <input
              type="text"
              id="prof-vehicle"
              className="form-input"
              maxLength={80}
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{marginTop: '0.25rem'}}>
            <i className="fa-solid fa-floppy-disk" /> Save Details &amp; UPI ID
          </button>
        </form>
      </div>

      <button
        type="button"
        className="btn btn-outline"
        onClick={onLogout}
        style={{color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.45)'}}
      >
        <i className="fa-solid fa-right-from-bracket" /> End Shift &amp; Sign Out
      </button>
    </div>
  );
});
