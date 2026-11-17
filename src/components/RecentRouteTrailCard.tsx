import {memo, useEffect, useMemo, useRef, useState} from 'react';
import * as d3 from 'd3';
import type {RoutePoint} from '../types/rider';
import {
  computeGeoProjectionDomains,
  formatTrailClockTime,
  summarizeTodayRouteTrail,
} from '../utils/routeTrail';

interface RecentRouteTrailCardProps {
  recentRoute?: RoutePoint[] | Record<string, RoutePoint>;
  nowMs?: number;
}

const SVG_WIDTH = 360;
const SVG_HEIGHT = 188;
const SVG_PADDING = 24;

export const RecentRouteTrailCard = memo(function RecentRouteTrailCard({
  recentRoute,
  nowMs,
}: RecentRouteTrailCardProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const summary = useMemo(
    () => summarizeTodayRouteTrail(recentRoute, nowMs),
    [recentRoute, nowMs],
  );

  // Reset selected waypoint index if points count shrinks
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= summary.points.length) {
      setSelectedIndex(null);
    }
  }, [selectedIndex, summary.points.length]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const domains = computeGeoProjectionDomains(
      summary.points,
      SVG_WIDTH,
      SVG_HEIGHT,
      SVG_PADDING,
    );

    const xScale = d3.scaleLinear().domain(domains.lngDomain).range(domains.xRange);
    const yScale = d3.scaleLinear().domain(domains.latDomain).range(domains.yRange);

    const defs = svg.append('defs');

    // Emerald -> Cyan gradient along the rider's daily trail
    const grad = defs
      .append('linearGradient')
      .attr('id', 'gb-route-trail-grad')
      .attr('x1', '0%')
      .attr('y1', '100%')
      .attr('x2', '100%')
      .attr('y2', '0%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#34d399');
    grad.append('stop').attr('offset', '55%').attr('stop-color', '#22d3ee');
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#38bdf8');

    // Background coordinate grid
    const gridGroup = svg.append('g').attr('class', 'trail-grid');
    const xTicks = xScale.ticks(5);
    const yTicks = yScale.ticks(4);

    gridGroup
      .selectAll('line.v-grid')
      .data(xTicks)
      .enter()
      .append('line')
      .attr('class', 'v-grid')
      .attr('x1', (d) => xScale(d))
      .attr('x2', (d) => xScale(d))
      .attr('y1', 10)
      .attr('y2', SVG_HEIGHT - 10)
      .attr('stroke', 'rgba(148, 163, 184, 0.1)')
      .attr('stroke-dasharray', '3 3')
      .attr('stroke-width', 1);

    gridGroup
      .selectAll('line.h-grid')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('class', 'h-grid')
      .attr('x1', 10)
      .attr('x2', SVG_WIDTH - 10)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', 'rgba(148, 163, 184, 0.1)')
      .attr('stroke-dasharray', '3 3')
      .attr('stroke-width', 1);

    // Subtle North indicator
    svg
      .append('text')
      .attr('x', SVG_WIDTH - 14)
      .attr('y', 20)
      .attr('text-anchor', 'end')
      .attr('fill', 'rgba(148, 163, 184, 0.55)')
      .attr('font-size', '9px')
      .attr('font-weight', '700')
      .text('N ↑');

    if (summary.points.length === 0) {
      svg
        .append('text')
        .attr('x', SVG_WIDTH / 2)
        .attr('y', SVG_HEIGHT / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(148, 163, 184, 0.75)')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .text('Go online to record today’s GPS breadcrumb trail');
      return;
    }

    // Draw glowing + crisp D3 polyline when >= 2 waypoints exist
    if (summary.points.length >= 2) {
      const lineGenerator = d3
        .line<RoutePoint>()
        .x((d) => xScale(d.lng))
        .y((d) => yScale(d.lat))
        .curve(d3.curveCatmullRom.alpha(0.5));

      const pathData = lineGenerator(summary.points) || '';

      svg
        .append('path')
        .datum(summary.points)
        .attr('d', pathData)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(56, 189, 248, 0.22)')
        .attr('stroke-width', 8)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round');

      svg
        .append('path')
        .datum(summary.points)
        .attr('data-testid', 'recent-route-polyline')
        .attr('class', 'gps-trail-polyline')
        .attr('d', pathData)
        .attr('fill', 'none')
        .attr('stroke', 'url(#gb-route-trail-grad)')
        .attr('stroke-width', 3)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round');
    }

    // Waypoint dots
    const nodesGroup = svg.append('g').attr('class', 'trail-waypoints');
    const lastIdx = summary.points.length - 1;

    nodesGroup
      .selectAll('circle.trail-node')
      .data(summary.points)
      .enter()
      .append('circle')
      .attr('class', 'trail-node')
      .attr('data-testid', (_d, i) => `route-waypoint-${i}`)
      .attr('cx', (d) => xScale(d.lng))
      .attr('cy', (d) => yScale(d.lat))
      .attr('r', (_d, i) => {
        if (i === selectedIndex) return 6.5;
        if (i === 0 || i === lastIdx) return 5.5;
        return 3;
      })
      .attr('fill', (_d, i) => {
        if (i === 0) return '#34d399';
        if (i === lastIdx) return '#38bdf8';
        return i === selectedIndex ? '#fbbf24' : '#7dd3fc';
      })
      .attr('stroke', '#070b14')
      .attr('stroke-width', (_d, i) => (i === 0 || i === lastIdx || i === selectedIndex ? 2 : 1.25))
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        const idx = summary.points.indexOf(d);
        if (idx >= 0) {
          setSelectedIndex((prev) => (prev === idx ? null : idx));
        }
      });

    // Outer halo on latest GPS position
    const latest = summary.points[lastIdx];
    svg
      .append('circle')
      .attr('cx', xScale(latest.lng))
      .attr('cy', yScale(latest.lat))
      .attr('r', 10)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(56, 189, 248, 0.45)')
      .attr('stroke-width', 1.5);

    // Corner Legend (avoids label collision when round-trip loops back near Start)
    const legend = svg.append('g').attr('transform', 'translate(14, 15)');
    legend
      .append('circle')
      .attr('cx', 4)
      .attr('cy', 0)
      .attr('r', 3.5)
      .attr('fill', '#34d399');
    legend
      .append('text')
      .attr('x', 11)
      .attr('y', 3)
      .attr('fill', '#6ee7b7')
      .attr('font-size', '9px')
      .attr('font-weight', '700')
      .text('Start');

    legend
      .append('circle')
      .attr('cx', 46)
      .attr('cy', 0)
      .attr('r', 3.5)
      .attr('fill', '#38bdf8');
    legend
      .append('text')
      .attr('x', 53)
      .attr('y', 3)
      .attr('fill', '#7dd3fc')
      .attr('font-size', '9px')
      .attr('font-weight', '700')
      .text('Latest');
  }, [summary.points, selectedIndex]);

  const activePoint =
    selectedIndex !== null && summary.points[selectedIndex]
      ? summary.points[selectedIndex]
      : summary.points[summary.points.length - 1] || null;

  return (
    <div
      data-testid="recent-route-card"
      className="surface-card"
      style={{borderColor: 'rgba(56, 189, 248, 0.28)'}}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '6px',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{color: '#38bdf8', fontSize: '0.92rem'}}>
          <i className="fa-solid fa-route" style={{marginRight: '6px'}} />
          Today&apos;s GPS Trail
        </strong>
        <span data-testid="recent-route-badge" className="section-meta-count">
          {summary.pointCount} {summary.pointCount === 1 ? 'Point' : 'Points'}
        </span>
      </div>

      <p style={{fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.65rem'}}>
        D3 breadcrumb polyline of your live GPS route recorded today. Tap any dot to inspect timestamp &amp; coordinates.
      </p>

      <div
        style={{
          background: '#060a13',
          border: '1px solid rgba(56, 189, 248, 0.18)',
          borderRadius: '12px',
          overflow: 'hidden',
          marginBottom: '0.7rem',
        }}
      >
        <svg
          ref={svgRef}
          data-testid="recent-route-svg"
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          role="img"
          aria-label="Rider recent GPS trail visualization"
          style={{display: 'block', width: '100%', height: 'auto', maxHeight: '235px'}}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '8px',
          marginBottom: activePoint ? '0.6rem' : 0,
        }}
      >
        <div
          style={{
            background: 'rgba(52, 211, 153, 0.08)',
            border: '1px solid rgba(52, 211, 153, 0.22)',
            borderRadius: '10px',
            padding: '0.45rem 0.6rem',
          }}
        >
          <div style={{fontSize: '0.64rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700}}>
            Distance
          </div>
          <div data-testid="recent-route-distance" className="tabular-nums" style={{fontSize: '0.88rem', fontWeight: 800, color: '#34d399'}}>
            {summary.totalDistanceKm.toFixed(2)} km
          </div>
        </div>
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            borderRadius: '10px',
            padding: '0.45rem 0.6rem',
          }}
        >
          <div style={{fontSize: '0.64rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700}}>
            Active Span
          </div>
          <div data-testid="recent-route-duration" className="tabular-nums" style={{fontSize: '0.88rem', fontWeight: 800, color: '#38bdf8'}}>
            {summary.durationMinutes} min
          </div>
        </div>
        <div
          style={{
            background: 'rgba(148, 163, 184, 0.08)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: '10px',
            padding: '0.45rem 0.6rem',
          }}
        >
          <div style={{fontSize: '0.64rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700}}>
            Window
          </div>
          <div data-testid="recent-route-window" className="tabular-nums" style={{fontSize: '0.78rem', fontWeight: 800, color: '#f8fafc', marginTop: '2px'}}>
            {summary.startTimeLabel}–{summary.endTimeLabel}
          </div>
        </div>
      </div>

      {activePoint && (
        <div
          data-testid="recent-route-active-point"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.71rem',
            color: '#cbd5e1',
            borderTop: '1px solid var(--border)',
            paddingTop: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <span>
            <strong style={{color: selectedIndex !== null ? '#fbbf24' : '#7dd3fc'}}>
              {selectedIndex !== null
                ? `Waypoint #${selectedIndex + 1}`
                : 'Latest GPS Fix'}
            </strong>{' '}
            · {formatTrailClockTime(activePoint.time)}
          </span>
          <span className="tabular-nums" style={{color: 'var(--text-muted)'}}>
            {activePoint.lat.toFixed(5)}, {activePoint.lng.toFixed(5)}
          </span>
        </div>
      )}
    </div>
  );
});
