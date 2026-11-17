import {useEffect, useMemo, useRef, useState} from 'react';
import L from 'leaflet';
import {useOnlineStatus} from '../hooks/useOnlineStatus';
import type {OrderRecord, StoreInfo, ToastType, TripGroup} from '../types/rider';
import {createOrderHeatmapLayer} from '../utils/heatmapLayer';
import {createOfflineTileLayer} from '../utils/offlineTileLayer';
import {
  GOSSAIGAON_MAX_ZOOM,
  GOSSAIGAON_MIN_ZOOM,
  GOSSAIGAON_OFFLINE_BOUNDS,
  clearOfflineTileCache,
  downloadTilesToCache,
  formatBytesLabel,
  getCachedTileStats,
  getTilesForBounds,
  readOfflineMapMetadata,
  saveOfflineMapMetadata,
  type DownloadTilesProgress,
  type OfflineMapMetadata,
} from '../utils/offlineTiles';
import {
  buildOrderVolumeHeatmap,
  buildRiderMapPoints,
} from '../utils/riderLogic';
import {escapeHtml, getSafeMapsUrl} from '../utils/security';

interface MapViewTabProps {
  riderCurrentLat: number;
  riderCurrentLng: number;
  gpsSyncTime: string;
  stores: Record<string, StoreInfo>;
  activeTrips: TripGroup[];
  historicalOrders: Record<string, OrderRecord>;
  onRefreshGps: () => void;
  onNotify?: (msg: string, type?: ToastType) => void;
}

export function MapViewTab({
  riderCurrentLat,
  riderCurrentLng,
  gpsSyncTime,
  stores,
  activeTrips,
  historicalOrders,
  onRefreshGps,
  onNotify,
}: MapViewTabProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const heatmapGroupRef = useRef<L.LayerGroup | null>(null);
  const markerByIdRef = useRef<Record<string, L.Marker>>({});
  const hotspotCircleByIdRef = useRef<Record<string, L.Circle>>({});
  const hasFittedInitialBoundsRef = useRef(false);
  const focusPopupTimerRef = useRef<number | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);

  const isOnline = useOnlineStatus();
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [offlineMeta, setOfflineMeta] = useState<OfflineMapMetadata | null>(() =>
    readOfflineMapMetadata(),
  );
  const [cachedTileCount, setCachedTileCount] = useState<number>(
    () => readOfflineMapMetadata()?.tileCount || 0,
  );
  const [isDownloadingTiles, setIsDownloadingTiles] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadTilesProgress | null>(null);
  const [offlineStatusMessage, setOfflineStatusMessage] = useState<string | null>(null);

  const gossaigaonTilePack = useMemo(
    () => getTilesForBounds(GOSSAIGAON_OFFLINE_BOUNDS, GOSSAIGAON_MIN_ZOOM, GOSSAIGAON_MAX_ZOOM),
    [],
  );

  const mapData = useMemo(
    () => buildRiderMapPoints(riderCurrentLat, riderCurrentLng, stores, activeTrips),
    [riderCurrentLat, riderCurrentLng, stores, activeTrips],
  );

  const heatmapData = useMemo(
    () => buildOrderVolumeHeatmap(historicalOrders, stores),
    [historicalOrders, stores],
  );

  // Initialize Leaflet map once
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapInstanceRef.current) return;

    let disposed = false;
    const map = L.map(container, {
      center: [mapData.riderLat, mapData.riderLng],
      zoom: 15,
      zoomControl: true,
    });

    createOfflineTileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
      crossOrigin: 'anonymous',
    }).addTo(map);

    const heatmapGroup = L.layerGroup().addTo(map);
    const group = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    heatmapGroupRef.current = heatmapGroup;
    layerGroupRef.current = group;

    // Ensure Leaflet measures container properly after tab mount (guarded against unmount)
    const resizeTimer = window.setTimeout(() => {
      if (disposed || mapInstanceRef.current !== map || !container.isConnected) return;
      map.invalidateSize({animate: false});
    }, 50);

    return () => {
      disposed = true;
      window.clearTimeout(resizeTimer);
      if (focusPopupTimerRef.current !== null) {
        window.clearTimeout(focusPopupTimerRef.current);
        focusPopupTimerRef.current = null;
      }
      const internalMap = map as unknown as {
        _animatingZoom?: boolean;
        _onZoomTransitionEnd?: () => void;
        _animateZoom?: () => void;
        _move?: () => unknown;
        _moveStart?: () => unknown;
      };
      internalMap._animatingZoom = false;
      internalMap._onZoomTransitionEnd = () => undefined;
      internalMap._animateZoom = () => undefined;
      map.stop();
      internalMap._move = () => internalMap;
      internalMap._moveStart = () => internalMap;
      map.remove();
      mapInstanceRef.current = null;
      heatmapGroupRef.current = null;
      layerGroupRef.current = null;
      markerByIdRef.current = {};
      hotspotCircleByIdRef.current = {};
      hasFittedInitialBoundsRef.current = false;
      downloadAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile stored offline map metadata with live Cache Storage count on mount
  useEffect(() => {
    let active = true;
    void getCachedTileStats().then(({cachedCount}) => {
      if (!active) return;
      setCachedTileCount(cachedCount);
      if (cachedCount === 0 && offlineMeta) {
        setOfflineMeta(null);
        void clearOfflineTileCache();
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync historical order volume heatmap overlay
  useEffect(() => {
    const map = mapInstanceRef.current;
    const heatGroup = heatmapGroupRef.current;
    if (!map || !heatGroup) return;

    heatGroup.clearLayers();
    hotspotCircleByIdRef.current = {};

    if (!showHeatmap || heatmapData.points.length === 0) return;

    const canvasLayer = createOrderHeatmapLayer(heatmapData.points);
    canvasLayer.addTo(heatGroup);

    heatmapData.points.forEach((pt) => {
      const ringColor =
        pt.weight >= 0.7 ? '#ef4444' : pt.weight >= 0.4 ? '#f59e0b' : '#38bdf8';
      const tierLabel =
        pt.weight >= 0.7
          ? '🔥 HIGH ORDER VOLUME'
          : pt.weight >= 0.4
            ? '⚡ BUSY ZONE'
            : '📍 ACTIVE ZONE';

      const circle = L.circle([pt.lat, pt.lng], {
        radius: 135,
        color: ringColor,
        weight: 1,
        opacity: 0.45,
        dashArray: '4 4',
        fillColor: ringColor,
        fillOpacity: 0.04,
      }).addTo(heatGroup);

      circle.bindPopup(
        `<div>
          <span style="color:${ringColor};font-weight:800;">${tierLabel}</span><br/>
          <strong style="font-size:0.86rem;">${escapeHtml(pt.areaLabel)}</strong><br/>
          <span style="color:#e2e8f0;font-weight:700;">${pt.orderCount} ${
            pt.orderCount === 1 ? 'Order' : 'Orders'
          }</span>
          <span style="color:#94a3b8;"> • ₹${pt.totalValue.toFixed(0)} Volume</span>
        </div>`,
      );
      hotspotCircleByIdRef.current[pt.id] = circle;
    });
  }, [heatmapData, showHeatmap]);

  // Sync markers and active route polyline when GPS, stores, or trips update
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    markerByIdRef.current = {};

    // Active route polyline
    if (mapData.routePoints.length > 1) {
      L.polyline(mapData.routePoints, {
        color: '#38bdf8',
        weight: 4,
        opacity: 0.85,
        dashArray: '8 6',
      }).addTo(group);
    }

    // Rider live GPS marker
    const riderIcon = L.divIcon({
      className: '',
      html: `<div class="rider-gps-pulse" title="Your Live GPS"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    const riderMarker = L.marker([mapData.riderLat, mapData.riderLng], {
      icon: riderIcon,
      zIndexOffset: 500,
    }).addTo(group);
    riderMarker.bindPopup(
      `<div><strong style="color:#34d399;">🛵 Your Live GPS</strong><br/><span style="color:#94a3b8;">${mapData.riderLat.toFixed(
        5,
      )}, ${mapData.riderLng.toFixed(5)}</span></div>`,
    );
    markerByIdRef.current['rider'] = riderMarker;

    // Delivery store markers
    mapData.storeMarkers.forEach((store) => {
      const badgeBg = store.isPickedUp
        ? '#10b981'
        : store.isAssignedStop
          ? '#f59e0b'
          : '#38bdf8';
      const badgeTextColor = store.isAssignedStop && !store.isPickedUp ? '#000' : '#fff';
      const storeIcon = L.divIcon({
        className: '',
        html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:10px;background:${badgeBg};color:${badgeTextColor};border:2px solid #050811;box-shadow:0 4px 12px rgba(0,0,0,0.5);font-size:13px;"><i class="fa-solid fa-store"></i></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([store.lat, store.lng], {
        icon: storeIcon,
        zIndexOffset: store.isAssignedStop ? 300 : 100,
      }).addTo(group);

      const safeName = escapeHtml(store.name);
      const safeAddr = escapeHtml(store.address);
      const safeStoreMapsUrl = escapeHtml(
        getSafeMapsUrl(store.mapsUrl, store.lat, store.lng, store.address),
      );
      const statusLabel = store.isPickedUp
        ? '<span style="color:#34d399;font-weight:800;">✓ PICKED UP</span>'
        : store.isAssignedStop
          ? '<span style="color:#fbbf24;font-weight:800;">⚡ ASSIGNED PICKUP</span>'
          : '<span style="color:#38bdf8;font-weight:800;">DELIVERY STORE</span>';

      marker.bindPopup(
        `<div>
          ${statusLabel}<br/>
          <strong style="font-size:0.86rem;">${safeName}</strong><br/>
          <span style="color:#94a3b8;">${safeAddr}</span><br/>
          ${store.distanceKm !== null ? `<span style="color:#38bdf8;font-weight:700;">~${store.distanceKm.toFixed(2)} km away</span><br/>` : ''}
          <a href="${safeStoreMapsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;padding:4px 8px;border-radius:8px;background:#2563eb;color:#fff;font-weight:800;text-decoration:none;">Navigate in Maps</a>
        </div>`,
      );
      markerByIdRef.current[`store:${store.storeId}`] = marker;
    });

    // Customer destination markers
    mapData.customerMarkers.forEach((cust) => {
      const custIcon = L.divIcon({
        className: '',
        html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#16a34a;color:#fff;border:2px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.5);font-size:13px;"><i class="fa-solid fa-house"></i></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([cust.lat, cust.lng], {
        icon: custIcon,
        zIndexOffset: 250,
      }).addTo(group);

      const safeAddr = escapeHtml(cust.address);
      const safeCustMapsUrl = escapeHtml(
        getSafeMapsUrl(cust.mapsUrl, cust.lat, cust.lng, cust.address),
      );
      marker.bindPopup(
        `<div>
          <span style="color:#34d399;font-weight:800;">🏠 CUSTOMER DROPOFF (#${escapeHtml(cust.tripId.slice(-6))})</span><br/>
          <strong style="font-size:0.84rem;">${safeAddr}</strong><br/>
          ${cust.distanceKm !== null ? `<span style="color:#34d399;font-weight:700;">~${cust.distanceKm.toFixed(2)} km away</span><br/>` : ''}
          <a href="${safeCustMapsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;padding:4px 8px;border-radius:8px;background:#16a34a;color:#fff;font-weight:800;text-decoration:none;">Doorstep Maps</a>
        </div>`,
      );
      markerByIdRef.current[`cust:${cust.tripId}`] = marker;
    });

    if (
      !hasFittedInitialBoundsRef.current &&
      mapData.boundsPoints.length > 1 &&
      map.getContainer()?.isConnected &&
      Boolean((map as unknown as {_mapPane?: HTMLElement})._mapPane)
    ) {
      map.fitBounds(mapData.boundsPoints, {padding: [36, 36], maxZoom: 16});
      hasFittedInitialBoundsRef.current = true;
    }
  }, [mapData]);

  const isMapAlive = (map: L.Map | null): map is L.Map =>
    Boolean(
      map &&
        mapInstanceRef.current === map &&
        map.getContainer()?.isConnected &&
        (map as unknown as {_mapPane?: HTMLElement})._mapPane,
    );

  const handleRecenterGps = () => {
    onRefreshGps();
    const map = mapInstanceRef.current;
    if (!isMapAlive(map)) return;
    map.flyTo([mapData.riderLat, mapData.riderLng], 16, {duration: 0.5});
    markerByIdRef.current['rider']?.openPopup();
  };

  const handleFitAllStops = () => {
    const map = mapInstanceRef.current;
    if (!isMapAlive(map)) return;
    const allPts: Array<[number, number]> = [
      ...mapData.boundsPoints,
      ...(showHeatmap ? heatmapData.points.map((p) => [p.lat, p.lng] as [number, number]) : []),
    ];
    if (allPts.length > 1) {
      map.fitBounds(allPts, {padding: [36, 36], maxZoom: 16});
    } else {
      map.flyTo([mapData.riderLat, mapData.riderLng], 15, {duration: 0.5});
    }
  };

  const focusMarker = (key: string, lat: number, lng: number) => {
    const map = mapInstanceRef.current;
    if (!isMapAlive(map)) return;
    mapContainerRef.current?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    map.flyTo([lat, lng], 16, {duration: 0.45});
    markerByIdRef.current[key]?.openPopup();
  };

  const focusHotspot = (hotspotId: string, lat: number, lng: number) => {
    if (!showHeatmap) setShowHeatmap(true);
    const map = mapInstanceRef.current;
    if (!isMapAlive(map)) return;
    mapContainerRef.current?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    map.flyTo([lat, lng], 16, {duration: 0.45});
    if (focusPopupTimerRef.current !== null) {
      window.clearTimeout(focusPopupTimerRef.current);
    }
    focusPopupTimerRef.current = window.setTimeout(() => {
      focusPopupTimerRef.current = null;
      if (!isMapAlive(map)) return;
      hotspotCircleByIdRef.current[hotspotId]?.openPopup();
    }, 120);
  };

  const handleDownloadOfflineMap = async () => {
    if (isDownloadingTiles) return;
    if (!isOnline) {
      const msg = 'Connect to the internet first to download Gossaigaon offline map tiles.';
      setOfflineStatusMessage(msg);
      onNotify?.(msg, 'warning');
      return;
    }

    const controller = new AbortController();
    downloadAbortRef.current = controller;
    setIsDownloadingTiles(true);
    setOfflineStatusMessage(null);
    setDownloadProgress({
      completed: 0,
      total: gossaigaonTilePack.length,
      downloadedFromNetwork: 0,
      reusedFromCache: 0,
      failed: 0,
      bytesApprox: 0,
      percent: 0,
    });

    try {
      const result = await downloadTilesToCache({
        tiles: gossaigaonTilePack,
        concurrency: 4,
        signal: controller.signal,
        onProgress: (p) => setDownloadProgress(p),
      });

      const {cachedCount} = await getCachedTileStats();
      setCachedTileCount(cachedCount);

      if (result.cancelled) {
        setOfflineStatusMessage(`Download paused (${cachedCount} tiles currently saved offline).`);
        return;
      }

      const successfulCount = result.downloadedFromNetwork + result.reusedFromCache;
      if (successfulCount > 0) {
        const meta: OfflineMapMetadata = {
          areaName: 'Gossaigaon Bazar & Town',
          tileCount: cachedCount || successfulCount,
          totalExpected: gossaigaonTilePack.length,
          bytesApprox: result.bytesApprox,
          minZoom: GOSSAIGAON_MIN_ZOOM,
          maxZoom: GOSSAIGAON_MAX_ZOOM,
          updatedAt: Date.now(),
        };
        saveOfflineMapMetadata(meta);
        setOfflineMeta(meta);
      }

      if (result.failed > 0) {
        const msg = `Saved ${successfulCount}/${result.total} tiles (${result.failed} skipped due to network).`;
        setOfflineStatusMessage(msg);
        onNotify?.(msg, successfulCount > 0 ? 'warning' : 'danger');
      } else {
        const msg = `Gossaigaon offline map ready (${cachedCount || successfulCount} tiles cached).`;
        setOfflineStatusMessage(msg);
        onNotify?.(msg, 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to download offline tiles.';
      setOfflineStatusMessage(msg);
      onNotify?.(msg, 'danger');
    } finally {
      downloadAbortRef.current = null;
      setIsDownloadingTiles(false);
    }
  };

  const handleCancelOfflineDownload = () => {
    downloadAbortRef.current?.abort();
  };

  const handleClearOfflineMap = async () => {
    await clearOfflineTileCache();
    setOfflineMeta(null);
    setCachedTileCount(0);
    setDownloadProgress(null);
    setOfflineStatusMessage('Offline Gossaigaon map tiles cleared.');
    onNotify?.('Offline map cache cleared.', 'info');
  };

  return (
    <div id="tab-map" className="tab-view active">
      <div className="section-header-row" style={{marginBottom: '0.65rem'}}>
        <div>
          <h3 className="section-title">Live Fleet Map</h3>
          <div className="tabular-nums" style={{fontSize: '0.72rem', color: 'var(--text-muted)'}}>
            {mapData.riderLat.toFixed(4)}, {mapData.riderLng.toFixed(4)} · {gpsSyncTime}
          </div>
        </div>
        <span data-testid="map-stores-badge" className="section-meta-count">
          {mapData.storeMarkers.length} Stores
        </span>
      </div>

      <div style={{display: 'flex', gap: '6px', marginBottom: '0.7rem'}}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          style={{flex: 1, whiteSpace: 'nowrap'}}
          onClick={handleRecenterGps}
        >
          <i className="fa-solid fa-crosshairs" /> My GPS
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{flex: 1, borderColor: 'rgba(56, 189, 248, 0.4)', color: '#7dd3fc', whiteSpace: 'nowrap'}}
          onClick={handleFitAllStops}
        >
          <i className="fa-solid fa-expand" /> Fit All
        </button>
        <button
          type="button"
          data-testid="toggle-heatmap-btn"
          aria-pressed={showHeatmap}
          className="btn btn-outline btn-sm"
          style={{
            flex: 1.1,
            whiteSpace: 'nowrap',
            borderColor: showHeatmap ? 'rgba(245, 158, 11, 0.55)' : 'var(--border)',
            background: showHeatmap ? 'rgba(245, 158, 11, 0.14)' : 'transparent',
            color: showHeatmap ? '#fbbf24' : 'var(--text-muted)',
          }}
          onClick={() => setShowHeatmap((prev) => !prev)}
        >
          <i className="fa-solid fa-fire" /> {showHeatmap ? 'Heat ON' : 'Heat OFF'}
        </button>
      </div>

      <div
        ref={mapContainerRef}
        data-testid="leaflet-map-container"
        className="rider-leaflet-container"
        aria-label="Interactive delivery stores, rider GPS, and order volume heatmap"
      />

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          justifyContent: 'center',
          alignItems: 'center',
          margin: '0.65rem 0 0.9rem',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: 'var(--text-muted)',
        }}
      >
        <span style={{display: 'inline-flex', alignItems: 'center', gap: '5px'}}>
          <span style={{width: '9px', height: '9px', borderRadius: '50%', background: '#16a34a', border: '1.5px solid #fff'}} />
          You
        </span>
        <span style={{display: 'inline-flex', alignItems: 'center', gap: '5px'}}>
          <span style={{width: '9px', height: '9px', borderRadius: '3px', background: '#f59e0b'}} />
          Assigned
        </span>
        <span style={{display: 'inline-flex', alignItems: 'center', gap: '5px'}}>
          <span style={{width: '9px', height: '9px', borderRadius: '3px', background: '#38bdf8'}} />
          Store
        </span>
        <span style={{display: 'inline-flex', alignItems: 'center', gap: '5px'}}>
          <span style={{width: '9px', height: '9px', borderRadius: '50%', background: '#16a34a'}} />
          Customer
        </span>
        {showHeatmap && (
          <span
            data-testid="heatmap-legend"
            style={{display: 'inline-flex', alignItems: 'center', gap: '5px'}}
          >
            <span>Low</span>
            <span
              style={{
                width: '44px',
                height: '6px',
                borderRadius: '999px',
                background: 'linear-gradient(90deg, #38bdf8, #22c55e, #f59e0b, #ef4444)',
              }}
            />
            <span style={{color: '#fca5a5'}}>High</span>
          </span>
        )}
      </div>

      <div className="responsive-grid-2" style={{marginBottom: '1rem'}}>
        {/* Offline Map Tile Cache (Gossaigaon Area) */}
        <div
          data-testid="offline-map-card"
          className="surface-card"
          style={{
            marginBottom: 0,
            borderColor:
              !isOnline && cachedTileCount > 0
                ? 'rgba(245, 158, 11, 0.45)'
                : cachedTileCount > 0
                  ? 'rgba(56, 189, 248, 0.32)'
                  : undefined,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '8px',
              marginBottom: '0.55rem',
            }}
          >
            <div>
              <h4 style={{fontSize: '0.9rem', fontWeight: 800, color: '#38bdf8'}}>
                <i className="fa-solid fa-cloud-arrow-down" style={{marginRight: '6px'}} />
                Offline Map (Gossaigaon)
              </h4>
              <div style={{fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px'}}>
                {isOnline
                  ? `Zoom ${GOSSAIGAON_MIN_ZOOM}–${GOSSAIGAON_MAX_ZOOM} town tiles for low-network routes`
                  : cachedTileCount > 0
                    ? 'Offline mode active · Serving cached town tiles'
                    : 'Offline mode · Connect once to cache town tiles'}
              </div>
            </div>

            <span
              data-testid="offline-map-badge"
              className="tabular-nums"
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: cachedTileCount > 0 ? '#34d399' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {cachedTileCount > 0
                ? `${cachedTileCount}/${gossaigaonTilePack.length} Tiles`
                : 'Not Cached'}
            </span>
          </div>

          {offlineMeta && cachedTileCount > 0 && !isDownloadingTiles && (
            <div
              data-testid="offline-map-meta"
              className="tabular-nums"
              style={{
                fontSize: '0.72rem',
                color: '#cbd5e1',
                marginBottom: '0.6rem',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span>{formatBytesLabel(offlineMeta.bytesApprox)} stored</span>
              <span style={{color: 'var(--text-muted)'}}>
                Updated {new Date(offlineMeta.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
              </span>
            </div>
          )}

          {isDownloadingTiles && downloadProgress && (
            <div data-testid="offline-download-progress" style={{marginBottom: '0.6rem'}}>
              <div
                className="tabular-nums"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#7dd3fc',
                  marginBottom: '4px',
                }}
              >
                <span>
                  Caching tiles ({downloadProgress.completed}/{downloadProgress.total})
                </span>
                <span>{downloadProgress.percent}%</span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '5px',
                  borderRadius: '999px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${downloadProgress.percent}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #38bdf8, #34d399)',
                    transition: 'width 0.15s ease',
                  }}
                />
              </div>
            </div>
          )}

          {offlineStatusMessage && (
            <div
              data-testid="offline-map-status"
              style={{
                fontSize: '0.72rem',
                color: offlineStatusMessage.includes('Connect') || offlineStatusMessage.includes('Failed')
                  ? '#fca5a5'
                  : '#a7f3d0',
                marginBottom: '0.55rem',
                lineHeight: 1.35,
              }}
            >
              {offlineStatusMessage}
            </div>
          )}

          <div style={{display: 'flex', gap: '8px'}}>
            {isDownloadingTiles ? (
              <button
                type="button"
                data-testid="cancel-offline-download-btn"
                className="btn btn-outline btn-sm"
                style={{
                  flex: 1,
                  borderColor: 'rgba(239, 68, 68, 0.45)',
                  color: '#fca5a5',
                }}
                onClick={handleCancelOfflineDownload}
              >
                <i className="fa-solid fa-xmark" /> Cancel Download
              </button>
            ) : (
              <>
                <button
                  type="button"
                  data-testid="download-offline-map-btn"
                  className="btn btn-info btn-sm"
                  style={{flex: 1}}
                  onClick={() => void handleDownloadOfflineMap()}
                >
                  <i className="fa-solid fa-download" />{' '}
                  {cachedTileCount > 0
                    ? `Update Map (${gossaigaonTilePack.length} tiles)`
                    : `Download Map (${gossaigaonTilePack.length} tiles)`}
                </button>
                {cachedTileCount > 0 && (
                  <button
                    type="button"
                    data-testid="clear-offline-map-btn"
                    aria-label="Clear cached offline map tiles"
                    className="btn btn-outline btn-sm"
                    style={{
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      color: '#fca5a5',
                      flexShrink: 0,
                    }}
                    onClick={() => void handleClearOfflineMap()}
                  >
                    <i className="fa-solid fa-trash" /> Clear
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* High Order Volume Hotspots (Historical Orders) */}
        <div className="surface-card" style={{marginBottom: 0}}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '0.55rem',
            }}
          >
            <div>
              <h4 style={{fontSize: '0.9rem', fontWeight: 800, color: '#fbbf24'}}>
                <i className="fa-solid fa-fire" style={{marginRight: '6px'}} />
                High Order Volume Zones
              </h4>
              <div className="tabular-nums" style={{fontSize: '0.72rem', color: 'var(--text-muted)'}}>
                From {heatmapData.totalOrdersAnalyzed} historical orders
              </div>
            </div>
            <span data-testid="heatmap-zones-badge" className="section-meta-count">
              {heatmapData.topHotspots.length} Zones
            </span>
          </div>

          {heatmapData.topHotspots.length === 0 ? (
            <p style={{fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0}}>
              No historical delivered orders with GPS coordinates yet.
            </p>
          ) : (
            <div data-testid="heatmap-hotspots-list">
              {heatmapData.topHotspots.slice(0, 5).map((zone, idx) => {
                const isHot = zone.weight >= 0.7;
                const isBusy = zone.weight >= 0.4 && zone.weight < 0.7;
                const tierColor = isHot ? '#f87171' : isBusy ? '#fbbf24' : '#38bdf8';
                const tierText = isHot ? 'HOT' : isBusy ? 'BUSY' : 'WARM';
                return (
                  <div
                    key={zone.id}
                    data-testid={`hotspot-row-${zone.id}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '0.5rem 0',
                      borderTop: idx > 0 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                    }}
                  >
                    <div style={{minWidth: 0}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            color: tierColor,
                            flexShrink: 0,
                          }}
                        >
                          {tierText}
                        </span>
                        <strong
                          style={{
                            fontSize: '0.82rem',
                            color: '#f8fafc',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {zone.areaLabel}
                        </strong>
                      </div>
                      <div className="tabular-nums" style={{fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px'}}>
                        {zone.orderCount} {zone.orderCount === 1 ? 'order' : 'orders'} · ₹
                        {zone.totalValue.toFixed(0)} value
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      aria-label={`Locate ${zone.areaLabel} hotspot`}
                      style={{flexShrink: 0, borderColor: `${tierColor}55`, color: tierColor}}
                      onClick={() => focusHotspot(zone.id, zone.lat, zone.lng)}
                    >
                      <i className="fa-solid fa-location-crosshairs" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Customer Dropoff Stops */}
      {mapData.customerMarkers.length > 0 && (
        <div className="surface-card">
          <h4 style={{fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.55rem', color: '#34d399'}}>
            <i className="fa-solid fa-house" style={{marginRight: '6px'}} />
            Active Customer Dropoffs
          </h4>
          {mapData.customerMarkers.map((cust, idx) => (
            <div
              key={cust.tripId}
              style={{
                borderTop: idx > 0 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                padding: '0.6rem 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <div style={{minWidth: 0}}>
                <strong className="tabular-nums" style={{fontSize: '0.86rem', display: 'block', color: '#fff'}}>
                  Trip #{cust.tripId.slice(-6)}
                </strong>
                <div style={{fontSize: '0.76rem', color: 'var(--text-muted)'}}>{cust.address}</div>
                {cust.distanceKm !== null && (
                  <div className="tabular-nums" style={{fontSize: '0.72rem', color: '#34d399', fontWeight: 700, marginTop: '2px'}}>
                    ~{cust.distanceKm.toFixed(1)} km away
                  </div>
                )}
              </div>
              <div style={{display: 'flex', gap: '6px', flexShrink: 0}}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  aria-label={`Locate Trip #${cust.tripId.slice(-6)} on map`}
                  onClick={() => focusMarker(`cust:${cust.tripId}`, cust.lat, cust.lng)}
                >
                  <i className="fa-solid fa-location-crosshairs" />
                </button>
                <a
                  href={getSafeMapsUrl(cust.mapsUrl, cust.lat, cust.lng, cust.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="action-btn-sm map-customer"
                >
                  <i className="fa-solid fa-diamond-turn-right" /> Go
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delivery Stores Directory */}
      <div className="surface-card" style={{marginBottom: 0}}>
        <h4 style={{fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.55rem'}}>
          <i className="fa-solid fa-store" style={{color: '#38bdf8', marginRight: '6px'}} />
          Delivery Stores ({mapData.storeMarkers.length})
        </h4>
        {mapData.storeMarkers.length === 0 ? (
          <p style={{color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.5rem 0'}}>
            No stores with GPS coordinates available yet.
          </p>
        ) : (
          mapData.storeMarkers.map((store, idx) => (
            <div
              key={store.storeId}
              style={{
                borderTop: idx > 0 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                padding: '0.6rem 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <div style={{minWidth: 0}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap'}}>
                  <strong style={{fontSize: '0.88rem', color: '#fff'}}>{store.name}</strong>
                  {store.isAssignedStop && (
                    <span
                      className={`stop-badge ${
                        store.isPickedUp ? 'stop-badge-green' : 'stop-badge-blue'
                      }`}
                      style={{marginBottom: 0}}
                    >
                      · {store.isPickedUp ? 'Picked Up' : 'Active Pickup'}
                    </span>
                  )}
                </div>
                <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px'}}>
                  {store.address}
                </div>
                {store.distanceKm !== null && (
                  <div className="tabular-nums" style={{fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700, marginTop: '2px'}}>
                    ~{store.distanceKm.toFixed(1)} km away
                  </div>
                )}
              </div>

              <div style={{display: 'flex', gap: '6px', flexShrink: 0}}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  aria-label={`Locate ${store.name} on map`}
                  onClick={() => focusMarker(`store:${store.storeId}`, store.lat, store.lng)}
                >
                  <i className="fa-solid fa-location-crosshairs" />
                </button>
                <a
                  href={getSafeMapsUrl(store.mapsUrl, store.lat, store.lng, store.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="action-btn-sm map-store"
                >
                  <i className="fa-solid fa-diamond-turn-right" /> Maps
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
