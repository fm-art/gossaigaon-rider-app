import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGeoProjectionDomains,
  filterTodayRoutePoints,
  isValidRoutePoint,
  summarizeTodayRouteTrail,
} from './routeTrail';

test('filterTodayRoutePoints retains only valid today breadcrumbs sorted chronologically', () => {
  const now = new Date(2026, 10, 14, 15, 30, 0).getTime();
  const yesterday = now - 24 * 60 * 60 * 1000;
  const morning1 = new Date(2026, 10, 14, 9, 10, 0).getTime();
  const morning2 = new Date(2026, 10, 14, 9, 45, 0).getTime();

  const raw = [
    {lat: 26.4582, lng: 89.9788, time: morning2},
    {lat: 26.4524, lng: 89.9723, time: morning1},
    {lat: 26.4524, lng: 89.9723, time: morning1 + 200}, // duplicate point within 1s
    {lat: 26.454, lng: 89.974, time: yesterday}, // yesterday -> excluded
    {lat: 120, lng: 89.97, time: morning2}, // invalid latitude -> excluded
    {lat: Number.NaN, lng: 89.97, time: morning2}, // invalid NaN -> excluded
  ];

  const today = filterTodayRoutePoints(raw, now);
  assert.equal(today.length, 2);
  assert.equal(today[0].time, morning1);
  assert.equal(today[1].time, morning2);
  assert.equal(isValidRoutePoint(null), false);
});

test('summarizeTodayRouteTrail calculates cumulative distance, duration, and empty defaults', () => {
  const now = new Date(2026, 10, 14, 14, 0, 0).getTime();
  const t0 = now - 45 * 60 * 1000;
  const t1 = now - 20 * 60 * 1000;
  const t2 = now - 5 * 60 * 1000;

  const summary = summarizeTodayRouteTrail(
    [
      {lat: 26.4524, lng: 89.9723, time: t0},
      {lat: 26.4539, lng: 89.9741, time: t1},
      {lat: 26.4582, lng: 89.9788, time: t2},
    ],
    now,
  );

  assert.equal(summary.pointCount, 3);
  assert.equal(summary.durationMinutes, 40);
  assert.ok(summary.totalDistanceKm > 0.7 && summary.totalDistanceKm < 1.2);
  assert.notEqual(summary.startTimeLabel, '--:--');
  assert.notEqual(summary.endTimeLabel, '--:--');

  const empty = summarizeTodayRouteTrail(undefined, now);
  assert.equal(empty.pointCount, 0);
  assert.equal(empty.totalDistanceKm, 0);
  assert.equal(empty.startTimeLabel, '--:--');
});

test('computeGeoProjectionDomains handles multi-point, single-point, and empty trails with aspect preservation', () => {
  const width = 360;
  const height = 190;
  const padding = 24;

  const empty = computeGeoProjectionDomains([], width, height, padding);
  assert.deepEqual(empty.xRange, [24, 336]);
  assert.deepEqual(empty.yRange, [166, 24]);

  const single = computeGeoProjectionDomains(
    [{lat: 26.454, lng: 89.974, time: 1700000000000}],
    width,
    height,
    padding,
  );
  assert.ok(single.lngDomain[1] > single.lngDomain[0]);
  assert.ok(single.latDomain[1] > single.latDomain[0]);

  const trail = computeGeoProjectionDomains(
    [
      {lat: 26.451, lng: 89.97, time: 1700000000000},
      {lat: 26.459, lng: 89.979, time: 1700000600000},
    ],
    width,
    height,
    padding,
  );
  assert.ok(trail.lngDomain[0] <= 89.97 && trail.lngDomain[1] >= 89.979);
  assert.ok(trail.latDomain[0] <= 26.451 && trail.latDomain[1] >= 26.459);
});
