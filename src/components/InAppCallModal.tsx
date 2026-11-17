import type {ActiveCallSession} from '../hooks/useCommunicationManager';
import {formatCallDuration} from '../utils/communicationLogic';

interface InAppCallModalProps {
  session: ActiveCallSession | null;
  nowMs: number;
  onAnswer: () => void;
  onDecline: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
}

export function InAppCallModal({
  session,
  nowMs,
  onAnswer,
  onDecline,
  onEndCall,
  onToggleMute,
  onToggleSpeaker,
}: InAppCallModalProps) {
  if (!session) return null;

  const isIncomingRinging = session.phase === 'INCOMING_RINGING';
  const isConnected = session.phase === 'CONNECTED' && Boolean(session.connectedAt);
  const roleLabel = session.peerRole === 'CUSTOMER' ? 'Customer' : 'Restaurant';
  const durationStr = isConnected ? formatCallDuration(session.connectedAt, nowMs) : null;

  return (
    <div
      data-testid={isIncomingRinging ? 'incoming-call-popup' : 'active-call-screen'}
      role="dialog"
      aria-modal="true"
      aria-label={isIncomingRinging ? 'Incoming Voice Call' : 'Active In-App Voice Call'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 980,
        background:
          'radial-gradient(circle at top, rgba(22, 163, 74, 0.24), transparent 52%), rgba(6, 10, 20, 0.98)',
        backdropFilter: 'blur(18px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'max(2.5rem, env(safe-area-inset-top, 2.5rem)) 1.5rem max(2.5rem, env(safe-area-inset-bottom, 2.5rem))',
        color: '#F8FAFC',
      }}
    >
      {/* Top order & encryption badge */}
      <div style={{textAlign: 'center'}}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0.32rem 0.85rem',
            borderRadius: '999px',
            background: 'rgba(16, 185, 129, 0.14)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: '#34D399',
            fontSize: '0.72rem',
            fontWeight: 800,
          }}
        >
          <i className="fa-solid fa-shield-halved" />
          Chutki Private In-App Call · {roleLabel}
        </span>
        <div
          className="tabular-nums"
          style={{fontSize: '0.78rem', color: '#94A3B8', fontWeight: 700, marginTop: '0.6rem'}}
        >
          Order #{session.orderId.slice(-6)}
        </div>
      </div>

      {/* Center avatar, contact name, genuine status/timer */}
      <div style={{textAlign: 'center', maxWidth: '340px'}}>
        <div
          style={{
            width: '108px',
            height: '108px',
            borderRadius: '50%',
            margin: '0 auto 1.2rem',
            background: 'rgba(22, 163, 74, 0.16)',
            border: `3px solid ${isConnected ? '#22C55E' : '#38BDF8'}`,
            boxShadow: isIncomingRinging
              ? '0 0 0 14px rgba(34, 197, 94, 0.14)'
              : '0 16px 40px rgba(0, 0, 0, 0.45)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
            color: '#34D399',
          }}
        >
          {session.peerPhoto ? (
            <img
              src={session.peerPhoto}
              alt={session.peerName}
              style={{width: '100%', height: '100%', objectFit: 'cover'}}
            />
          ) : (
            <i
              className={`fa-solid ${
                session.peerRole === 'RESTAURANT' ? 'fa-store' : 'fa-user'
              }`}
            />
          )}
        </div>

        <h2 style={{fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.4rem'}}>
          {session.peerName}
        </h2>

        <div
          data-testid="inapp-call-status"
          style={{
            fontSize: '0.95rem',
            fontWeight: 700,
            color: isConnected
              ? '#34D399'
              : session.phase === 'RECONNECTING'
                ? '#FBBF24'
                : '#7DD3FC',
          }}
        >
          {isIncomingRinging ? 'Incoming Voice Call' : session.statusText}
        </div>

        {durationStr && (
          <div
            data-testid="inapp-call-duration"
            className="tabular-nums"
            style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              color: '#F8FAFC',
              marginTop: '0.5rem',
              letterSpacing: '1px',
            }}
          >
            {durationStr}
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      {isIncomingRinging ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2.2rem',
            width: '100%',
            maxWidth: '340px',
          }}
        >
          <button
            type="button"
            data-testid="decline-call-btn"
            onClick={onDecline}
            aria-label="Decline call"
            style={{
              flex: 1,
              minHeight: '58px',
              borderRadius: '18px',
              border: 'none',
              background: '#EF4444',
              color: '#FFFFFF',
              fontSize: '0.96rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 10px 24px rgba(239, 68, 68, 0.35)',
            }}
          >
            <i className="fa-solid fa-phone-slash" /> Decline
          </button>

          <button
            type="button"
            data-testid="answer-call-btn"
            onClick={onAnswer}
            aria-label="Answer call"
            style={{
              flex: 1,
              minHeight: '58px',
              borderRadius: '18px',
              border: 'none',
              background: '#16A34A',
              color: '#FFFFFF',
              fontSize: '0.96rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 10px 24px rgba(22, 163, 74, 0.4)',
            }}
          >
            <i className="fa-solid fa-phone" /> Answer
          </button>
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            maxWidth: '360px',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: '24px',
            padding: '1.15rem 1rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '12px',
          }}
        >
          <button
            type="button"
            data-testid="call-mute-btn"
            onClick={onToggleMute}
            aria-pressed={session.isMuted}
            style={{
              minHeight: '64px',
              borderRadius: '16px',
              border: `1px solid ${
                session.isMuted ? 'rgba(245, 158, 11, 0.5)' : 'rgba(148, 163, 184, 0.2)'
              }`,
              background: session.isMuted
                ? 'rgba(245, 158, 11, 0.16)'
                : 'rgba(30, 41, 59, 0.85)',
              color: session.isMuted ? '#FBBF24' : '#F8FAFC',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              fontSize: '0.76rem',
              fontWeight: 700,
            }}
          >
            <i
              className={`fa-solid ${
                session.isMuted ? 'fa-microphone-slash' : 'fa-microphone'
              }`}
              style={{fontSize: '1.15rem'}}
            />
            <span>{session.isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          <button
            type="button"
            data-testid="call-speaker-btn"
            onClick={onToggleSpeaker}
            aria-pressed={session.isSpeakerOn}
            style={{
              minHeight: '64px',
              borderRadius: '16px',
              border: `1px solid ${
                session.isSpeakerOn ? 'rgba(56, 189, 248, 0.5)' : 'rgba(148, 163, 184, 0.2)'
              }`,
              background: session.isSpeakerOn
                ? 'rgba(56, 189, 248, 0.16)'
                : 'rgba(30, 41, 59, 0.85)',
              color: session.isSpeakerOn ? '#38BDF8' : '#F8FAFC',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              fontSize: '0.76rem',
              fontWeight: 700,
            }}
          >
            <i
              className={`fa-solid ${
                session.isSpeakerOn ? 'fa-volume-high' : 'fa-volume-low'
              }`}
              style={{fontSize: '1.15rem'}}
            />
            <span>{session.isSpeakerOn ? 'Speaker ON' : 'Speaker OFF'}</span>
          </button>

          <button
            type="button"
            data-testid="end-call-btn"
            onClick={onEndCall}
            style={{
              minHeight: '64px',
              borderRadius: '16px',
              border: 'none',
              background: '#EF4444',
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              fontSize: '0.76rem',
              fontWeight: 800,
            }}
          >
            <i className="fa-solid fa-phone-slash" style={{fontSize: '1.15rem'}} />
            <span>End Call</span>
          </button>
        </div>
      )}
    </div>
  );
}
