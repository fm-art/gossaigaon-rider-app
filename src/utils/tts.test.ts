import test from 'node:test';
import assert from 'node:assert/strict';
import type {StoreInfo, TripGroup} from '../types/rider';
import {
  TTS_STORAGE_KEY,
  buildIncomingTripAnnouncement,
  formatDistanceForSpeech,
  isTtsSupported,
  readTtsEnabled,
  resetTtsCooldown,
  saveTtsEnabled,
  speakTripAnnouncement,
} from './tts';

const SAMPLE_STORES: Record<string, StoreInfo> = {
  s1: {name: 'FreshMart Grocery', lat: 26.4539, lng: 89.9741},
  s2: {name: 'Bazar Dairy & Bakery', lat: 26.4551, lng: 89.9702},
  s3: {name: 'Green Basket Organics', lat: 26.4543, lng: 89.9746},
};

function makeTrip(orderRestaurants: string[], paymentMode = 'COD', paymentStatus = 'COD'): TripGroup {
  return {
    tripId: 'trip_tts_1',
    phone: '9954012345',
    address: 'Ward No. 3, Gossaigaon',
    customerLat: 26.4582,
    customerLng: 89.9788,
    locationLink: '',
    deliveryOtp: '4829',
    paymentMode,
    paymentStatus,
    emergencyAlert: false,
    emergencyDetails: '',
    assignedAt: 1700000000000,
    orders: orderRestaurants.map((rid, idx) => ({
      orderId: `ord_${idx + 1}`,
      restaurantId: rid,
      deliveryCharge: 35,
      totalAmount: 220,
      status: 'READY_FOR_PICKUP',
      paymentMode,
      paymentStatus,
    })),
  };
}

test('formatDistanceForSpeech formats meters under 1km and kilometers >= 1km', () => {
  assert.equal(formatDistanceForSpeech(null), null);
  assert.equal(formatDistanceForSpeech(0), null);
  assert.equal(formatDistanceForSpeech(0.456), '460 meters');
  assert.equal(formatDistanceForSpeech(0.02), '50 meters');
  assert.equal(formatDistanceForSpeech(1.0), '1 kilometer');
  assert.equal(formatDistanceForSpeech(2.44), '2.4 kilometers');
});

test('buildIncomingTripAnnouncement formats single-store and multi-store announcements with total distance', () => {
  const single = buildIncomingTripAnnouncement(makeTrip(['s1']), SAMPLE_STORES, 26.4524, 89.9723);
  assert.equal(single.storeSummary, 'FreshMart Grocery');
  assert.ok(single.distanceKm && single.distanceKm > 0.5 && single.distanceKm < 1.0);
  assert.match(single.text, /^New trip assigned\. Pickup from FreshMart Grocery\./);
  assert.match(single.text, /Total distance \d+ meters\./);
  assert.match(single.text, /Earning 35 rupees, cash on delivery\./);

  const twoStores = buildIncomingTripAnnouncement(
    makeTrip(['s1', 's2'], 'UPI', 'VERIFIED'),
    SAMPLE_STORES,
    26.4524,
    89.9723,
  );
  assert.equal(twoStores.storeSummary, 'FreshMart Grocery and Bazar Dairy & Bakery');
  assert.match(twoStores.text, /Total distance \d+(\.\d+)? kilometers?\./);
  assert.match(twoStores.text, /Earning 70 rupees, prepaid order\./);

  const threeStores = buildIncomingTripAnnouncement(
    makeTrip(['s1', 's2', 's3']),
    SAMPLE_STORES,
    26.4524,
    89.9723,
  );
  assert.equal(threeStores.storeSummary, 'FreshMart Grocery and 2 other stores');
});

test('speakTripAnnouncement speaks sanitized utterance, picks voice, enforces cooldown, and handles disabled/unsupported states', () => {
  resetTtsCooldown();
  const spokenUtterances: Array<{text: string; lang: string; rate: number; voiceName?: string}> = [];
  let cancelCount = 0;

  const mockSpeechApi = {
    cancel: () => {
      cancelCount += 1;
    },
    getVoices: () =>
      [{lang: 'en-IN', name: 'Indian English'} as SpeechSynthesisVoice],
    speak: (u: SpeechSynthesisUtterance) => {
      spokenUtterances.push({
        text: u.text,
        lang: u.lang,
        rate: u.rate,
        voiceName: u.voice?.name,
      });
    },
  };

  const createUtterance = (text: string) =>
    ({
      text,
      lang: '',
      rate: 1,
      pitch: 1,
      volume: 1,
      voice: null,
    }) as unknown as SpeechSynthesisUtterance;

  const res1 = speakTripAnnouncement('New trip assigned.\u202E Pickup from FreshMart.', {
    enabled: true,
    nowMs: 1000,
    speechApi: mockSpeechApi,
    createUtterance,
  });
  assert.equal(res1.spoken, true);
  assert.equal(cancelCount, 1);
  assert.equal(spokenUtterances.length, 1);
  assert.equal(spokenUtterances[0].lang, 'en-IN');
  assert.equal(spokenUtterances[0].voiceName, 'Indian English');
  assert.ok(!spokenUtterances[0].text.includes('\u202E'));

  // Immediate duplicate blocked by cooldown
  const dup = speakTripAnnouncement('New trip assigned. Pickup from FreshMart.', {
    enabled: true,
    nowMs: 1500,
    speechApi: mockSpeechApi,
    createUtterance,
  });
  assert.equal(dup.spoken, false);
  assert.equal(dup.reason, 'cooldown');

  // Disabled returns disabled
  const disabled = speakTripAnnouncement('Another trip', {
    enabled: false,
    nowMs: 6000,
    speechApi: mockSpeechApi,
    createUtterance,
  });
  assert.equal(disabled.spoken, false);
  assert.equal(disabled.reason, 'disabled');

  // Unsupported returns unsupported
  const unsupported = speakTripAnnouncement('Another trip', {
    enabled: true,
    nowMs: 7000,
    speechApi: null,
    createUtterance,
  });
  assert.equal(unsupported.spoken, false);
  assert.equal(unsupported.reason, 'unsupported');
  assert.equal(isTtsSupported({}), false);
});

test('readTtsEnabled and saveTtsEnabled persist voice alert preference safely', () => {
  const store = new Map<string, string>();
  const origLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    },
  });

  try {
    assert.equal(readTtsEnabled(), true);
    saveTtsEnabled(false);
    assert.equal(store.get(TTS_STORAGE_KEY), '0');
    assert.equal(readTtsEnabled(), false);
    saveTtsEnabled(true);
    assert.equal(readTtsEnabled(), true);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: origLocalStorage,
    });
  }
});
