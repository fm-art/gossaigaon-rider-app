import {get, onChildAdded, onValue, push, ref, set, update} from 'firebase/database';
import {db} from '../config/firebase';
import type {WebRtcIceCandidatePayload, WebRtcSdpPayload} from '../types/rider';

export interface IceServerConfigInput {
  dynamicTurnServers?: RTCIceServer[] | Record<string, RTCIceServer>;
}

export type VoiceEngineState =
  | 'IDLE'
  | 'ACQUIRING_MIC'
  | 'OFFERING'
  | 'ANSWERING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'FAILED'
  | 'CLOSED';

export interface VoiceEngineCallbacks {
  onStateChange: (state: VoiceEngineState) => void;
  onAudioConnected: () => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onError: (message: string) => void;
}

const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  {urls: 'stun:stun.l.google.com:19302'},
  {urls: 'stun:stun1.l.google.com:19302'},
];

const ICE_CONNECT_TIMEOUT_MS = 18_000;

/**
 * Resolves STUN + runtime TURN configuration strictly from environment variables
 * or Firebase admin settings — handles both Array and RTDB numeric-keyed Objects.
 */
export function resolveRtcIceServers(input?: IceServerConfigInput): RTCIceServer[] {
  const servers: RTCIceServer[] = [...DEFAULT_STUN_SERVERS];

  const env = (import.meta as unknown as {env?: Record<string, string | undefined>}).env || {};
  const turnUrlsRaw = (env.VITE_TURN_URLS || '').trim();
  const turnUsername = (env.VITE_TURN_USERNAME || '').trim();
  const turnCredential = (env.VITE_TURN_CREDENTIAL || '').trim();

  if (turnUrlsRaw) {
    const urls = turnUrlsRaw
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length > 0) {
      servers.push({
        urls,
        ...(turnUsername ? {username: turnUsername} : {}),
        ...(turnCredential ? {credential: turnCredential} : {}),
      });
    }
  }

  const rawDynamic = input?.dynamicTurnServers;
  const dynamicList: RTCIceServer[] = Array.isArray(rawDynamic)
    ? rawDynamic
    : rawDynamic && typeof rawDynamic === 'object'
      ? Object.values(rawDynamic)
      : [];

  for (const srv of dynamicList) {
    if (srv && srv.urls) {
      servers.push(srv);
    }
  }

  return servers;
}

function preferOpusInSdpTransceiver(pc: RTCPeerConnection): void {
  try {
    if (typeof RTCRtpSender === 'undefined' || typeof RTCRtpSender.getCapabilities !== 'function') {
      return;
    }
    const capabilities = RTCRtpSender.getCapabilities('audio');
    if (!capabilities?.codecs?.length) return;
    const opusCodecs = capabilities.codecs.filter((c) =>
      c.mimeType.toLowerCase().includes('audio/opus'),
    );
    const otherCodecs = capabilities.codecs.filter(
      (c) => !c.mimeType.toLowerCase().includes('audio/opus'),
    );
    if (opusCodecs.length === 0) return;

    pc.getTransceivers().forEach((transceiver) => {
      if (
        transceiver.sender.track?.kind === 'audio' &&
        typeof transceiver.setCodecPreferences === 'function'
      ) {
        transceiver.setCodecPreferences([...opusCodecs, ...otherCodecs]);
      }
    });
  } catch {
    // Codec preference tuning is optional per browser capability
  }
}

export class WebRtcVoiceEngine {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private unsubs: Array<() => void> = [];
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private processedCandidateKeys = new Set<string>();
  private remoteDescriptionSet = false;
  private remoteCandidateReceived = false;
  private hasTurnConfigured = false;
  private iceConnectTimer: number | null = null;
  private closed = false;
  private connectedNotified = false;
  private activeCallId = '';
  private activeOrderId = '';
  private callStartedAt = 0;
  private localRoleSide: 'caller' | 'receiver' = 'caller';
  private callbacks: VoiceEngineCallbacks;

  constructor(callbacks: VoiceEngineCallbacks) {
    this.callbacks = callbacks;
  }

  private matchesActiveCall(payloadCallId?: string | null, createdAt?: number | null): boolean {
    if (payloadCallId) {
      return payloadCallId === this.activeCallId;
    }
    if (createdAt && Number.isFinite(createdAt) && this.callStartedAt > 0) {
      return createdAt >= this.callStartedAt - 15_000;
    }
    return true;
  }

  private ensureAudioElement(): HTMLAudioElement | null {
    if (typeof document === 'undefined') return null;
    if (!this.audioEl) {
      this.audioEl = document.createElement('audio');
      this.audioEl.autoplay = true;
      this.audioEl.muted = false;
      this.audioEl.volume = 1.0;
      this.audioEl.style.display = 'none';
      (this.audioEl as HTMLAudioElement & {playsInline?: boolean}).playsInline = true;
      document.body.appendChild(this.audioEl);
    }
    return this.audioEl;
  }

  private attachAudioElement(stream: MediaStream): void {
    const el = this.ensureAudioElement();
    if (!el) return;
    el.muted = false;
    el.volume = 1.0;
    el.srcObject = stream;
    void el.play().catch(() => {
      // Autoplay will complete upon answer/call click gesture
    });
  }

  public async setSpeakerEnabled(enabled: boolean): Promise<boolean> {
    try {
      const bridge = (
        window as unknown as {
          AndroidBridge?: {setSpeakerphoneOn?: (on: boolean) => void};
        }
      ).AndroidBridge;
      if (bridge && typeof bridge.setSpeakerphoneOn === 'function') {
        bridge.setSpeakerphoneOn(enabled);
      }

      if (this.audioEl) {
        this.audioEl.volume = 1.0;
        this.audioEl.muted = false;
        const sinkAware = this.audioEl as HTMLAudioElement & {
          setSinkId?: (sinkId: string) => Promise<void>;
        };
        if (
          typeof sinkAware.setSinkId === 'function' &&
          navigator.mediaDevices &&
          typeof navigator.mediaDevices.enumerateDevices === 'function'
        ) {
          const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
          const outputs = devices.filter((d) => d.kind === 'audiooutput');
          if (outputs.length > 0) {
            const preferred = enabled
              ? outputs.find((d) => /speaker/i.test(d.label)) || outputs[0]
              : outputs.find((d) => /earpiece|head|communications/i.test(d.label)) || outputs[0];
            if (preferred?.deviceId) {
              await sinkAware.setSinkId(preferred.deviceId).catch(() => undefined);
            }
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  public setMuted(muted: boolean): boolean {
    if (!this.localStream) return false;
    const tracks = this.localStream.getAudioTracks();
    tracks.forEach((track) => {
      track.enabled = !muted;
    });
    return true;
  }

  private clearIceTimeout(): void {
    if (this.iceConnectTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.iceConnectTimer);
      this.iceConnectTimer = null;
    }
  }

  private armIceTimeout(): void {
    if (typeof window === 'undefined' || this.iceConnectTimer !== null) return;
    this.iceConnectTimer = window.setTimeout(() => {
      if (this.closed || this.connectedNotified) return;
      if (!this.remoteDescriptionSet) {
        this.callbacks.onError('No audio response from recipient. Please try again.');
      } else if (!this.remoteCandidateReceived) {
        this.callbacks.onError('Network path missing from recipient. Please retry call.');
      } else if (!this.hasTurnConfigured) {
        this.callbacks.onError(
          'Audio blocked by mobile network (TURN server not configured in admin/settings/webrtcIceServers).',
        );
      } else {
        this.callbacks.onError('Audio connection timed out due to weak network.');
      }
    }, ICE_CONNECT_TIMEOUT_MS);
  }

  private async flushPendingCandidates(): Promise<void> {
    if (!this.pc || !this.remoteDescriptionSet || this.closed) return;
    const queue = [...this.pendingCandidates];
    this.pendingCandidates = [];
    for (const candidateInit of queue) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidateInit));
      } catch {
        // Ignore stale or incompatible candidate during ICE race
      }
    }
  }

  private async enqueueOrAddRemoteCandidate(key: string, payload: WebRtcIceCandidatePayload): Promise<void> {
    if (this.closed || !this.pc) return;
    if (!payload.candidate) return;
    if (!this.matchesActiveCall(payload.callId, payload.createdAt)) return;
    if (this.processedCandidateKeys.has(key)) return;
    this.processedCandidateKeys.add(key);
    this.remoteCandidateReceived = true;

    const candidateInit: RTCIceCandidateInit = {
      candidate: payload.candidate,
      sdpMid: payload.sdpMid ?? undefined,
      sdpMLineIndex: payload.sdpMLineIndex ?? undefined,
      usernameFragment: payload.usernameFragment ?? undefined,
    };

    if (!this.remoteDescriptionSet) {
      this.pendingCandidates.push(candidateInit);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch {
      // Ignore individual ICE candidate failure
    }
  }

  private async initializePeerConnection(params: {
    orderId: string;
    callId: string;
    side: 'caller' | 'receiver';
    localUid: string;
    dynamicTurnServers?: RTCIceServer[] | Record<string, RTCIceServer>;
  }): Promise<void> {
    this.closed = false;
    this.connectedNotified = false;
    this.remoteDescriptionSet = false;
    this.remoteCandidateReceived = false;
    this.pendingCandidates = [];
    this.processedCandidateKeys.clear();
    this.clearIceTimeout();
    this.activeCallId = params.callId;
    this.activeOrderId = params.orderId;
    this.callStartedAt = Date.now();
    this.localRoleSide = params.side;

    // Pre-create audio element while still near user click gesture for Android WebView
    this.ensureAudioElement();

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      throw new Error('Microphone audio is not supported on this device/browser.');
    }

    if (typeof RTCPeerConnection === 'undefined') {
      throw new Error('WebRTC voice calling is not supported on this browser.');
    }

    this.callbacks.onStateChange('ACQUIRING_MIC');

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    if (this.closed) {
      this.cleanup();
      return;
    }

    const iceServers = resolveRtcIceServers({
      dynamicTurnServers: params.dynamicTurnServers,
    });
    this.hasTurnConfigured = iceServers.some((s) =>
      String(Array.isArray(s.urls) ? s.urls.join(',') : s.urls)
        .toLowerCase()
        .includes('turn'),
    );

    this.pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 6,
    });

    this.localStream.getAudioTracks().forEach((track) => {
      if (this.pc && this.localStream) {
        this.pc.addTrack(track, this.localStream);
      }
    });

    preferOpusInSdpTransceiver(this.pc);

    this.remoteStream = new MediaStream();
    this.pc.ontrack = (event) => {
      if (!this.remoteStream) return;
      if (event.streams && event.streams[0]) {
        event.streams[0].getAudioTracks().forEach((t) => {
          if (this.remoteStream && !this.remoteStream.getTracks().includes(t)) {
            this.remoteStream.addTrack(t);
          }
        });
      } else if (event.track) {
        this.remoteStream.addTrack(event.track);
      }
      this.attachAudioElement(this.remoteStream);
      this.callbacks.onRemoteStream?.(this.remoteStream);
    };

    const candidateSubpath =
      params.side === 'caller' ? 'callerCandidates' : 'receiverCandidates';
    const remoteCandidateSubpath =
      params.side === 'caller' ? 'receiverCandidates' : 'callerCandidates';

    this.pc.onicecandidate = (event) => {
      if (!event.candidate || this.closed) return;
      const candRef = push(
        ref(db, `inAppCalls/${params.orderId}/webrtc/${candidateSubpath}`),
      );
      const payload: WebRtcIceCandidatePayload = {
        callId: params.callId,
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid ?? null,
        sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
        usernameFragment: event.candidate.usernameFragment ?? null,
        createdAt: Date.now(),
      };
      void set(candRef, payload).catch(() => undefined);
    };

    const handleConnectionChange = () => {
      if (!this.pc || this.closed) return;
      const conn = this.pc.connectionState;
      const ice = this.pc.iceConnectionState;

      if (conn === 'connected' || ice === 'connected' || ice === 'completed') {
        this.clearIceTimeout();
        this.callbacks.onStateChange('CONNECTED');
        if (!this.connectedNotified) {
          this.connectedNotified = true;
          this.callbacks.onAudioConnected();
        }
      } else if (conn === 'connecting' || ice === 'checking') {
        this.callbacks.onStateChange('CONNECTING');
      } else if (conn === 'disconnected' || ice === 'disconnected') {
        this.callbacks.onStateChange('RECONNECTING');
        void this.attemptIceRestart(params.localUid);
      } else if (conn === 'failed' || ice === 'failed') {
        this.clearIceTimeout();
        this.callbacks.onStateChange('FAILED');
        this.callbacks.onError(
          this.hasTurnConfigured
            ? 'Voice connection failed due to network conditions.'
            : 'Voice blocked by mobile NAT. Add TURN server in Firebase admin/settings/webrtcIceServers.',
        );
      }
    };

    this.pc.onconnectionstatechange = handleConnectionChange;
    this.pc.oniceconnectionstatechange = handleConnectionChange;

    const remoteCandRef = ref(
      db,
      `inAppCalls/${params.orderId}/webrtc/${remoteCandidateSubpath}`,
    );
    const unsubRemoteCand = onChildAdded(remoteCandRef, (snap) => {
      const val = snap.val() as WebRtcIceCandidatePayload | null;
      if (val && snap.key) {
        void this.enqueueOrAddRemoteCandidate(snap.key, val);
      }
    });
    this.unsubs.push(unsubRemoteCand);
  }

  private async attemptIceRestart(localUid: string): Promise<void> {
    if (!this.pc || this.closed || this.localRoleSide !== 'caller') return;
    try {
      const offer = await this.pc.createOffer({iceRestart: true});
      await this.pc.setLocalDescription(offer);
      const payload: WebRtcSdpPayload = {
        callId: this.activeCallId,
        type: 'offer',
        sdp: offer.sdp || '',
        createdByUid: localUid,
        updatedAt: Date.now(),
      };
      await update(ref(db, `inAppCalls/${this.activeOrderId}/webrtc`), {offer: payload});
    } catch {
      // Handled by connectionState === 'failed' if unrecoverable
    }
  }

  public async startOutgoingCall(params: {
    orderId: string;
    callId: string;
    riderUid: string;
    dynamicTurnServers?: RTCIceServer[] | Record<string, RTCIceServer>;
  }): Promise<void> {
    await this.initializePeerConnection({
      orderId: params.orderId,
      callId: params.callId,
      side: 'caller',
      localUid: params.riderUid,
      dynamicTurnServers: params.dynamicTurnServers,
    });
    if (!this.pc || this.closed) return;

    this.callbacks.onStateChange('OFFERING');
    const offer = await this.pc.createOffer({offerToReceiveAudio: true});
    await this.pc.setLocalDescription(offer);

    const offerPayload: WebRtcSdpPayload = {
      callId: params.callId,
      type: 'offer',
      sdp: offer.sdp || '',
      createdByUid: params.riderUid,
      updatedAt: Date.now(),
    };
    await set(ref(db, `inAppCalls/${params.orderId}/webrtc/offer`), offerPayload);

    const answerRef = ref(db, `inAppCalls/${params.orderId}/webrtc/answer`);
    const unsubAnswer = onValue(answerRef, (snap) => {
      const val = snap.val() as WebRtcSdpPayload | null;
      if (!val || !val.sdp || !this.pc || this.closed) {
        return;
      }
      if (!this.matchesActiveCall(val.callId, val.updatedAt)) {
        return;
      }
      if (this.pc.currentRemoteDescription) return;
      void (async () => {
        try {
          if (!this.pc || this.closed) return;
          this.callbacks.onStateChange('CONNECTING');
          this.armIceTimeout();
          await this.pc.setRemoteDescription(
            new RTCSessionDescription({type: 'answer', sdp: val.sdp}),
          );
          this.remoteDescriptionSet = true;
          await this.flushPendingCandidates();
        } catch {
          this.callbacks.onError('Failed to apply remote audio answer.');
        }
      })();
    });
    this.unsubs.push(unsubAnswer);
  }

  public async answerIncomingCall(params: {
    orderId: string;
    callId: string;
    riderUid: string;
    dynamicTurnServers?: RTCIceServer[] | Record<string, RTCIceServer>;
  }): Promise<void> {
    await this.initializePeerConnection({
      orderId: params.orderId,
      callId: params.callId,
      side: 'receiver',
      localUid: params.riderUid,
      dynamicTurnServers: params.dynamicTurnServers,
    });
    if (!this.pc || this.closed) return;

    this.callbacks.onStateChange('ANSWERING');
    this.armIceTimeout();

    const applyOfferAndCreateAnswer = async (offerVal: WebRtcSdpPayload) => {
      if (!this.pc || this.closed || this.remoteDescriptionSet) return;
      if (!offerVal.sdp) return;
      if (!this.matchesActiveCall(offerVal.callId, offerVal.updatedAt)) return;

      await this.pc.setRemoteDescription(
        new RTCSessionDescription({type: 'offer', sdp: offerVal.sdp}),
      );
      this.remoteDescriptionSet = true;
      await this.flushPendingCandidates();

      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      const answerPayload: WebRtcSdpPayload = {
        callId: this.activeCallId,
        type: 'answer',
        sdp: answer.sdp || '',
        createdByUid: params.riderUid,
        updatedAt: Date.now(),
      };
      await set(ref(db, `inAppCalls/${params.orderId}/webrtc/answer`), answerPayload);
      this.callbacks.onStateChange('CONNECTING');
    };

    const offerRef = ref(db, `inAppCalls/${params.orderId}/webrtc/offer`);
    const existingOfferSnap = await get(offerRef);
    const existingOffer = existingOfferSnap.val() as WebRtcSdpPayload | null;
    if (existingOffer && existingOffer.sdp) {
      await applyOfferAndCreateAnswer(existingOffer);
    }

    const unsubOffer = onValue(offerRef, (snap) => {
      const val = snap.val() as WebRtcSdpPayload | null;
      if (val && val.sdp) {
        void applyOfferAndCreateAnswer(val).catch(() => {
          this.callbacks.onError('Could not negotiate incoming audio offer.');
        });
      }
    });
    this.unsubs.push(unsubOffer);
  }

  public cleanup(): void {
    this.closed = true;
    this.clearIceTimeout();
    this.callbacks.onStateChange('CLOSED');

    this.unsubs.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore listener teardown error
      }
    });
    this.unsubs = [];

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      this.remoteStream = null;
    }

    if (this.audioEl) {
      try {
        this.audioEl.pause();
        this.audioEl.srcObject = null;
        this.audioEl.remove();
      } catch {
        // ignore
      }
      this.audioEl = null;
    }

    if (this.pc) {
      try {
        this.pc.ontrack = null;
        this.pc.onicecandidate = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.close();
      } catch {
        // ignore
      }
      this.pc = null;
    }

    this.pendingCandidates = [];
    this.processedCandidateKeys.clear();
    this.remoteDescriptionSet = false;
    this.remoteCandidateReceived = false;
    this.connectedNotified = false;
  }
}
