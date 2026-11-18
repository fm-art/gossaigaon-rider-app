import {memo, useEffect, useState} from 'react';
import type {AdminSettings, RiderData} from '../types/rider';
import type {BatteryStatusSnapshot, GpsTrackingPolicy} from '../utils/riderLogic';
import {PWAInstallButton} from './PWAInstallButton';

interface RiderHeaderProps {
  riderData: RiderData | null;
  adminSettings: AdminSettings;
  soundEnabled: boolean;
  gpsSyncTime: string;
  batteryStatus: BatteryStatusSnapshot;
  gpsPolicy: GpsTrackingPolicy;
  netCashInHand: number;
  maxAllowedCashLimit: number;
  pushPermission: NotificationPermission | 'unsupported';
  onToggleSound: () => void;
  onToggleDuty: () => void;
  onEnablePush: () => void;
  onOpenDeposit: () => void;
}

export const RiderHeader = memo(function RiderHeader({
  riderData,
  adminSettings,
  soundEnabled,
  gpsSyncTime,
  batteryStatus,
  gpsPolicy,
  netCashInHand,
  maxAllowedCashLimit,
  pushPermission,
  onToggleSound,
  onToggleDuty,
  onEnablePush,
  onOpenDeposit,
}: RiderHeaderProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [riderData?.profilePhoto]);

  const isOnline = Boolean(riderData?.online && riderData?.suspended !== true);
  const ratingValue = riderData?.ratingCount
    ? `★ ${Number(riderData.ratingAvg || 5).toFixed(1)} (${riderData.ratingCount})`
    : 'New Rider';

  const showProfileImg = Boolean(riderData?.profilePhoto && !avatarFailed);

  return (
    <>
      <div className="rider-header-shell">
        <header className="rider-header">
          <div className="rider-meta">
            <div className="rider-avatar" style={{overflow: 'hidden'}}>
              {showProfileImg ? (
                <img
                  src={riderData?.profilePhoto}
                  alt={riderData?.name || riderData?.fullName || 'Rider'}
                  style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}}
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <i className="fa-solid fa-motorcycle" />
              )}
            </div>
            <div style={{minWidth: 0}}>
              <h4
                id="header-rider-name"
                style={{
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {riderData?.name || 'Chutki Rider'}
              </h4>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                <span
                  id="header-rider-vehicle"
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minWidth: 0,
                  }}
                >
                  {riderData?.vehicle || 'Vehicle'}
                </span>
                <span aria-hidden="true" style={{flexShrink: 0}}>·</span>
                <span
                  id="header-rider-rating"
                  style={{
                    color: '#fbbf24',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                  }}
                >
                  {ratingValue}
                </span>
              </div>
            </div>
          </div>

          <div style={{display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0}}>
            <button
              type="button"
              className="header-icon-btn"
              id="btn-push-toggle"
              aria-label={
                pushPermission === 'granted' ? 'Push notifications enabled' : 'Enable push notifications'
              }
              onClick={onEnablePush}
              style={{
                color: pushPermission === 'granted' ? '#34d399' : '#fbbf24',
              }}
            >
              <i className={pushPermission === 'granted' ? 'fa-solid fa-bell' : 'fa-solid fa-bell-slash'} />
            </button>

            <button
              type="button"
              className="header-icon-btn"
              id="btn-sound-toggle"
              aria-label={soundEnabled ? 'Mute trip chime' : 'Unmute trip chime'}
              onClick={onToggleSound}
            >
              <i className={soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark'} />
            </button>

            <button
              type="button"
              className="online-toggle"
              onClick={onToggleDuty}
              aria-label={isOnline ? 'Switch Duty Offline' : 'Switch Duty Online'}
            >
              <div className={`online-indicator ${isOnline ? 'is-online' : ''}`} id="status-indicator" />
              <span id="status-label">{isOnline ? 'Online' : 'Offline'}</span>
            </button>
          </div>
        </header>
      </div>

      {riderData?.suspended === true && (
        <div id="rider-suspended-banner" className="admin-alert-bar suspended">
          <strong>Account Suspended:</strong> Duty and trips are temporarily locked by Admin.
        </div>
      )}

      {riderData?.adminNote && (
        <div id="rider-specific-notice" className="admin-alert-bar personal">
          <i className="fa-solid fa-message" /> Admin: {riderData.adminNote}
        </div>
      )}

      {adminSettings.riderAnnouncement && (
        <div id="rider-admin-broadcast" className="admin-alert-bar broadcast">
          <i className="fa-solid fa-bullhorn" /> {adminSettings.riderAnnouncement}
        </div>
      )}

      {pushPermission === 'default' && (
        <div
          className="admin-alert-bar broadcast"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            textAlign: 'left',
          }}
        >
          <span style={{fontSize: '0.74rem', fontWeight: 600}}>
            <i className="fa-solid fa-bell" style={{marginRight: '6px', color: '#38bdf8'}} />
            Enable push alerts for instant trip &amp; payout updates
          </span>
          <div style={{display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0}}>
            <button
              type="button"
              className="btn btn-info btn-sm"
              style={{minHeight: '32px', padding: '0.3rem 0.75rem'}}
              onClick={onEnablePush}
            >
              Enable
            </button>
            <PWAInstallButton compact />
          </div>
        </div>
      )}

      {isOnline && (
        <div
          id="gps-radar-bar"
          data-testid="gps-radar-bar"
          style={
            gpsPolicy.mode === 'MANUAL_PAUSED'
              ? {
                  background: 'rgba(148, 163, 184, 0.1)',
                  borderTopColor: 'rgba(148, 163, 184, 0.25)',
                  color: '#cbd5e1',
                }
              : gpsPolicy.mode === 'CRITICAL_SAVER'
                ? {
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderTopColor: 'rgba(239, 68, 68, 0.3)',
                    color: '#fca5a5',
                  }
                : gpsPolicy.mode === 'POWER_SAVER'
                  ? {
                      background: 'rgba(245, 158, 11, 0.1)',
                      borderTopColor: 'rgba(245, 158, 11, 0.3)',
                      color: '#fde68a',
                    }
                  : undefined
          }
        >
          <div className="gps-radar-inner">
            <span
              data-testid="gps-radar-mode"
              style={{display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0}}
            >
              <i
                className={`fa-solid ${
                  gpsPolicy.mode === 'MANUAL_PAUSED'
                    ? 'fa-circle-pause'
                    : gpsPolicy.mode === 'HIGH_ACCURACY'
                      ? 'fa-satellite-dish'
                      : 'fa-battery-quarter'
                }`}
              />
              <span>
                {gpsPolicy.mode === 'MANUAL_PAUSED'
                  ? 'GPS · Manual'
                  : gpsPolicy.mode === 'HIGH_ACCURACY'
                    ? 'GPS · 5s'
                    : gpsPolicy.badgeLabel}
              </span>
              {batteryStatus.supported && batteryStatus.levelPercent !== null && (
                <span
                  data-testid="header-battery-pill"
                  className="tabular-nums"
                  style={{
                    color:
                      batteryStatus.levelPercent < 15 && !batteryStatus.charging
                        ? '#fca5a5'
                        : 'var(--text-muted)',
                    fontWeight: 700,
                  }}
                >
                  · {batteryStatus.charging ? '⚡' : ''}
                  {batteryStatus.levelPercent}%
                </span>
              )}
            </span>
            <span
              id="gps-sync-time"
              style={{
                color:
                  gpsPolicy.mode === 'MANUAL_PAUSED'
                    ? '#cbd5e1'
                    : gpsPolicy.mode === 'CRITICAL_SAVER'
                      ? '#fecaca'
                      : gpsPolicy.mode === 'POWER_SAVER'
                        ? '#fef3c7'
                        : '#a7f3d0',
              }}
            >
              {gpsSyncTime}
            </span>
          </div>
        </div>
      )}

      {netCashInHand >= maxAllowedCashLimit && (
        <div id="cash-limit-banner">
          <div>
            <i className="fa-solid fa-lock" />{' '}
            <strong id="cash-limit-banner-text">Cash Limit ₹{maxAllowedCashLimit}+ Reached:</strong> Deposit
            COD cash to unlock pickups.
          </div>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            style={{width: 'auto', padding: '4px 10px', flexShrink: 0}}
            onClick={onOpenDeposit}
          >
            Deposit
          </button>
        </div>
      )}

      {riderData && riderData.approved !== true && (
        <div id="approval-banner" className="approval-banner">
          <i className="fa-solid fa-triangle-exclamation" style={{fontSize: '1.1rem', color: 'var(--warning)'}} />
          <div>
            <strong>Approval Pending:</strong> Your account is under verification by Chutki Admin.
          </div>
        </div>
      )}
    </>
  );
});
