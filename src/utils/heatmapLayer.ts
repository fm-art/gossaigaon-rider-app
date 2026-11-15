import L from 'leaflet';
import type {HeatmapPoint} from './riderLogic';

// Precompute 256-level thermal RGBA lookup table (Cyan -> Emerald -> Amber -> Hot Red)
const THERMAL_PALETTE = (() => {
  const palette = new Uint8ClampedArray(256 * 4);
  const stops: Array<{pos: number; r: number; g: number; b: number}> = [
    {pos: 0.0, r: 56, g: 189, b: 248}, // #38bdf8 (Cool Cyan - Low volume)
    {pos: 0.35, r: 34, g: 197, b: 94}, // #22c55e (Emerald)
    {pos: 0.68, r: 245, g: 158, b: 11}, // #f59e0b (Amber - Medium/Busy)
    {pos: 1.0, r: 239, g: 68, b: 68}, // #ef4444 (Hot Crimson - Peak hotspot)
  ];

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s0 = stops[0];
    let s1 = stops[stops.length - 1];
    for (let k = 0; k < stops.length - 1; k++) {
      if (t >= stops[k].pos && t <= stops[k + 1].pos) {
        s0 = stops[k];
        s1 = stops[k + 1];
        break;
      }
    }
    const span = Math.max(0.0001, s1.pos - s0.pos);
    const localT = (t - s0.pos) / span;
    palette[i * 4] = Math.round(s0.r + (s1.r - s0.r) * localT);
    palette[i * 4 + 1] = Math.round(s0.g + (s1.g - s0.g) * localT);
    palette[i * 4 + 2] = Math.round(s0.b + (s1.b - s0.b) * localT);
    palette[i * 4 + 3] = i;
  }
  return palette;
})();

export function createOrderHeatmapLayer(points: HeatmapPoint[]): L.Layer {
  const HeatmapCanvasLayer = L.Layer.extend({
    onAdd(map: L.Map) {
      this._map = map;
      const canvas = L.DomUtil.create(
        'canvas',
        'leaflet-layer leaflet-heatmap-canvas',
      ) as HTMLCanvasElement;
      canvas.style.position = 'absolute';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '220';
      this._canvas = canvas;

      const pane = map.getPanes().overlayPane;
      pane.appendChild(canvas);

      map.on('moveend zoomend resize', this._redraw, this);
      this._redraw();
      return this;
    },

    onRemove(map: L.Map) {
      map.off('moveend zoomend resize', this._redraw, this);
      if (this._canvas && this._canvas.parentNode) {
        this._canvas.parentNode.removeChild(this._canvas);
      }
      this._canvas = null;
      this._map = null;
      return this;
    },

    _redraw() {
      const map: L.Map | null = this._map;
      const canvas: HTMLCanvasElement | null = this._canvas;
      if (
        !map ||
        !canvas ||
        !map.getContainer()?.isConnected ||
        !(map as unknown as {_mapPane?: HTMLElement})._mapPane
      ) {
        return;
      }

      const size = map.getSize();
      if (size.x <= 0 || size.y <= 0) return;

      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);
      canvas.width = size.x;
      canvas.height = size.y;

      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      if (!ctx) return;
      ctx.clearRect(0, 0, size.x, size.y);

      if (!points || points.length === 0) return;

      const zoom = map.getZoom();
      const radius = Math.max(26, Math.min(58, Math.round(36 + (zoom - 14) * 6)));

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const pt = map.latLngToContainerPoint([p.lat, p.lng]);
        if (
          pt.x < -radius ||
          pt.y < -radius ||
          pt.x > size.x + radius ||
          pt.y > size.y + radius
        ) {
          continue;
        }

        const alpha = Math.min(1, 0.34 + p.weight * 0.64);
        const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
        grad.addColorStop(0, `rgba(0, 0, 0, ${alpha.toFixed(3)})`);
        grad.addColorStop(0.5, `rgba(0, 0, 0, ${(alpha * 0.5).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      const img = ctx.getImageData(0, 0, size.x, size.y);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a > 6) {
          const pIdx = a * 4;
          data[i] = THERMAL_PALETTE[pIdx];
          data[i + 1] = THERMAL_PALETTE[pIdx + 1];
          data[i + 2] = THERMAL_PALETTE[pIdx + 2];
          data[i + 3] = Math.min(205, Math.round(a * 0.85));
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });

  return new (HeatmapCanvasLayer as unknown as new () => L.Layer)();
}
