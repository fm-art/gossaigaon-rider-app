import {useEffect, useMemo, useState, type FormEvent} from 'react';
import QRCode from 'qrcode';
import {
  calculateChangeReturn,
  type BatteryStatusSnapshot,
  type GpsTrackingPolicy,
} from '../utils/riderLogic';
import {canCompleteCodDelivery, verifyUpiSecurity} from '../utils/security';
import {QrScannerPanel} from './QrScannerPanel';

export interface VerifyModalState {
  open: boolean;
  tripId: string;
  targetAmt: number;
  isPrepaid: boolean;
  initialMode?: 'pin' | 'qr';
}

interface CancelModalProps {
  open: boolean;
  tripId: string;
  onClose: () => void;
  onConfirm: (tripId: string, reason: string) => void;
}

export function CancelTripModal({open, tripId, onClose, onConfirm}: CancelModalProps) {
  const [reason, setReason] = useState('Vehicle breakdown / Tyre puncture');
  const [note, setNote] = useState('');

  if (!open) return null;

  return (
    <div className="modal-backdrop open" id="riderCancelTripModal" role="dialog" aria-modal="true">
      <div className="modal-box">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <h3 style={{fontWeight: 800, fontSize: '1.15rem', color: 'var(--danger)'}}>
            <i className="fa-solid fa-ban" /> Pass / Reject Trip
          </h3>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close Pass Trip modal"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div id="cancel-modal-order-tag" style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.85rem'}}>
          Trip: #{tripId.slice(-6)}
        </div>
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '12px',
            padding: '0.8rem 0.95rem',
            marginBottom: '1rem',
            fontSize: '0.82rem',
          }}
        >
          Pass karne par yeh trip turant agle nearest online rider ke paas chala jayega.
        </div>
        <div className="form-group">
          <label htmlFor="rider-cancel-reason-select">
            Select Reason <span style={{color: 'var(--danger)'}}>*</span>
          </label>
          <select
            id="rider-cancel-reason-select"
            className="form-input"
            style={{fontWeight: 700}}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="Vehicle breakdown / Tyre puncture">Vehicle breakdown / Tyre puncture</option>
            <option value="Heavy rainfall / Severe waterlogging">Heavy rainfall / Waterlogging</option>
            <option value="Personal emergency / Ending shift">Personal emergency / Ending shift</option>
            <option value="Customer unreachable">Customer unreachable</option>
          </select>
        </div>
        <div className="form-group" style={{marginBottom: '1.25rem'}}>
          <label htmlFor="rider-cancel-note">Extra Note (Optional)</label>
          <textarea
            id="rider-cancel-note"
            className="form-input"
            rows={2}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div style={{display: 'flex', gap: '8px'}}>
          <button type="button" className="btn btn-outline" style={{flex: 1}} onClick={onClose}>
            Go Back
          </button>
          <button
            type="button"
            className="btn btn-danger"
            style={{flex: 1.3}}
            onClick={() => {
              const trimmed = note.trim();
              onConfirm(tripId, trimmed ? `${reason} (${trimmed})` : reason);
              setNote('');
            }}
          >
            Confirm Pass
          </button>
        </div>
      </div>
    </div>
  );
}

interface SosModalProps {
  open: boolean;
  tripId: string;
  onClose: () => void;
  onSubmit: (tripId: string, reason: string) => void;
}

export function SosModal({open, tripId, onClose, onSubmit}: SosModalProps) {
  const [reason, setReason] = useState('🌧️ Heavy rainfall / severe waterlogging on route');

  if (!open) return null;

  return (
    <div className="modal-backdrop open" id="riderSosModal" role="dialog" aria-modal="true">
      <div className="modal-box">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <h3 style={{fontWeight: 900, color: 'var(--warning)', fontSize: '1.15rem'}}>
            <i className="fa-solid fa-triangle-exclamation" /> Road Delay / Issue Alert
          </h3>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close Road Issue modal"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="form-group">
          <label htmlFor="sos-reason-select">Select Delay Reason</label>
          <select
            id="sos-reason-select"
            className="form-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="🌧️ Heavy rainfall / severe waterlogging on route">
              🌧️ Heavy rainfall / waterlogging
            </option>
            <option value="🛵 Bike tyre puncture / minor breakdown">
              🛵 Tyre puncture / minor breakdown
            </option>
            <option value="🚦 Severe traffic jam on main road">🚦 Severe traffic jam</option>
            <option value="📞 Customer doorstep gate locked / waiting">
              📞 Customer doorstep locked
            </option>
          </select>
        </div>
        <div style={{display: 'flex', gap: '8px'}}>
          <button type="button" className="btn btn-outline" style={{flex: 1}} onClick={onClose}>
            Back
          </button>
          <button
            type="button"
            className="btn btn-warning"
            style={{flex: 1.4}}
            onClick={() => onSubmit(tripId, reason)}
          >
            <i className="fa-solid fa-paper-plane" /> Broadcast Alert
          </button>
        </div>
      </div>
    </div>
  );
}

interface PayoutModalProps {
  open: boolean;
  availableBalance: number;
  minAmount: number;
  maxAmount: number;
  defaultUpi: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (amount: number, upiId: string) => void;
}

export function PayoutModal({
  open,
  availableBalance,
  minAmount,
  maxAmount,
  defaultUpi,
  submitting,
  onClose,
  onSubmit,
}: PayoutModalProps) {
  const [amount, setAmount] = useState(
    String(Math.min(Math.floor(availableBalance), maxAmount)),
  );
  const [upiId, setUpiId] = useState(defaultUpi);

  useEffect(() => {
    if (open) {
      setAmount(String(Math.min(Math.floor(availableBalance), maxAmount)));
      setUpiId(defaultUpi);
    }
  }, [open, availableBalance, maxAmount, defaultUpi]);

  const upiSecurity = useMemo(
    () => verifyUpiSecurity(upiId, defaultUpi),
    [upiId, defaultUpi],
  );

  if (!open) return null;

  return (
    <div className="modal-backdrop open" id="riderPayoutModal" role="dialog" aria-modal="true">
      <div className="modal-box">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{fontWeight: 800, fontSize: '1.15rem', color: '#38bdf8'}}>
            Withdraw Earnings to UPI
          </h3>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close Payout modal"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid #38bdf8',
            borderRadius: '14px',
            padding: '1rem',
            textAlign: 'center',
            marginBottom: '1rem',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Available Payout Balance
          </span>
          <div id="modal-payout-available-display" style={{fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8'}}>
            ₹{availableBalance.toFixed(2)}
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="payout-req-amount" id="payout-amt-limit-label">
            Withdraw Amount (Min ₹{minAmount} - Max ₹{maxAmount})
          </label>
          <input
            type="number"
            id="payout-req-amount"
            className="form-input"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="payout-req-upi">
            Verify Your Receiving UPI ID <span style={{color: 'red'}}>*</span>
          </label>
          <input
            type="text"
            id="payout-req-upi"
            className="form-input"
            maxLength={80}
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            required
          />
        </div>
        {upiId.trim() && (!upiSecurity.valid || upiSecurity.isDifferentFromProfile) && (
          <div
            data-testid="payout-upi-scam-warning"
            role="alert"
            style={{
              background: !upiSecurity.valid
                ? 'rgba(239, 68, 68, 0.14)'
                : 'rgba(245, 158, 11, 0.14)',
              border: !upiSecurity.valid
                ? '1px solid rgba(239, 68, 68, 0.45)'
                : '1px solid rgba(245, 158, 11, 0.45)',
              color: !upiSecurity.valid ? '#fecaca' : '#fde68a',
              borderRadius: '10px',
              padding: '0.6rem 0.75rem',
              fontSize: '0.74rem',
              fontWeight: 700,
              marginBottom: '0.85rem',
              lineHeight: 1.35,
            }}
          >
            {!upiSecurity.valid ? upiSecurity.reason : upiSecurity.warning}
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          id="btn-submit-payout"
          style={{background: '#0284c7'}}
          disabled={submitting}
          onClick={() => onSubmit(Number(amount || 0), upiId.trim())}
        >
          <i className="fa-solid fa-paper-plane" /> Send Withdrawal Request
        </button>
      </div>
    </div>
  );
}

interface DeliveryVerifyModalProps {
  state: VerifyModalState;
  submitting: boolean;
  pinLockRemainingSec?: number;
  qrError?: string | null;
  onClearQrError?: () => void;
  onClose: () => void;
  onConfirm: (tripId: string, enteredPin: string, cashTendered?: string) => void;
  onConfirmQr: (tripId: string, rawQrPayload: string, cashTendered?: string) => void;
}

export function DeliveryVerifyModal({
  state,
  submitting,
  pinLockRemainingSec = 0,
  qrError,
  onClearQrError,
  onClose,
  onConfirm,
  onConfirmQr,
}: DeliveryVerifyModalProps) {
  const [mode, setMode] = useState<'pin' | 'qr'>(state.initialMode || 'pin');
  const [otpInput, setOtpInput] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  const [localQrError, setLocalQrError] = useState<string | null>(null);

  useEffect(() => {
    if (state.open) {
      setMode(state.initialMode || 'pin');
      setOtpInput('');
      setCashTendered('');
      setLocalQrError(null);
    }
  }, [state.open, state.tripId, state.initialMode]);

  if (!state.open) return null;

  const tenderedNum = Number(cashTendered || 0);
  const {change, isShort} = calculateChangeReturn(state.targetAmt, tenderedNum);
  const codGuard = canCompleteCodDelivery(state.isPrepaid, state.targetAmt, cashTendered);
  const activeQrError = qrError || localQrError;
  const isPinLocked = pinLockRemainingSec > 0;

  return (
    <div className="modal-backdrop open" id="deliveryVerifyModal" role="dialog" aria-modal="true">
      <div className="modal-box">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <h3 style={{fontWeight: 800, fontSize: '1.15rem'}}>
            {mode === 'qr' ? 'Scan Customer QR & Complete' : 'Verify PIN & Complete Trip'}
          </h3>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close delivery verification modal"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <p style={{fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem'}} id="verify-modal-order-label">
          Trip: #{state.tripId.slice(-6)}
        </p>

        {/* Verification Mode Switcher (PIN vs Camera QR) */}
        <div style={{display: 'flex', gap: '8px', marginBottom: '0.9rem'}}>
          <button
            type="button"
            data-testid="verify-mode-pin"
            className={`btn btn-sm ${mode === 'pin' ? 'btn-primary' : 'btn-outline'}`}
            style={{flex: 1}}
            onClick={() => {
              setMode('pin');
              setLocalQrError(null);
              onClearQrError?.();
            }}
          >
            <i className="fa-solid fa-key" /> Enter PIN
          </button>
          <button
            type="button"
            data-testid="verify-mode-qr"
            className={`btn btn-sm ${mode === 'qr' ? 'btn-success' : 'btn-outline'}`}
            style={{
              flex: 1,
              borderColor: mode === 'qr' ? 'var(--primary)' : '#34d399',
              color: mode === 'qr' ? '#fff' : '#34d399',
            }}
            onClick={() => {
              setMode('qr');
              setLocalQrError(null);
              onClearQrError?.();
            }}
          >
            <i className="fa-solid fa-qrcode" /> Scan QR
          </button>
        </div>

        {mode === 'pin' ? (
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.08)',
              border: `1px dashed ${isPinLocked ? '#ef4444' : '#38bdf8'}`,
              borderRadius: '14px',
              padding: '1rem',
              marginBottom: '1rem',
              textAlign: 'center',
            }}
          >
            <label
              htmlFor="verify-otp-input"
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                color: isPinLocked ? '#fca5a5' : '#38bdf8',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '8px',
              }}
            >
              🔐 Enter Customer&apos;s 4-Digit Delivery PIN
            </label>
            <input
              type="text"
              inputMode="numeric"
              id="verify-otp-input"
              className="otp-verify-input"
              placeholder="----"
              maxLength={4}
              disabled={isPinLocked}
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            {isPinLocked ? (
              <div
                data-testid="pin-lock-banner"
                role="alert"
                style={{
                  color: '#fecaca',
                  background: 'rgba(239, 68, 68, 0.16)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '10px',
                  padding: '0.45rem 0.65rem',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  marginTop: '8px',
                }}
              >
                🔒 PIN Brute-Force Lock active — Wait{' '}
                <strong className="tabular-nums">{pinLockRemainingSec}s</strong> before trying again.
              </div>
            ) : (
              <small
                style={{
                  color: 'var(--warning)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  display: 'block',
                  marginTop: '6px',
                }}
              >
                Max 3 attempts allowed before persistent security lock.
              </small>
            )}
          </div>
        ) : (
          <QrScannerPanel
            active={state.open && mode === 'qr'}
            disabled={submitting}
            errorBanner={activeQrError}
            onScanSuccess={(raw) => {
              setLocalQrError(null);
              onConfirmQr(state.tripId, raw, cashTendered);
            }}
            onScanError={(msg) => setLocalQrError(msg)}
          />
        )}

        {!state.isPrepaid && (
          <div id="verify-cod-section">
            <div
              style={{
                background: 'rgba(22, 163, 74, 0.12)',
                borderRadius: '12px',
                padding: '0.85rem',
                textAlign: 'center',
                marginBottom: '0.85rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 800,
                }}
              >
                Total COD Cash to Collect
              </span>
              <div
                id="verify-modal-bill-amt"
                style={{fontSize: '1.65rem', fontWeight: 800, color: 'var(--primary)'}}
              >
                ₹{state.targetAmt.toFixed(2)}
              </div>
            </div>
            <div className="form-group" style={{marginBottom: '0.65rem'}}>
              <label htmlFor="cash-tendered">Cash Tendered by Customer</label>
              <input
                type="number"
                id="cash-tendered"
                className="form-input"
                placeholder="e.g. 500"
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                fontSize: '0.9rem',
                fontWeight: 800,
                marginBottom: codGuard.allowed ? '0.85rem' : '0.45rem',
              }}
            >
              <span>Change to Return:</span>
              <span
                id="cash-change-return"
                style={{color: isShort ? 'var(--danger)' : 'var(--primary)'}}
              >
                {isShort
                  ? `Need ₹${Math.abs(change).toFixed(2)} more`
                  : `₹${change.toFixed(2)}`}
              </span>
            </div>
            {!codGuard.allowed && (
              <div
                data-testid="cod-short-warning"
                role="alert"
                style={{
                  background: 'rgba(239, 68, 68, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.45)',
                  color: '#fecaca',
                  borderRadius: '10px',
                  padding: '0.5rem 0.7rem',
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  marginBottom: '0.85rem',
                }}
              >
                {codGuard.reason}
              </div>
            )}
          </div>
        )}

        {mode === 'pin' && (
          <button
            type="button"
            className="btn btn-success"
            id="btn-confirm-pin-delivery"
            disabled={submitting || isPinLocked || !codGuard.allowed}
            onClick={() => onConfirm(state.tripId, otpInput.trim(), cashTendered)}
          >
            <i className="fa-solid fa-shield-halved" />{' '}
            {isPinLocked
              ? `Locked (${pinLockRemainingSec}s)`
              : submitting
                ? 'Verifying...'
                : 'Verify PIN & Complete Trip'}
          </button>
        )}
      </div>
    </div>
  );
}

interface DepositModalProps {
  open: boolean;
  netCashInHand: number;
  adminUpiId: string;
  minAmount: number;
  maxAmount: number;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (amount: number, mode: 'UPI' | 'CASH', utr: string) => void;
}

export function DepositModal({
  open,
  netCashInHand,
  adminUpiId,
  minAmount,
  maxAmount,
  submitting,
  onClose,
  onSubmit,
}: DepositModalProps) {
  const [amount, setAmount] = useState(String(Math.min(Math.round(netCashInHand), maxAmount)));
  const [mode, setMode] = useState<'UPI' | 'CASH'>('UPI');
  const [utr, setUtr] = useState('');
  const [localQrDataUrl, setLocalQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (open) {
      setAmount(String(Math.min(Math.round(netCashInHand), maxAmount)));
      setUtr('');
    }
  }, [open, netCashInHand, maxAmount]);

  const qrAmt = Math.max(1, Number(amount || netCashInHand));
  const upiString = `upi://pay?pa=${encodeURIComponent(adminUpiId)}&pn=GossaigaonBazarAdmin&am=${qrAmt.toFixed(
    2,
  )}&cu=INR`;

  useEffect(() => {
    if (!open || mode !== 'UPI') return;
    let active = true;
    void QRCode.toDataURL(upiString, {
      width: 172,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {dark: '#050811', light: '#ffffff'},
    })
      .then((dataUrl) => {
        if (active) setLocalQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setLocalQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [open, mode, upiString]);

  if (!open) return null;

  return (
    <div className="modal-backdrop open" id="depositModal" role="dialog" aria-modal="true">
      <div className="modal-box">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{fontWeight: 800, fontSize: '1.15rem'}}>Deposit COD Cash to Admin</h3>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close COD deposit modal"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div
          style={{
            background: 'rgba(22, 163, 74, 0.1)',
            border: '1px solid var(--primary)',
            borderRadius: '14px',
            padding: '1rem',
            textAlign: 'center',
            marginBottom: '1rem',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Total COD Cash in Hand
          </span>
          <div
            id="modal-deposit-amount-display"
            style={{fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)'}}
          >
            ₹{netCashInHand.toFixed(2)}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="deposit-amount-input" id="deposit-amt-limit-label">
            Deposit Amount (Min ₹{minAmount} - Max ₹{maxAmount})
          </label>
          <input
            type="number"
            id="deposit-amount-input"
            className="form-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div style={{display: 'flex', gap: '8px', marginBottom: '1rem'}}>
          <button
            type="button"
            id="btn-dep-mode-upi"
            className={`btn ${mode === 'UPI' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            style={{flex: 1}}
            onClick={() => setMode('UPI')}
          >
            <i className="fa-solid fa-qrcode" /> Pay via UPI
          </button>
          <button
            type="button"
            id="btn-dep-mode-cash"
            className={`btn ${mode === 'CASH' ? 'btn-primary' : 'btn-outline'} btn-sm`}
            style={{flex: 1}}
            onClick={() => setMode('CASH')}
          >
            <i className="fa-solid fa-hand-holding-dollar" /> Office Handover
          </button>
        </div>

        {mode === 'UPI' ? (
          <div id="deposit-upi-box" style={{textAlign: 'center'}}>
            <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px'}}>
              Verified Hub UPI ID:{' '}
              <strong id="deposit-admin-upi-id" style={{color: '#38bdf8'}}>
                {adminUpiId}
              </strong>
            </p>
            {localQrDataUrl && (
              <img
                src={localQrDataUrl}
                id="deposit-qr-img"
                data-testid="deposit-qr-img"
                style={{
                  width: '150px',
                  height: '150px',
                  borderRadius: '12px',
                  background: '#fff',
                  padding: '6px',
                  margin: '0 auto 0.6rem',
                  display: 'block',
                }}
                alt="Locally generated Official Admin UPI QR"
              />
            )}
            <div
              data-testid="deposit-anti-scam-notice"
              style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.28)',
                borderRadius: '10px',
                padding: '0.45rem 0.65rem',
                fontSize: '0.71rem',
                color: '#bae6fd',
                marginBottom: '0.75rem',
                lineHeight: 1.35,
              }}
            >
              <i className="fa-solid fa-shield-halved" style={{marginRight: '4px', color: '#38bdf8'}} />
              Offline-generated Hub QR. Never pay third-party WhatsApp links or unverified UPI IDs.
            </div>
            <div className="form-group" style={{textAlign: 'left', marginBottom: '1rem'}}>
              <label htmlFor="deposit-utr">
                Enter Exact 12-Digit UPI UTR No. <span style={{color: 'red'}}>*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                id="deposit-utr"
                className="form-input"
                placeholder="e.g. 412893471923"
                maxLength={12}
                style={{fontWeight: 800, letterSpacing: '1px', textAlign: 'center'}}
                value={utr}
                onChange={(e) => setUtr(e.target.value.replace(/\D/g, '').slice(0, 12))}
              />
            </div>
          </div>
        ) : (
          <div
            id="deposit-cash-box"
            style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
            }}
          >
            <i className="fa-solid fa-location-dot" style={{color: 'var(--primary)'}} /> Hand over
            exact cash at Gossaigaon Bazar Hub Office.
          </div>
        )}

        <button
          type="button"
          className="btn btn-success"
          id="btn-submit-deposit"
          disabled={submitting}
          onClick={() => onSubmit(Number(amount || 0), mode, utr.trim())}
        >
          <i className="fa-solid fa-paper-plane" /> Submit Verified Handover
        </button>
      </div>
    </div>
  );
}

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (subject: string, message: string) => void;
}

export function FeedbackModal({open, onClose, onSubmit}: FeedbackModalProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(subject.trim(), message.trim());
    setSubject('');
    setMessage('');
  };

  return (
    <div className="modal-backdrop open" id="riderFeedbackModal" role="dialog" aria-modal="true">
      <div className="modal-box">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{fontWeight: 900, color: '#38bdf8'}}>Send Feedback / Issue to Admin</h3>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Close feedback modal"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <form id="rider-feedback-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="rider-fb-subject">Subject</label>
            <input
              type="text"
              id="rider-fb-subject"
              className="form-input"
              placeholder="e.g. Payout / Route / App Issue"
              maxLength={100}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="rider-fb-message">Message</label>
            <textarea
              id="rider-fb-message"
              className="form-input"
              rows={3}
              maxLength={500}
              placeholder="Write details..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Send to Admin Hub
          </button>
        </form>
      </div>
    </div>
  );
}

interface BatteryOptimizationTipsModalProps {
  open: boolean;
  batteryStatus: BatteryStatusSnapshot;
  gpsPolicy: GpsTrackingPolicy;
  autoGpsEnabled: boolean;
  onToggleAutoGps?: () => void;
  onClose: () => void;
}

const RIDER_BATTERY_TIPS = [
  {
    id: 'dim-screen',
    icon: 'fa-sun',
    accent: '#fbbf24',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.32)',
    title: 'Dim Screen Brightness & Shorten Timeout',
    detail:
      'Keep display brightness around 40–50% (turn off max outdoor boost when shaded) and set screen timeout to 30 seconds between stops.',
  },
  {
    id: 'close-bg-apps',
    icon: 'fa-layer-group',
    accent: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.32)',
    title: 'Close Heavy Background Apps',
    detail:
      'Swipe away video, social media, and extra map apps before starting your shift so background sync and RAM wake-locks do not drain battery.',
  },
  {
    id: 'gps-saver',
    icon: 'fa-location-crosshairs',
    accent: '#34d399',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.32)',
    title: 'Pause Auto GPS Below 20% Battery',
    detail:
      'When battery runs low on long shifts, pause Auto GPS Refresh and tap My GPS on the Map tab only when arriving at pickup or drop stops.',
  },
  {
    id: 'screen-off-alerts',
    icon: 'fa-volume-high',
    accent: '#a78bfa',
    bg: 'rgba(167, 139, 250, 0.12)',
    border: 'rgba(167, 139, 250, 0.32)',
    title: 'Ride With Screen Off Using Voice & Haptics',
    detail:
      'Enable Voice Trip Alerts (TTS) and Haptic Feedback so you can lock your screen while riding instead of keeping the display awake.',
  },
  {
    id: 'radios-off',
    icon: 'fa-wifi',
    accent: '#f472b6',
    bg: 'rgba(244, 114, 182, 0.12)',
    border: 'rgba(244, 114, 182, 0.32)',
    title: 'Turn Off Unused Wi-Fi, Hotspot & Bluetooth',
    detail:
      'Disable Wi-Fi scanning, Personal Hotspot, and Bluetooth (unless using a helmet headset) while riding on mobile 4G/5G data.',
  },
  {
    id: 'power-bank',
    icon: 'fa-battery-three-quarters',
    accent: '#4ade80',
    bg: 'rgba(74, 222, 128, 0.12)',
    border: 'rgba(74, 222, 128, 0.32)',
    title: 'Top Up During Store Wait Times',
    detail:
      'Plug into a 10,000mAh power bank while waiting for orders at hubs or stores to stay between 25%–85% without overheating.',
  },
] as const;

export function BatteryOptimizationTipsModal({
  open,
  batteryStatus,
  gpsPolicy,
  autoGpsEnabled,
  onToggleAutoGps,
  onClose,
}: BatteryOptimizationTipsModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const batteryLabel =
    batteryStatus.supported && batteryStatus.levelPercent !== null
      ? `${batteryStatus.levelPercent}%${batteryStatus.charging ? ' · Charging' : ''}`
      : 'Not Reported';

  return (
    <div
      className="modal-backdrop open"
      id="batteryOptimizationTipsModal"
      data-testid="battery-tips-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battery-tips-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-box" style={{maxWidth: '460px'}}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '0.75rem',
          }}
        >
          <h3
            id="battery-tips-modal-title"
            style={{fontWeight: 900, fontSize: '1.1rem', color: '#34d399', margin: 0}}
          >
            <i className="fa-solid fa-bolt" style={{marginRight: '6px'}} />
            Battery Optimization Tips
          </h3>
          <button
            type="button"
            className="modal-close-btn"
            data-testid="close-battery-tips-modal"
            aria-label="Close Battery Optimization Tips modal"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <p style={{fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.85rem', lineHeight: 1.45}}>
          Practical habits to extend your phone&apos;s battery life across 8–12 hour delivery shifts.
        </p>

        {/* Live Device Status Summary */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            background: 'rgba(15, 23, 42, 0.72)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '0.65rem 0.85rem',
            marginBottom: '0.9rem',
          }}
        >
          <div>
            <div style={{fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700}}>
              Current Device Battery
            </div>
            <div className="tabular-nums" style={{fontSize: '0.88rem', fontWeight: 800, color: '#f8fafc'}}>
              {batteryLabel}
            </div>
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <span
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
            {onToggleAutoGps && (
              <button
                type="button"
                data-testid="tips-modal-auto-gps-btn"
                className={`btn btn-sm ${autoGpsEnabled ? 'btn-outline' : 'btn-success'}`}
                style={{width: 'auto', padding: '0.28rem 0.65rem', fontSize: '0.72rem'}}
                onClick={onToggleAutoGps}
              >
                {autoGpsEnabled ? 'Pause Auto GPS' : 'Resume Auto GPS'}
              </button>
            )}
          </div>
        </div>

        {/* Tips List */}
        <div style={{display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem'}}>
          {RIDER_BATTERY_TIPS.map((tip) => (
            <div
              key={tip.id}
              data-testid={`battery-tip-${tip.id}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                background: 'rgba(255, 255, 255, 0.025)',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                padding: '0.7rem 0.8rem',
              }}
            >
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: tip.bg,
                  border: `1px solid ${tip.border}`,
                  color: tip.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '0.9rem',
                }}
              >
                <i className={`fa-solid ${tip.icon}`} />
              </div>
              <div style={{minWidth: 0}}>
                <div style={{fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '2px'}}>
                  {tip.title}
                </div>
                <div style={{fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4}}>
                  {tip.detail}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          data-testid="battery-tips-done-btn"
          onClick={onClose}
        >
          Got It
        </button>
      </div>
    </div>
  );
}
