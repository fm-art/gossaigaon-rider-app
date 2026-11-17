import {useCallback, useEffect, useRef, useState, type ChangeEvent} from 'react';
import jsQR from 'jsqr';

interface BarcodeDetectorLike {
  detect: (source: ImageBitmapSource) => Promise<Array<{rawValue?: string}>>;
}

interface QrScannerPanelProps {
  active: boolean;
  disabled?: boolean;
  errorBanner?: string | null;
  onScanSuccess: (rawText: string) => void;
  onScanError?: (message: string) => void;
}

export function QrScannerPanel({
  active,
  disabled = false,
  errorBanner,
  onScanSuccess,
  onScanError,
}: QrScannerPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastDecodedRef = useRef<{text: string; ts: number}>({text: '', ts: 0});
  const onScanSuccessRef = useRef(onScanSuccess);
  onScanSuccessRef.current = onScanSuccess;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'scanning' | 'unavailable'>('starting');
  const [cameraHint, setCameraHint] = useState<string>('Initializing camera...');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [retrySeed, setRetrySeed] = useState(0);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const emitDecoded = useCallback((rawText: string) => {
    const cleaned = rawText.trim();
    if (!cleaned || disabledRef.current) return;
    const now = Date.now();
    if (lastDecodedRef.current.text === cleaned && now - lastDecodedRef.current.ts < 1500) {
      return;
    }
    lastDecodedRef.current = {text: cleaned, ts: now};
    onScanSuccessRef.current(cleaned);
  }, []);

  useEffect(() => {
    if (!active) {
      stopCamera();
      return;
    }

    let cancelled = false;
    let scanTimer: number | null = null;
    let isScanningFrame = false;
    let detector: BarcodeDetectorLike | null = null;

    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const Ctor = (
          window as unknown as {
            BarcodeDetector: new (opts?: {formats?: string[]}) => BarcodeDetectorLike;
          }
        ).BarcodeDetector;
        detector = new Ctor({formats: ['qr_code']});
      } catch {
        detector = null;
      }
    }

    const startCamera = async () => {
      stopCamera();
      setCameraStatus('starting');
      setCameraHint('Requesting camera permission...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('unavailable');
        setCameraHint('Live camera is unavailable in this browser. Upload a QR photo or enter PIN.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {ideal: facingMode},
            width: {ideal: 720},
            height: {ideal: 720},
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities() as {torch?: boolean};
          setTorchSupported(Boolean(caps.torch));
        }

        const video = videoRef.current;
        if (!video) {
          stopCamera();
          setCameraStatus('unavailable');
          setCameraHint('Camera preview unavailable. Upload a QR photo or enter PIN.');
          return;
        }
        video.srcObject = stream;
        await video.play();

        if (cancelled) return;
        setCameraStatus('scanning');
        setCameraHint('Align the customer’s QR code inside the frame.');

        const scanFrame = async () => {
          if (cancelled || disabledRef.current || isScanningFrame) return;
          const v = videoRef.current;
          if (!v || v.readyState < 2 || v.videoWidth === 0 || v.videoHeight === 0) return;

          isScanningFrame = true;
          try {
            if (detector) {
              try {
                const found = await detector.detect(v);
                if (found.length > 0 && found[0].rawValue) {
                  emitDecoded(found[0].rawValue);
                  return;
                }
              } catch {
                // Fall back to jsQR below
              }
            }

            let canvas = canvasRef.current;
            if (!canvas) {
              canvas = document.createElement('canvas');
              canvasRef.current = canvas;
            }
            const maxDim = 540;
            const scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
            const w = Math.max(1, Math.round(v.videoWidth * scale));
            const h = Math.max(1, Math.round(v.videoHeight * scale));
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;

            const ctx = canvas.getContext('2d', {willReadFrequently: true});
            if (!ctx) return;
            ctx.drawImage(v, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const decoded = jsQR(img.data, w, h, {inversionAttempts: 'attemptBoth'});
            if (decoded?.data) {
              emitDecoded(decoded.data);
            }
          } finally {
            isScanningFrame = false;
          }
        };

        scanTimer = window.setInterval(() => {
          void scanFrame();
        }, 160);
      } catch (err) {
        if (cancelled) return;
        const errName = err instanceof Error ? err.name : '';
        setCameraStatus('unavailable');
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setCameraHint('Camera permission denied. Allow camera access, upload a QR photo, or enter PIN.');
        } else {
          setCameraHint('No camera detected on this device. Upload a QR photo or use PIN.');
        }
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (scanTimer !== null) {
        window.clearInterval(scanTimer);
      }
      stopCamera();
    };
  }, [active, facingMode, retrySeed, stopCamera, emitDecoded]);

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{torch: next} as unknown as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      onScanError?.('Flashlight control is not supported on this camera.');
    }
  };

  const handleQrImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = canvasRef.current || document.createElement('canvas');
          canvasRef.current = canvas;
          const maxDim = 960;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', {willReadFrequently: true});
          if (!ctx) {
            onScanError?.('Could not read QR image.');
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const decoded = jsQR(imageData.data, w, h, {inversionAttempts: 'attemptBoth'});
          if (decoded?.data) {
            emitDecoded(decoded.data);
          } else {
            onScanError?.('No valid QR code found in the selected photo.');
          }
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        onScanError?.('Could not load selected QR image.');
      };
      img.src = url;
    } catch {
      onScanError?.('Failed to inspect QR photo.');
    }
  };

  return (
    <div
      data-testid="qr-scanner-panel"
      style={{
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1px dashed #34d399',
        borderRadius: '14px',
        padding: '0.85rem',
        marginBottom: '1rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px',
        }}
      >
        <span style={{fontSize: '0.75rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase'}}>
          <i className="fa-solid fa-qrcode" /> Customer QR Scanner
        </span>
        <span
          data-testid="qr-camera-status"
          style={{
            fontSize: '0.68rem',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '8px',
            background:
              cameraStatus === 'scanning'
                ? 'rgba(16, 185, 129, 0.18)'
                : cameraStatus === 'starting'
                  ? 'rgba(56, 189, 248, 0.18)'
                  : 'rgba(245, 158, 11, 0.18)',
            color:
              cameraStatus === 'scanning'
                ? '#34d399'
                : cameraStatus === 'starting'
                  ? '#38bdf8'
                  : '#fbbf24',
          }}
        >
          {cameraStatus === 'scanning'
            ? 'LIVE CAMERA'
            : cameraStatus === 'starting'
              ? 'CONNECTING'
              : 'UPLOAD / RETRY'}
        </span>
      </div>

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '250px',
          aspectRatio: '1 / 1',
          margin: '0 auto 0.75rem',
          borderRadius: '14px',
          overflow: 'hidden',
          background: '#050811',
          border: '1.5px solid rgba(52, 211, 153, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <video
          ref={videoRef}
          data-testid="qr-camera-video"
          playsInline
          muted
          autoPlay
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: cameraStatus === 'unavailable' ? 'none' : 'block',
          }}
        />

        {cameraStatus === 'unavailable' && (
          <div style={{padding: '1rem', color: 'var(--text-muted)', fontSize: '0.76rem'}}>
            <i
              className="fa-solid fa-camera-slash"
              style={{fontSize: '1.75rem', color: '#fbbf24', marginBottom: '8px', display: 'block'}}
            />
            {cameraHint}
          </div>
        )}

        {/* Viewfinder corner reticles */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '16px',
            pointerEvents: 'none',
            borderRadius: '10px',
            boxShadow: 'inset 0 0 0 1px rgba(52, 211, 153, 0.25)',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '20px',
              height: '20px',
              borderTop: '3px solid #34d399',
              borderLeft: '3px solid #34d399',
              borderTopLeftRadius: '6px',
            }}
          />
          <span
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '20px',
              height: '20px',
              borderTop: '3px solid #34d399',
              borderRight: '3px solid #34d399',
              borderTopRightRadius: '6px',
            }}
          />
          <span
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '20px',
              height: '20px',
              borderBottom: '3px solid #34d399',
              borderLeft: '3px solid #34d399',
              borderBottomLeftRadius: '6px',
            }}
          />
          <span
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: '20px',
              height: '20px',
              borderBottom: '3px solid #34d399',
              borderRight: '3px solid #34d399',
              borderBottomRightRadius: '6px',
            }}
          />
        </div>
      </div>

      {errorBanner && (
        <div
          data-testid="qr-scan-error"
          style={{
            background: 'rgba(239, 68, 68, 0.14)',
            border: '1px solid rgba(239, 68, 68, 0.45)',
            color: '#fca5a5',
            borderRadius: '10px',
            padding: '0.45rem 0.65rem',
            fontSize: '0.74rem',
            fontWeight: 700,
            marginBottom: '8px',
          }}
        >
          {errorBanner}
        </div>
      )}

      <p style={{fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '8px'}}>
        {cameraStatus === 'scanning'
          ? cameraHint
          : 'Scan from live camera or capture/upload the customer app QR screen.'}
      </p>

      <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center'}}>
        {cameraStatus === 'scanning' ? (
          <>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{flex: 1, minWidth: '105px', whiteSpace: 'nowrap', fontSize: '0.76rem'}}
              onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
            >
              <i className="fa-solid fa-camera-rotate" /> Flip Cam
            </button>
            {torchSupported && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{
                  flex: 1,
                  minWidth: '90px',
                  whiteSpace: 'nowrap',
                  fontSize: '0.76rem',
                  borderColor: torchOn ? '#fbbf24' : 'var(--border)',
                  color: torchOn ? '#fbbf24' : 'var(--text-main)',
                }}
                onClick={() => void handleToggleTorch()}
              >
                <i className="fa-solid fa-bolt" /> {torchOn ? 'Flash ON' : 'Flash'}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{
              flex: 1,
              minWidth: '115px',
              whiteSpace: 'nowrap',
              fontSize: '0.76rem',
              borderColor: '#38bdf8',
              color: '#38bdf8',
            }}
            onClick={() => setRetrySeed((s) => s + 1)}
          >
            <i className="fa-solid fa-rotate-right" /> Retry Cam
          </button>
        )}

        <button
          type="button"
          data-testid="qr-file-upload-btn"
          className="btn btn-outline btn-sm"
          style={{
            flex: 1.25,
            minWidth: '130px',
            whiteSpace: 'nowrap',
            fontSize: '0.76rem',
            borderColor: '#34d399',
            color: '#34d399',
          }}
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <i className="fa-solid fa-image" /> Upload QR
        </button>
        <input
          ref={fileInputRef}
          data-testid="qr-file-input"
          type="file"
          accept="image/*"
          capture="environment"
          style={{display: 'none'}}
          onChange={(e) => void handleQrImageUpload(e)}
        />
      </div>
    </div>
  );
}
