import {Capacitor} from '@capacitor/core';
import {getApp, getApps, initializeApp} from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import {getDatabase} from 'firebase/database';
import {getMessaging, isSupported, type Messaging} from 'firebase/messaging';

export const firebaseConfig = {
  apiKey: 'AIzaSyCuJLxRCdhAVZoN81-5weEFnSU4nDr98lo',
  authDomain: 'test-2a0d0.firebaseapp.com',
  databaseURL: 'https://test-2a0d0-default-rtdb.firebaseio.com',
  projectId: 'test-2a0d0',
  storageBucket: 'test-2a0d0.firebasestorage.app',
  messagingSenderId: '396740286096',
  appId: '1:396740286096:web:430751766ca9c384946a15',
  measurementId: 'G-W05VPQX3V2',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function initFirebaseAuth(): Auth {
  if (Capacitor.isNativePlatform()) {
    try {
      return initializeAuth(app, {
        persistence: indexedDBLocalPersistence,
      });
    } catch {
      return getAuth(app);
    }
  }
  return getAuth(app);
}

export const auth = initFirebaseAuth();
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export const db = getDatabase(app);

let messagingInstance: Messaging | null = null;

export async function getFirebaseMessagingSafe(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch {
    return null;
  }
}

export default app;
