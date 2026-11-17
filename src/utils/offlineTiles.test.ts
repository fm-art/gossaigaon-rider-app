import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOSSAIGAON_OFFLINE_BOUNDS,
  buildOsmTileUrl,
  clearOfflineTileCache,
  downloadTilesToCache,
  formatBytesLabel,
  getCachedTileStats,
  getTilesForBounds,
  latToTileY,
  lonToTileX,
  type CacheLike,
  type CacheStorageLike,
} from './offlineTiles';

function createMockCacheStorage() {
  const store = new Map<string, Map<string, Response>>();

  const storage: CacheStorageLike = {
    async open(cacheName: string): Promise<CacheLike> {
      let bucket = store.get(cacheName);
      if (!bucket) {
        bucket = new Map<string, Response>();
        store.set(cacheName, bucket);
      }
      return {
        async match(req: string) {
          return bucket!.get(req);
        },
        async put(req: string, resp: Response) {
          bucket!.set(req, resp);
        },
        async keys() {
          return Array.from(bucket!.keys()).map((url) => ({url}));
        },
      };
    },
    async delete(cacheName: string) {
      return store.delete(cacheName);
    },
  };

  return {storage, store};
}

test('lonToTileX, latToTileY, and getTilesForBounds generate valid deduplicated Gossaigaon tiles across zoom 13-16', () => {
  const centerX15 = lonToTileX(89.9723, 15);
  const centerY15 = latToTileY(26.4524, 15);
  assert.ok(centerX15 > 24000 && centerX15 < 25000);
  assert.ok(centerY15 > 13000 && centerY15 < 15000);

  const tiles = getTilesForBounds(GOSSAIGAON_OFFLINE_BOUNDS, 13, 16);
  assert.ok(tiles.length > 40 && tiles.length < 150);

  const uniqueUrls = new Set(tiles.map((t) => t.url));
  assert.equal(uniqueUrls.size, tiles.length);

  // Center tile of Gossaigaon Bazar at z15 must be included
  const centerUrl15 = buildOsmTileUrl(15, centerX15, centerY15);
  assert.equal(uniqueUrls.has(centerUrl15), true);
});

test('downloadTilesToCache caches tiles, reuses existing entries, tracks progress, and clears cache', async () => {
  const {storage} = createMockCacheStorage();
  const sampleTiles = getTilesForBounds(GOSSAIGAON_OFFLINE_BOUNDS, 13, 14);
  let networkCalls = 0;

  const mockFetch = (async (input: RequestInfo | URL) => {
    networkCalls += 1;
    const url = String(input);
    if (url.includes('/14/')) {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: {'content-length': '4'},
      });
    }
    return new Response(new Uint8Array([5, 6]), {
      status: 200,
      headers: {'content-length': '2'},
    });
  }) as typeof fetch;

  const progressUpdates: number[] = [];
  const res1 = await downloadTilesToCache({
    tiles: sampleTiles,
    cacheStorage: storage,
    fetchFn: mockFetch,
    concurrency: 3,
    onProgress: (p) => progressUpdates.push(p.percent),
  });

  assert.equal(res1.cancelled, false);
  assert.equal(res1.failed, 0);
  assert.equal(res1.downloadedFromNetwork, sampleTiles.length);
  assert.equal(res1.reusedFromCache, 0);
  assert.equal(progressUpdates[progressUpdates.length - 1], 100);

  const stats = await getCachedTileStats(storage);
  assert.equal(stats.cachedCount, sampleTiles.length);

  // Second run without forceRefresh reuses cached tiles with 0 network calls
  networkCalls = 0;
  const res2 = await downloadTilesToCache({
    tiles: sampleTiles,
    cacheStorage: storage,
    fetchFn: mockFetch,
  });
  assert.equal(res2.reusedFromCache, sampleTiles.length);
  assert.equal(res2.downloadedFromNetwork, 0);
  assert.equal(networkCalls, 0);

  // Clear deletes cache
  const deleted = await clearOfflineTileCache(storage);
  assert.equal(deleted, true);
  const statsAfterClear = await getCachedTileStats(storage);
  assert.equal(statsAfterClear.cachedCount, 0);
});

test('downloadTilesToCache handles partial network failures and AbortController cancellation', async () => {
  const {storage} = createMockCacheStorage();
  const sampleTiles = getTilesForBounds(GOSSAIGAON_OFFLINE_BOUNDS, 13, 14);

  let idx = 0;
  const controller = new AbortController();
  const abortingFetch = (async () => {
    idx += 1;
    if (idx >= 2) {
      controller.abort();
      throw new Error('Aborted');
    }
    return new Response(new Uint8Array([1, 2, 3]), {status: 200});
  }) as typeof fetch;

  const abortedRes = await downloadTilesToCache({
    tiles: sampleTiles,
    cacheStorage: storage,
    fetchFn: abortingFetch,
    concurrency: 1,
    signal: controller.signal,
  });
  assert.equal(abortedRes.cancelled, true);

  // Partial HTTP failure counts failed tiles without throwing
  const partialFetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('/13/')) {
      return new Response('Rate limited', {status: 429});
    }
    return new Response(new Uint8Array([9, 9]), {status: 200});
  }) as typeof fetch;

  const partialRes = await downloadTilesToCache({
    tiles: sampleTiles,
    cacheStorage: storage,
    fetchFn: partialFetch,
    forceRefresh: true,
  });
  assert.ok(partialRes.failed > 0);
  assert.ok(partialRes.downloadedFromNetwork > 0);
  assert.equal(partialRes.completed, sampleTiles.length);

  assert.equal(formatBytesLabel(512), '512 B');
  assert.equal(formatBytesLabel(4096), '4 KB');
  assert.equal(formatBytesLabel(2 * 1024 * 1024), '2.0 MB');
});
