import {useEffect, useState} from 'react';
import type {BatteryStatusSnapshot} from '../utils/riderLogic';

interface BatteryManagerLike extends EventTarget {
  charging: boolean;
  level: number;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManagerLike>;
}

export function useBatteryStatus(): BatteryStatusSnapshot {
  const [status, setStatus] = useState<BatteryStatusSnapshot>({
    supported: false,
    levelPercent: null,
    charging: false,
  });

  useEffect(() => {
    const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithBattery) : null;
    if (!nav || typeof nav.getBattery !== 'function') {
      return;
    }

    let cancelled = false;
    let manager: BatteryManagerLike | null = null;

    const syncFromManager = (bm: BatteryManagerLike) => {
      if (cancelled) return;
      const pct = Math.max(0, Math.min(100, Math.round(Number(bm.level) * 100)));
      setStatus({
        supported: true,
        levelPercent: Number.isFinite(pct) ? pct : null,
        charging: Boolean(bm.charging),
      });
    };

    const handleChange = () => {
      if (manager) syncFromManager(manager);
    };

    void nav
      .getBattery()
      .then((bm) => {
        if (cancelled) return;
        manager = bm;
        syncFromManager(bm);
        bm.addEventListener('levelchange', handleChange);
        bm.addEventListener('chargingchange', handleChange);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({supported: false, levelPercent: null, charging: false});
        }
      });

    return () => {
      cancelled = true;
      if (manager) {
        manager.removeEventListener('levelchange', handleChange);
        manager.removeEventListener('chargingchange', handleChange);
      }
    };
  }, []);

  return status;
}
