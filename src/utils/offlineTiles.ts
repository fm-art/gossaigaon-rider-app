export const OFFLINE_TILE_CACHE_NAME = 'gossaigaon-osm-tiles-v1';
export const OFFLINE_MAP_META_STORAGE_KEY = 'gbz_offline_map_meta_v1';

export interface GeoBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export const GOSSAIGAON_OFFLINE_BOUNDS: GeoBounds = {
  south: 26.436,
  west: 89.952,
  north: 26.47,
  east: 89.994,
};

export const GOSSAIGAON_MIN_ZOOM = 13;
export const GOSSAIGAON_MAX_ZOOM = 16;

export interface TileCoord {
  z: number;
  x: number;
  y: number;
  url: string;
}

export interface OfflineMapMetadata {
  areaName: string;
  tileCount: number;
  totalExpected: number;
  bytesApprox: number;
  minZoom: number;
  maxZoom: number;
  updatedAt: number;
}

export interface DownloadTilesProgress {
  completed: number;
  total: number;
  downloadedFromNetwork: number;
  reusedFromCache: number;
  failed: number;
  bytesApprox: number;
  percent: number;
}

export interface DownloadTilesResult extends DownloadTilesProgress {
  cancelled: boolean;
}

export interface CacheLike {
  match: (request: string) => Promise<Response | undefined>;
  put: (request: string, response: Response) => Promise<void>;
  keys: () => Promise<readonly {url: string}[]>;
}

export interface CacheStorageLike {
  open: (cacheName: string) => Promise<CacheLike>;
  delete: (cacheName: string) => Promise<boolean>;
}

export function lonToTileX(lon: number, zoom: number): number {
  const n = 2 ** zoom;
  const raw = Math.floor(((lon + 180) / 360) * n);
  return Math.max(0, Math.min(n - 1, raw));
}

export function latToTileY(lat: number, zoom: number): number {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const n = 2 ** zoom;
  const raw = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return Math.max(0, Math.min(n - 1, raw));
}

export function buildOsmTileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

export function getTilesForBounds(
  bounds: GeoBounds = GOSSAIGAON_OFFLINE_BOUNDS,
  minZoom = GOSSAIGAON_MIN_ZOOM,
  maxZoom = GOSSAIGAON_MAX_ZOOM,
): TileCoord[] {
  const startZ = Math.max(0, Math.min(19, Math.floor(minZoom)));
  const endZ = Math.max(startZ, Math.min(19, Math.floor(maxZoom)));
  const tiles: TileCoord[] = [];

  for (let z = startZ; z <= endZ; z++) {
    const xMin = Math.min(lonToTileX(bounds.west, z), lonToTileX(bounds.east, z));
    const xMax = Math.max(lonToTileX(bounds.west, z), lonToTileX(bounds.east, z));
    const yMin = Math.min(latToTileY(bounds.north, z), latToTileY(bounds.south, z));
    const yMax = Math.max(latToTileY(bounds.north, z), latToTileY(bounds.south, z));

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({
          z,
          x,
          y,
          url: buildOsmTileUrl(z, x, y),
        });
      }
    }
  }

  return tiles;
}

export function formatBytesLabel(bytes: number): string {
  const clean = Math.max(0, Number(bytes) || 0);
  if (clean < 1024) return `${clean} B`;
  if (clean < 1024 * 1024) return `${(clean / 1024).toFixed(0)} KB`;
  return `${(clean / (1024 * 1024)).toFixed(1)} MB`;
}

export async function downloadTilesToCache(options: {
  tiles?: TileCoord[];
  cacheStorage?: CacheStorageLike;
  fetchFn?: typeof fetch;
  concurrency?: number;
  forceRefresh?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: DownloadTilesProgress) => void;
}): Promise<DownloadTilesResult> {
  const tiles = options.tiles ?? getTilesForBounds();
  const storage: CacheStorageLike | undefined =
    options.cacheStorage ?? (typeof caches !== 'undefined' ? (caches as unknown as CacheStorageLike) : undefined);
  const fetchFn: typeof fetch | undefined =
    options.fetchFn ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);

  if (!storage || !fetchFn) {
    throw new Error('Browser Cache Storage is unavailable in this environment.');
  }

  const cache = await storage.open(OFFLINE_TILE_CACHE_NAME);
  const total = tiles.length;
  const workerCount = Math.max(1, Math.min(6, options.concurrency ?? 4));

  let cursor = 0;
  let completed = 0;
  let downloadedFromNetwork = 0;
  let reusedFromCache = 0;
  let failed = 0;
  let bytesApprox = 0;

  const emitProgress = () => {
    options.onProgress?.({
      completed,
      total,
      downloadedFromNetwork,
      reusedFromCache,
      failed,
      bytesApprox,
      percent: total > 0 ? Math.round((completed / total) * 100) : 100,
    });
  };

  emitProgress();

  const runWorker = async () => {
    while (cursor < tiles.length) {
      if (options.signal?.aborted) return;
      const tile = tiles[cursor++];
      if (!tile) break;

      try {
        if (!options.forceRefresh) {
          const existing = await cache.match(tile.url);
          if (existing && existing.type !== 'opaque' && existing.ok) {
            const sizeHeader = Number(existing.headers?.get('content-length') || 0);
            bytesApprox += sizeHeader > 0 ? sizeHeader : 18 * 1024;
            reusedFromCache += 1;
            completed += 1;
            emitProgress();
            continue;
          }
        }

        const resp = await fetchFn(tile.url, {
          mode: 'cors',
          credentials: 'omit',
          signal: options.signal,
        });
        if (!resp.ok || resp.type === 'opaque') {
          failed += 1;
        } else {
          const clone = resp.clone();
          const lenHeader = Number(resp.headers?.get('content-length') || 0);
          if (lenHeader > 0) {
            bytesApprox += lenHeader;
          } else {
            try {
              const buf = await resp.arrayBuffer();
              bytesApprox += buf.byteLength || 18 * 1024;
            } catch {
              bytesApprox += 18 * 1024;
            }
          }
          await cache.put(tile.url, clone);
          downloadedFromNetwork += 1;
        }
      } catch {
        if (options.signal?.aborted) return;
        failed += 1;
      }

      completed += 1;
      emitProgress();
    }
  };

  await Promise.all(Array.from({length: workerCount}, () => runWorker()));

  return {
    completed,
    total,
    downloadedFromNetwork,
    reusedFromCache,
    failed,
    bytesApprox,
    percent: total > 0 ? Math.round((completed / total) * 100) : 100,
    cancelled: Boolean(options.signal?.aborted),
  };
}

export async function getCachedTileStats(
  cacheStorage?: CacheStorageLike,
): Promise<{cachedCount: number}> {
  const storage: CacheStorageLike | undefined =
    cacheStorage ?? (typeof caches !== 'undefined' ? (caches as unknown as CacheStorageLike) : undefined);
  if (!storage) return {cachedCount: 0};
  try {
    const cache = await storage.open(OFFLINE_TILE_CACHE_NAME);
    const keys = await cache.keys();
    return {cachedCount: keys.length};
  } catch {
    return {cachedCount: 0};
  }
}

export async function clearOfflineTileCache(cacheStorage?: CacheStorageLike): Promise<boolean> {
  const storage: CacheStorageLike | undefined =
    cacheStorage ?? (typeof caches !== 'undefined' ? (caches as unknown as CacheStorageLike) : undefined);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(OFFLINE_MAP_META_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  if (!storage) return false;
  try {
    return await storage.delete(OFFLINE_TILE_CACHE_NAME);
  } catch {
    return false;
  }
}

export function readOfflineMapMetadata(): OfflineMapMetadata | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(OFFLINE_MAP_META_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OfflineMapMetadata>;
    if (typeof parsed.tileCount !== 'number') return null;
    return {
      areaName: parsed.areaName || 'Gossaigaon',
      tileCount: parsed.tileCount,
      totalExpected: Number(parsed.totalExpected || parsed.tileCount),
      bytesApprox: Number(parsed.bytesApprox || 0),
      minZoom: Number(parsed.minZoom || GOSSAIGAON_MIN_ZOOM),
      maxZoom: Number(parsed.maxZoom || GOSSAIGAON_MAX_ZOOM),
      updatedAt: Number(parsed.updatedAt || Date.now()),
    };
  } catch {
    return null;
  }
}

export function saveOfflineMapMetadata(meta: OfflineMapMetadata): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(OFFLINE_MAP_META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // ignore storage quota errors
  }
}
