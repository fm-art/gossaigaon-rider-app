import {memo, useMemo} from 'react';
import type {OrderRecord, RiderData} from '../types/rider';
import {calculateWeeklyLeaderboard} from '../utils/riderLogic';

interface LeaderboardProps {
  allOrders: Record<string, OrderRecord>;
  allRiders: Record<string, RiderData>;
  currentRiderUid: string;
  baseRiderFeePerTrip: number;
}

export const Leaderboard = memo(function Leaderboard({
  allOrders,
  allRiders,
  currentRiderUid,
  baseRiderFeePerTrip,
}: LeaderboardProps) {
  const leaderboard = useMemo(
    () =>
      calculateWeeklyLeaderboard(
        allOrders,
        allRiders,
        currentRiderUid,
        baseRiderFeePerTrip,
      ),
    [allOrders, allRiders, currentRiderUid, baseRiderFeePerTrip],
  );

  const maxTrips = leaderboard.topRiders[0]?.deliveredTrips || 1;
  const me = leaderboard.currentRiderEntry;
  const nextRankTarget =
    me && me.rank > 1
      ? leaderboard.topRiders.find((r) => r.rank === me.rank - 1) ||
        leaderboard.topRiders[leaderboard.topRiders.length - 1]
      : null;
  const tripsToNextRank =
    me && nextRankTarget ? Math.max(1, nextRankTarget.deliveredTrips - me.deliveredTrips + 1) : 0;

  return (
    <div data-testid="weekly-leaderboard-card" className="surface-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '0.65rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong
            style={{
              color: '#fbbf24',
              fontSize: '0.94rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="fa-solid fa-trophy" />
            <span>Weekly Leaderboard</span>
          </strong>
          <div style={{fontSize: '0.72rem', color: 'var(--text-muted)'}}>
            {leaderboard.weekRangeLabel} · Top 10 Riders
          </div>
        </div>
        <span data-testid="leaderboard-fleet-badge" className="section-meta-count">
          {leaderboard.totalFleetTripsThisWeek} Fleet Trips
        </span>
      </div>

      {me && (
        <div
          data-testid="leaderboard-my-rank-banner"
          style={{
            background:
              me.rank === 1 ? 'rgba(251, 191, 36, 0.1)' : 'rgba(56, 189, 248, 0.08)',
            border:
              me.rank === 1
                ? '1px solid rgba(251, 191, 36, 0.35)'
                : '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '12px',
            padding: '0.55rem 0.75rem',
            marginBottom: '0.65rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div style={{fontSize: '0.76rem', fontWeight: 700, color: '#f8fafc'}}>
            {me.rank === 1 ? (
              <span>
                <i className="fa-solid fa-crown" style={{color: '#fbbf24', marginRight: '5px'}} />
                You are #1 this week
              </span>
            ) : (
              <span className="tabular-nums">
                Rank <strong style={{color: '#38bdf8'}}>#{me.rank}</strong> · {me.deliveredTrips}{' '}
                {me.deliveredTrips === 1 ? 'Trip' : 'Trips'}
              </span>
            )}
          </div>
          <span
            className="tabular-nums"
            style={{fontSize: '0.72rem', fontWeight: 700, color: '#34d399', whiteSpace: 'nowrap'}}
          >
            {me.rank === 1
              ? `${me.deliveredTrips} Trips`
              : me.deliveredTrips === 0
                ? 'Deliver 1 trip to rank'
                : `+${tripsToNextRank} to pass #${nextRankTarget?.rank || me.rank - 1}`}
          </span>
        </div>
      )}

      {leaderboard.topRiders.length === 0 ? (
        <p style={{textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1rem 0'}}>
          No delivered trips recorded yet for this week.
        </p>
      ) : (
        <div data-testid="leaderboard-list">
          {leaderboard.topRiders.map((entry, idx) => {
            const isGold = entry.rank === 1;
            const isSilver = entry.rank === 2;
            const isBronze = entry.rank === 3;
            const rankBg = isGold
              ? '#f59e0b'
              : isSilver
                ? '#cbd5e1'
                : isBronze
                  ? '#fb923c'
                  : 'var(--surface-light)';
            const rankColor = isGold || isSilver || isBronze ? '#050811' : '#cbd5e1';
            const barPct = Math.max(8, Math.round((entry.deliveredTrips / maxTrips) * 100));

            return (
              <div
                key={entry.riderUid}
                data-testid={`leaderboard-row-${entry.rank}`}
                style={{
                  background: entry.isCurrentRider ? 'rgba(22, 163, 74, 0.1)' : 'transparent',
                  borderRadius: entry.isCurrentRider ? '12px' : undefined,
                  borderTop:
                    idx > 0 && !entry.isCurrentRider ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                  padding: '0.6rem 0.5rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0}}>
                    <span
                      className="tabular-nums"
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: rankBg,
                        color: rankColor,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {isGold ? <i className="fa-solid fa-crown" /> : entry.rank}
                    </span>
                    <div style={{minWidth: 0}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <strong
                          style={{
                            fontSize: '0.84rem',
                            color: '#f8fafc',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {entry.name}
                        </strong>
                        {entry.isCurrentRider && (
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 800,
                              color: '#34d399',
                              flexShrink: 0,
                            }}
                          >
                            (You)
                          </span>
                        )}
                      </div>
                      <div style={{fontSize: '0.68rem', color: 'var(--text-muted)'}}>
                        ★ {entry.ratingAvg.toFixed(1)} · {entry.vehicle}
                      </div>
                    </div>
                  </div>

                  <div className="tabular-nums" style={{textAlign: 'right', flexShrink: 0}}>
                    <div
                      style={{
                        fontSize: '0.86rem',
                        fontWeight: 800,
                        color: isGold ? '#fbbf24' : entry.isCurrentRider ? '#34d399' : '#38bdf8',
                      }}
                    >
                      {entry.deliveredTrips} {entry.deliveredTrips === 1 ? 'Trip' : 'Trips'}
                    </div>
                    <div style={{fontSize: '0.66rem', color: 'var(--text-muted)'}}>
                      ₹{entry.weeklyEarnings.toFixed(0)}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    height: '3px',
                    borderRadius: '999px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    marginTop: '6px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${barPct}%`,
                      height: '100%',
                      borderRadius: '999px',
                      background: isGold
                        ? '#fbbf24'
                        : entry.isCurrentRider
                          ? '#22c55e'
                          : '#38bdf8',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
