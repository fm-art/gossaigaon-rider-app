import {useState} from 'react';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export function PWAInstallButton({compact = false}: PWAInstallButtonProps) {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={compact ? 'btn btn-primary btn-sm' : 'btn btn-outline'}
        style={
          compact
            ? {padding: '5px 10px', fontSize: '0.72rem'}
            : {borderColor: 'var(--primary)', color: '#34d399', marginTop: '0.75rem'}
        }
        aria-label="Install Gossaigaon Fleet App"
      >
        <i className="fa-solid fa-download" />
        <span>{compact ? 'Install App' : 'Install Gossaigaon Fleet App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={compact ? 'btn btn-outline btn-sm' : 'btn btn-outline'}
          style={
            compact
              ? {padding: '5px 10px', fontSize: '0.72rem', borderColor: 'var(--primary)', color: '#34d399'}
              : {borderColor: 'var(--primary)', color: '#34d399', marginTop: '0.75rem'}
          }
          aria-label="Install on iPhone or iPad"
        >
          <i className="fa-solid fa-mobile-screen" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="modal-backdrop open" role="dialog" aria-modal="true" aria-label="Install on iPhone or iPad">
            <div className="modal-box">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem'}}>
                <h3 style={{fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)'}}>
                  <i className="fa-solid fa-mobile-screen" /> Install on iPhone / iPad
                </h3>
                <button
                  type="button"
                  className="modal-close-btn"
                  aria-label="Close iOS install guide"
                  onClick={() => setShowIOSGuide(false)}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
              <p style={{fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1rem'}}>
                1. Tap the <strong style={{color: '#fff'}}>Share</strong> button in Safari&apos;s toolbar.
                <br />
                2. Scroll down and tap <strong style={{color: '#fff'}}>Add to Home Screen</strong>.
                <br />
                3. Open <strong style={{color: '#34d399'}}>Gossaigaon Fleet</strong> from your home screen for full-screen native experience &amp; alerts.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => setShowIOSGuide(false)}>
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
