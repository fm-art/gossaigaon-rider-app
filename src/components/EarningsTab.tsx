import {memo, useMemo} from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AdminSettings,
  OrderRecord,
  RiderData,
  RiderPayoutRecord,
  RiderRating,
  SettlementRecord,
  TripGroup,
} from '../types/rider';
import {
  calculateLast7DaysPerformance,
  type FinancialSummary,
} from '../utils/riderLogic';
import {Leaderboard} from './Leaderboard';

interface EarningsTabProps {
  riderData: RiderData | null;
  adminSettings: AdminSettings;
  financials: FinancialSummary;
  riderRatings: RiderRating[];
  myRiderPayouts: Record<string, RiderPayoutRecord>;
  riderSettlements: Record<string, SettlementRecord>;
  completedTrips: TripGroup[];
  allOrders: Record<string, OrderRecord>;
  allRiders: Record<string, RiderData>;
  currentRiderUid: string;
  onOpenPayoutModal: () => void;
  onOpenDepositModal: () => void;
  onOpenHistory?: () => void;
}

export const EarningsTab = memo(function EarningsTab({
  riderData,
  adminSettings,
  financials,
  riderRatings,
  myRiderPayouts,
  riderSettlements,
  completedTrips,
  allOrders,
  allRiders,
  currentRiderUid,
  onOpenPayoutModal,
  onOpenDepositModal,
  onOpenHistory,
}: EarningsTabProps) {
  const maxAllowedCashLimit =
    adminSettings.maxRiderCashLimit && Number(adminSettings.maxRiderCashLimit) > 0
      ? Number(adminSettings.maxRiderCashLimit)
      : 3000;
  const minRiderPayout =
    adminSettings.minRiderPayout && Number(adminSettings.minRiderPayout) >= 1
      ? Number(adminSettings.minRiderPayout)
      : 10;
  const maxRiderPayout =
    adminSettings.maxRiderPayout && Number(adminSettings.maxRiderPayout) >= 10
      ? Number(adminSettings.maxRiderPayout)
      : 10000;
  const minRiderCodDeposit =
    adminSettings.minRiderCodDeposit && Number(adminSettings.minRiderCodDeposit) >= 1
      ? Number(adminSettings.minRiderCodDeposit)
      : 10;
  const maxRiderCodDeposit =
    adminSettings.maxRiderCodDeposit && Number(adminSettings.maxRiderCodDeposit) >= 10
      ? Number(adminSettings.maxRiderCodDeposit)
      : 25000;
  const baseRiderFeePerTrip =
    adminSettings.riderBaseFee && Number(adminSettings.riderBaseFee) > 0
      ? Number(adminSettings.riderBaseFee)
      : adminSettings.deliveryCharge && Number(adminSettings.deliveryCharge) > 0
        ? Number(adminSettings.deliveryCharge)
        : 25;

  const last7Days = useMemo(
    () => calculateLast7DaysPerformance(completedTrips, baseRiderFeePerTrip),
    [completedTrips, baseRiderFeePerTrip],
  );

  const sevenDayTotals = useMemo(
    () =>
      last7Days.reduce(
        (acc, d) => ({
          earnings: acc.earnings + d.earnings,
          trips: acc.trips + d.trips,
        }),
        {earnings: 0, trips: 0},
      ),
    [last7Days],
  );

  const payoutEntries = useMemo(
    () =>
      Object.entries(myRiderPayouts).sort(
        (a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0),
      ),
    [myRiderPayouts],
  );

  const settlementEntries = useMemo(
    () =>
      Object.entries(riderSettlements).sort(
        (a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0),
      ),
    [riderSettlements],
  );

  const ratingText = riderData?.ratingCount
    ? `★ ${Number(riderData.ratingAvg || 5).toFixed(1)} (${riderData.ratingCount})`
    : 'New';

  return (
    <div id="tab-earnings" className="tab-view active">
      <div className="section-header-row">
        <h3 className="section-title">Earnings &amp; COD Cash</h3>
        {onOpenHistory && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onOpenHistory}
            style={{fontSize: '0.74rem'}}
          >
            <i className="fa-solid fa-clock-rotate-left" /> {completedTrips.length} Trips
          </button>
        )}
      </div>

      <div className="responsive-grid-2" style={{marginBottom: '1rem'}}>
        <div className="earnings-hero-card" style={{marginBottom: 0}}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '10px',
              marginBottom: '0.75rem',
            }}
          >
            <div>
              <span
                style={{
                  fontSize: '0.68rem',
                  color: '#38bdf8',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                Available Payout
              </span>
              <div
                id="summary-rider-unpaid-earnings"
                className="tabular-nums"
                style={{fontSize: '1.85rem', fontWeight: 800, color: '#38bdf8'}}
              >
                ₹{financials.availablePayoutBalance.toFixed(2)}
              </div>
              <div style={{fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px'}}>
                UPI:{' '}
                <strong id="hero-rider-upi-display" style={{color: '#f8fafc'}}>
                  {riderData?.upiId || 'Not Set'}
                </strong>{' '}
                · Limit{' '}
                <span id="hero-payout-limits-display" className="tabular-nums" style={{color: '#7dd3fc'}}>
                  ₹{minRiderPayout}–₹{maxRiderPayout}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{background: '#0284c7', width: 'auto', whiteSpace: 'nowrap', flexShrink: 0}}
              onClick={onOpenPayoutModal}
            >
              <i className="fa-solid fa-money-bill-transfer" /> Withdraw
            </button>
          </div>
          <div
            className="tabular-nums"
            style={{
              borderTop: '1px solid rgba(56, 189, 248, 0.2)',
              paddingTop: '0.65rem',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.76rem',
              color: 'var(--text-muted)',
            }}
          >
            <span>
              Earned:{' '}
              <strong id="summary-rider-total-earned" style={{color: '#fff'}}>
                ₹{financials.totalRiderEarned.toFixed(2)}
              </strong>
            </span>
            <span>
              Paid:{' '}
              <strong id="summary-rider-total-paid" style={{color: '#34d399'}}>
                ₹{financials.totalRiderPaidPayout.toFixed(2)}
              </strong>
            </span>
          </div>
        </div>

        <div className="cash-hero-card" style={{marginBottom: 0}}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '10px',
              marginBottom: '0.75rem',
            }}
          >
            <div>
              <span
                style={{
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
                id="cod-limit-hero-label"
              >
                COD Cash in Hand (Max ₹{maxAllowedCashLimit})
              </span>
              <div
                id="summary-cash-in-hand"
                className="tabular-nums"
                style={{fontSize: '1.85rem', fontWeight: 800, color: '#34d399'}}
              >
                ₹{financials.netCashInHand.toFixed(2)}
              </div>
              <div
                className="tabular-nums"
                style={{fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px'}}
                id="hero-cod-deposit-limits"
              >
                Deposit ₹{minRiderCodDeposit}–₹{maxRiderCodDeposit}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{width: 'auto', whiteSpace: 'nowrap', flexShrink: 0}}
              onClick={onOpenDepositModal}
            >
              <i className="fa-solid fa-hand-holding-dollar" /> Deposit COD
            </button>
          </div>
          <div
            className="tabular-nums"
            style={{
              borderTop: '1px solid var(--border)',
              paddingTop: '0.65rem',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.76rem',
              color: 'var(--text-muted)',
            }}
          >
            <span>
              Collected:{' '}
              <strong id="summary-total-cod" style={{color: '#fff'}}>
                ₹{financials.totalCodCollected.toFixed(2)}
              </strong>
            </span>
            <span>
              Settled:{' '}
              <strong id="summary-total-deposited" style={{color: '#34d399'}}>
                ₹{financials.totalDeposited.toFixed(2)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* LAST 7 DAYS PERFORMANCE BAR CHART */}
      <div data-testid="performance-chart-card" className="surface-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <strong style={{color: '#38bdf8', fontSize: '0.92rem'}}>
            <i className="fa-solid fa-chart-column" style={{marginRight: '6px'}} />
            Last 7 Days
          </strong>
          <span data-testid="seven-day-summary" className="section-meta-count">
            ₹{sevenDayTotals.earnings.toFixed(0)} · {sevenDayTotals.trips} Trips
          </span>
        </div>

        <div style={{width: '100%', height: '190px'}}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last7Days} margin={{top: 6, right: 0, left: -12, bottom: 0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 600}}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="earnings"
                tick={{fill: '#38bdf8', fontSize: 10, fontWeight: 600}}
                axisLine={false}
                tickLine={false}
                width={42}
                tickFormatter={(v) => `₹${v}`}
              />
              <YAxis
                yAxisId="trips"
                orientation="right"
                allowDecimals={false}
                tick={{fill: '#34d399', fontSize: 10, fontWeight: 600}}
                axisLine={false}
                tickLine={false}
                width={24}
              />
              <Tooltip
                cursor={{fill: 'rgba(56, 189, 248, 0.08)'}}
                contentStyle={{
                  backgroundColor: '#090d16',
                  borderColor: '#24344d',
                  borderRadius: '12px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#f8fafc',
                }}
                labelFormatter={(_label, payload) => {
                  const first = payload && payload[0];
                  const point = first?.payload as {fullDate?: string} | undefined;
                  return point?.fullDate ? `${point.fullDate}` : String(_label);
                }}
                formatter={(value, name) => {
                  if (name === 'Earnings (₹)') return [`₹${Number(value || 0).toFixed(0)}`, 'Earnings'];
                  return [`${Number(value || 0)} Trips`, 'Total Trips'];
                }}
              />
              <Bar
                yAxisId="earnings"
                dataKey="earnings"
                name="Earnings (₹)"
                fill="#38bdf8"
                radius={[5, 5, 0, 0]}
                maxBarSize={16}
              />
              <Bar
                yAxisId="trips"
                dataKey="trips"
                name="Total Trips"
                fill="#16a34a"
                radius={[5, 5, 0, 0]}
                maxBarSize={16}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '16px',
            marginTop: '0.45rem',
            fontSize: '0.72rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}
        >
          <span style={{display: 'inline-flex', alignItems: 'center', gap: '6px'}}>
            <span style={{width: '9px', height: '9px', borderRadius: '3px', background: '#38bdf8'}} />
            Earnings (₹)
          </span>
          <span style={{display: 'inline-flex', alignItems: 'center', gap: '6px'}}>
            <span style={{width: '9px', height: '9px', borderRadius: '3px', background: '#16a34a'}} />
            Trips
          </span>
        </div>
      </div>

      {/* WEEKLY RIDER LEADERBOARD (TOP 10) */}
      <Leaderboard
        allOrders={allOrders}
        allRiders={allRiders}
        currentRiderUid={currentRiderUid}
        baseRiderFeePerTrip={baseRiderFeePerTrip}
      />

      {/* RATINGS */}
      <div className="surface-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.55rem',
          }}
        >
          <strong style={{color: '#fbbf24', fontSize: '0.92rem'}}>
            <i className="fa-solid fa-star" style={{marginRight: '6px'}} />
            Customer Ratings
          </strong>
          <span id="earnings-rating-summary" className="section-meta-count" style={{color: '#fbbf24'}}>
            {ratingText}
          </span>
        </div>
        <div id="rider-ratings-list" style={{maxHeight: '160px', overflowY: 'auto'}}>
          {riderRatings.length === 0 ? (
            <p style={{fontSize: '0.78rem', color: 'var(--text-muted)'}}>No customer ratings yet.</p>
          ) : (
            riderRatings.slice(0, 10).map((r, idx) => (
              <div
                key={idx}
                style={{
                  borderTop: idx > 0 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                  padding: '6px 0',
                  fontSize: '0.78rem',
                }}
              >
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <strong>{r.customerName || 'Customer'}</strong>
                  <span style={{color: '#fbbf24', fontWeight: 800}}>
                    {'★'.repeat(Number(r.rating || 5))}
                  </span>
                </div>
                {r.comment && <div style={{color: '#cbd5e1', marginTop: '2px'}}>{r.comment}</div>}
              </div>
            ))
          )}
        </div>
      </div>

      {/* PAYOUT & SETTLEMENT LOGS */}
      <div className="responsive-grid-2">
        <div className="surface-card" style={{marginBottom: 0}}>
          <h4 style={{fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.55rem'}}>
            Payout History
          </h4>
          <div id="payout-history-container">
            {payoutEntries.length === 0 ? (
              <p style={{color: 'var(--text-muted)', fontSize: '0.78rem', padding: '0.5rem 0'}}>
                No payout requests yet.
              </p>
            ) : (
              payoutEntries.map(([id, p], idx) => (
                <div
                  key={id}
                  style={{
                    borderTop: idx > 0 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                    padding: '0.55rem 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div>
                    <strong className="tabular-nums" style={{color: '#38bdf8', fontSize: '0.9rem'}}>
                      ₹{Number(p.amount || 0).toFixed(2)}
                    </strong>
                    <div style={{fontSize: '0.72rem', color: 'var(--text-muted)'}}>
                      {p.riderUpiId} {p.adminRef ? `· Ref: ${p.adminRef}` : ''}
                    </div>
                  </div>
                  <span
                    className={`settlement-badge ${
                      p.status === 'PAID' ? 'settlement-approved' : 'settlement-pending'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="surface-card" style={{marginBottom: 0}}>
          <h4 style={{fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.55rem'}}>
            COD Handover Log
          </h4>
          <div id="settlement-history-container">
            {settlementEntries.length === 0 ? (
              <p style={{color: 'var(--text-muted)', fontSize: '0.78rem', padding: '0.5rem 0'}}>
                No handover requests yet.
              </p>
            ) : (
              settlementEntries.map(([id, s], idx) => (
                <div
                  key={id}
                  style={{
                    borderTop: idx > 0 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                    padding: '0.55rem 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div>
                    <strong className="tabular-nums" style={{color: '#f8fafc', fontSize: '0.9rem'}}>
                      ₹{Number(s.amount || 0).toFixed(2)}
                    </strong>
                    <div style={{fontSize: '0.72rem', color: 'var(--text-muted)'}}>
                      {s.mode} {s.utr ? `· ${s.utr}` : ''}
                    </div>
                  </div>
                  <span
                    className={`settlement-badge ${
                      s.status === 'APPROVED' ? 'settlement-approved' : 'settlement-pending'
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
