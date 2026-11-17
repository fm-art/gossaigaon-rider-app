import {Capacitor, type PluginListenerHandle} from '@capacitor/core';
import {FirebaseMessaging} from '@capacitor-firebase/messaging';
import {LocalNotifications} from '@capacitor/local-notifications';
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

const NATIVE_CHANNEL_ID = 'gossaigaon_alerts';
let nativeChannelReady = false;

function toValidTab(raw: unknown): RiderTab {
  if (raw === 'map' || raw === 'history' || raw === 'earnings' || raw === 'profile') {
    return raw;
  }
  return 'active';
}

function getSafeNotificationId(tag?: string): number {
  if (!tag) {
    return (Date.now() % 1_900_000_000) + 1000;
  }
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1_900_000_000) + 1000;
}

async function ensureNativeNotificationChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform() || nativeChannelReady) return;
  try {
    await LocalNotifications.createChannel({
      id: NATIVE_CHANNEL_ID,
      name: 'Trip, Call & Payout Alerts',
      description: 'Urgent delivery trips, customer calls, chat messages and payout updates',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
    });
    nativeChannelReady = true;
  } catch {
    // Channel creation unsupported on older Android API < 26
  }
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
  if (typeof window === 'undefined') return 'unsupported';
  if (Capacitor.isNativePlatform()) {
    return 'default';
  }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function syncNativeNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!Capacitor.isNativePlatform()) {
    return getNotificationPermissionState();
  }
  try {
    const localPerm = await LocalNotifications.checkPermissions();
    if (localPerm.display === 'granted') {
      await ensureNativeNotificationChannel();
      return 'granted';
    }
    if (localPerm.display === 'denied') {
      return 'denied';
    }
    return 'default';
  } catch {
    return 'default';
  }
}

export async function requestPushPermissionAndToken(
  riderUid?: string,
): Promise<{permission: NotificationPermission | 'unsupported'; fcmToken?: string | null}> {
  if (typeof window === 'undefined') {
    return {permission: 'unsupported'};
  }

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNativeNotificationChannel();
      const localCheck = await LocalNotifications.checkPermissions();
      const localPerm =
        localCheck.display === 'granted'
          ? localCheck
          : await LocalNotifications.requestPermissions();

      const fcmCheck = await FirebaseMessaging.checkPermissions();
      const fcmPerm =
        fcmCheck.receive === 'granted'
          ? fcmCheck
          : await FirebaseMessaging.requestPermissions();

      const isGranted =
        localPerm.display === 'granted' || fcmPerm.receive === 'granted';

      if (!isGranted) {
        const isDenied =
          localPerm.display === 'denied' && fcmPerm.receive === 'denied';
        return {permission: isDenied ? 'denied' : 'default', fcmToken: null};
      }

      let fcmToken: string | null = null;
      try {
        const res = await FirebaseMessaging.getToken();
        fcmToken = res.token || null;
        if (fcmToken && riderUid) {
          await update(ref(db, `deliveryPartners/${riderUid}`), {
            fcmToken,
            pushEnabledAt: Date.now(),
          }).catch(() => undefined);
        }
      } catch {
        // Local notifications still work in mobile notification bar
      }

      return {permission: 'granted', fcmToken};
    } catch {
      return {permission: 'default', fcmToken: null};
    }
  }

  if (!('Notification' in window)) {
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
    // Web push VAPID optional fallback
  }

  return {permission, fcmToken};
}

export async function subscribeForegroundFcm(
  onPayload: (payload: RiderPushPayload) => void,
  onNavigateTab?: (tab: RiderTab) => void,
): Promise<() => void> {
  if (Capacitor.isNativePlatform()) {
    const handles: PluginListenerHandle[] = [];
    try {
      handles.push(
        await FirebaseMessaging.addListener('notificationReceived', (event) => {
          const notif = event.notification;
          const data = (notif?.data || {}) as Record<string, unknown>;
          onPayload({
            title: notif?.title || 'Gossaigaon Fleet Alert',
            body: notif?.body || 'New update in your rider terminal.',
            tab: toValidTab(data.tab),
            tag: String(notif?.id || data.tag || `fcm-${Date.now()}`),
          });
        }),
      );

      handles.push(
        await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
          const data = (event.notification?.data || {}) as Record<string, unknown>;
          onNavigateTab?.(toValidTab(data.tab));
        }),
      );

      handles.push(
        await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
          const extra = (event.notification?.extra || {}) as Record<string, unknown>;
          onNavigateTab?.(toValidTab(extra.tab));
        }),
      );
    } catch {
      // Ignore listener registration failures
    }

    return () => {
      handles.forEach((h) => {
        void h.remove().catch(() => undefined);
      });
    };
  }

  const messaging = await getFirebaseMessagingSafe();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || 'Gossaigaon Fleet Update';
    const body = payload.notification?.body || 'Check your rider terminal for updates.';
    const tab = toValidTab(payload.data?.tab);
    onPayload({title, body, tab, tag: payload.messageId || 'fcm-msg'});
  });
}

export async function showSystemPushNotification(payload: RiderPushPayload): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (Capacitor.isNativePlatform()) {
    try {
      await ensureNativeNotificationChannel();
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        return false;
      }

      const id = getSafeNotificationId(payload.tag);
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title: payload.title,
            body: payload.body,
            channelId: NATIVE_CHANNEL_ID,
            autoCancel: true,
            extra: {
              tab: payload.tab || 'active',
              tag: payload.tag || '',
            },
          },
        ],
      });
      if (payload.vibrate) {
        triggerDeviceVibration(payload.vibrate);
      }
      return true;
    } catch {
      return false;
    }
  }

  if (!('Notification' in window)) return false;
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
