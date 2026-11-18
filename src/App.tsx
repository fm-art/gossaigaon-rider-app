import {Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {App as CapacitorApp} from '@capacitor/app';
import {Capacitor, CapacitorHttp, registerPlugin} from '@capacitor/core';
import type {BackgroundGeolocationPlugin} from '@capacitor-community/background-geolocation';
import {FirebaseAuthentication} from '@capacitor-firebase/authentication';
import {
  getRedirectResult,
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import {onValue, push, ref, get, update} from 'firebase/database';
import {ActiveTripsTab} from './components/ActiveTripsTab';
import {ApprovalGateScreen} from './components/ApprovalGateScreen';
import {AuthScreen, provisionGoogleDeliveryProfileIfNeeded} from './components/AuthScreen';
import {BottomNav} from './components/BottomNav';
import {
  CancelTripModal,
  DeliveryVerifyModal,
  DepositModal,
  FeedbackModal,
  PayoutModal,
  SosModal,
  type VerifyModalState,
} from './components/Modals';
import {OfflineIndicator} from './components/OfflineIndicator';
import {OrderChatModal} from './components/OrderChatModal';
import {InAppCallModal} from './components/InAppCallModal';
import {RiderHeader} from './components/RiderHeader';
import {ToastContainer} from './components/ToastContainer';

const MapViewTab = lazy(() =>
  import('./components/MapViewTab').then((m) => ({default: m.MapViewTab})),
);
const HistoryTab = lazy(() =>
  import('./components/HistoryTab').then((m) => ({default: m.HistoryTab})),
);
const EarningsTab = lazy(() =>
  import('./components/EarningsTab').then((m) => ({default: m.EarningsTab})),
);
const ProfileTab = lazy(() =>
  import('./components/ProfileTab').then((m) => ({default: m.ProfileTab})),
);
import {auth, db, firebaseConfig} from './config/firebase';
import {useBatteryStatus} from './hooks/useBatteryStatus';
import {useCommunicationManager} from './hooks/useCommunicationManager';
import type {
  AdminSettings,
  ChatChannel,
  DeliveryUserProfile,
  FeedbackRecord,
  OrderRecord,
  OrderWithId,
  PreferredShiftHours,
  RiderData,
  RiderPayoutRecord,
  RiderRating,
  RiderTab,
  SettlementRecord,
  StoreInfo,
  ToastMessage,
  ToastType,
} from './types/rider';
import {
  evaluateDeliveryAccessGate,
  mergeDeliveryProfiles,
  normalizeIndianPhone,
} from './utils/authLogic';
import {
  canCommunicateWithCustomer,
  canCommunicateWithRestaurant,
} from './utils/communicationLogic';
import {
  getNotificationPermissionState,
  playAssignmentChime,
  requestPushPermissionAndToken,
  showSystemPushNotification,
  subscribeForegroundFcm,
  syncNativeNotificationPermission,
  triggerDeviceVibration,
} from './utils/notifications';
import {
  calculateDistanceKm,
  calculateFinancialSummary,
  evaluateBatteryGpsPolicy,
  evaluatePinAttempt,
  evaluateShiftCompliance,
  formatShiftTime12h,
  getDemoSeedState,
  getTripsGrouped,
  isTripPickedUp,
  isValidShiftHours,
  isValidUpiId,
  readAutoGpsEnabled,
  sanitizeText,
  saveAutoGpsEnabled,
  selectNearestEligibleRider,
  shouldShowPowerBankBanner,
  validateDeliveryQrPayload,
  validateSettlementUtr,
  type BatteryGpsMode,
  type PinGuardState,
} from './utils/riderLogic';
import {
  readHapticsEnabled,
  saveHapticsEnabled,
  triggerHaptic,
  type HapticCue,
} from './utils/haptics';
import {
  buildIncomingTripAnnouncement,
  cancelTripSpeech,
  readTtsEnabled,
  saveTtsEnabled,
  speakTripAnnouncement,
} from './utils/tts';
import {
  analyzeQrSecurityThreat,
  canCompleteCodDelivery,
  clearAuthThrottle,
  clearSecurityEvents,
  getSecurityEvents,
  loadPinGuards,
  readIdleLockEnabled,
  recordSecurityEvent,
  sanitizeFirebaseAuthError,
  saveIdleLockEnabled,
  savePinGuards,
  verifyUpiSecurity,
  type SecurityEvent,
} from './utils/security';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  'BackgroundGeolocation',
);

declare global {
  interface Window {
    AndroidBridge?: {
      startTracking: (
        uid: string,
        idToken: string,
        refreshToken: string,
        apiKey: string,
        databaseURL: string,
        activeOrderIds: string,
      ) => void;
      stopTracking: () => void;
    };
  }
}

export default function App() {
  const isDemoMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' || params.get('demo') === '1';
  }, []);

  const initialTab = useMemo<RiderTab>(() => {
    if (typeof window === 'undefined') return 'active';
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (
      tabParam === 'map' ||
      tabParam === 'history' ||
      tabParam === 'earnings' ||
      tabParam === 'profile'
    )
      return tabParam;
    return 'active';
  }, []);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState<{
    type: 'error' | 'success' | 'warning';
    text: string;
  } | null>(null);
  const [demoActive, setDemoActive] = useState(isDemoMode);

  const [deliveryUserRecord, setDeliveryUserRecord] =
    useState<Partial<DeliveryUserProfile> | null>(null);
  const [deliveryPartnerRecord, setDeliveryPartnerRecord] = useState<RiderData | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [riderData, setRiderData] = useState<RiderData | null>(null);
  const [assignedOrders, setAssignedOrders] = useState<Record<string, OrderRecord>>({});
  const [allOrders, setAllOrders] = useState<Record<string, OrderRecord>>({});
  const [allRiders, setAllRiders] = useState<Record<string, RiderData>>({});
  const [stores, setStores] = useState<Record<string, StoreInfo>>({});
  const [allSettlements, setAllSettlements] = useState<Record<string, SettlementRecord>>({});
  const [riderSettlements, setRiderSettlements] = useState<Record<string, SettlementRecord>>({});
  const [myRiderPayouts, setMyRiderPayouts] = useState<Record<string, RiderPayoutRecord>>({});
  const [riderRatings, setRiderRatings] = useState<RiderRating[]>([]);
  const [myFeedbacks, setMyFeedbacks] = useState<Record<string, FeedbackRecord>>({});
  const [adminSettings, setAdminSettings] = useState<AdminSettings>({});

  const [activeTab, setActiveTab] = useState<RiderTab>(initialTab);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [gpsSyncTime, setGpsSyncTime] = useState('Connecting...');
  const [riderCurrentLat, setRiderCurrentLat] = useState(26.4524);
  const [riderCurrentLng, setRiderCurrentLng] = useState(89.9723);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getNotificationPermissionState(),
  );

  // Modals state
  const [cancelModalTripId, setCancelModalTripId] = useState<string | null>(null);
  const [sosModalTripId, setSosModalTripId] = useState<string | null>(null);
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [verifyModalState, setVerifyModalState] = useState<VerifyModalState>({
    open: false,
    tripId: '',
    targetAmt: 0,
    isPrepaid: false,
    initialMode: 'pin',
  });
  const [qrScanError, setQrScanError] = useState<string | null>(null);

  const [isVerifyingDelivery, setIsVerifyingDelivery] = useState(false);
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);
  const [shiftBannerDismissed, setShiftBannerDismissed] = useState(false);
  const [terminalLocked, setTerminalLocked] = useState(false);
  const [idleLockEnabled, setIdleLockEnabled] = useState(() => readIdleLockEnabled());
  const [hapticsEnabled, setHapticsEnabled] = useState(() => readHapticsEnabled());
  const [ttsEnabled, setTtsEnabled] = useState(() => readTtsEnabled());
  const [autoGpsEnabled, setAutoGpsEnabled] = useState(() => readAutoGpsEnabled());
  const [ordersHydrated, setOrdersHydrated] = useState(false);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>(() => getSecurityEvents());
  const [pinLockRemainingSec, setPinLockRemainingSec] = useState(0);

  const prevActiveTripCountRef = useRef<number | null>(null);
  const knownActiveTripIdsRef = useRef<Set<string> | null>(null);
  const prevOrderStatusesRef = useRef<Record<string, string>>({});
  const prevPaidPayoutsRef = useRef<Set<string>>(new Set());
  const prevApprovedSettlementsRef = useRef<Set<string>>(new Set());
  const prevAnnouncementRef = useRef<string | undefined>(undefined);
  const prevAdminNoteRef = useRef<string | undefined>(undefined);
  const prevOvertimeRef = useRef(false);
  const timedOutTripsRef = useRef<Record<string, boolean>>({});
  const pinGuardRef = useRef<Record<string, PinGuardState>>(loadPinGuards());
  const lastActivityMsRef = useRef<number>(Date.now());
  const lastTrailPointRef = useRef<{lat: number; lng: number} | null>(null);
  const lastNativeHttpSyncMsRef = useRef<number>(0);
  const nativePushPromptedRef = useRef<boolean>(false);
  const lastWatchDispatchMsRef = useRef(0);
  const lastWatchCoordsRef = useRef<{lat: number; lng: number} | null>(null);
  const prevGpsModeRef = useRef<BatteryGpsMode>('HIGH_ACCURACY');
  const isSyncingGpsRef = useRef(false);
  const riderLastBackTimeRef = useRef(0);
  const activeTabRef = useRef<RiderTab>(activeTab);
  activeTabRef.current = activeTab;

  const logThreat = useCallback(
    (
      category: SecurityEvent['category'],
      severity: SecurityEvent['severity'],
      summary: string,
    ) => {
      setSecurityEvents(recordSecurityEvent(category, severity, summary));
    },
    [],
  );

  const showToast = useCallback((msg: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, {id, msg, type}]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const triggerCue = useCallback(
    (cue: HapticCue) => {
      triggerHaptic(cue, {enabled: hapticsEnabled});
    },
    [hapticsEnabled],
  );

  const adminUpiId = adminSettings.upiId || 'gossaigaonbazar@apl';
  const baseRiderFeePerTrip =
    adminSettings.riderBaseFee && Number(adminSettings.riderBaseFee) > 0
      ? Number(adminSettings.riderBaseFee)
      : adminSettings.deliveryCharge && Number(adminSettings.deliveryCharge) > 0
        ? Number(adminSettings.deliveryCharge)
        : 25;
  const maxAllowedCashLimit =
    adminSettings.maxRiderCashLimit && Number(adminSettings.maxRiderCashLimit) > 0
      ? Number(adminSettings.maxRiderCashLimit)
      : 3000;
  const acceptTimeoutSec =
    adminSettings.riderAcceptTimeoutSec && Number(adminSettings.riderAcceptTimeoutSec) >= 15
      ? Number(adminSettings.riderAcceptTimeoutSec)
      : 45;
  const minRiderPayoutAmount =
    adminSettings.minRiderPayout && Number(adminSettings.minRiderPayout) >= 1
      ? Number(adminSettings.minRiderPayout)
      : 10;
  const maxRiderPayoutAmount =
    adminSettings.maxRiderPayout && Number(adminSettings.maxRiderPayout) >= 10
      ? Number(adminSettings.maxRiderPayout)
      : 10000;
  const minRiderCodDeposit =
    adminSettings.minRiderCodDeposit && Number(adminSettings.minRiderCodDeposit) >= 1
      ? Number(adminSettings.minRiderCodDeposit)
      : 10;
  const maxRiderCodDeposit =
    adminSettings.maxRiderCodDeposit && Number(adminSettings.maxRiderCodDeposit) >= 10
      ? Number(adminSettings.maxRiderCodDeposit)
      : 25000;
  const allowRiderPassTrip = adminSettings.allowRiderPassTrip !== false;
  const allowRiderSos = adminSettings.allowRiderSos !== false;

  const {activeTrips, completedTrips} = useMemo(
    () => getTripsGrouped(assignedOrders),
    [assignedOrders],
  );

  const accessEvaluation = useMemo(
    () =>
      demoActive
        ? {
            gate: 'APPROVED' as const,
            approvalStatus: 'approved' as const,
            accountStatus: 'active' as const,
            headline: 'Approved & Active',
            message: 'Demo session active.',
            needsPhoneCompletion: false,
          }
        : evaluateDeliveryAccessGate({
            profileLoaded,
            deliveryUser: deliveryUserRecord,
            deliveryPartner: deliveryPartnerRecord,
          }),
    [demoActive, profileLoaded, deliveryUserRecord, deliveryPartnerRecord],
  );

  const isDashboardUnlocked = demoActive || (Boolean(currentUser) && accessEvaluation.gate === 'APPROVED');
  const activeRiderUid = demoActive ? 'demo_rider_uid' : currentUser?.uid || '';

  const comm = useCommunicationManager({
    enabled: isDashboardUnlocked,
    demoActive,
    riderUid: activeRiderUid || null,
    riderData,
    assignedOrders,
    stores,
    adminSettings,
    soundEnabled,
    onNotify: showToast,
  });
  const commRef = useRef(comm);
  commRef.current = comm;

  const openChatOrder: OrderWithId | null = useMemo(() => {
    if (!comm.openChatTarget) return null;
    const raw = assignedOrders[comm.openChatTarget.orderId];
    if (!raw) return null;
    return {...raw, orderId: comm.openChatTarget.orderId};
  }, [assignedOrders, comm.openChatTarget]);

  const storesRef = useRef(stores);
  storesRef.current = stores;
  const riderDataRef = useRef(riderData);
  riderDataRef.current = riderData;
  const assignedOrdersRef = useRef(assignedOrders);
  assignedOrdersRef.current = assignedOrders;
  const riderCoordsRef = useRef({lat: riderCurrentLat, lng: riderCurrentLng});
  riderCoordsRef.current = {lat: riderCurrentLat, lng: riderCurrentLng};
  const ttsEnabledRef = useRef(ttsEnabled);
  ttsEnabledRef.current = ttsEnabled;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Hands-free TTS announcement whenever a new incoming trip is assigned
  useEffect(() => {
    if (!isDashboardUnlocked || !ordersHydrated) {
      knownActiveTripIdsRef.current = null;
      return;
    }

    const currentIds = new Set(activeTrips.map((t) => t.tripId));
    if (knownActiveTripIdsRef.current === null) {
      knownActiveTripIdsRef.current = currentIds;
      return;
    }

    const newlyArrived = activeTrips.filter(
      (t) => !knownActiveTripIdsRef.current!.has(t.tripId),
    );
    knownActiveTripIdsRef.current = currentIds;

    if (newlyArrived.length === 0 || riderData?.suspended === true) return;
    if (!ttsEnabledRef.current) return;

    const targetTrip =
      newlyArrived.find((t) => !t.orders.every((o) => o.riderAccepted === true)) || newlyArrived[0];
    const announcement = buildIncomingTripAnnouncement(
      targetTrip,
      storesRef.current,
      riderCoordsRef.current.lat,
      riderCoordsRef.current.lng,
    );

    const delayMs = soundEnabledRef.current ? 450 : 0;
    const timer = window.setTimeout(() => {
      speakTripAnnouncement(announcement.text, {enabled: ttsEnabledRef.current});
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [activeTrips, isDashboardUnlocked, ordersHydrated, riderData?.suspended]);

  const financials = useMemo(
    () =>
      calculateFinancialSummary(
        assignedOrders,
        riderSettlements,
        myRiderPayouts,
        baseRiderFeePerTrip,
      ),
    [assignedOrders, riderSettlements, myRiderPayouts, baseRiderFeePerTrip],
  );

  const batteryStatus = useBatteryStatus();

  const gpsPolicy = useMemo(
    () => evaluateBatteryGpsPolicy(batteryStatus, activeTrips.length > 0, autoGpsEnabled),
    [batteryStatus, activeTrips.length, autoGpsEnabled],
  );

  const showPowerBankBanner = useMemo(
    () => shouldShowPowerBankBanner(batteryStatus),
    [batteryStatus],
  );

  useEffect(() => {
    const isOnlineShift = Boolean(
      isDashboardUnlocked && riderData?.online && riderData?.suspended !== true,
    );
    if (!isOnlineShift) {
      prevGpsModeRef.current = gpsPolicy.mode;
      return;
    }
    if (prevGpsModeRef.current === gpsPolicy.mode) return;
    const prevMode = prevGpsModeRef.current;
    prevGpsModeRef.current = gpsPolicy.mode;

    if (gpsPolicy.mode === 'MANUAL_PAUSED' || prevMode === 'MANUAL_PAUSED') {
      return;
    }

    if (gpsPolicy.mode === 'POWER_SAVER' || gpsPolicy.mode === 'CRITICAL_SAVER') {
      showToast(`🪫 ${gpsPolicy.reason}`, 'warning');
    } else if (prevMode !== 'HIGH_ACCURACY') {
      showToast(`⚡ ${gpsPolicy.reason}`, 'success');
    }
  }, [
    isDashboardUnlocked,
    riderData?.online,
    riderData?.suspended,
    gpsPolicy.mode,
    gpsPolicy.reason,
    showToast,
  ]);

  const shiftCompliance = useMemo(
    () =>
      evaluateShiftCompliance(
        riderData?.preferredShift,
        Boolean(riderData?.online && riderData?.suspended !== true),
        nowMs,
      ),
    [riderData?.preferredShift, riderData?.online, riderData?.suspended, nowMs],
  );

  useEffect(() => {
    if (!shiftCompliance.isOvertimeOnDuty) {
      prevOvertimeRef.current = false;
      setShiftBannerDismissed(false);
      return;
    }
    if (!prevOvertimeRef.current) {
      prevOvertimeRef.current = true;
      setShiftBannerDismissed(false);
      showToast(
        `⏰ Outside preferred shift (${shiftCompliance.windowLabel}). Consider going offline.`,
        'warning',
      );
      void showSystemPushNotification({
        title: '⏰ Outside Preferred Shift Hours',
        body: `You are still on duty outside your scheduled shift (${shiftCompliance.windowLabel}).`,
        tag: 'shift-hours-reminder',
        tab: 'profile',
      });
    }
  }, [shiftCompliance.isOvertimeOnDuty, shiftCompliance.windowLabel, showToast]);

  // Demo mode bootstrap (for ?autostart=1 / ?demo=1 only)
  useEffect(() => {
    if (!demoActive) return;
    const seed = getDemoSeedState(Date.now());
    setRiderData(seed.riderData);
    setDeliveryPartnerRecord(seed.riderData);
    setProfileLoaded(true);
    setStores(seed.stores);
    setAssignedOrders(seed.assignedOrders);
    setAllOrders(seed.allOrders);
    setAllRiders(seed.allRiders);
    setAllSettlements(seed.allSettlements);
    setRiderSettlements(seed.riderSettlements);
    setMyRiderPayouts(seed.myRiderPayouts);
    setRiderRatings(seed.riderRatings);
    setMyFeedbacks(seed.myFeedbacks);
    setAdminSettings(seed.adminSettings);
    setGpsSyncTime(`Synced ${new Date().toLocaleTimeString()}`);
    setOrdersHydrated(true);
    setAuthReady(true);
  }, [demoActive]);

  // Google redirect sign-in completion & Firebase Auth session listener
  useEffect(() => {
    if (demoActive) return;
    let active = true;

    if (!Capacitor.isNativePlatform()) {
      void getRedirectResult(auth)
        .then(async (res) => {
          if (!active || !res?.user) return;
          await provisionGoogleDeliveryProfileIfNeeded(res.user);
          clearAuthThrottle();
        })
        .catch((err) => {
          if (!active) return;
          setAuthNotice({type: 'error', text: sanitizeFirebaseAuthError(err)});
        });
    }

    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (!user) {
        setDeliveryUserRecord(null);
        setDeliveryPartnerRecord(null);
        setProfileLoaded(false);
        setRiderData(null);
        setAssignedOrders({});
        setAllOrders({});
        setAllRiders({});
        setOrdersHydrated(false);
        prevActiveTripCountRef.current = null;
        return;
      }

      setAuthNotice(null);
      setProfileLoaded(false);

      void user.reload().catch((err) => {
        const code = (err as {code?: string} | null)?.code || '';
        if (
          code === 'auth/user-disabled' ||
          code === 'auth/user-token-expired' ||
          code === 'auth/invalid-user-token'
        ) {
          setAuthNotice({type: 'error', text: sanitizeFirebaseAuthError(err)});
          void signOut(auth);
        }
      });
    });

    return () => {
      active = false;
      unsub();
    };
  }, [demoActive]);

  // Phase 1 RTDB subscriptions: Rider's own profile & Admin support info
  useEffect(() => {
    if (demoActive || !currentUser) return;
    const uid = currentUser.uid;
    let userSnapReady = false;
    let partnerSnapReady = false;
    let latestUser: Partial<DeliveryUserProfile> | null = null;
    let latestPartner: RiderData | null = null;
    let autoProvisioned = false;

    const syncMerged = () => {
      if (userSnapReady && partnerSnapReady) {
        setProfileLoaded(true);
        if (!latestUser && !latestPartner && !autoProvisioned) {
          autoProvisioned = true;
          void provisionGoogleDeliveryProfileIfNeeded(currentUser).catch(() => undefined);
        }
      }
      const merged = mergeDeliveryProfiles(latestUser, latestPartner, currentUser);
      setRiderData(merged);
    };

    const unsubDeliveryUser = onValue(ref(db, `deliveryUsers/${uid}`), (snap) => {
      latestUser = (snap.val() as Partial<DeliveryUserProfile> | null) || null;
      userSnapReady = true;
      setDeliveryUserRecord(latestUser);
      syncMerged();
    });

    const unsubRider = onValue(ref(db, `deliveryPartners/${uid}`), (snap) => {
      const val = (snap.val() as RiderData | null) || null;
      latestPartner = val;
      partnerSnapReady = true;
      if (
        val &&
        prevAdminNoteRef.current !== undefined &&
        val.adminNote &&
        val.adminNote !== prevAdminNoteRef.current
      ) {
        void showSystemPushNotification({
          title: '💬 Message from Admin',
          body: val.adminNote,
          tag: 'admin-note',
          tab: 'active',
        });
      }
      prevAdminNoteRef.current = val?.adminNote || '';
      setDeliveryPartnerRecord(val);
      syncMerged();
    });

    const unsubSettings = onValue(ref(db, 'admin/settings'), (snap) => {
      const s = (snap.val() as AdminSettings | null) || {};
      if (
        prevAnnouncementRef.current !== undefined &&
        s.riderAnnouncement &&
        s.riderAnnouncement !== prevAnnouncementRef.current
      ) {
        void showSystemPushNotification({
          title: '📢 Gossaigaon Bazar Admin Notice',
          body: s.riderAnnouncement,
          tag: 'admin-announcement',
          tab: 'active',
        });
      }
      prevAnnouncementRef.current = s.riderAnnouncement || '';
      setAdminSettings(s);
    });

    return () => {
      unsubDeliveryUser();
      unsubRider();
      unsubSettings();
    };
  }, [demoActive, currentUser]);

  // Phase 2 RTDB real-time operational subscriptions (ONLY after Admin approval & active status)
  useEffect(() => {
    if (demoActive || !currentUser || accessEvaluation.gate !== 'APPROVED') return;
    const uid = currentUser.uid;

    const unsubStores = onValue(ref(db, 'restaurants'), (snap) => {
      setStores((snap.val() as Record<string, StoreInfo> | null) || {});
    });

    const unsubAllRiders = onValue(ref(db, 'deliveryPartners'), (snap) => {
      setAllRiders((snap.val() as Record<string, RiderData> | null) || {});
    });

    const unsubRatings = onValue(ref(db, `riderRatings/${uid}`), (snap) => {
      const list = Object.values((snap.val() as Record<string, RiderRating> | null) || {}).sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
      );
      setRiderRatings(list);
    });

    const unsubFeedbacks = onValue(ref(db, 'feedbacks'), (snap) => {
      const allFb = (snap.val() as Record<string, FeedbackRecord> | null) || {};
      const mine: Record<string, FeedbackRecord> = {};
      Object.entries(allFb).forEach(([id, f]) => {
        if (f.uid === uid) mine[id] = f;
      });
      setMyFeedbacks(mine);
    });

    const unsubOrders = onValue(ref(db, 'orders'), (snap) => {
      const allOrders = (snap.val() as Record<string, OrderRecord> | null) || {};
      const myOrders: Record<string, OrderRecord> = {};
      Object.entries(allOrders).forEach(([id, o]) => {
        if (o.deliveryUid === uid) myOrders[id] = o;
      });

      const activeCount = Object.values(myOrders).filter(
        (o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED',
      ).length;

      if (prevActiveTripCountRef.current !== null && activeCount > prevActiveTripCountRef.current) {
        playAssignmentChime(soundEnabledRef.current);
        triggerDeviceVibration([250, 100, 250]);
        showToast('🔔 New grocery trip assigned!', 'success');
        void showSystemPushNotification({
          title: '🛵 New Grocery Trip Assigned!',
          body: 'Tap to view pickup store and accept before the timer expires.',
          tag: 'new-trip-assigned',
          tab: 'active',
          requireInteraction: true,
        });
      }

      Object.entries(myOrders).forEach(([id, o]) => {
        const prevStatus = prevOrderStatusesRef.current[id];
        if (prevStatus && prevStatus !== 'READY_FOR_PICKUP' && o.status === 'READY_FOR_PICKUP') {
          playAssignmentChime(soundEnabledRef.current);
          void showSystemPushNotification({
            title: '📦 Store Order Ready for Pickup!',
            body: `Order #${id.slice(-6)} is packed and ready at the store.`,
            tag: `ready-${id}`,
            tab: 'active',
          });
        }
        prevOrderStatusesRef.current[id] = o.status || '';
      });

      prevActiveTripCountRef.current = activeCount;
      setAllOrders(allOrders);
      setAssignedOrders(myOrders);
      setOrdersHydrated(true);
    });

    const unsubSettlements = onValue(ref(db, 'settlements'), (snap) => {
      const allS = (snap.val() as Record<string, SettlementRecord> | null) || {};
      const mine: Record<string, SettlementRecord> = {};
      Object.entries(allS).forEach(([id, s]) => {
        if (s.riderUid === uid) {
          mine[id] = s;
          if (s.status === 'APPROVED' && !prevApprovedSettlementsRef.current.has(id)) {
            if (prevApprovedSettlementsRef.current.size > 0) {
              void showSystemPushNotification({
                title: '✅ COD Deposit Approved',
                body: `₹${Number(s.amount || 0).toFixed(2)} handover verified by Admin.`,
                tag: `settle-${id}`,
                tab: 'earnings',
              });
            }
            prevApprovedSettlementsRef.current.add(id);
          }
        }
      });
      setAllSettlements(allS);
      setRiderSettlements(mine);
    });

    const unsubPayouts = onValue(ref(db, 'riderPayouts'), (snap) => {
      const allP = (snap.val() as Record<string, RiderPayoutRecord> | null) || {};
      const mine: Record<string, RiderPayoutRecord> = {};
      Object.entries(allP).forEach(([id, p]) => {
        if (p.riderUid === uid) {
          mine[id] = p;
          if (p.status === 'PAID' && !prevPaidPayoutsRef.current.has(id)) {
            if (prevPaidPayoutsRef.current.size > 0) {
              void showSystemPushNotification({
                title: '💸 Earnings Payout Credited!',
                body: `₹${Number(p.amount || 0).toFixed(2)} sent to ${p.riderUpiId || 'your UPI'}.`,
                tag: `payout-${id}`,
                tab: 'earnings',
              });
            }
            prevPaidPayoutsRef.current.add(id);
          }
        }
      });
      setMyRiderPayouts(mine);
    });

    return () => {
      unsubStores();
      unsubAllRiders();
      unsubRatings();
      unsubFeedbacks();
      unsubOrders();
      unsubSettlements();
      unsubPayouts();
    };
  }, [demoActive, currentUser, accessEvaluation.gate, showToast]);

  // Foreground FCM + Service Worker + Native Notification Bar click routing
  useEffect(() => {
    let unsubFcm: (() => void) | undefined;
    void subscribeForegroundFcm(
      (payload) => {
        playAssignmentChime(soundEnabledRef.current);
        showToast(`${payload.title}: ${payload.body}`, 'info');
        void showSystemPushNotification(payload);
      },
      (tab) => setActiveTab(tab),
    ).then((fn) => {
      unsubFcm = fn;
    });

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data as {type?: string; tab?: RiderTab} | undefined;
      if (data?.type === 'NAVIGATE_TAB' && data.tab) {
        setActiveTab(data.tab);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);

    return () => {
      unsubFcm?.();
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
    };
  }, [showToast]);

  // Sync native Android notification permission on launch and auto-prompt once after login
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    void syncNativeNotificationPermission().then((perm) => {
      if (!active) return;
      setPushPermission(perm);
      if (
        perm === 'default' &&
        isDashboardUnlocked &&
        currentUser &&
        !nativePushPromptedRef.current
      ) {
        nativePushPromptedRef.current = true;
        void requestPushPermissionAndToken(currentUser.uid).then((res) => {
          if (active) setPushPermission(res.permission);
        });
      }
    });
    return () => {
      active = false;
    };
  }, [isDashboardUnlocked, currentUser]);

  // Auto-sync FCM token for approved active riders
  useEffect(() => {
    if (!currentUser || !isDashboardUnlocked || pushPermission !== 'granted') return;
    void requestPushPermissionAndToken(currentUser.uid);
  }, [currentUser, isDashboardUnlocked, pushPermission]);

  const handleEnablePush = useCallback(async () => {
    const res = await requestPushPermissionAndToken(currentUser?.uid);
    setPushPermission(res.permission);
    if (res.permission === 'granted') {
      showToast('🔔 Push Notifications enabled!', 'success');
      void showSystemPushNotification({
        title: 'Chutki Rider Alerts Active',
        body: 'You will receive instant alerts for new trips, store ready updates, and payouts.',
        tag: 'push-enabled',
        tab: 'active',
      });
    } else if (res.permission === 'denied') {
      showToast('Notification permission blocked. Allow it in Phone App Settings.', 'warning');
    } else if (res.permission === 'unsupported') {
      showToast('Push notifications not supported on this browser.', 'info');
    }
  }, [currentUser?.uid, showToast]);

  const handleSendTestPush = useCallback(async () => {
    const ok = await showSystemPushNotification({
      title: '🛵 Chutki Rider Test Alert',
      body: 'Push notifications are working! You will get instant dispatch & payout alerts.',
      tag: 'test-push',
      tab: 'active',
    });
    if (ok) {
      playAssignmentChime(soundEnabled);
      triggerDeviceVibration([150, 80, 150]);
      showToast('Test push notification sent!', 'success');
    } else {
      showToast('Enable notification permission first!', 'warning');
    }
  }, [soundEnabled, showToast]);

  // Live GPS Sync (WebSocket RTDB + Native CapacitorHttp REST fallback for background reliability)
  const pushRiderCoordinates = useCallback(
    (rawLat: number, rawLng: number) => {
      const lat = Number(Number(rawLat).toFixed(6));
      const lng = Number(Number(rawLng).toFixed(6));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      setRiderCurrentLat(lat);
      setRiderCurrentLng(lng);
      const now = Date.now();
      setGpsSyncTime(`Synced ${new Date(now).toLocaleTimeString()}`);

      const movedKm = lastTrailPointRef.current
        ? calculateDistanceKm(
            lastTrailPointRef.current.lat,
            lastTrailPointRef.current.lng,
            lat,
            lng,
          )
        : 1;
      const shouldAppendPoint = !lastTrailPointRef.current || (movedKm !== null && movedKm >= 0.015);

      if (demoActive) {
        if (shouldAppendPoint) {
          lastTrailPointRef.current = {lat, lng};
          setRiderData((prev) => {
            if (!prev) return prev;
            const existing = Array.isArray(prev.recentRoute) ? prev.recentRoute : [];
            return {
              ...prev,
              lat,
              lng,
              lastSeen: now,
              recentRoute: [...existing, {lat, lng, time: now}].slice(-20),
            };
          });
        }
        return;
      }

      const currentRider = riderDataRef.current;
      if (
        currentUser &&
        currentRider?.approved === true &&
        currentRider?.online &&
        currentRider?.suspended !== true
      ) {
        const riderUpdates: Record<string, unknown> = {
          lat,
          lng,
          online: true,
          lastSeen: now,
          lastLocationUpdate: now,
        };

        if (shouldAppendPoint) {
          const existingTrail = Array.isArray(currentRider.recentRoute) ? currentRider.recentRoute : [];
          riderUpdates.recentRoute = [...existingTrail, {lat, lng, time: now}].slice(-20);
          lastTrailPointRef.current = {lat, lng};
        }

        void update(ref(db, `deliveryPartners/${currentUser.uid}`), riderUpdates);

        const activeOrderIdsToSync = Object.entries(assignedOrdersRef.current)
          .filter(([, o]) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED')
          .map(([orderId]) => orderId);

        activeOrderIdsToSync.forEach((orderId) => {
          void update(ref(db, `orders/${orderId}`), {
            riderLat: lat,
            riderLng: lng,
            lastLocationUpdate: now,
          });
        });

        if (
          Capacitor.isNativePlatform() &&
          now - lastNativeHttpSyncMsRef.current >= 4000
        ) {
          lastNativeHttpSyncMsRef.current = now;
          void currentUser
            .getIdToken()
            .then((idToken) => {
              const authQ = `?auth=${encodeURIComponent(idToken)}`;
              void CapacitorHttp.patch({
                url: `${firebaseConfig.databaseURL}/deliveryPartners/${currentUser.uid}.json${authQ}`,
                headers: {'Content-Type': 'application/json'},
                data: riderUpdates,
              }).catch(() => undefined);

              activeOrderIdsToSync.forEach((orderId) => {
                void CapacitorHttp.patch({
                  url: `${firebaseConfig.databaseURL}/orders/${orderId}.json${authQ}`,
                  headers: {'Content-Type': 'application/json'},
                  data: {
                    riderLat: lat,
                    riderLng: lng,
                    lastLocationUpdate: now,
                  },
                }).catch(() => undefined);
              });
            })
            .catch(() => undefined);
        }
      }
    },
    [demoActive, currentUser],
  );

  // Foreground + Native Android Background GPS Tracking
  useEffect(() => {
    const isOnlineShift = Boolean(
      isDashboardUnlocked && riderData?.online && riderData?.suspended !== true,
    );
    if (!isOnlineShift) return;
    if (!autoGpsEnabled) {
      setGpsSyncTime('Auto GPS Paused');
      return;
    }

    let bgWatcherId: string | null = null;
    let bgCancelled = false;

    if (Capacitor.isNativePlatform()) {
      void BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: 'Chutki Rider • Live GPS Active',
          backgroundMessage: 'Tracking delivery location in background. Go Offline to stop.',
          requestPermissions: true,
          stale: false,
          distanceFilter: 10,
        },
        (location, error) => {
          if (bgCancelled) return;
          if (error) {
            if (error.code === 'NOT_AUTHORIZED') {
              showToast(
                'Enable Location ("Allow all the time") in App Settings for background GPS.',
                'warning',
              );
            }
            return;
          }
          if (location) {
            pushRiderCoordinates(location.latitude, location.longitude);
          }
        },
      )
        .then((id) => {
          if (bgCancelled) {
            void BackgroundGeolocation.removeWatcher({id}).catch(() => undefined);
          } else {
            bgWatcherId = id;
          }
        })
        .catch(() => undefined);
    }

    if (!navigator.geolocation) {
      return () => {
        bgCancelled = true;
        if (bgWatcherId) {
          void BackgroundGeolocation.removeWatcher({id: bgWatcherId}).catch(() => undefined);
        }
      };
    }

    const syncOnce = () => {
      if (isSyncingGpsRef.current) return;
      isSyncingGpsRef.current = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          isSyncingGpsRef.current = false;
          lastWatchDispatchMsRef.current = Date.now();
          lastWatchCoordsRef.current = {lat: pos.coords.latitude, lng: pos.coords.longitude};
          pushRiderCoordinates(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          isSyncingGpsRef.current = false;
          if (!bgWatcherId) setGpsSyncTime('Waiting for GPS...');
        },
        {
          enableHighAccuracy: gpsPolicy.enableHighAccuracy,
          timeout: gpsPolicy.timeoutMs,
          maximumAge: gpsPolicy.maximumAgeMs,
        },
      );
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        const elapsed = now - lastWatchDispatchMsRef.current;
        const movedKm = lastWatchCoordsRef.current
          ? calculateDistanceKm(
              lastWatchCoordsRef.current.lat,
              lastWatchCoordsRef.current.lng,
              pos.coords.latitude,
              pos.coords.longitude,
            )
          : null;
        const movedMeters = movedKm !== null ? movedKm * 1000 : Infinity;

        if (
          elapsed < gpsPolicy.minWatchDispatchMs &&
          movedMeters < gpsPolicy.minDistanceMeters
        ) {
          return;
        }
        lastWatchDispatchMsRef.current = now;
        lastWatchCoordsRef.current = {lat: pos.coords.latitude, lng: pos.coords.longitude};
        pushRiderCoordinates(pos.coords.latitude, pos.coords.longitude);
      },
      () => undefined,
      {
        enableHighAccuracy: gpsPolicy.enableHighAccuracy,
        timeout: Math.max(15000, gpsPolicy.timeoutMs),
        maximumAge: gpsPolicy.maximumAgeMs,
      },
    );

    syncOnce();
    const intervalId = setInterval(syncOnce, gpsPolicy.intervalMs);

    const handleVisibility = () => {
      if (!document.hidden) syncOnce();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    let wakeLock: {release: () => Promise<void>} | null = null;
    if ('wakeLock' in navigator) {
      void (
        navigator as unknown as {
          wakeLock: {request: (t: string) => Promise<{release: () => Promise<void>}>};
        }
      ).wakeLock
        .request('screen')
        .then((wl) => {
          wakeLock = wl;
        })
        .catch(() => undefined);
    }

    return () => {
      bgCancelled = true;
      if (bgWatcherId) {
        void BackgroundGeolocation.removeWatcher({id: bgWatcherId}).catch(() => undefined);
      }
      isSyncingGpsRef.current = false;
      navigator.geolocation.clearWatch(watchId);
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (wakeLock) void wakeLock.release().catch(() => undefined);
    };
  }, [
    isDashboardUnlocked,
    riderData?.online,
    riderData?.suspended,
    autoGpsEnabled,
    gpsPolicy.intervalMs,
    gpsPolicy.enableHighAccuracy,
    gpsPolicy.maximumAgeMs,
    gpsPolicy.timeoutMs,
    gpsPolicy.minWatchDispatchMs,
    gpsPolicy.minDistanceMeters,
    pushRiderCoordinates,
    showToast,
  ]);

  // Android APK Background GPS Bridge (15s interval - legacy hook if custom bridge exists)
  useEffect(() => {
    if (
      window.AndroidBridge &&
      (!isDashboardUnlocked || !currentUser || !riderData?.online || riderData?.suspended === true || !autoGpsEnabled)
    ) {
      window.AndroidBridge.stopTracking();
    }
    const interval = setInterval(async () => {
      if (!window.AndroidBridge) return;
      if (isDashboardUnlocked && currentUser && riderData?.online && riderData?.suspended !== true && autoGpsEnabled) {
        try {
          const idToken = await currentUser.getIdToken();
          const activeIds = Object.entries(assignedOrders)
            .filter(([, o]) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED')
            .map(([id]) => id)
            .join(',');
          window.AndroidBridge.startTracking(
            currentUser.uid,
            idToken,
            currentUser.refreshToken || '',
            firebaseConfig.apiKey,
            firebaseConfig.databaseURL,
            activeIds,
          );
        } catch {
          // ignore
        }
      } else {
        window.AndroidBridge.stopTracking();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [isDashboardUnlocked, currentUser, riderData?.online, riderData?.suspended, autoGpsEnabled, assignedOrders]);

  // Pass Trip to nearest eligible rider
  const passTripToNextRider = useCallback(
    async (tripId: string, reason: string) => {
      const trip = activeTrips.find((t) => t.tripId === tripId);
      if (!trip) return;
      if (isTripPickedUp(trip)) {
        showToast('🔒 Store se pickup ke baad order cancel/pass nahi kar sakte!', 'danger');
        return;
      }

      if (demoActive) {
        setAssignedOrders((prev) => {
          const next = {...prev};
          trip.orders.forEach((o) => delete next[o.orderId]);
          return next;
        });
        showToast('⚡ Trip passed to nearest rider near store!', 'success');
        return;
      }

      if (!currentUser) return;
      showToast('Finding nearest online rider to store...', 'info');
      try {
        const snap = await get(ref(db, 'deliveryPartners'));
        const allRiders = (snap.val() as Record<string, RiderData> | null) || {};
        const store = stores[trip.orders[0].restaurantId || ''] || {};
        const storeLat = Number(store.lat) || riderCurrentLat || 26.4524;
        const storeLng = Number(store.lng) || riderCurrentLng || 89.9723;

        const nextRiderUid = selectNearestEligibleRider(
          allRiders,
          currentUser.uid,
          trip.orders,
          storeLat,
          storeLng,
        );

        await Promise.all(
          trip.orders.map((o) => {
            const updates: Record<string, unknown> = {
              deliveryUid: nextRiderUid || null,
              riderAccepted: null,
              riderAcceptedAt: null,
              assignedAt: nextRiderUid ? Date.now() : null,
              updatedAt: Date.now(),
            };
            updates[`rejectedByRiders/${currentUser.uid}`] = {
              riderName: riderData?.name || 'Rider',
              riderPhone: riderData?.phone || '',
              reason: reason || 'Declined',
              timestamp: Date.now(),
            };
            return update(ref(db, `orders/${o.orderId}`), updates);
          }),
        );

        showToast(
          nextRiderUid ? '⚡ Trip passed to nearest rider near store!' : 'Sent to Admin queue.',
          nextRiderUid ? 'success' : 'warning',
        );
      } catch (err) {
        showToast('Error: ' + (err instanceof Error ? err.message : 'Unknown error'), 'danger');
      }
    },
    [activeTrips, demoActive, currentUser, stores, riderCurrentLat, riderCurrentLng, riderData, showToast],
  );

  const hasUnacceptedTrip = useMemo(
    () =>
      activeTrips.some(
        (trip) => !trip.orders.every((o) => o.riderAccepted === true) && !isTripPickedUp(trip),
      ),
    [activeTrips],
  );

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      setNowMs(now);
      if (!hasUnacceptedTrip) return;
      activeTrips.forEach((trip) => {
        if (trip.orders.every((o) => o.riderAccepted === true)) return;
        if (isTripPickedUp(trip)) return;
        const remainingSec = Math.max(
          0,
          acceptTimeoutSec - Math.floor((now - (trip.assignedAt || now)) / 1000),
        );
        if (remainingSec <= 0 && !timedOutTripsRef.current[trip.tripId]) {
          timedOutTripsRef.current[trip.tripId] = true;
          void passTripToNextRider(trip.tripId, `Auto-Timeout (${acceptTimeoutSec}s)`);
        }
      });
    };

    if (hasUnacceptedTrip) {
      tick();
    }
    const intervalMs = hasUnacceptedTrip ? 1000 : 30000;
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [hasUnacceptedTrip, activeTrips, acceptTimeoutSec, passTripToNextRider]);

  useEffect(() => {
    if (!verifyModalState.open || !verifyModalState.tripId) {
      setPinLockRemainingSec(0);
      return;
    }
    const syncCountdown = () => {
      const guard = pinGuardRef.current[verifyModalState.tripId];
      const rem = guard && guard.lockedUntil > Date.now()
        ? Math.ceil((guard.lockedUntil - Date.now()) / 1000)
        : 0;
      setPinLockRemainingSec(rem);
    };
    syncCountdown();
    const timer = window.setInterval(syncCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [verifyModalState.open, verifyModalState.tripId]);

  useEffect(() => {
    if (!isDashboardUnlocked || !idleLockEnabled || terminalLocked) return;

    const touchActivity = () => {
      lastActivityMsRef.current = Date.now();
    };
    touchActivity();

    window.addEventListener('pointerdown', touchActivity, {passive: true});
    window.addEventListener('keydown', touchActivity, {passive: true});

    const checker = window.setInterval(() => {
      if (Date.now() - lastActivityMsRef.current >= 15 * 60 * 1000) {
        setTerminalLocked(true);
        logThreat('SESSION_LOCK', 'info', 'Terminal auto-locked after 15m inactivity');
      }
    }, 30_000);

    return () => {
      window.removeEventListener('pointerdown', touchActivity);
      window.removeEventListener('keydown', touchActivity);
      window.clearInterval(checker);
    };
  }, [isDashboardUnlocked, idleLockEnabled, terminalLocked, logThreat]);

  // Unified Tab Navigation + Android Hardware Back Button + Browser Popstate Handler
  const switchNav = useCallback(
    (tabName: RiderTab, pushHistory = true) => {
      if (tabName !== activeTabRef.current) {
        triggerCue('tap');
      }
      setActiveTab(tabName);
      if (pushHistory) {
        window.history.pushState({screen: tabName}, '');
      }
    },
    [triggerCue],
  );

  const modalOpenStateRef = useRef({
    feedbackModalOpen,
    cancelModalTripId,
    sosModalTripId,
    payoutModalOpen,
    verifyOpen: verifyModalState.open,
    depositModalOpen,
    chatOpen: Boolean(comm.openChatTarget),
    callActive: Boolean(comm.callSession),
    terminalLocked,
  });
  modalOpenStateRef.current = {
    feedbackModalOpen,
    cancelModalTripId,
    sosModalTripId,
    payoutModalOpen,
    verifyOpen: verifyModalState.open,
    depositModalOpen,
    chatOpen: Boolean(comm.openChatTarget),
    callActive: Boolean(comm.callSession),
    terminalLocked,
  };

  useEffect(() => {
    window.history.replaceState({screen: activeTabRef.current}, '');

    const handleBackAction = (isNativeHardwareBack: boolean) => {
      const m = modalOpenStateRef.current;

      if (m.callActive || m.terminalLocked) {
        if (!isNativeHardwareBack) {
          window.history.pushState({screen: activeTabRef.current}, '');
        }
        return;
      }

      if (m.chatOpen) {
        commRef.current.closeOrderChat();
        return;
      }
      if (m.feedbackModalOpen) {
        setFeedbackModalOpen(false);
        return;
      }
      if (m.cancelModalTripId) {
        setCancelModalTripId(null);
        return;
      }
      if (m.sosModalTripId) {
        setSosModalTripId(null);
        return;
      }
      if (m.payoutModalOpen) {
        setPayoutModalOpen(false);
        return;
      }
      if (m.verifyOpen) {
        setVerifyModalState((s) => ({...s, open: false}));
        return;
      }
      if (m.depositModalOpen) {
        setDepositModalOpen(false);
        return;
      }

      if (activeTabRef.current !== 'active') {
        switchNav('active', false);
        window.history.replaceState({screen: 'active'}, '');
        return;
      }

      const now = Date.now();
      if (now - riderLastBackTimeRef.current < 2000) {
        if (isNativeHardwareBack && Capacitor.isNativePlatform()) {
          if (riderDataRef.current?.online) {
            void CapacitorApp.minimizeApp();
          } else {
            void CapacitorApp.exitApp();
          }
        } else {
          window.history.back();
        }
      } else {
        riderLastBackTimeRef.current = now;
        showToast('Press BACK again to exit', 'info');
        if (!isNativeHardwareBack) {
          window.history.pushState({screen: 'active'}, '');
        }
      }
    };

    const handlePop = () => handleBackAction(false);
    window.addEventListener('popstate', handlePop);

    let backListenerPromise: Promise<{remove: () => Promise<void>}> | null = null;
    if (Capacitor.isNativePlatform()) {
      backListenerPromise = CapacitorApp.addListener('backButton', () => {
        handleBackAction(true);
      });
    }

    return () => {
      window.removeEventListener('popstate', handlePop);
      if (backListenerPromise) {
        void backListenerPromise.then((h) => h.remove()).catch(() => undefined);
      }
    };
  }, [switchNav, showToast]);

  // Rider actions
  const handleToggleSound = () => {
    triggerCue('tap');
    setSoundEnabled((prev) => {
      const next = !prev;
      showToast(next ? 'Trip chime: ON' : 'Trip chime: MUTED', 'info');
      return next;
    });
  };

  const handleToggleDuty = () => {
    if (!riderData) return;
    if (riderData.suspended === true) {
      triggerCue('warning');
      showToast('🚫 Account suspended by Admin!', 'danger');
      return;
    }
    const newStatus = !riderData.online;
    if (newStatus && financials.netCashInHand >= maxAllowedCashLimit) {
      triggerCue('warning');
      showToast(`🛑 Cash Limit ₹${maxAllowedCashLimit} Exceeded! Deposit cash first.`, 'danger');
      return;
    }

    if (demoActive) {
      setRiderData((prev) => (prev ? {...prev, online: newStatus, lastSeen: Date.now()} : prev));
      triggerCue(newStatus ? 'dutyOn' : 'dutyOff');
      showToast(
        newStatus ? 'Duty ON: Live 5s GPS active!' : 'Duty OFF: Shift Ended.',
        newStatus ? 'success' : 'info',
      );
      return;
    }

    if (!currentUser) return;
    void update(ref(db, `deliveryPartners/${currentUser.uid}`), {
      online: newStatus,
      lastSeen: Date.now(),
    }).then(() => {
      triggerCue(newStatus ? 'dutyOn' : 'dutyOff');
      showToast(
        newStatus ? 'Duty ON: Live Background GPS active!' : 'Duty OFF: Shift Ended.',
        newStatus ? 'success' : 'info',
      );
    });
  };

  const handleAcceptTrip = (tripId: string) => {
    if (riderData?.suspended === true) {
      triggerCue('warning');
      showToast('🚫 Account suspended by Admin!', 'danger');
      return;
    }
    const trip = activeTrips.find((t) => t.tripId === tripId);
    if (!trip) return;

    if (demoActive) {
      setAssignedOrders((prev) => {
        const next = {...prev};
        trip.orders.forEach((o) => {
          next[o.orderId] = {...next[o.orderId], riderAccepted: true, riderAcceptedAt: Date.now()};
        });
        return next;
      });
      triggerCue('accept');
      showToast('🎉 Trip Accepted!', 'success');
      return;
    }

    void Promise.all(
      trip.orders.map((o) =>
        update(ref(db, `orders/${o.orderId}`), {
          riderAccepted: true,
          riderAcceptedAt: Date.now(),
          riderLat: riderCurrentLat,
          riderLng: riderCurrentLng,
          lastLocationUpdate: Date.now(),
          updatedAt: Date.now(),
        }),
      ),
    ).then(() => {
      triggerCue('accept');
      showToast('🎉 Trip Accepted!', 'success');
    });
  };

  const handleConfirmStorePickup = (orderId: string) => {
    if (riderData?.suspended === true) {
      triggerCue('warning');
      showToast('🚫 Account suspended by Admin!', 'danger');
      return;
    }
    if (demoActive) {
      setAssignedOrders((prev) => ({
        ...prev,
        [orderId]: {
          ...prev[orderId],
          status: 'PICKED_UP',
          storePickupVerifiedAt: Date.now(),
        },
      }));
      triggerCue('pickup');
      showToast('✅ Order picked up from store! Cancel/Pass ab lock ho gaya hai.', 'success');
      return;
    }

    void update(ref(db, `orders/${orderId}`), {
      status: 'PICKED_UP',
      storePickupVerifiedAt: Date.now(),
      riderLat: riderCurrentLat,
      riderLng: riderCurrentLng,
      lastLocationUpdate: Date.now(),
      updatedAt: Date.now(),
    }).then(() => {
      triggerCue('pickup');
      showToast('✅ Order picked up from store! Cancel/Pass ab lock ho gaya hai.', 'success');
    });
  };

  const handleStartDoorstepRoute = (tripId: string) => {
    if (riderData?.suspended === true) {
      triggerCue('warning');
      showToast('🚫 Account suspended by Admin!', 'danger');
      return;
    }
    const trip = activeTrips.find((t) => t.tripId === tripId);
    if (!trip) return;

    if (demoActive) {
      setAssignedOrders((prev) => {
        const next = {...prev};
        trip.orders.forEach((o) => {
          next[o.orderId] = {...next[o.orderId], status: 'OUT_FOR_DELIVERY'};
        });
        return next;
      });
      triggerCue('routeStart');
      showToast('🛵 Doorstep route started!', 'info');
      return;
    }

    void Promise.all(
      trip.orders.map((o) =>
        update(ref(db, `orders/${o.orderId}`), {
          status: 'OUT_FOR_DELIVERY',
          riderLat: riderCurrentLat,
          riderLng: riderCurrentLng,
          lastLocationUpdate: Date.now(),
          updatedAt: Date.now(),
        }),
      ),
    ).then(() => {
      triggerCue('routeStart');
      showToast('🛵 Doorstep route started!', 'info');
    });
  };

  const handleConfirmPinDelivery = (tripId: string, enteredPin: string, cashTendered = '') => {
    if (isVerifyingDelivery) return;
    if (riderData?.suspended === true) {
      triggerCue('warning');
      showToast('🚫 Account suspended by Admin!', 'danger');
      return;
    }
    const trip = activeTrips.find((t) => t.tripId === tripId);
    if (!trip) return;

    const totalBillAmt = trip.orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const isPrepaid =
      trip.paymentMode === 'WALLET' ||
      (trip.paymentMode === 'UPI' && trip.orders.every((o) => o.paymentStatus === 'VERIFIED'));
    const codGuard = canCompleteCodDelivery(isPrepaid, totalBillAmt, cashTendered);
    if (!codGuard.allowed) {
      triggerCue('warning');
      logThreat('COD_GUARD', 'medium', `Blocked short COD completion (-₹${codGuard.shortBy})`);
      showToast(codGuard.reason || 'Collect full COD amount first!', 'danger');
      return;
    }

    const result = evaluatePinAttempt(
      pinGuardRef.current[tripId],
      trip.deliveryOtp,
      enteredPin,
      Date.now(),
    );
    pinGuardRef.current[tripId] = result.nextGuard;
    savePinGuards(pinGuardRef.current);

    if (!result.allowed) {
      if (result.lockedSecondsRemaining !== undefined) {
        triggerCue('error');
        setPinLockRemainingSec(result.lockedSecondsRemaining);
        showToast(`🔒 Locked: Wait ${result.lockedSecondsRemaining}s.`, 'danger');
      } else if (result.justLocked) {
        triggerCue('error');
        setPinLockRemainingSec(60);
        logThreat('BRUTE_FORCE', 'high', `Delivery PIN locked 60s on Trip #${tripId.slice(-6)}`);
        showToast('🚨 3 Wrong Attempts! Locked 60s.', 'danger');
      } else {
        triggerCue('warning');
        showToast(`❌ Wrong PIN! (${result.attemptsLeft} left)`, 'danger');
      }
      return;
    }

    setPinLockRemainingSec(0);
    setIsVerifyingDelivery(true);
    const verifiedAt = Date.now();
    if (demoActive) {
      setAssignedOrders((prev) => {
        const next = {...prev};
        trip.orders.forEach((o) => {
          next[o.orderId] = {
            ...next[o.orderId],
            status: 'DELIVERED',
            verificationMethod: 'PIN',
            verifiedAt,
            updatedAt: verifiedAt,
          };
        });
        return next;
      });
      setVerifyModalState((s) => ({...s, open: false}));
      setIsVerifyingDelivery(false);
      triggerCue('success');
      showToast('🎉 PIN Verified! Trip Completed!', 'success');
      return;
    }

    void Promise.all(
      trip.orders.map((o) =>
        update(ref(db, `orders/${o.orderId}`), {
          status: 'DELIVERED',
          verificationMethod: 'PIN',
          verifiedAt,
          updatedAt: verifiedAt,
        }),
      ),
    )
      .then(() => {
        setVerifyModalState((s) => ({...s, open: false}));
        triggerCue('success');
        showToast('🎉 PIN Verified! Trip Completed!', 'success');
      })
      .finally(() => setIsVerifyingDelivery(false));
  };

  const handleConfirmQrDelivery = (tripId: string, rawQrPayload: string, cashTendered = '') => {
    if (isVerifyingDelivery) return;
    if (riderData?.suspended === true) {
      triggerCue('warning');
      showToast('🚫 Account suspended by Admin!', 'danger');
      return;
    }
    const trip = activeTrips.find((t) => t.tripId === tripId);
    if (!trip) return;

    const totalBillAmt = trip.orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const isPrepaid =
      trip.paymentMode === 'WALLET' ||
      (trip.paymentMode === 'UPI' && trip.orders.every((o) => o.paymentStatus === 'VERIFIED'));
    const codGuard = canCompleteCodDelivery(isPrepaid, totalBillAmt, cashTendered);
    if (!codGuard.allowed) {
      const msg = codGuard.reason || 'Collect full COD amount first!';
      triggerCue('warning');
      setQrScanError(msg);
      logThreat('COD_GUARD', 'medium', `Blocked short COD QR completion (-₹${codGuard.shortBy})`);
      showToast(msg, 'danger');
      return;
    }

    const threatCheck = analyzeQrSecurityThreat(rawQrPayload);
    if (!threatCheck.safe) {
      const msg = threatCheck.reason || 'Blocked unsafe QR payload.';
      triggerCue('error');
      setQrScanError(msg);
      logThreat('QR_PHISHING', 'high', msg);
      showToast(msg, 'danger');
      return;
    }

    const validation = validateDeliveryQrPayload(rawQrPayload, trip);
    if (!validation.valid) {
      const msg = validation.reason || 'Invalid customer QR code.';
      triggerCue('warning');
      setQrScanError(msg);
      logThreat('QR_PHISHING', 'medium', `Rejected mismatched QR on Trip #${tripId.slice(-6)}`);
      showToast(`❌ ${msg}`, 'danger');
      return;
    }

    setQrScanError(null);
    setIsVerifyingDelivery(true);
    const verifiedAt = Date.now();

    if (demoActive) {
      setAssignedOrders((prev) => {
        const next = {...prev};
        trip.orders.forEach((o) => {
          next[o.orderId] = {
            ...next[o.orderId],
            status: 'DELIVERED',
            verificationMethod: 'QR_CODE',
            verifiedAt,
            updatedAt: verifiedAt,
          };
        });
        return next;
      });
      setVerifyModalState((s) => ({...s, open: false}));
      setIsVerifyingDelivery(false);
      playAssignmentChime(soundEnabled);
      triggerCue('success');
      showToast('🎉 Customer QR Verified! Trip Completed!', 'success');
      return;
    }

    void Promise.all(
      trip.orders.map((o) =>
        update(ref(db, `orders/${o.orderId}`), {
          status: 'DELIVERED',
          verificationMethod: 'QR_CODE',
          verifiedAt,
          updatedAt: verifiedAt,
        }),
      ),
    )
      .then(() => {
        setVerifyModalState((s) => ({...s, open: false}));
        playAssignmentChime(soundEnabled);
        triggerCue('success');
        showToast('🎉 Customer QR Verified! Trip Completed!', 'success');
      })
      .finally(() => setIsVerifyingDelivery(false));
  };

  const handleSubmitSos = (tripId: string, reason: string) => {
    const trip = activeTrips.find((t) => t.tripId === tripId);
    if (!trip) return;

    if (demoActive) {
      setSosModalTripId(null);
      triggerCue('warning');
      showToast('⚠️ Delay alert sent!', 'warning');
      return;
    }

    void Promise.all(
      trip.orders.map((o) =>
        update(ref(db, `orders/${o.orderId}`), {
          emergencyAlert: true,
          emergencyDetails: `Rider update: ${sanitizeText(reason)}`,
          updatedAt: Date.now(),
        }),
      ),
    ).then(() => {
      setSosModalTripId(null);
      triggerCue('warning');
      showToast('⚠️ Delay alert sent!', 'warning');
    });
  };

  const handleSubmitPayout = (amount: number, upi: string) => {
    if (isSubmittingPayout) return;
    if (riderData?.suspended === true) {
      showToast('🚫 Account suspended by Admin!', 'danger');
      return;
    }
    if (!Number.isFinite(amount) || amount < minRiderPayoutAmount || amount > maxRiderPayoutAmount) {
      showToast(`Allowed withdrawal: ₹${minRiderPayoutAmount} to ₹${maxRiderPayoutAmount}!`, 'danger');
      return;
    }
    if (amount > financials.availablePayoutBalance) {
      showToast('Insufficient earnings balance!', 'danger');
      return;
    }
    const upiCheck = verifyUpiSecurity(upi, riderData?.upiId);
    if (!upiCheck.valid) {
      triggerCue('error');
      logThreat('ACCOUNT_CHANGE', 'high', upiCheck.reason || 'Blocked suspicious payout UPI');
      showToast(upiCheck.reason || 'Enter valid UPI ID!', 'danger');
      return;
    }
    if (upiCheck.isDifferentFromProfile) {
      logThreat(
        'ACCOUNT_CHANGE',
        'medium',
        `Payout requested to non-profile UPI (${upi})`,
      );
    }

    setIsSubmittingPayout(true);
    if (demoActive) {
      const id = `pay_${Date.now()}`;
      setMyRiderPayouts((prev) => ({
        ...prev,
        [id]: {
          riderUid: 'demo_rider_uid',
          riderName: riderData?.name || 'Rider',
          riderPhone: riderData?.phone || '',
          riderUpiId: upi,
          amount: Number(amount.toFixed(2)),
          status: 'PENDING',
          createdAt: Date.now(),
        },
      }));
      setPayoutModalOpen(false);
      setIsSubmittingPayout(false);
      triggerCue('success');
      showToast(`🎉 ₹${amount.toFixed(2)} Payout Request sent!`, 'success');
      return;
    }

    if (!currentUser) {
      setIsSubmittingPayout(false);
      return;
    }

    void push(ref(db, 'riderPayouts'), {
      riderUid: currentUser.uid,
      riderName: riderData?.name || 'Rider',
      riderPhone: riderData?.phone || '',
      riderUpiId: upi,
      amount: Number(amount.toFixed(2)),
      status: 'PENDING',
      createdAt: Date.now(),
    })
      .then(() => {
        setPayoutModalOpen(false);
        triggerCue('success');
        showToast(`🎉 ₹${amount.toFixed(2)} Payout Request sent!`, 'success');
      })
      .finally(() => setIsSubmittingPayout(false));
  };

  const handleSubmitDeposit = (amt: number, mode: 'UPI' | 'CASH', utr: string) => {
    if (isSubmittingDeposit) return;
    if (riderData?.suspended === true) {
      triggerCue('warning');
      showToast('🚫 Account suspended by Admin!', 'danger');
      return;
    }
    if (!Number.isFinite(amt) || amt < minRiderCodDeposit || amt > maxRiderCodDeposit) {
      triggerCue('warning');
      showToast(`COD Deposit limit: ₹${minRiderCodDeposit} to ₹${maxRiderCodDeposit}!`, 'danger');
      return;
    }
    if (amt > financials.netCashInHand) {
      triggerCue('warning');
      showToast('Amount exceeds cash in hand!', 'danger');
      return;
    }
    if (mode === 'UPI') {
      const check = validateSettlementUtr(utr, allSettlements);
      if (!check.valid) {
        triggerCue('error');
        logThreat('SCAM_UTR', 'high', check.reason || 'Blocked suspicious UTR submission');
        showToast(check.reason || 'Invalid UTR', 'danger');
        return;
      }
    }

    setIsSubmittingDeposit(true);
    const payload: SettlementRecord = {
      riderUid: currentUser?.uid || 'demo_rider_uid',
      riderName: riderData?.name || 'Rider',
      amount: Number(amt.toFixed(2)),
      mode,
      utr: mode === 'UPI' ? utr : 'PHYSICAL_HANDOVER',
      status: 'PENDING',
      createdAt: Date.now(),
    };

    if (demoActive) {
      const id = `settle_${Date.now()}`;
      setAllSettlements((prev) => ({...prev, [id]: payload}));
      setRiderSettlements((prev) => ({...prev, [id]: payload}));
      setDepositModalOpen(false);
      setIsSubmittingDeposit(false);
      triggerCue('success');
      showToast('🎉 Handover submitted to Admin!', 'success');
      return;
    }

    void push(ref(db, 'settlements'), payload)
      .then(() => {
        setDepositModalOpen(false);
        triggerCue('success');
        showToast('🎉 Handover submitted to Admin!', 'success');
      })
      .finally(() => setIsSubmittingDeposit(false));
  };

  const handleSaveProfile = (updates: {name: string; phone: string; upiId: string; vehicle: string}) => {
    if (riderData?.suspended === true) {
      showToast('🚫 Account suspended by Admin!', 'danger');
      return;
    }
    const upiChanged =
      Boolean(riderData?.upiId) &&
      updates.upiId.trim().toLowerCase() !== String(riderData?.upiId || '').trim().toLowerCase();
    if (upiChanged) {
      logThreat('ACCOUNT_CHANGE', 'medium', `Profile payout UPI updated to ${updates.upiId}`);
    }

    if (demoActive) {
      setRiderData((prev) => (prev ? {...prev, ...updates} : prev));
      triggerCue('pickup');
      showToast(
        upiChanged ? '🛡️ Profile saved & Payout UPI change logged!' : 'Rider profile & UPI ID saved!',
        'success',
      );
      return;
    }
    if (!currentUser) return;
    const now = Date.now();
    const normalizedPhone = normalizeIndianPhone(updates.phone);
    void Promise.all([
      update(ref(db, `deliveryPartners/${currentUser.uid}`), {
        ...updates,
        fullName: updates.name,
        phone: normalizedPhone,
        updatedAt: now,
      }),
      update(ref(db, `deliveryUsers/${currentUser.uid}`), {
        fullName: updates.name,
        phone: normalizedPhone,
        updatedAt: now,
      }),
    ]).then(() => {
      triggerCue('pickup');
      showToast(
        upiChanged ? '🛡️ Profile saved & Payout UPI change logged!' : 'Rider profile & UPI ID saved!',
        'success',
      );
    });
  };

  const handleSaveShiftHours = (shift: PreferredShiftHours) => {
    const check = isValidShiftHours(shift.startTime, shift.endTime);
    if (!check.valid) {
      triggerCue('warning');
      showToast(check.reason || 'Invalid shift hours.', 'danger');
      return;
    }
    const label = `${formatShiftTime12h(shift.startTime)} – ${formatShiftTime12h(shift.endTime)}`;
    setShiftBannerDismissed(false);
    prevOvertimeRef.current = false;

    if (demoActive) {
      setRiderData((prev) => (prev ? {...prev, preferredShift: shift, lastSeen: Date.now()} : prev));
      triggerCue('tap');
      showToast(
        shift.enabled ? `⏰ Shift hours saved (${label})` : 'Shift alerts paused.',
        shift.enabled ? 'success' : 'info',
      );
      return;
    }
    if (!currentUser) return;
    void update(ref(db, `deliveryPartners/${currentUser.uid}`), {
      preferredShift: shift,
      updatedAt: Date.now(),
    }).then(() => {
      triggerCue('tap');
      showToast(
        shift.enabled ? `⏰ Shift hours saved (${label})` : 'Shift alerts paused.',
        shift.enabled ? 'success' : 'info',
      );
    });
  };

  const handleSubmitFeedback = (subject: string, message: string) => {
    const payload: FeedbackRecord = {
      role: 'RIDER',
      uid: currentUser?.uid || 'demo_rider_uid',
      name: riderData?.name || 'Rider',
      phone: riderData?.phone || '',
      subject: sanitizeText(subject),
      message: sanitizeText(message),
      status: 'OPEN',
      createdAt: Date.now(),
    };
    if (demoActive) {
      setMyFeedbacks((prev) => ({...prev, [`fb_${Date.now()}`]: payload}));
      setFeedbackModalOpen(false);
      showToast('💬 Ticket sent to Admin Hub!', 'success');
      return;
    }
    void push(ref(db, 'feedbacks'), payload).then(() => {
      setFeedbackModalOpen(false);
      showToast('💬 Ticket sent to Admin Hub!', 'success');
    });
  };

  const handleRefreshApprovalStatus = useCallback(async () => {
    if (!currentUser) return;
    try {
      await currentUser.reload();
      const [userSnap, partnerSnap] = await Promise.all([
        get(ref(db, `deliveryUsers/${currentUser.uid}`)),
        get(ref(db, `deliveryPartners/${currentUser.uid}`)),
      ]);
      const latestU = (userSnap.val() as Partial<DeliveryUserProfile> | null) || null;
      const latestP = (partnerSnap.val() as RiderData | null) || null;
      setDeliveryUserRecord(latestU);
      setDeliveryPartnerRecord(latestP);
      setProfileLoaded(true);

      const evalNext = evaluateDeliveryAccessGate({
        profileLoaded: true,
        deliveryUser: latestU,
        deliveryPartner: latestP,
      });
      if (evalNext.gate === 'APPROVED') {
        showToast('🎉 Your Chutki delivery account is approved!', 'success');
      } else if (evalNext.gate === 'PENDING') {
        showToast('Your delivery account is still waiting for Admin approval.', 'info');
      }
    } catch (err) {
      showToast(sanitizeFirebaseAuthError(err), 'danger');
    }
  }, [currentUser, showToast]);

  const handleLogout = () => {
    cancelTripSpeech();
    setOrdersHydrated(false);
    knownActiveTripIdsRef.current = null;
    prevActiveTripCountRef.current = null;
    if (demoActive) {
      setDemoActive(false);
      return;
    }
    if (currentUser) {
      void update(ref(db, `deliveryPartners/${currentUser.uid}`), {online: false}).catch(
        () => undefined,
      );
    }
    if (Capacitor.isNativePlatform()) {
      void FirebaseAuthentication.signOut().catch(() => undefined);
    }
    void signOut(auth);
  };

  const isAuthenticated = demoActive || Boolean(currentUser);

  return (
    <>
      <ToastContainer toasts={toasts} />
      <OfflineIndicator />

      <div className="app-viewport">
        {!authReady ? null : !isAuthenticated ? (
          <AuthScreen initialNotice={authNotice} />
        ) : !isDashboardUnlocked && currentUser ? (
          <ApprovalGateScreen
            user={currentUser}
            riderData={riderData}
            evaluation={accessEvaluation}
            adminSettings={adminSettings}
            onRefreshStatus={handleRefreshApprovalStatus}
            onSignOut={handleLogout}
            onNotify={showToast}
          />
        ) : (
          <>
            <RiderHeader
              riderData={riderData}
              adminSettings={adminSettings}
              soundEnabled={soundEnabled}
              gpsSyncTime={gpsSyncTime}
              batteryStatus={batteryStatus}
              gpsPolicy={gpsPolicy}
              netCashInHand={financials.netCashInHand}
              maxAllowedCashLimit={maxAllowedCashLimit}
              pushPermission={pushPermission}
              onToggleSound={handleToggleSound}
              onToggleDuty={handleToggleDuty}
              onEnablePush={() => void handleEnablePush()}
              onOpenDeposit={() => {
                switchNav('earnings');
                if (financials.netCashInHand <= 0) {
                  showToast('No COD cash balance to deposit!', 'info');
                } else {
                  setDepositModalOpen(true);
                  window.history.pushState({modal: 'deposit'}, '');
                }
              }}
            />

            {shiftCompliance.isOvertimeOnDuty && !shiftBannerDismissed && (
              <div className="app-main-container" style={{flex: 'none'}}>
                <div
                  data-testid="outside-shift-alert"
                  role="alert"
                  style={{
                    margin: '0.65rem 1rem 0',
                    padding: '0.75rem 0.85rem',
                    borderRadius: '14px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.45)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'flex-start', gap: '8px'}}>
                    <i
                      className="fa-solid fa-clock-rotate-left"
                      style={{color: '#fbbf24', marginTop: '2px', fontSize: '0.92rem'}}
                    />
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{fontSize: '0.8rem', fontWeight: 700, color: '#fde68a'}}>
                        Outside Preferred Shift ({shiftCompliance.windowLabel})
                      </div>
                      <div style={{fontSize: '0.72rem', color: '#fcd34d', marginTop: '2px'}}>
                        You are still on duty outside your scheduled hours. Go offline when ready to end shift.
                      </div>
                    </div>
                  </div>
                  <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                    <button
                      type="button"
                      data-testid="shift-alert-offline-btn"
                      className="btn btn-sm"
                      style={{
                        flex: 1,
                        background: '#f59e0b',
                        color: '#050811',
                        fontWeight: 800,
                        border: 'none',
                      }}
                      onClick={handleToggleDuty}
                    >
                      <i className="fa-solid fa-power-off" /> Go Offline
                    </button>
                    {activeTab !== 'profile' && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{borderColor: 'rgba(251, 191, 36, 0.45)', color: '#fde68a'}}
                        onClick={() => switchNav('profile')}
                      >
                        Edit Shift
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="shift-alert-dismiss-btn"
                      className="btn btn-outline btn-sm"
                      style={{borderColor: 'rgba(255,255,255,0.2)', color: 'var(--text-muted)'}}
                      onClick={() => setShiftBannerDismissed(true)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'active' && (
              <>
                {showPowerBankBanner && (
                  <div className="app-main-container" style={{flex: 'none'}}>
                    <div
                      data-testid="low-battery-powerbank-banner"
                      role="status"
                      aria-live="polite"
                      style={{
                        margin: '0.65rem 1rem 0',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '14px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(248, 113, 113, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '9px',
                          background: 'rgba(239, 68, 68, 0.16)',
                          color: '#fca5a5',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.9rem',
                          flexShrink: 0,
                        }}
                      >
                        <i className="fa-solid fa-car-battery" />
                      </span>
                      <div style={{flex: 1, minWidth: 0}}>
                        <div style={{fontSize: '0.78rem', fontWeight: 700, color: '#fecaca', lineHeight: 1.25}}>
                          Battery Low ({batteryStatus.levelPercent}%) — Connect a Power Bank
                        </div>
                        <div style={{fontSize: '0.71rem', color: '#fda4af', marginTop: '2px', lineHeight: 1.3}}>
                          Plug in a power bank to avoid losing GPS tracking or delivery verification mid-trip.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <ActiveTripsTab
                  activeTrips={activeTrips}
                  stores={stores}
                  riderCurrentLat={riderCurrentLat}
                  riderCurrentLng={riderCurrentLng}
                  adminSettings={adminSettings}
                  nowMs={nowMs}
                  riderUid={activeRiderUid}
                  isRiderApproved={
                    demoActive || (riderData?.approved === true && riderData?.suspended !== true)
                  }
                  unreadByOrder={comm.unreadByOrder}
                  callStatusByOrder={comm.callStatusByOrder}
                  onCallParticipant={(order, role) => {
                    triggerCue('tap');
                    void comm.startOutgoingCall(order, role);
                  }}
                  onOpenOrderChat={(orderId, channel: ChatChannel) => {
                    triggerCue('tap');
                    comm.openOrderChat(orderId, channel);
                    window.history.pushState({modal: 'orderChat'}, '');
                  }}
                  onPassTripDirect={(tripId, reason) => void passTripToNextRider(tripId, reason)}
                  onAcceptTrip={handleAcceptTrip}
                  onConfirmStorePickup={handleConfirmStorePickup}
                  onStartDoorstepRoute={handleStartDoorstepRoute}
                  onOpenVerifyModal={(tripId, totalAmt, isPrepaid, initialMode = 'pin') => {
                    setQrScanError(null);
                    setVerifyModalState({open: true, tripId, targetAmt: totalAmt, isPrepaid, initialMode});
                    window.history.pushState({modal: 'verify'}, '');
                  }}
                  onOpenSosModal={(tripId) => {
                    if (!allowRiderSos) {
                      showToast('SOS disabled by Admin.', 'info');
                      return;
                    }
                    setSosModalTripId(tripId);
                    window.history.pushState({modal: 'sos'}, '');
                  }}
                  onOpenCancelModal={(tripId) => {
                    if (!allowRiderPassTrip) {
                      showToast('Passing trips disabled by Admin.', 'info');
                      return;
                    }
                    const trip = activeTrips.find((t) => t.tripId === tripId);
                    if (isTripPickedUp(trip)) {
                      showToast('🔒 Store se pickup ho chuka hai — ab cancel/pass nahi ho sakta!', 'danger');
                      return;
                    }
                    setCancelModalTripId(tripId);
                    window.history.pushState({modal: 'cancelTrip'}, '');
                  }}
                />
              </>
            )}

            <Suspense
              fallback={
                <div className="tab-view" style={{color: 'var(--text-muted)', textAlign: 'center', paddingTop: '3rem'}}>
                  <i className="fa-solid fa-spinner fa-spin" style={{fontSize: '1.35rem', color: '#38bdf8'}} />
                </div>
              }
            >
              {activeTab === 'map' && (
                <MapViewTab
                  riderCurrentLat={riderCurrentLat}
                  riderCurrentLng={riderCurrentLng}
                  gpsSyncTime={gpsSyncTime}
                  stores={stores}
                  activeTrips={activeTrips}
                  historicalOrders={allOrders}
                  onNotify={showToast}
                  onRefreshGps={() => {
                    if (!navigator.geolocation) {
                      showToast('GPS not supported on this device.', 'warning');
                      return;
                    }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        pushRiderCoordinates(pos.coords.latitude, pos.coords.longitude);
                        showToast('📍 GPS coordinates refreshed!', 'success');
                      },
                      () => {
                        showToast('Using last known GPS coordinates.', 'info');
                      },
                      {enableHighAccuracy: true, timeout: 4500, maximumAge: 0},
                    );
                  }}
                />
              )}

              {activeTab === 'history' && (
                <HistoryTab
                  completedTrips={completedTrips}
                  stores={stores}
                  baseRiderFeePerTrip={baseRiderFeePerTrip}
                />
              )}

              {activeTab === 'earnings' && (
                <EarningsTab
                  riderData={riderData}
                  adminSettings={adminSettings}
                  financials={financials}
                  riderRatings={riderRatings}
                  myRiderPayouts={myRiderPayouts}
                  riderSettlements={riderSettlements}
                  completedTrips={completedTrips}
                  allOrders={allOrders}
                  allRiders={allRiders}
                  currentRiderUid={demoActive ? 'demo_rider_uid' : currentUser?.uid || ''}
                  onOpenHistory={() => switchNav('history')}
                  onOpenPayoutModal={() => {
                    if (financials.availablePayoutBalance < minRiderPayoutAmount) {
                      showToast(`Minimum ₹${minRiderPayoutAmount} balance required!`, 'info');
                      return;
                    }
                    setPayoutModalOpen(true);
                    window.history.pushState({modal: 'payout'}, '');
                  }}
                  onOpenDepositModal={() => {
                    if (financials.netCashInHand <= 0) {
                      showToast('No COD cash balance to deposit!', 'info');
                      return;
                    }
                    setDepositModalOpen(true);
                    window.history.pushState({modal: 'deposit'}, '');
                  }}
                />
              )}

              {activeTab === 'profile' && (
                <ProfileTab
                  riderData={riderData}
                  userEmail={currentUser?.email || riderData?.email || ''}
                  adminSettings={adminSettings}
                  myFeedbacks={myFeedbacks}
                  pushPermission={pushPermission}
                  shiftCompliance={shiftCompliance}
                  batteryStatus={batteryStatus}
                  gpsPolicy={gpsPolicy}
                  idleLockEnabled={idleLockEnabled}
                  hapticsEnabled={hapticsEnabled}
                  ttsEnabled={ttsEnabled}
                  autoGpsEnabled={autoGpsEnabled}
                  securityEvents={securityEvents}
                  onToggleAutoGps={() => {
                    triggerCue('tap');
                    const next = !autoGpsEnabled;
                    setAutoGpsEnabled(next);
                    saveAutoGpsEnabled(next);
                    setGpsSyncTime(next ? 'Connecting...' : 'Auto GPS Paused');
                    showToast(
                      next
                        ? '📡 Automatic GPS refresh resumed.'
                        : '🔋 Automatic GPS refresh paused. Tap My GPS on Map for a manual fix.',
                      next ? 'success' : 'warning',
                    );
                  }}
                  onToggleIdleLock={() => {
                    triggerCue('tap');
                    const next = !idleLockEnabled;
                    setIdleLockEnabled(next);
                    saveIdleLockEnabled(next);
                    showToast(
                      next ? '🔒 15-min inactivity lock enabled.' : 'Inactivity lock paused.',
                      next ? 'success' : 'info',
                    );
                  }}
                  onToggleHaptics={() => {
                    const next = !hapticsEnabled;
                    setHapticsEnabled(next);
                    saveHapticsEnabled(next);
                    if (next) {
                      triggerHaptic('dutyOn', {enabled: true});
                    }
                    showToast(
                      next ? '📳 Haptic feedback enabled.' : 'Haptic feedback muted.',
                      next ? 'success' : 'info',
                    );
                  }}
                  onToggleTts={() => {
                    triggerCue('tap');
                    const next = !ttsEnabled;
                    setTtsEnabled(next);
                    saveTtsEnabled(next);
                    if (!next) {
                      cancelTripSpeech();
                    }
                    showToast(
                      next ? '🗣️ Voice trip alerts enabled.' : 'Voice trip alerts muted.',
                      next ? 'success' : 'info',
                    );
                  }}
                  onTestTts={() => {
                    triggerCue('tap');
                    const sampleTrip = activeTrips[0] || {
                      tripId: 'sample_tts_trip',
                      phone: '9954012345',
                      address: 'Ward No. 3, Near Civil Hospital, Gossaigaon',
                      customerLat: 26.4582,
                      customerLng: 89.9788,
                      locationLink: '',
                      deliveryOtp: '4829',
                      paymentMode: 'COD',
                      paymentStatus: 'COD',
                      emergencyAlert: false,
                      emergencyDetails: '',
                      assignedAt: Date.now(),
                      orders: [
                        {
                          orderId: 'ord_sample_1',
                          restaurantId: Object.keys(stores)[0] || 'store_freshmart',
                          deliveryCharge: 35,
                          totalAmount: 420,
                          status: 'READY_FOR_PICKUP',
                        },
                      ],
                    };
                    const info = buildIncomingTripAnnouncement(
                      sampleTrip,
                      Object.keys(stores).length > 0
                        ? stores
                        : {
                            store_freshmart: {
                              name: 'FreshMart Grocery',
                              lat: 26.4539,
                              lng: 89.9741,
                            },
                          },
                      riderCurrentLat,
                      riderCurrentLng,
                    );
                    const result = speakTripAnnouncement(info.text, {enabled: true, cooldownMs: 0});
                    if (result.spoken) {
                      showToast(`🗣️ "${info.storeSummary} · ${info.distanceLabel || 'Route ready'}"`, 'info');
                    } else {
                      showToast('Voice synthesis unavailable on this browser.', 'warning');
                    }
                  }}
                  onLockTerminal={() => {
                    triggerCue('dutyOff');
                    setTerminalLocked(true);
                    logThreat('SESSION_LOCK', 'info', 'Rider manually locked terminal screen');
                  }}
                  onClearSecurityEvents={() => {
                    triggerCue('tap');
                    clearSecurityEvents();
                    setSecurityEvents([]);
                  }}
                  onSaveProfile={handleSaveProfile}
                  onSaveShiftHours={handleSaveShiftHours}
                  onOpenFeedbackModal={() => {
                    triggerCue('tap');
                    setFeedbackModalOpen(true);
                    window.history.pushState({modal: 'riderFb'}, '');
                  }}
                  onEnablePush={() => void handleEnablePush()}
                  onSendTestPush={() => void handleSendTestPush()}
                  onLogout={handleLogout}
                  onNotify={showToast}
                />
              )}
            </Suspense>

            <BottomNav activeTab={activeTab} onSelectTab={(tab) => switchNav(tab)} />
          </>
        )}
      </div>

      {terminalLocked && isDashboardUnlocked && (
        <div
          data-testid="terminal-lock-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Terminal Screen Locked"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 900,
            background: 'rgba(5, 8, 17, 0.96)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div className="modal-box" style={{textAlign: 'center', maxWidth: '380px'}}>
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '16px',
                background: 'rgba(56, 189, 248, 0.14)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: '#38bdf8',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.45rem',
                marginBottom: '0.85rem',
              }}
            >
              <i className="fa-solid fa-shield-halved" />
            </div>
            <h3 style={{fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.35rem'}}>
              Rider Terminal Locked
            </h3>
            <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.1rem', lineHeight: 1.4}}>
              OTPs, customer details, and payout controls are shielded while your screen is locked.
            </p>
            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
              <button
                type="button"
                data-testid="unlock-terminal-btn"
                className="btn btn-primary"
                onClick={() => {
                  lastActivityMsRef.current = Date.now();
                  setTerminalLocked(false);
                  showToast('🔓 Terminal unlocked.', 'success');
                }}
              >
                <i className="fa-solid fa-lock-open" /> Unlock Terminal
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{width: '100%', color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.35)'}}
                onClick={() => {
                  setTerminalLocked(false);
                  handleLogout();
                }}
              >
                Sign Out Instead
              </button>
            </div>
          </div>
        </div>
      )}

      <CancelTripModal
        open={Boolean(cancelModalTripId)}
        tripId={cancelModalTripId || ''}
        onClose={() => setCancelModalTripId(null)}
        onConfirm={(tripId, reason) => {
          const trip = activeTrips.find((t) => t.tripId === tripId);
          if (isTripPickedUp(trip)) {
            setCancelModalTripId(null);
            showToast('🔒 Store se pickup ke baad order cancel/pass nahi kar sakte!', 'danger');
            return;
          }
          setCancelModalTripId(null);
          void passTripToNextRider(tripId, reason);
        }}
      />

      <SosModal
        open={Boolean(sosModalTripId)}
        tripId={sosModalTripId || ''}
        onClose={() => setSosModalTripId(null)}
        onSubmit={handleSubmitSos}
      />

      <PayoutModal
        open={payoutModalOpen}
        availableBalance={financials.availablePayoutBalance}
        minAmount={minRiderPayoutAmount}
        maxAmount={maxRiderPayoutAmount}
        defaultUpi={riderData?.upiId || ''}
        submitting={isSubmittingPayout}
        onClose={() => setPayoutModalOpen(false)}
        onSubmit={handleSubmitPayout}
      />

      <DeliveryVerifyModal
        state={verifyModalState}
        submitting={isVerifyingDelivery}
        pinLockRemainingSec={pinLockRemainingSec}
        qrError={qrScanError}
        onClearQrError={() => setQrScanError(null)}
        onClose={() => {
          setQrScanError(null);
          setVerifyModalState((s) => ({...s, open: false}));
        }}
        onConfirm={handleConfirmPinDelivery}
        onConfirmQr={handleConfirmQrDelivery}
      />

      <DepositModal
        open={depositModalOpen}
        netCashInHand={financials.netCashInHand}
        adminUpiId={adminUpiId}
        minAmount={minRiderCodDeposit}
        maxAmount={maxRiderCodDeposit}
        submitting={isSubmittingDeposit}
        onClose={() => setDepositModalOpen(false)}
        onSubmit={handleSubmitDeposit}
      />

      <FeedbackModal
        open={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        onSubmit={handleSubmitFeedback}
      />

      <OrderChatModal
        open={Boolean(comm.openChatTarget && openChatOrder)}
        order={openChatOrder}
        stores={stores}
        riderUid={activeRiderUid}
        initialChannel={comm.openChatTarget?.initialChannel || 'RIDER_CUSTOMER'}
        canChatCustomer={Boolean(
          openChatOrder &&
            canCommunicateWithCustomer({
              riderUid: activeRiderUid,
              isRiderApproved:
                demoActive || (riderData?.approved === true && riderData?.suspended !== true),
              order: openChatOrder,
            }),
        )}
        canChatRestaurant={Boolean(
          openChatOrder &&
            canCommunicateWithRestaurant({
              riderUid: activeRiderUid,
              isRiderApproved:
                demoActive || (riderData?.approved === true && riderData?.suspended !== true),
              order: openChatOrder,
              stores,
            }),
        )}
        customerUnread={openChatOrder ? comm.unreadByOrder[openChatOrder.orderId]?.customer || 0 : 0}
        restaurantUnread={
          openChatOrder ? comm.unreadByOrder[openChatOrder.orderId]?.restaurant || 0 : 0
        }
        getMessages={comm.getMessagesForOrderChannel}
        onSwitchChannel={comm.setOpenChatChannel}
        onSendMessage={comm.sendChatMessage}
        onRetryMessage={comm.retryFailedMessage}
        onCallParticipant={(order, role) => {
          triggerCue('tap');
          void comm.startOutgoingCall(order, role);
        }}
        onClose={comm.closeOrderChat}
      />

      <InAppCallModal
        session={comm.callSession}
        nowMs={comm.callDurationNowMs}
        onAnswer={() => {
          triggerCue('tap');
          void comm.answerIncomingCall();
        }}
        onDecline={() => {
          triggerCue('tap');
          void comm.declineIncomingCall();
        }}
        onEndCall={() => {
          triggerCue('tap');
          void comm.endActiveCall('HUNG_UP');
        }}
        onToggleMute={comm.toggleMute}
        onToggleSpeaker={comm.toggleSpeaker}
      />
    </>
  );
}
