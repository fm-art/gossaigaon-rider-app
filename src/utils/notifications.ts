import {Capacitor} from '@capacitor/core';
import {LocalNotifications} from '@capacitor/local-notifications';
import {PushNotifications} from '@capacitor/push-notifications';
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

const ANDROID_CHANNEL_ID = 'gossaigaon-alerts';
let androidChannelReady = false;
let nativeListenersRegistered = false;

function nextAndroidNotificationId(): number {
  return (Math.floor(Date.now() % 2_000_000_000) + Math.floor(Math.random() * 1000)) || 1;
}

async function ensureAndroidNotificationChannel(): Promise<void> {
  if (androidChannelReady || !Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'Gossaigaon Fleet Alerts',
      description: 'New trip assignments, store pickup updates, and payouts',
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: 'default',
    });
    androidChannelReady = true;
  } catch {
    // Ignore channel creation error on unsupported Android versions
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
  if (Capacitor.isNativePlatform()) {
    return 'default';
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function getNotificationPermissionStateAsync(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (Capacitor.isNativePlatform()) {
    try {
      const localPerm = await LocalNotifications.checkPermissions();
      if (localPerm.display === 'granted') return 'granted';
      if (localPerm.display === 'denied') return 'denied';
      return 'default';
    } catch {
      return 'default';
    }
  }
  return getNotificationPermissionState();
}

export async function registerNativeNotificationListeners(
  onNavigateTab?: (tab: RiderTab) => void,
  onForegroundPush?: (payload: RiderPushPayload) => void,
): Promise<void> {
  if (!Capacitor.isNativePlatform() || nativeListenersRegistered) return;
  nativeListenersRegistered = true;

  try {
    await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const tab = (event.notification.extra as {tab?: RiderTab} | undefined)?.tab;
      if (tab && onNavigateTab) onNavigateTab(tab);
    });
  } catch {
    // Ignore listener attach error
  }

  try {
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const title = notification.title || 'Gossaigaon Fleet Alert';
      const body = notification.body || 'Check your rider terminal for updates.';
      const tab = (notification.data as {tab?: RiderTab} | undefined)?.tab || 'active';
      if (onForegroundPush) {
        onForegroundPush({title, body, tab, tag: notification.id || 'fcm-fg'});
      } else {
        void showSystemPushNotification({title, body, tab, tag: notification.id || 'fcm-fg'});
      }
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const tab = (action.notification.data as {tab?: RiderTab} | undefined)?.tab;
      if (tab && onNavigateTab) onNavigateTab(tab);
    });
  } catch {
    // Ignore push listener attach error
  }
}

export async function requestPushPermissionAndToken(
  riderUid?: string,
): Promise<{permission: NotificationPermission | 'unsupported'; fcmToken?: string | null}> {
  if (Capacitor.isNativePlatform()) {
    let localDisplay = 'denied';
    try {
      const localPerm = await LocalNotifications.requestPermissions();
      localDisplay = localPerm.display;
      if (localDisplay === 'granted') {
        await ensureAndroidNotificationChannel();
      }
    } catch {
      return {permission: 'denied', fcmToken: null};
    }

    let fcmToken: string | null = null;
    try {
      let pushPerm = await PushNotifications.checkPermissions();
      if (pushPerm.receive === 'prompt' || pushPerm.receive === 'prompt-with-rationale') {
        pushPerm = await PushNotifications.requestPermissions();
      }

      if (pushPerm.receive === 'granted') {
        fcmToken = await new Promise<string | null>((resolve) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              resolve(null);
            }
          }, 4000);

          void PushNotifications.addListener('registration', (token) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve(token.value || null);
            }
            if (token.value && riderUid) {
              void update(ref(db, `deliveryPartners/${riderUid}`), {
                fcmToken: token.value,
                pushEnabledAt: Date.now(),
                pushPlatform: Capacitor.getPlatform(),
              }).catch(() => undefined);
            }
          });

          void PushNotifications.addListener('registrationError', () => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve(null);
            }
          });

          void PushNotifications.register();
        });
      }
    } catch {
      // Native LocalNotifications will still work even if FCM registration fails
    }

    return {
      permission: localDisplay === 'granted' ? 'granted' : 'denied',
      fcmToken,
    };
  }

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
    // FCM web push optional fallback
  }

  return {permission, fcmToken};
}

export async function subscribeForegroundFcm(
  onPayload: (payload: RiderPushPayload) => void,
): Promise<() => void> {
  if (Capacitor.isNativePlatform()) {
    return () => {};
  }
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
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') return false;
      await ensureAndroidNotificationChannel();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: nextAndroidNotificationId(),
            title: payload.title,
            body: payload.body,
            channelId: ANDROID_CHANNEL_ID,
            smallIcon: 'ic_stat_notification',
            iconColor: '#16a34a',
            extra: {
              tab: payload.tab || 'active',
            },
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }

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
