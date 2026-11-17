import {memo, useMemo, useState} from 'react';
import type {StoreInfo, TripGroup} from '../types/rider';
import {buildDeliveredHistoryEntries} from '../utils/riderLogic';

interface HistoryTabProps {
  completedTrips: TripGroup[];
  stores: Record<string, StoreInfo>;
  baseRiderFeePerTrip: number;
}

export const HistoryTab = memo(function HistoryTab({
  completedTrips,
  stores,
  baseRiderFeePerTrip,
}: HistoryTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'COD' | 'UPI' | 'WALLET'>('ALL');

  const allEntries = useMemo(
    () => buildDeliveredHistoryEntries(completedTrips, stores, baseRiderFeePerTrip),
    [completedTrips, stores, baseRiderFeePerTrip],
  );

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allEntries.filter((entry) => {
      if (paymentFilter !== 'ALL' && entry.paymentMode.toUpperCase() !== paymentFilter) {
        return false;
      }
      if (!q) return true;
      return (
        entry.shortId.toLowerCase().includes(q) ||
        entry.customerLocation.toLowerCase().includes(q) ||
        entry.storeNames.some((name) => name.toLowerCase().includes(q))
      );
    });
  }, [allEntries, searchQuery, paymentFilter]);

  const totals = useMemo(
    () =>
      filteredEntries.reduce(
        (acc, e) => ({
          earnings: acc.earnings + e.totalEarnings,
          bill: acc.bill + e.totalBillAmount,
        }),
        {earnings: 0, bill: 0},
      ),
    [filteredEntries],
  );

  return (
    <div id="tab-history" className="tab-view active">
      <div className="section-header-row">
        <h3 className="section-title">Delivered History</h3>
        <span data-testid="history-count-badge" className="section-meta-count">
          {filteredEntries.length} Delivered
        </span>
      </div>

      {/* Summary Strip */}
      <div className="cash-hero-card" style={{padding: '0.95rem 1.05rem', marginBottom: '0.85rem'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px'}}>
          <div>
            <span
              style={{
                fontSize: '0.68rem',
                color: '#38bdf8',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              Total Trip Earnings
            </span>
            <div
              data-testid="history-total-earnings"
              className="tabular-nums"
              style={{fontSize: '1.55rem', fontWeight: 800, color: '#34d399'}}
            >
              ₹{totals.earnings.toFixed(2)}
            </div>
          </div>
          <div style={{textAlign: 'right'}}>
            <span
              style={{
                fontSize: '0.68rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              Order Volume
            </span>
            <div className="tabular-nums" style={{fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc'}}>
              ₹{totals.bill.toFixed(0)}
            </div>
            <div className="tabular-nums" style={{fontSize: '0.72rem', color: 'var(--text-muted)'}}>
              {filteredEntries.length} {filteredEntries.length === 1 ? 'trip' : 'trips'}
            </div>
          </div>
        </div>
      </div>

      {/* Search & Payment Filter */}
      <div style={{marginBottom: '0.9rem'}}>
        <input
          type="search"
          aria-label="Search delivered trips"
          className="form-input"
          placeholder="Search restaurant, location, or trip #..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{marginBottom: '0.55rem'}}
        />
        <div className="auth-tabs" role="tablist" aria-label="Filter by payment mode" style={{marginBottom: 0}}>
          {(['ALL', 'COD', 'UPI', 'WALLET'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={paymentFilter === mode}
              className={`auth-tab ${paymentFilter === mode ? 'active' : ''}`}
              style={{padding: '0.45rem 0', fontSize: '0.76rem'}}
              onClick={() => setPaymentFilter(mode)}
            >
              {mode === 'ALL' ? 'All' : mode === 'WALLET' ? 'Wallet' : mode}
            </button>
          ))}
        </div>
      </div>

      {/* Delivered Trips List */}
      <div
        data-testid="history-trips-list"
        className={filteredEntries.length > 1 ? 'responsive-grid-2' : undefined}
      >
        {filteredEntries.length === 0 ? (
          <div
            className="surface-card"
            style={{textAlign: 'center', color: 'var(--text-muted)', padding: '2.25rem 1rem'}}
          >
            <i
              className="fa-solid fa-box-archive"
              style={{fontSize: '2rem', marginBottom: '0.65rem', opacity: 0.4, display: 'block'}}
            />
            {allEntries.length === 0
              ? 'No past delivered trips yet.'
              : 'No delivered trips match your filter.'}
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry.tripId}
              data-testid={`history-card-${entry.tripId}`}
              className="surface-card"
              style={{marginBottom: 0}}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '8px',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: '0.5rem',
                  marginBottom: '0.6rem',
                }}
              >
                <div>
                  <strong className="tabular-nums" style={{fontSize: '0.94rem', color: '#fff'}}>
                    {entry.shortId} · Delivered
                  </strong>
                  <div style={{fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px'}}>
                    {entry.dateLabel}
                  </div>
                </div>
                <span className="order-status-pill pill-delivered tabular-nums">
                  +₹{entry.totalEarnings.toFixed(0)}
                </span>
              </div>

              <div style={{fontSize: '0.82rem', marginBottom: '0.25rem', color: '#e2e8f0'}}>
                <i className="fa-solid fa-store" style={{color: '#38bdf8', marginRight: '6px'}} />
                <strong>{entry.storeNames.join(' + ')}</strong>
              </div>

              <div style={{fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.6rem'}}>
                <i className="fa-solid fa-location-dot" style={{color: '#34d399', marginRight: '6px'}} />
                {entry.customerLocation}
              </div>

              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.24)',
                  borderRadius: '10px',
                  padding: '0.55rem 0.7rem',
                  fontSize: '0.74rem',
                }}
              >
                {entry.orderBreakdowns.map((ob) => (
                  <div
                    key={ob.orderId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '2px 0',
                      gap: '8px',
                    }}
                  >
                    <span style={{color: '#cbd5e1'}}>
                      {ob.storeName} ({ob.itemCount} {ob.itemCount === 1 ? 'item' : 'items'} · ₹
                      {ob.billAmount.toFixed(0)})
                    </span>
                    <strong className="tabular-nums" style={{color: '#34d399', flexShrink: 0}}>
                      +₹{ob.earning.toFixed(2)}
                    </strong>
                  </div>
                ))}
                <div
                  style={{
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    marginTop: '5px',
                    paddingTop: '5px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: 'var(--text-muted)',
                    fontWeight: 700,
                  }}
                >
                  <span>{entry.paymentMode}</span>
                  <span className="tabular-nums" style={{color: '#38bdf8'}}>
                    Trip +₹{entry.totalEarnings.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
