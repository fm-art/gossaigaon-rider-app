import {Capacitor} from '@capacitor/core';
import {TextToSpeech} from '@capacitor-community/text-to-speech';
import type {StoreInfo, TripGroup} from '../types/rider';
import {calculateOptimalDeliverySequence} from './riderLogic';
import {sanitizeInput} from './security';

export const TTS_STORAGE_KEY = 'gb_tts_enabled_v1';
export const DEFAULT_TTS_COOLDOWN_MS = 1200;

export interface TripAnnouncementDetails {
  text: string;
  storeSummary: string;
  distanceKm: number | null;
  distanceLabel: string | null;
  earningRupees: number;
}

export interface SpeechSynthesisLike {
  cancel?: () => void;
  speak: (utterance: SpeechSynthesisUtterance) => void;
  getVoices?: () => SpeechSynthesisVoice[];
}

export interface SpeakOptions {
  enabled?: boolean;
  nowMs?: number;
  cooldownMs?: number;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  speechApi?: SpeechSynthesisLike | null;
  createUtterance?: (text: string) => SpeechSynthesisUtterance;
}

export interface SpeakResult {
  spoken: boolean;
  text: string;
  reason?: 'disabled' | 'empty' | 'cooldown' | 'unsupported' | 'error';
}

let lastSpokenAtMs = 0;
let lastSpokenText = '';

export function resetTtsCooldown(): void {
  lastSpokenAtMs = 0;
  lastSpokenText = '';
}

export function readTtsEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    const raw = localStorage.getItem(TTS_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== '0' && raw !== 'false';
  } catch {
    return true;
  }
}

export function saveTtsEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(TTS_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage failures
  }
}

export function isTtsSupported(win?: {
  speechSynthesis?: unknown;
  SpeechSynthesisUtterance?: unknown;
} | null): boolean {
  if (win === undefined && Capacitor.isNativePlatform()) {
    return true;
  }
  const target = win === undefined ? (typeof window !== 'undefined' ? window : null) : win;
  return Boolean(
    target &&
      'speechSynthesis' in target &&
      target.speechSynthesis &&
      typeof (target.speechSynthesis as SpeechSynthesisLike).speak === 'function' &&
      'SpeechSynthesisUtterance' in target,
  );
}

export function formatDistanceForSpeech(distanceKm: number | null | undefined): string | null {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    return null;
  }
  if (distanceKm < 1) {
    const meters = Math.max(50, Math.round((distanceKm * 1000) / 10) * 10);
    return `${meters} meters`;
  }
  const rounded = Number(distanceKm.toFixed(1));
  if (rounded === 1) return '1 kilometer';
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label} kilometers`;
}

export function buildIncomingTripAnnouncement(
  trip: TripGroup,
  stores: Record<string, StoreInfo>,
  riderLat: number,
  riderLng: number,
): TripAnnouncementDetails {
  const storeNames: string[] = [];
  for (const order of trip.orders) {
    const rawName = stores[order.restaurantId || '']?.name || 'Partner Store';
    const cleanName = sanitizeInput(rawName, 70) || 'Partner Store';
    if (!storeNames.includes(cleanName)) {
      storeNames.push(cleanName);
    }
  }

  let storeSummary = 'Partner Store';
  if (storeNames.length === 1) {
    storeSummary = storeNames[0];
  } else if (storeNames.length === 2) {
    storeSummary = `${storeNames[0]} and ${storeNames[1]}`;
  } else if (storeNames.length > 2) {
    storeSummary = `${storeNames[0]} and ${storeNames.length - 1} other stores`;
  }

  const seq = calculateOptimalDeliverySequence(trip, stores, riderLat, riderLng);
  const distanceKm =
    typeof seq.totalRemainingDistanceKm === 'number' &&
    Number.isFinite(seq.totalRemainingDistanceKm) &&
    seq.totalRemainingDistanceKm > 0
      ? seq.totalRemainingDistanceKm
      : null;
  const distanceLabel = formatDistanceForSpeech(distanceKm);

  const earningRupees = Math.round(
    trip.orders.reduce((sum, o) => sum + Math.max(0, Number(o.deliveryCharge || 25)), 0),
  );

  const isPrepaid =
    trip.paymentMode === 'WALLET' ||
    (trip.paymentMode === 'UPI' && trip.orders.every((o) => o.paymentStatus === 'VERIFIED'));
  const paymentPhrase = isPrepaid ? 'prepaid order' : 'cash on delivery';

  const parts = [`New trip assigned. Pickup from ${storeSummary}.`];
  if (distanceLabel) {
    parts.push(`Total distance ${distanceLabel}.`);
  }
  if (earningRupees > 0) {
    parts.push(`Earning ${earningRupees} rupees, ${paymentPhrase}.`);
  }

  return {
    text: parts.join(' '),
    storeSummary,
    distanceKm,
    distanceLabel,
    earningRupees,
  };
}

export function cancelTripSpeech(speechApi?: SpeechSynthesisLike | null): void {
  if (speechApi === undefined && Capacitor.isNativePlatform()) {
    void TextToSpeech.stop().catch(() => undefined);
    return;
  }
  try {
    const api =
      speechApi === undefined
        ? typeof window !== 'undefined'
          ? window.speechSynthesis
          : null
        : speechApi;
    if (api && typeof api.cancel === 'function') {
      api.cancel();
    }
  } catch {
    // Ignore speech synthesis cancel errors
  }
}

async function speakNativeTts(
  text: string,
  lang: string,
  rate: number,
  pitch: number,
  volume: number,
): Promise<void> {
  try {
    await TextToSpeech.speak({
      text,
      lang,
      rate,
      pitch,
      volume,
      category: 'ambient',
      queueStrategy: 1,
    });
  } catch {
    // Fallback to en-US if en-IN voice pack is not downloaded on device
    await TextToSpeech.speak({
      text,
      lang: 'en-US',
      rate,
      pitch,
      volume,
      category: 'ambient',
      queueStrategy: 1,
    }).catch(() => undefined);
  }
}

export function speakTripAnnouncement(rawText: string, options: SpeakOptions = {}): SpeakResult {
  const cleanText = sanitizeInput(rawText, 240);
  const enabled = options.enabled ?? readTtsEnabled();

  if (!enabled) {
    return {spoken: false, text: cleanText, reason: 'disabled'};
  }
  if (!cleanText) {
    return {spoken: false, text: '', reason: 'empty'};
  }

  const now = options.nowMs ?? Date.now();
  const cooldownMs = options.cooldownMs ?? DEFAULT_TTS_COOLDOWN_MS;
  if (
    lastSpokenAtMs > 0 &&
    (now - lastSpokenAtMs < cooldownMs ||
      (lastSpokenText === cleanText && now - lastSpokenAtMs < 4000))
  ) {
    return {spoken: false, text: cleanText, reason: 'cooldown'};
  }

  const targetLang = options.lang ?? 'en-IN';
  const rate = options.rate ?? 0.98;
  const pitch = options.pitch ?? 1.0;
  const volume = options.volume ?? 1.0;

  if (options.speechApi === undefined && Capacitor.isNativePlatform()) {
    lastSpokenAtMs = now;
    lastSpokenText = cleanText;
    void speakNativeTts(cleanText, targetLang, rate, pitch, volume);
    return {spoken: true, text: cleanText};
  }

  const speechApi =
    options.speechApi !== undefined
      ? options.speechApi
      : typeof window !== 'undefined' && 'speechSynthesis' in window
        ? window.speechSynthesis
        : null;

  const createUtterance =
    options.createUtterance ??
    (typeof SpeechSynthesisUtterance !== 'undefined'
      ? (txt: string) => new SpeechSynthesisUtterance(txt)
      : null);

  if (!speechApi || typeof speechApi.speak !== 'function' || !createUtterance) {
    return {spoken: false, text: cleanText, reason: 'unsupported'};
  }

  try {
    speechApi.cancel?.();
    const utterance = createUtterance(cleanText);
    utterance.lang = targetLang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    if (typeof speechApi.getVoices === 'function') {
      const voices = speechApi.getVoices();
      const preferred =
        voices.find((v) => v.lang?.toLowerCase() === targetLang.toLowerCase()) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith('en'));
      if (preferred) {
        utterance.voice = preferred;
      }
    }

    speechApi.speak(utterance);
    lastSpokenAtMs = now;
    lastSpokenText = cleanText;
    return {spoken: true, text: cleanText};
  } catch {
    return {spoken: false, text: cleanText, reason: 'error'};
  }
}
