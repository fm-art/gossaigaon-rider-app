import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HAPTIC_PATTERNS,
  HAPTIC_STORAGE_KEY,
  isHapticSupported,
  readHapticsEnabled,
  resetHapticCooldown,
  saveHapticsEnabled,
  triggerHaptic,
  type HapticCue,
} from './haptics';

test('HAPTIC_PATTERNS define subtle, well-bounded tactile cues for all rider actions', () => {
  const interactiveCues: HapticCue[] = [
    'tap',
    'dutyOn',
    'dutyOff',
    'accept',
    'pickup',
    'routeStart',
    'success',
    'warning',
    'error',
  ];

  interactiveCues.forEach((cue) => {
    const pattern = HAPTIC_PATTERNS[cue];
    const parts = Array.isArray(pattern) ? pattern : [pattern];
    assert.ok(parts.length >= 1, `Expected pattern for ${cue}`);
    parts.forEach((ms) => {
      assert.ok(ms > 0 && ms <= 55, `Expected subtle pulse <= 55ms for ${cue}, got ${ms}ms`);
    });
  });

  assert.deepEqual(HAPTIC_PATTERNS.alert, [120, 60, 120]);
});

test('triggerHaptic invokes vibrateFn with matching cue pattern and enforces cooldown', () => {
  resetHapticCooldown();
  const calls: Array<number | number[]> = [];
  const vibrateFn = (pattern: VibratePattern) => {
    calls.push(pattern as number | number[]);
    return true;
  };

  const first = triggerHaptic('dutyOn', {
    enabled: true,
    prefersReducedMotion: false,
    nowMs: 1000,
    vibrateFn,
  });
  assert.equal(first.triggered, true);
  assert.deepEqual(first.pattern, [14, 40, 22]);

  // Rapid duplicate within 45ms cooldown is suppressed
  const second = triggerHaptic('accept', {
    enabled: true,
    prefersReducedMotion: false,
    nowMs: 1020,
    vibrateFn,
  });
  assert.equal(second.triggered, false);
  assert.equal(second.reason, 'cooldown');

  // After cooldown expires, accept and success fire cleanly
  const third = triggerHaptic('accept', {
    enabled: true,
    prefersReducedMotion: false,
    nowMs: 1060,
    vibrateFn,
  });
  assert.equal(third.triggered, true);

  const fourth = triggerHaptic('success', {
    enabled: true,
    prefersReducedMotion: false,
    nowMs: 1200,
    vibrateFn,
  });
  assert.equal(fourth.triggered, true);
  assert.deepEqual(calls, [
    [14, 40, 22],
    [16, 45, 28],
    [18, 45, 30, 45, 40],
  ]);
});

test('triggerHaptic respects user disable, reduced motion, missing support, and throwing vibrateFn', () => {
  resetHapticCooldown();

  const disabled = triggerHaptic('accept', {
    enabled: false,
    prefersReducedMotion: false,
    nowMs: 2000,
    vibrateFn: () => true,
  });
  assert.equal(disabled.triggered, false);
  assert.equal(disabled.reason, 'disabled');

  const reduced = triggerHaptic('success', {
    enabled: true,
    prefersReducedMotion: true,
    nowMs: 2200,
    vibrateFn: () => true,
  });
  assert.equal(reduced.triggered, false);
  assert.equal(reduced.reason, 'reduced-motion');

  // Critical incoming dispatch alert still works even when reduced motion is set
  const criticalAlert = triggerHaptic('alert', {
    enabled: true,
    prefersReducedMotion: true,
    nowMs: 2400,
    vibrateFn: () => true,
  });
  assert.equal(criticalAlert.triggered, true);

  assert.equal(isHapticSupported({}), false);
  assert.equal(isHapticSupported({vibrate: () => true}), true);

  const throwing = triggerHaptic('tap', {
    enabled: true,
    prefersReducedMotion: false,
    nowMs: 2600,
    vibrateFn: () => {
      throw new Error('Blocked');
    },
  });
  assert.equal(throwing.triggered, false);
  assert.equal(throwing.reason, 'error');
});

test('readHapticsEnabled and saveHapticsEnabled persist preference safely', () => {
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
    assert.equal(readHapticsEnabled(), true);
    saveHapticsEnabled(false);
    assert.equal(store.get(HAPTIC_STORAGE_KEY), '0');
    assert.equal(readHapticsEnabled(), false);
    saveHapticsEnabled(true);
    assert.equal(readHapticsEnabled(), true);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: origLocalStorage,
    });
  }
});
