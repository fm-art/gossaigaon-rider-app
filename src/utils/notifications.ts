import {getToken, onMessage} from 'firebase/messaging';
import {ref, update} from 'firebase/database';
import {db, getFirebaseMessagingSafe} from '../config/firebase';
import type {RiderTab} from '../types/rider';

export interface RiderPushPayload {
  title: string;
  body: string;
  tag?: string;
  tab?: RiderTab;
  requireInteraction?: boolean;
  vibrate?: number[];
}

export function playAssignmentChime(soundEnabled: boolean): void {
  if (!soundEnabled || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch {
    // Ignore audio unlock errors before first user gesture
  }
}

export function triggerDeviceVibration(pattern: number[] = [200, 100, 200]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore unsupported vibration
  }
}

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestPushPermissionAndToken(
  riderUid?: string,
): Promise<{permission: NotificationPermission | 'unsupported'; fcmToken?: string | null}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {permission: 'unsupported'};
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    return {permission, fcmToken: null};
  }

  let fcmToken: string | null = null;
  try {
    const messaging = await getFirebaseMessagingSafe();
    const registration =
      'serviceWorker' in navigator ? await navigator.serviceWorker.ready : undefined;
    if (messaging && registration) {
      fcmToken = await getToken(messaging, {
        serviceWorkerRegistration: registration,
      }).catch(() => null);
      if (fcmToken && riderUid) {
        await update(ref(db, `deliveryPartners/${riderUid}`), {
          fcmToken,
          pushEnabledAt: Date.now(),
        }).catch(() => undefined);
      }
    }
  } catch {
    // FCM web push VAPID optional fallback: local ServiceWorker showNotification still works
  }

  return {permission, fcmToken};
}

export async function subscribeForegroundFcm(
  onPayload: (payload: RiderPushPayload) => void,
): Promise<() => void> {
  const messaging = await getFirebaseMessagingSafe();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || 'Gossaigaon Fleet Update';
    const body = payload.notification?.body || 'Check your rider terminal for updates.';
    const tab = (payload.data?.tab as RiderTab | undefined) || 'active';
    onPayload({title, body, tab, tag: payload.messageId || 'fcm-msg'});
  });
}

export async function showSystemPushNotification(payload: RiderPushPayload): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const options: NotificationOptions & {vibrate?: number[]; renotify?: boolean} = {
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: payload.tag || 'gossaigaon-rider-alert',
    renotify: true,
    requireInteraction: payload.requireInteraction ?? false,
    vibrate: payload.vibrate || [200, 100, 200],
    data: {
      tab: payload.tab || 'active',
      url: `/?tab=${payload.tab || 'active'}`,
    },
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(payload.title, options);
        return true;
      }
    }
    const notif = new Notification(payload.title, options);
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}
