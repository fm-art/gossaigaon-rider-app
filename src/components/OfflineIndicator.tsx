import {useOnlineStatus} from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 'calc(var(--bottom-nav-height) + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 450,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderRadius: '12px',
        background: 'rgba(245, 158, 11, 0.95)',
        color: '#000',
        padding: '6px 14px',
        fontSize: '0.75rem',
        fontWeight: 800,
        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.5)',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: '#050811',
        }}
      />
      Offline Mode — Cached data active
    </div>
  );
}
