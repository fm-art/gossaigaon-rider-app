import L from 'leaflet';
import {
  OFFLINE_TILE_CACHE_NAME,
  buildOsmTileUrl,
  GOSSAIGAON_MIN_ZOOM,
} from './offlineTiles';

async function loadParentTileAsDataUrl(
  z: number,
  x: number,
  y: number,
  cache: Cache,
): Promise<string | null> {
  for (let parentZ = z - 1; parentZ >= GOSSAIGAON_MIN_ZOOM; parentZ--) {
    const dz = z - parentZ;
    const factor = 2 ** dz;
    const parentX = Math.floor(x / factor);
    const parentY = Math.floor(y / factor);
    const parentUrl = buildOsmTileUrl(parentZ, parentX, parentY);
    const match = await cache.match(parentUrl);
    if (!match || match.type === 'opaque') continue;

    try {
      const blob = await match.blob();
      if (blob.size === 0) continue;
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const subX = x - parentX * factor;
        const subY = y - parentY * factor;
        const srcSizeX = bitmap.width / factor;
        const srcSizeY = bitmap.height / factor;
        ctx.drawImage(
          bitmap,
          subX * srcSizeX,
          subY * srcSizeY,
          srcSizeX,
          srcSizeY,
          0,
          0,
          256,
          256,
        );
        return canvas.toDataURL('image/png');
      } finally {
        bitmap.close();
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function createOfflineTileLayer(
  urlTemplate: string,
  options?: L.TileLayerOptions,
): L.TileLayer {
  const OfflineTileLayer = L.TileLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
      const tile = document.createElement('img');
      tile.alt = '';
      tile.setAttribute('role', 'presentation');

      const cors = this.options.crossOrigin;
      if (cors || cors === '') {
        tile.crossOrigin = cors === true ? '' : cors;
      }

      const url = this.getTileUrl(coords);

      const hasActiveMap = () =>
        Boolean(this._map && (this._map as unknown as {_mapPane?: HTMLElement})._mapPane);

      const loadFromNetwork = () => {
        if (!hasActiveMap()) return;
        tile.onload = () => {
          if (hasActiveMap()) done(undefined, tile);
        };
        tile.onerror = () => {
          if (hasActiveMap()) done(new Error('Tile failed to load'), tile);
        };
        tile.src = url;
      };

      if (typeof caches === 'undefined') {
        loadFromNetwork();
        return tile;
      }

      void (async () => {
        try {
          const cache = await caches.open(OFFLINE_TILE_CACHE_NAME);
          if (!hasActiveMap()) return;
          const cached = await cache.match(url);
          if (!hasActiveMap()) return;

          if (cached && cached.type !== 'opaque') {
            const blob = await cached.blob();
            if (!hasActiveMap()) return;
            if (blob.size > 0) {
              const objectUrl = URL.createObjectURL(blob);
              tile.onload = () => {
                URL.revokeObjectURL(objectUrl);
                if (hasActiveMap()) done(undefined, tile);
              };
              tile.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                if (hasActiveMap()) done(new Error('Cached tile invalid'), tile);
              };
              tile.src = objectUrl;
              return;
            }
          }

          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            const upscaledDataUrl = await loadParentTileAsDataUrl(
              coords.z,
              coords.x,
              coords.y,
              cache,
            );
            if (!hasActiveMap()) return;
            if (upscaledDataUrl) {
              tile.onload = () => {
                if (hasActiveMap()) done(undefined, tile);
              };
              tile.onerror = () => {
                if (hasActiveMap()) done(new Error('Fallback tile invalid'), tile);
              };
              tile.src = upscaledDataUrl;
              return;
            }
            if (hasActiveMap()) done(new Error('Offline and tile not cached'), tile);
            return;
          }
        } catch {
          // Fall through to standard network tile loading
        }

        loadFromNetwork();
      })();

      return tile;
    },
  });

  return new (OfflineTileLayer as unknown as new (
    url: string,
    opts?: L.TileLayerOptions,
  ) => L.TileLayer)(urlTemplate, options);
}
