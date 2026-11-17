export type HapticCue =
  | 'tap'
  | 'dutyOn'
  | 'dutyOff'
  | 'accept'
  | 'pickup'
  | 'routeStart'
  | 'success'
  | 'warning'
  | 'error'
  | 'alert';

export const HAPTIC_STORAGE_KEY = 'gb_haptics_enabled_v1';
export const DEFAULT_HAPTIC_COOLDOWN_MS = 45;

export const HAPTIC_PATTERNS: Record<HapticCue, number | number[]> = {
  tap: 8,
  dutyOn: [14, 40, 22],
  dutyOff: 18,
  accept: [16, 45, 28],
  pickup: [14, 35, 18],
  routeStart: [12, 30, 14],
  success: [18, 45, 30, 45, 40],
  warning: [24, 50, 24],
  error: [35, 45, 35, 45, 45],
  alert: [120, 60, 120],
};

let lastHapticTriggeredAtMs = 0;

export function resetHapticCooldown(): void {
  lastHapticTriggeredAtMs = 0;
}

export function isHapticSupported(nav?: {vibrate?: unknown} | null): boolean {
  const target = nav === undefined ? (typeof navigator !== 'undefined' ? navigator : null) : nav;
  return Boolean(target && typeof target.vibrate === 'function');
}

export function prefersReducedMotionEnabled(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function readHapticsEnabled(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true;
    const raw = localStorage.getItem(HAPTIC_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== '0' && raw !== 'false';
  } catch {
    return true;
  }
}

export function saveHapticsEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(HAPTIC_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage quota / restricted environment errors
  }
}

export interface TriggerHapticOptions {
  enabled?: boolean;
  prefersReducedMotion?: boolean;
  nowMs?: number;
  cooldownMs?: number;
  vibrateFn?: (pattern: VibratePattern) => boolean;
}

export interface TriggerHapticResult {
  triggered: boolean;
  cue: HapticCue;
  pattern: number | number[];
  reason?: 'disabled' | 'reduced-motion' | 'cooldown' | 'unsupported' | 'error';
}

export function triggerHaptic(
  cue: HapticCue,
  options: TriggerHapticOptions = {},
): TriggerHapticResult {
  const pattern = HAPTIC_PATTERNS[cue];
  const enabled = options.enabled ?? readHapticsEnabled();
  if (!enabled) {
    return {triggered: false, cue, pattern, reason: 'disabled'};
  }

  const reducedMotion = options.prefersReducedMotion ?? prefersReducedMotionEnabled();
  if (reducedMotion && cue !== 'alert') {
    return {triggered: false, cue, pattern, reason: 'reduced-motion'};
  }

  const now = options.nowMs ?? Date.now();
  const cooldownMs = options.cooldownMs ?? DEFAULT_HAPTIC_COOLDOWN_MS;
  if (lastHapticTriggeredAtMs > 0 && now - lastHapticTriggeredAtMs < cooldownMs) {
    return {triggered: false, cue, pattern, reason: 'cooldown'};
  }

  const vibrateFn =
    options.vibrateFn ??
    (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
      ? (p: VibratePattern) => navigator.vibrate(p)
      : null);

  if (!vibrateFn) {
    return {triggered: false, cue, pattern, reason: 'unsupported'};
  }

  try {
    const ok = vibrateFn(pattern);
    lastHapticTriggeredAtMs = now;
    return {triggered: ok !== false, cue, pattern};
  } catch {
    return {triggered: false, cue, pattern, reason: 'error'};
  }
}
