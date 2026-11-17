import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {onValue, push, ref, set, update} from 'firebase/database';
import {db} from '../config/firebase';
import type {
  AdminSettings,
  CallInboxRecord,
  ChatChannel,
  InAppCallRecord,
  OrderRecord,
  OrderWithId,
  RiderData,
  StoreInfo,
  ToastType,
  TripChatMessage,
} from '../types/rider';
import {
  OUTGOING_RING_TIMEOUT_MS,
  buildCustomerOutgoingCallPayload,
  buildDeclineCallPatch,
  buildEndCallPatch,
  buildRestaurantOutgoingCallPayload,
  buildRiderChatMessagePayload,
  canCommunicateWithCustomer,
  canCommunicateWithRestaurant,
  countUnreadChannelMessages,
  filterOrderChannelMessages,
  resolveCustomerIdentity,
  resolveRestaurantIdentity,
  validateIncomingCallPopup,
} from '../utils/communicationLogic';
import {
  playAssignmentChime,
  showSystemPushNotification,
  triggerDeviceVibration,
} from '../utils/notifications';
import {WebRtcVoiceEngine, type VoiceEngineState} from '../utils/webrtcVoiceEngine';

export type CallSessionPhase =
  | 'IDLE'
  | 'OUTGOING_RINGING'
  | 'INCOMING_RINGING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ENDED';

export interface ActiveCallSession {
  phase: CallSessionPhase;
  direction: 'OUTGOING' | 'INCOMING';
  callId: string;
  orderId: string;
  tripId: string;
  peerRole: 'CUSTOMER' | 'RESTAURANT';
  peerUid: string;
  peerName: string;
  peerPhoto: string;
  callerRole: 'RIDER' | 'CUSTOMER' | 'RESTAURANT';
  statusText: string;
  isMuted: boolean;
  isSpeakerOn: boolean;
  connectedAt: number | null;
  startedAt: number;
  webrtcState: VoiceEngineState;
}

export interface OpenChatTarget {
  orderId: string;
  initialChannel: ChatChannel;
}

interface UseCommunicationManagerParams {
  enabled: boolean;
  demoActive: boolean;
  riderUid: string | null;
  riderData: RiderData | null;
  assignedOrders: Record<string, OrderRecord>;
  stores: Record<string, StoreInfo>;
  adminSettings: AdminSettings;
  soundEnabled: boolean;
  onNotify: (msg: string, type?: ToastType) => void;
}

function playRingtonePulse(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [0, 0.28].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now + offset);
      gain.gain.setValueAtTime(0.18, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.22);
    });
  } catch {
    // Audio playback requires prior user gesture on strict mobile browsers
  }
}

export function useCommunicationManager({
  enabled,
  demoActive,
  riderUid,
  riderData,
  assignedOrders,
  stores,
  adminSettings,
  soundEnabled,
  onNotify,
}: UseCommunicationManagerParams) {
  const [callSession, setCallSession] = useState<ActiveCallSession | null>(null);
  const [callDurationNowMs, setCallDurationNowMs] = useState(() => Date.now());
  const [openChatTarget, setOpenChatTarget] = useState<OpenChatTarget | null>(null);
  const [rawChatsByOrder, setRawChatsByOrder] = useState<
    Record<string, Record<string, Partial<TripChatMessage>>>
  >({});
  const [failedMessagesByOrder, setFailedMessagesByOrder] = useState<
    Record<string, TripChatMessage[]>
  >({});
  const [callStatusByOrder, setCallStatusByOrder] = useState<Record<string, string>>({});

  const engineRef = useRef<WebRtcVoiceEngine | null>(null);
  const activeCallUnsubRef = useRef<(() => void) | null>(null);
  const ringTimeoutRef = useRef<number | null>(null);
  const ringtoneIntervalRef = useRef<number | null>(null);
  const callSessionRef = useRef<ActiveCallSession | null>(null);
  callSessionRef.current = callSession;

  const assignedOrdersRef = useRef(assignedOrders);
  assignedOrdersRef.current = assignedOrders;
  const storesRef = useRef(stores);
  storesRef.current = stores;
  const adminSettingsRef = useRef(adminSettings);
  adminSettingsRef.current = adminSettings;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const prevUnreadTotalRef = useRef<number>(0);

  const isRiderApproved = riderData?.approved === true && riderData?.suspended !== true;

  const clearRingTimers = useCallback(() => {
    if (ringTimeoutRef.current !== null) {
      window.clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (ringtoneIntervalRef.current !== null) {
      window.clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
  }, []);

  const teardownCallResources = useCallback(() => {
    clearRingTimers();
    if (activeCallUnsubRef.current) {
      activeCallUnsubRef.current();
      activeCallUnsubRef.current = null;
    }
    if (engineRef.current) {
      engineRef.current.cleanup();
      engineRef.current = null;
    }
  }, [clearRingTimers]);

  // Real duration ticker strictly while genuine WebRTC call is CONNECTED
  useEffect(() => {
    if (!callSession || callSession.phase !== 'CONNECTED' || !callSession.connectedAt) {
      return;
    }
    setCallDurationNowMs(Date.now());
    const id = window.setInterval(() => {
      setCallDurationNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [callSession?.phase, callSession?.connectedAt]);

  // Ringing audio/vibration feedback while incoming call is ringing
  useEffect(() => {
    if (!callSession || callSession.phase !== 'INCOMING_RINGING') {
      if (ringtoneIntervalRef.current !== null) {
        window.clearInterval(ringtoneIntervalRef.current);
        ringtoneIntervalRef.current = null;
      }
      return;
    }
    if (soundEnabledRef.current) {
      playRingtonePulse();
    }
    triggerDeviceVibration([300, 150, 300]);
    const id = window.setInterval(() => {
      if (soundEnabledRef.current) {
        playRingtonePulse();
      }
      triggerDeviceVibration([300, 150, 300]);
    }, 2400);
    ringtoneIntervalRef.current = id;
    return () => {
      window.clearInterval(id);
      if (ringtoneIntervalRef.current === id) {
        ringtoneIntervalRef.current = null;
      }
    };
  }, [callSession?.phase, callSession?.callId]);

  const syncInboxAndCallRecord = useCallback(
    async (params: {
      orderId: string;
      peerRole: 'CUSTOMER' | 'RESTAURANT';
      peerUid: string;
      patch: Partial<InAppCallRecord>;
    }) => {
      if (demoActive || !riderUid) return;
      const targetInboxPath =
        params.peerRole === 'CUSTOMER'
          ? `customerCallInbox/${params.peerUid}`
          : `restaurantCallInbox/${params.peerUid}`;

      await Promise.all([
        update(ref(db, `inAppCalls/${params.orderId}`), params.patch).catch(() => undefined),
        update(ref(db, targetInboxPath), params.patch).catch(() => undefined),
        update(ref(db, `riderCallInbox/${riderUid}`), params.patch).catch(() => undefined),
      ]);
    },
    [demoActive, riderUid],
  );

  const endActiveCall = useCallback(
    async (reason = 'ENDED_BY_RIDER') => {
      const current = callSessionRef.current;
      teardownCallResources();
      setCallSession(null);
      if (!current) return;

      setCallStatusByOrder((prev) => ({...prev, [current.orderId]: ''}));
      const endPatch = buildEndCallPatch({
        status: reason === 'TIMEOUT_MISSED' ? 'MISSED' : 'ENDED',
        reason,
      });
      await syncInboxAndCallRecord({
        orderId: current.orderId,
        peerRole: current.peerRole,
        peerUid: current.peerUid,
        patch: endPatch,
      });
    },
    [syncInboxAndCallRecord, teardownCallResources],
  );

  const subscribeToOrderCallState = useCallback(
    (orderId: string, callId: string, peerRole: 'CUSTOMER' | 'RESTAURANT', peerUid: string) => {
      if (activeCallUnsubRef.current) {
        activeCallUnsubRef.current();
      }
      if (demoActive) return;

      const callRef = ref(db, `inAppCalls/${orderId}`);
      activeCallUnsubRef.current = onValue(callRef, (snap) => {
        const val = snap.val() as InAppCallRecord | null;
        if (!val || val.callId !== callId) return;

        const remoteStatus = val.status;
        setCallStatusByOrder((prev) => ({...prev, [orderId]: remoteStatus}));

        if (
          remoteStatus === 'ENDED' ||
          remoteStatus === 'DECLINED' ||
          remoteStatus === 'BUSY' ||
          remoteStatus === 'MISSED' ||
          remoteStatus === 'FAILED'
        ) {
          teardownCallResources();
          setCallSession(null);
          setCallStatusByOrder((prev) => ({...prev, [orderId]: ''}));
          const label =
            remoteStatus === 'DECLINED'
              ? 'Call declined.'
              : remoteStatus === 'BUSY'
                ? 'Participant is busy on another call.'
                : remoteStatus === 'MISSED'
                  ? 'Call was not answered.'
                  : remoteStatus === 'FAILED'
                    ? 'Call connection failed.'
                    : 'Call ended.';
          onNotify(label, remoteStatus === 'ENDED' ? 'info' : 'warning');
          return;
        }

        setCallSession((prev) => {
          if (!prev || prev.callId !== callId) return prev;
          if (remoteStatus === 'RINGING' && prev.phase === 'OUTGOING_RINGING') {
            return {...prev, statusText: 'Ringing...'};
          }
          if (remoteStatus === 'CONNECTING' && prev.phase === 'OUTGOING_RINGING') {
            clearRingTimers();
            return {...prev, phase: 'CONNECTING', statusText: 'Connecting audio...'};
          }
          if (remoteStatus === 'CONNECTED' && prev.phase === 'CONNECTED') {
            return {
              ...prev,
              connectedAt: val.connectedAt || prev.connectedAt || Date.now(),
            };
          }
          return prev;
        });

        if (
          (peerRole === 'CUSTOMER' && val.customerAnswered) ||
          (peerRole === 'RESTAURANT' && val.restaurantAnswered)
        ) {
          clearRingTimers();
        }

        void peerUid;
      });
    },
    [clearRingTimers, demoActive, onNotify, teardownCallResources],
  );

  const createVoiceEngineForCall = useCallback(
    (orderId: string, callId: string, peerRole: 'CUSTOMER' | 'RESTAURANT', peerUid: string) => {
      if (engineRef.current) {
        engineRef.current.cleanup();
      }
      const engine = new WebRtcVoiceEngine({
        onStateChange: (webrtcState) => {
          setCallSession((prev) => {
            if (!prev || prev.callId !== callId) return prev;
            let nextPhase = prev.phase;
            let statusText = prev.statusText;
            if (webrtcState === 'ACQUIRING_MIC') {
              statusText = 'Accessing microphone...';
            } else if (webrtcState === 'OFFERING') {
              statusText = 'Calling...';
            } else if (webrtcState === 'CONNECTING' || webrtcState === 'ANSWERING') {
              nextPhase = 'CONNECTING';
              statusText = 'Connecting audio...';
            } else if (webrtcState === 'CONNECTED') {
              nextPhase = 'CONNECTED';
              statusText = 'Connected';
            } else if (webrtcState === 'RECONNECTING') {
              nextPhase = 'RECONNECTING';
              statusText = 'Reconnecting audio...';
            } else if (webrtcState === 'FAILED') {
              statusText = 'Connection failed';
            }
            return {
              ...prev,
              phase: nextPhase,
              statusText,
              webrtcState,
            };
          });
        },
        onAudioConnected: () => {
          const connectedAt = Date.now();
          clearRingTimers();
          setCallSession((prev) => {
            if (!prev || prev.callId !== callId) return prev;
            return {
              ...prev,
              phase: 'CONNECTED',
              statusText: 'Connected',
              connectedAt: prev.connectedAt || connectedAt,
            };
          });
          setCallStatusByOrder((prev) => ({...prev, [orderId]: 'CONNECTED'}));

          // Firebase CONNECTED is ONLY written after genuine WebRTC peer audio connects
          const answerFlag =
            peerRole === 'CUSTOMER' ? {customerAnswered: true} : {restaurantAnswered: true};
          void syncInboxAndCallRecord({
            orderId,
            peerRole,
            peerUid,
            patch: {
              status: 'CONNECTED',
              ...answerFlag,
              connectedAt,
              updatedAt: connectedAt,
            },
          });
        },
        onError: (msg) => {
          onNotify(msg, 'danger');
          void syncInboxAndCallRecord({
            orderId,
            peerRole,
            peerUid,
            patch: buildEndCallPatch({status: 'FAILED', reason: msg}),
          });
          teardownCallResources();
          setCallSession(null);
          setCallStatusByOrder((prev) => ({...prev, [orderId]: ''}));
        },
      });
      engineRef.current = engine;
      return engine;
    },
    [clearRingTimers, onNotify, syncInboxAndCallRecord, teardownCallResources],
  );

  const startOutgoingCall = useCallback(
    async (order: OrderWithId, targetRole: 'CUSTOMER' | 'RESTAURANT') => {
      if (!enabled || !riderUid || !isRiderApproved) {
        onNotify('Account must be active and approved to place calls.', 'warning');
        return;
      }
      if (callSessionRef.current) {
        onNotify('You already have an active call in progress.', 'warning');
        return;
      }
      if (demoActive) {
        onNotify(
          'In-app WebRTC voice calling requires a live Firebase session (sign in to place real audio calls).',
          'info',
        );
        return;
      }

      if (targetRole === 'CUSTOMER') {
        if (!canCommunicateWithCustomer({riderUid, isRiderApproved, order})) {
          onNotify('Customer in-app call is unavailable for this order state.', 'warning');
          return;
        }
      } else {
        if (!canCommunicateWithRestaurant({riderUid, isRiderApproved, order, stores})) {
          onNotify('Restaurant in-app call is unavailable for this order state.', 'warning');
          return;
        }
      }

      const riderName = riderData?.fullName || riderData?.name || 'Chutki Rider';
      const riderPhoto = riderData?.profilePhoto || '';
      const now = Date.now();

      const built =
        targetRole === 'CUSTOMER'
          ? buildCustomerOutgoingCallPayload({
              order,
              riderUid,
              riderName,
              riderPhoto,
              nowMs: now,
            })
          : buildRestaurantOutgoingCallPayload({
              order,
              stores,
              riderUid,
              riderName,
              riderPhoto,
              nowMs: now,
            });

      const peerInfo =
        targetRole === 'CUSTOMER'
          ? {
              uid: built.callRecord.customerUid || '',
              name: built.callRecord.customerLabel || 'Customer',
              photo: built.callRecord.customerPhoto || '',
            }
          : {
              uid: built.callRecord.restaurantUid || '',
              name: built.callRecord.restaurantName || 'Restaurant',
              photo: built.callRecord.restaurantPhoto || '',
            };

      const callId = built.callRecord.callId;
      setCallStatusByOrder((prev) => ({...prev, [order.orderId]: 'RINGING'}));
      setCallSession({
        phase: 'OUTGOING_RINGING',
        direction: 'OUTGOING',
        callId,
        orderId: order.orderId,
        tripId: built.callRecord.tripId,
        peerRole: targetRole,
        peerUid: peerInfo.uid,
        peerName: peerInfo.name,
        peerPhoto: peerInfo.photo,
        callerRole: 'RIDER',
        statusText: 'Calling...',
        isMuted: false,
        isSpeakerOn: false,
        connectedAt: null,
        startedAt: now,
        webrtcState: 'IDLE',
      });

      const targetInboxPath =
        targetRole === 'CUSTOMER'
          ? `customerCallInbox/${peerInfo.uid}`
          : `restaurantCallInbox/${peerInfo.uid}`;

      try {
        await Promise.all([
          set(ref(db, `inAppCalls/${order.orderId}`), built.callRecord),
          set(ref(db, targetInboxPath), built.inboxRecord),
        ]);

        subscribeToOrderCallState(order.orderId, callId, targetRole, peerInfo.uid);

        const engine = createVoiceEngineForCall(
          order.orderId,
          callId,
          targetRole,
          peerInfo.uid,
        );
        await engine.startOutgoingCall({
          orderId: order.orderId,
          callId,
          riderUid,
          dynamicTurnServers: adminSettingsRef.current.webrtcIceServers,
        });

        setCallSession((prev) =>
          prev && prev.callId === callId && prev.phase === 'OUTGOING_RINGING'
            ? {...prev, statusText: 'Ringing...'}
            : prev,
        );

        ringTimeoutRef.current = window.setTimeout(() => {
          const cur = callSessionRef.current;
          if (cur && cur.callId === callId && cur.phase === 'OUTGOING_RINGING') {
            onNotify('No answer from recipient.', 'info');
            void endActiveCall('TIMEOUT_MISSED');
          }
        }, OUTGOING_RING_TIMEOUT_MS);
      } catch (err) {
        teardownCallResources();
        setCallSession(null);
        setCallStatusByOrder((prev) => ({...prev, [order.orderId]: ''}));
        await syncInboxAndCallRecord({
          orderId: order.orderId,
          peerRole: targetRole,
          peerUid: peerInfo.uid,
          patch: buildEndCallPatch({status: 'FAILED', reason: 'MIC_OR_SIGNALING_ERROR'}),
        });
        onNotify(
          err instanceof Error ? err.message : 'Unable to start voice call (check microphone permission).',
          'danger',
        );
      }
    },
    [
      createVoiceEngineForCall,
      demoActive,
      enabled,
      endActiveCall,
      isRiderApproved,
      onNotify,
      riderData,
      riderUid,
      stores,
      subscribeToOrderCallState,
      syncInboxAndCallRecord,
      teardownCallResources,
    ],
  );

  const answerIncomingCall = useCallback(async () => {
    const current = callSessionRef.current;
    if (!current || current.phase !== 'INCOMING_RINGING' || !riderUid) return;

    clearRingTimers();
    setCallSession((prev) =>
      prev && prev.callId === current.callId
        ? {...prev, phase: 'CONNECTING', statusText: 'Connecting audio...'}
        : prev,
    );

    const answerFlag =
      current.peerRole === 'CUSTOMER' ? {customerAnswered: true} : {restaurantAnswered: true};
    void syncInboxAndCallRecord({
      orderId: current.orderId,
      peerRole: current.peerRole,
      peerUid: current.peerUid,
      patch: {
        status: 'CONNECTING',
        ...answerFlag,
        updatedAt: Date.now(),
      },
    });

    try {
      const engine = createVoiceEngineForCall(
        current.orderId,
        current.callId,
        current.peerRole,
        current.peerUid,
      );
      await engine.answerIncomingCall({
        orderId: current.orderId,
        callId: current.callId,
        riderUid,
        dynamicTurnServers: adminSettingsRef.current.webrtcIceServers,
      });
    } catch (err) {
      teardownCallResources();
      setCallSession(null);
      setCallStatusByOrder((prev) => ({...prev, [current.orderId]: ''}));
      await syncInboxAndCallRecord({
        orderId: current.orderId,
        peerRole: current.peerRole,
        peerUid: current.peerUid,
        patch: buildEndCallPatch({status: 'FAILED', reason: 'ANSWER_FAILED'}),
      });
      onNotify(
        err instanceof Error ? err.message : 'Could not connect microphone for incoming call.',
        'danger',
      );
    }
  }, [
    clearRingTimers,
    createVoiceEngineForCall,
    onNotify,
    riderUid,
    syncInboxAndCallRecord,
    teardownCallResources,
  ]);

  const declineIncomingCall = useCallback(async () => {
    const current = callSessionRef.current;
    if (!current || current.phase !== 'INCOMING_RINGING') return;

    teardownCallResources();
    setCallSession(null);
    setCallStatusByOrder((prev) => ({...prev, [current.orderId]: ''}));

    const patch = buildDeclineCallPatch({callerRole: current.peerRole});
    await syncInboxAndCallRecord({
      orderId: current.orderId,
      peerRole: current.peerRole,
      peerUid: current.peerUid,
      patch,
    });
  }, [syncInboxAndCallRecord, teardownCallResources]);

  const toggleMute = useCallback(async () => {
    const current = callSessionRef.current;
    if (!current || !engineRef.current) return;
    const nextMuted = !current.isMuted;
    engineRef.current.setMuted(nextMuted);
    setCallSession((prev) => (prev ? {...prev, isMuted: nextMuted} : prev));
    await syncInboxAndCallRecord({
      orderId: current.orderId,
      peerRole: current.peerRole,
      peerUid: current.peerUid,
      patch: {isMuted: nextMuted, updatedAt: Date.now()},
    });
  }, [syncInboxAndCallRecord]);

  const toggleSpeaker = useCallback(async () => {
    const current = callSessionRef.current;
    if (!current || !engineRef.current) return;
    const nextSpeaker = !current.isSpeakerOn;
    await engineRef.current.setSpeakerEnabled(nextSpeaker);
    setCallSession((prev) => (prev ? {...prev, isSpeakerOn: nextSpeaker} : prev));
  }, []);

  // Centralized incoming call listener on riderCallInbox/{riderUid} + authoritative inAppCalls/{orderId}
  useEffect(() => {
    if (!enabled || demoActive || !riderUid || !isRiderApproved) return;

    const inboxRef = ref(db, `riderCallInbox/${riderUid}`);
    let orderCallUnsub: (() => void) | null = null;
    let latestOrderCall: InAppCallRecord | null = null;
    let watchedOrderId = '';

    const evaluateInboxEntry = (inboxEntry: CallInboxRecord | null) => {
      if (!inboxEntry || !inboxEntry.callId || !inboxEntry.orderId) return;

      const validation = validateIncomingCallPopup({
        inboxEntry,
        inAppCall:
          latestOrderCall && latestOrderCall.callId === inboxEntry.callId
            ? latestOrderCall
            : undefined,
        riderUid,
        assignedOrders: assignedOrdersRef.current,
        stores: storesRef.current,
      });

      if (!validation.valid || !validation.callerRole || !validation.callId || !validation.orderId) {
        const cur = callSessionRef.current;
        if (cur && cur.callId === inboxEntry.callId && cur.phase === 'INCOMING_RINGING') {
          teardownCallResources();
          setCallSession(null);
          setCallStatusByOrder((prev) => ({...prev, [inboxEntry.orderId]: ''}));
        }
        return;
      }

      const existing = callSessionRef.current;
      if (existing) {
        if (existing.callId === validation.callId) return;
        const busyPatch = buildEndCallPatch({status: 'BUSY', reason: 'RIDER_BUSY'});
        const peerUid =
          validation.callerRole === 'CUSTOMER'
            ? inboxEntry.customerUid || assignedOrdersRef.current[validation.orderId]?.customerUid || ''
            : inboxEntry.restaurantUid || '';
        void syncInboxAndCallRecord({
          orderId: validation.orderId,
          peerRole: validation.callerRole,
          peerUid,
          patch: busyPatch,
        });
        return;
      }

      const order = assignedOrdersRef.current[validation.orderId];
      const peerUid =
        validation.callerRole === 'CUSTOMER'
          ? resolveCustomerIdentity(order).uid
          : resolveRestaurantIdentity(order, storesRef.current).uid;

      setCallStatusByOrder((prev) => ({...prev, [validation.orderId!]: 'RINGING'}));
      setCallSession({
        phase: 'INCOMING_RINGING',
        direction: 'INCOMING',
        callId: validation.callId,
        orderId: validation.orderId,
        tripId: inboxEntry.tripId || order?.batchGroupId || validation.orderId,
        peerRole: validation.callerRole,
        peerUid,
        peerName: validation.displayName || 'Caller',
        peerPhoto: validation.displayPhoto || '',
        callerRole: validation.callerRole,
        statusText: 'Incoming Voice Call',
        isMuted: false,
        isSpeakerOn: false,
        connectedAt: null,
        startedAt: Number(inboxEntry.startedAt || Date.now()),
        webrtcState: 'IDLE',
      });

      subscribeToOrderCallState(
        validation.orderId,
        validation.callId,
        validation.callerRole,
        peerUid,
      );

      if (typeof document !== 'undefined' && document.hidden) {
        void showSystemPushNotification({
          title: `📞 Incoming ${validation.callerRole === 'CUSTOMER' ? 'Customer' : 'Restaurant'} Call`,
          body: `${validation.displayName} · Order #${validation.orderId.slice(-6)}`,
          tag: `call-${validation.callId}`,
          tab: 'active',
          requireInteraction: true,
        });
      }
    };

    const unsubInbox = onValue(inboxRef, (snap) => {
      const inboxEntry = snap.val() as CallInboxRecord | null;
      if (!inboxEntry?.orderId) {
        if (orderCallUnsub) {
          orderCallUnsub();
          orderCallUnsub = null;
          watchedOrderId = '';
          latestOrderCall = null;
        }
        return;
      }

      if (watchedOrderId !== inboxEntry.orderId) {
        if (orderCallUnsub) orderCallUnsub();
        watchedOrderId = inboxEntry.orderId;
        latestOrderCall = null;
        orderCallUnsub = onValue(ref(db, `inAppCalls/${inboxEntry.orderId}`), (callSnap) => {
          latestOrderCall = callSnap.val() as InAppCallRecord | null;
          evaluateInboxEntry(inboxEntry);
        });
      }
      evaluateInboxEntry(inboxEntry);
    });

    return () => {
      unsubInbox();
      if (orderCallUnsub) orderCallUnsub();
    };
  }, [
    demoActive,
    enabled,
    isRiderApproved,
    riderUid,
    subscribeToOrderCallState,
    syncInboxAndCallRecord,
    teardownCallResources,
  ]);

  // Real-time dual-channel tripChats/{orderId}/messages subscriptions for active assigned orders
  const activeOrderIds = useMemo(
    () =>
      Object.entries(assignedOrders)
        .filter(([, o]) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED')
        .map(([id]) => id)
        .sort(),
    [assignedOrders],
  );
  const activeOrderIdsKey = activeOrderIds.join(',');

  useEffect(() => {
    if (!enabled || demoActive || !riderUid || !isRiderApproved) {
      setRawChatsByOrder({});
      return;
    }

    const unsubs: Array<() => void> = [];
    activeOrderIds.forEach((orderId) => {
      const chatRef = ref(db, `tripChats/${orderId}/messages`);
      const unsub = onValue(chatRef, (snap) => {
        const msgs = (snap.val() as Record<string, Partial<TripChatMessage>> | null) || {};
        setRawChatsByOrder((prev) => ({...prev, [orderId]: msgs}));

        const now = Date.now();
        Object.entries(msgs).forEach(([msgId, msg]) => {
          if (msg.receiverUid === riderUid && msg.senderUid !== riderUid) {
            const isCurrentlyOpen =
              openChatTarget?.orderId === orderId && openChatTarget?.initialChannel === msg.channel;
            if (isCurrentlyOpen && msg.status !== 'READ') {
              void update(ref(db, `tripChats/${orderId}/messages/${msgId}`), {
                status: 'READ',
                deliveredAt: msg.deliveredAt || now,
                readAt: now,
              }).catch(() => undefined);
            } else if (msg.status === 'SENT') {
              void update(ref(db, `tripChats/${orderId}/messages/${msgId}`), {
                status: 'DELIVERED',
                deliveredAt: now,
              }).catch(() => undefined);
            }
          }
        });
      });
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [
    activeOrderIdsKey,
    demoActive,
    enabled,
    isRiderApproved,
    openChatTarget?.initialChannel,
    openChatTarget?.orderId,
    riderUid,
  ]);

  const unreadByOrder = useMemo(() => {
    const map: Record<string, {customer: number; restaurant: number; total: number}> = {};
    let grandTotal = 0;
    if (!riderUid) return {map, grandTotal: 0};

    activeOrderIds.forEach((orderId) => {
      const order = assignedOrders[orderId];
      const msgs = rawChatsByOrder[orderId];
      const custUid = resolveCustomerIdentity(order).uid;
      const restUid = resolveRestaurantIdentity(order, stores).uid;
      const customerUnread = countUnreadChannelMessages(msgs, 'RIDER_CUSTOMER', riderUid, custUid);
      const restaurantUnread = countUnreadChannelMessages(
        msgs,
        'RIDER_RESTAURANT',
        riderUid,
        restUid,
      );
      const total = customerUnread + restaurantUnread;
      map[orderId] = {customer: customerUnread, restaurant: restaurantUnread, total};
      grandTotal += total;
    });
    return {map, grandTotal};
  }, [activeOrderIds, assignedOrders, rawChatsByOrder, riderUid, stores]);

  useEffect(() => {
    if (unreadByOrder.grandTotal > prevUnreadTotalRef.current && prevUnreadTotalRef.current >= 0) {
      if (!openChatTarget) {
        playAssignmentChime(soundEnabledRef.current);
      }
    }
    prevUnreadTotalRef.current = unreadByOrder.grandTotal;
  }, [openChatTarget, unreadByOrder.grandTotal]);

  const markChannelAsRead = useCallback(
    (orderId: string, channel: ChatChannel) => {
      if (demoActive || !riderUid) return;
      const msgs = rawChatsByOrder[orderId];
      if (!msgs) return;
      const now = Date.now();
      Object.entries(msgs).forEach(([msgId, msg]) => {
        if (
          msg.channel === channel &&
          msg.receiverUid === riderUid &&
          msg.senderUid !== riderUid &&
          msg.status !== 'READ'
        ) {
          void update(ref(db, `tripChats/${orderId}/messages/${msgId}`), {
            status: 'READ',
            deliveredAt: msg.deliveredAt || now,
            readAt: now,
          }).catch(() => undefined);
        }
      });
    },
    [demoActive, rawChatsByOrder, riderUid],
  );

  const openOrderChat = useCallback(
    (orderId: string, channel: ChatChannel) => {
      setOpenChatTarget({orderId, initialChannel: channel});
      markChannelAsRead(orderId, channel);
    },
    [markChannelAsRead],
  );

  const closeOrderChat = useCallback(() => {
    setOpenChatTarget(null);
  }, []);

  const sendChatMessage = useCallback(
    async (orderId: string, channel: ChatChannel, rawText: string): Promise<boolean> => {
      const order = assignedOrdersRef.current[orderId];
      if (!riderUid || !order || !isRiderApproved) {
        onNotify('Unable to send message for this order.', 'danger');
        return false;
      }

      const receiverUid =
        channel === 'RIDER_CUSTOMER'
          ? resolveCustomerIdentity(order).uid
          : resolveRestaurantIdentity(order, storesRef.current).uid;

      if (demoActive) {
        const msgId = `demo_msg_${Date.now()}`;
        const built = buildRiderChatMessagePayload({
          messageId: msgId,
          riderUid,
          receiverUid: receiverUid || 'demo_peer',
          channel,
          rawText,
        });
        if (!built.valid || !built.payload) {
          onNotify(built.reason || 'Enter a message.', 'warning');
          return false;
        }
        setRawChatsByOrder((prev) => ({
          ...prev,
          [orderId]: {...(prev[orderId] || {}), [msgId]: built.payload!},
        }));
        return true;
      }

      const msgListRef = ref(db, `tripChats/${orderId}/messages`);
      const pushedRef = push(msgListRef);
      const messageId = pushedRef.key || `msg_${Date.now()}`;
      const built = buildRiderChatMessagePayload({
        messageId,
        riderUid,
        receiverUid,
        channel,
        rawText,
      });

      if (!built.valid || !built.payload) {
        onNotify(built.reason || 'Invalid message.', 'warning');
        return false;
      }

      try {
        await set(pushedRef, built.payload);
        return true;
      } catch {
        const failedMsg: TripChatMessage = {...built.payload, status: 'FAILED'};
        setFailedMessagesByOrder((prev) => ({
          ...prev,
          [orderId]: [...(prev[orderId] || []), failedMsg],
        }));
        onNotify('Message failed to send. Tap Retry to resend.', 'danger');
        return false;
      }
    },
    [demoActive, isRiderApproved, onNotify, riderUid],
  );

  const retryFailedMessage = useCallback(
    async (orderId: string, failedMsg: TripChatMessage): Promise<void> => {
      setFailedMessagesByOrder((prev) => ({
        ...prev,
        [orderId]: (prev[orderId] || []).filter((m) => m.messageId !== failedMsg.messageId),
      }));
      await sendChatMessage(orderId, failedMsg.channel, failedMsg.message);
    },
    [sendChatMessage],
  );

  const getMessagesForOrderChannel = useCallback(
    (orderId: string, channel: ChatChannel): TripChatMessage[] => {
      if (!riderUid) return [];
      const order = assignedOrders[orderId];
      const peerUid =
        channel === 'RIDER_CUSTOMER'
          ? resolveCustomerIdentity(order).uid
          : resolveRestaurantIdentity(order, stores).uid;
      const synced = filterOrderChannelMessages(
        rawChatsByOrder[orderId],
        channel,
        riderUid,
        demoActive ? '' : peerUid,
      );
      const failed = (failedMessagesByOrder[orderId] || []).filter((m) => m.channel === channel);
      return [...synced, ...failed].sort((a, b) => a.timestamp - b.timestamp);
    },
    [assignedOrders, demoActive, failedMessagesByOrder, rawChatsByOrder, riderUid, stores],
  );

  useEffect(() => {
    if (!enabled) {
      teardownCallResources();
      setCallSession(null);
      setOpenChatTarget(null);
    }
    return () => {
      teardownCallResources();
    };
  }, [enabled, teardownCallResources]);

  return {
    callSession,
    callDurationNowMs,
    callStatusByOrder,
    unreadByOrder: unreadByOrder.map,
    openChatTarget,
    setOpenChatChannel: markChannelAsRead,
    startOutgoingCall,
    answerIncomingCall,
    declineIncomingCall,
    endActiveCall,
    toggleMute,
    toggleSpeaker,
    openOrderChat,
    closeOrderChat,
    sendChatMessage,
    retryFailedMessage,
    getMessagesForOrderChannel,
  };
}
