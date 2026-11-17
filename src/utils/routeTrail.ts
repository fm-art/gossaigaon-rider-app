import type {RoutePoint} from '../types/rider';
import {calculateDistanceKm} from './riderLogic';

export interface RouteTrailSummary {
  points: RoutePoint[];
  pointCount: number;
  totalDistanceKm: number;
  durationMinutes: number;
  startTimeLabel: string;
  endTimeLabel: string;
}

export interface GeoProjectionDomains {
  lngDomain: [number, number];
  latDomain: [number, number];
  xRange: [number, number];
  yRange: [number, number];
}

export function isValidRoutePoint(pt: unknown): pt is RoutePoint {
  if (!pt || typeof pt !== 'object') return false;
  const candidate = pt as Partial<RoutePoint>;
  return (
    typeof candidate.lat === 'number' &&
    Number.isFinite(candidate.lat) &&
    candidate.lat >= -90 &&
    candidate.lat <= 90 &&
    typeof candidate.lng === 'number' &&
    Number.isFinite(candidate.lng) &&
    candidate.lng >= -180 &&
    candidate.lng <= 180 &&
    typeof candidate.time === 'number' &&
    Number.isFinite(candidate.time) &&
    candidate.time > 0
  );
}

export function normalizeRoutePoints(
  recentRoute: RoutePoint[] | Record<string, RoutePoint> | undefined | null,
): RoutePoint[] {
  if (!recentRoute) return [];
  const rawList = Array.isArray(recentRoute) ? recentRoute : Object.values(recentRoute);
  return rawList
    .filter(isValidRoutePoint)
    .map((p) => ({
      lat: Number(p.lat),
      lng: Number(p.lng),
      time: Number(p.time),
    }))
    .sort((a, b) => a.time - b.time);
}

export function filterTodayRoutePoints(
  recentRoute: RoutePoint[] | Record<string, RoutePoint> | undefined | null,
  nowMs = Date.now(),
): RoutePoint[] {
  const refDate = new Date(nowMs);
  const startOfDay = new Date(
    refDate.getFullYear(),
    refDate.getMonth(),
    refDate.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;

  const normalized = normalizeRoutePoints(recentRoute).filter(
    (p) => p.time >= startOfDay && p.time <= endOfDay,
  );

  // Deduplicate identical consecutive coordinates at identical/sequential timestamps
  const deduped: RoutePoint[] = [];
  for (const pt of normalized) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.lat === pt.lat && prev.lng === pt.lng && pt.time - prev.time < 1000) {
      continue;
    }
    deduped.push(pt);
  }
  return deduped;
}

export function formatTrailClockTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--:--';
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function summarizeTodayRouteTrail(
  recentRoute: RoutePoint[] | Record<string, RoutePoint> | undefined | null,
  nowMs = Date.now(),
): RouteTrailSummary {
  const points = filterTodayRoutePoints(recentRoute, nowMs);
  let totalDistanceKm = 0;

  for (let i = 1; i < points.length; i += 1) {
    const seg = calculateDistanceKm(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng,
    );
    if (seg !== null && Number.isFinite(seg)) {
      totalDistanceKm += seg;
    }
  }

  const first = points[0];
  const last = points[points.length - 1];
  const durationMinutes =
    first && last ? Math.max(0, Math.round((last.time - first.time) / 60000)) : 0;

  return {
    points,
    pointCount: points.length,
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    durationMinutes,
    startTimeLabel: first ? formatTrailClockTime(first.time) : '--:--',
    endTimeLabel: last ? formatTrailClockTime(last.time) : '--:--',
  };
}

export function computeGeoProjectionDomains(
  points: RoutePoint[],
  width: number,
  height: number,
  padding = 26,
): GeoProjectionDomains {
  const innerW = Math.max(20, width - padding * 2);
  const innerH = Math.max(20, height - padding * 2);

  if (points.length === 0) {
    return {
      lngDomain: [89.968, 89.978],
      latDomain: [26.45, 26.46],
      xRange: [padding, width - padding],
      yRange: [height - padding, padding],
    };
  }

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;

  for (const pt of points) {
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
  }

  const midLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
  const lngScaleFactor = Math.max(0.2, Math.cos(midLatRad));

  // Ensure a readable minimum geographic window even for stationary / 1-point trails
  const minSpan = 0.0022;
  let latSpan = Math.max(minSpan, maxLat - minLat);
  let lngSpan = Math.max(minSpan / lngScaleFactor, maxLng - minLng);

  // Preserve visual aspect ratio so north/south vs east/west distances look undistorted
  const targetAspect = innerW / innerH;
  const geoAspect = (lngSpan * lngScaleFactor) / latSpan;

  if (geoAspect < targetAspect) {
    lngSpan = (latSpan * targetAspect) / lngScaleFactor;
  } else {
    latSpan = (lngSpan * lngScaleFactor) / targetAspect;
  }

  // Add subtle breathing margin around extreme trail vertices
  latSpan *= 1.18;
  lngSpan *= 1.18;

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  return {
    lngDomain: [centerLng - lngSpan / 2, centerLng + lngSpan / 2],
    latDomain: [centerLat - latSpan / 2, centerLat + latSpan / 2],
    xRange: [padding, width - padding],
    yRange: [height - padding, padding],
  };
}
