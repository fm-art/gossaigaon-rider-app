import {memo} from 'react';
import type {
  AdminSettings,
  ChatChannel,
  OrderWithId,
  StoreInfo,
  TripGroup,
} from '../types/rider';
import {
  canCommunicateWithCustomer,
  canCommunicateWithRestaurant,
  resolveCustomerIdentity,
  resolveRestaurantIdentity,
} from '../utils/communicationLogic';
import {
  calculateDistanceKm,
  calculateOptimalDeliverySequence,
  getRiderFeeForOrder,
  getStorePickupCode,
  isTripPickedUp,
  normalizeOrderItems,
  sortStoreStops,
} from '../utils/riderLogic';
import {getSafeMapsUrl} from '../utils/security';

interface ActiveTripsTabProps {
  activeTrips: TripGroup[];
  stores: Record<string, StoreInfo>;
  riderCurrentLat: number;
  riderCurrentLng: number;
  adminSettings: AdminSettings;
  nowMs: number;
  riderUid: string;
  isRiderApproved: boolean;
  unreadByOrder: Record<string, {customer: number; restaurant: number; total: number}>;
  callStatusByOrder: Record<string, string>;
  onCallParticipant: (order: OrderWithId, role: 'CUSTOMER' | 'RESTAURANT') => void;
  onOpenOrderChat: (orderId: string, channel: ChatChannel) => void;
  onPassTripDirect: (tripId: string, reason: string) => void;
  onAcceptTrip: (tripId: string) => void;
  onConfirmStorePickup: (orderId: string) => void;
  onStartDoorstepRoute: (tripId: string) => void;
  onOpenVerifyModal: (
    tripId: string,
    totalAmt: number,
    isPrepaid: boolean,
    initialMode?: 'pin' | 'qr',
  ) => void;
  onOpenSosModal: (tripId: string) => void;
  onOpenCancelModal: (tripId: string) => void;
}

export const ActiveTripsTab = memo(function ActiveTripsTab({
  activeTrips,
  stores,
  riderCurrentLat,
  riderCurrentLng,
  adminSettings,
  nowMs,
  riderUid,
  isRiderApproved,
  unreadByOrder,
  callStatusByOrder,
  onCallParticipant,
  onOpenOrderChat,
  onPassTripDirect,
  onAcceptTrip,
  onConfirmStorePickup,
  onStartDoorstepRoute,
  onOpenVerifyModal,
  onOpenSosModal,
  onOpenCancelModal,
}: ActiveTripsTabProps) {
  const baseRiderFeePerTrip =
    adminSettings.riderBaseFee && Number(adminSettings.riderBaseFee) > 0
      ? Number(adminSettings.riderBaseFee)
      : adminSettings.deliveryCharge && Number(adminSettings.deliveryCharge) > 0
        ? Number(adminSettings.deliveryCharge)
        : 25;

  const acceptTimeoutSec =
    adminSettings.riderAcceptTimeoutSec && Number(adminSettings.riderAcceptTimeoutSec) >= 15
      ? Number(adminSettings.riderAcceptTimeoutSec)
      : 45;

  const allowRiderPassTrip = adminSettings.allowRiderPassTrip !== false;
  const allowRiderSos = adminSettings.allowRiderSos !== false;

  return (
    <div id="tab-active" className="tab-view active">
      <div className="section-header-row">
        <h3 className="section-title">Assigned Trips</h3>
        <span id="active-count-badge" className="section-meta-count">
          {activeTrips.length} Active
        </span>
      </div>

      <div
        id="active-trips-container"
        data-testid="active-trips-container"
        className={activeTrips.length > 1 ? 'responsive-grid-2' : undefined}
      >
        {activeTrips.length === 0 ? (
          <div
            className="surface-card"
            style={{textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem 1rem'}}
          >
            <i
              className="fa-solid fa-cart-flatbed"
              style={{fontSize: '2.1rem', marginBottom: '0.75rem', opacity: 0.45, display: 'block'}}
            />
            <div style={{fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)'}}>
              No active trips in queue
            </div>
            <div style={{fontSize: '0.78rem', marginTop: '4px'}}>
              Stay online to receive incoming pickup alerts.
            </div>
          </div>
        ) : (
          activeTrips.map((trip) => {
            const isAcceptedByRider = trip.orders.every((o) => o.riderAccepted === true);
            const hasAnyPickedUp = isTripPickedUp(trip);
            const isMultiStore = trip.orders.length > 1;

            let totalBillAmt = 0;
            let totalTripFee = 0;
            const allItems: Array<{name: string; qty: number}> = [];

            trip.orders.forEach((o) => {
              totalBillAmt += Number(o.totalAmount || 0);
              totalTripFee += getRiderFeeForOrder(o, baseRiderFeePerTrip);
              normalizeOrderItems(o.items).forEach((item) => allItems.push(item));
            });

            const isUpi = trip.paymentMode === 'UPI';
            const isWallet = trip.paymentMode === 'WALLET';
            const isPrepaidVerified =
              isWallet || (isUpi && trip.orders.every((o) => o.paymentStatus === 'VERIFIED'));
            const isUpiPending = isUpi && !isPrepaidVerified;

            if (!isAcceptedByRider) {
              const elapsedSec = Math.max(0, Math.floor((nowMs - (trip.assignedAt || nowMs)) / 1000));
              const remainingSec = Math.max(0, Math.min(acceptTimeoutSec, acceptTimeoutSec - elapsedSec));
              const timerWidth = `${(remainingSec / acceptTimeoutSec) * 100}%`;

              return (
                <div
                  key={trip.tripId}
                  className="delivery-order-card unaccepted-alert"
                  id={`card-${trip.tripId}`}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                      borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
                      paddingBottom: '0.6rem',
                    }}
                  >
                    <div>
                      <strong style={{fontSize: '0.98rem', color: '#fde68a'}}>
                        {isMultiStore ? `${trip.orders.length}-Store Combo Trip` : 'New Trip Assigned'}
                      </strong>
                      <div className="tabular-nums" style={{fontSize: '0.74rem', color: 'var(--text-muted)'}}>
                        #{trip.tripId.slice(-6)}
                      </div>
                    </div>
                    <span className="order-status-pill pill-incoming">Accept Required</span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      color: '#fbbf24',
                      marginTop: '10px',
                    }}
                  >
                    <span>
                      <i className="fa-solid fa-clock" style={{marginRight: '5px'}} />
                      Auto-pass in
                    </span>
                    <span id={`timer-text-${trip.tripId}`} className="tabular-nums">
                      {remainingSec}s
                    </span>
                  </div>
                  <div className="timer-bar-container">
                    <div
                      className="timer-bar-fill"
                      id={`timer-bar-${trip.tripId}`}
                      style={{width: timerWidth}}
                    />
                  </div>

                  <div
                    style={{
                      background: 'rgba(22, 163, 74, 0.1)',
                      border: '1px solid rgba(22, 163, 74, 0.35)',
                      borderRadius: '14px',
                      padding: '0.85rem 0.95rem',
                      marginBottom: '0.85rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                          fontWeight: 700,
                        }}
                      >
                        Your Earning
                      </span>
                      <div
                        className="tabular-nums"
                        style={{fontSize: '1.5rem', fontWeight: 800, color: '#34d399'}}
                      >
                        +₹{totalTripFee.toFixed(0)}
                      </div>
                    </div>
                    <div style={{textAlign: 'right'}}>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                          fontWeight: 700,
                        }}
                      >
                        Payment
                      </span>
                      <div className="tabular-nums" style={{fontSize: '0.92rem', fontWeight: 700}}>
                        {isWallet
                          ? 'Wallet Paid'
                          : isUpi
                            ? isPrepaidVerified
                              ? 'UPI Paid'
                              : 'UPI Hold'
                            : `COD ₹${totalBillAmt.toFixed(0)}`}
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const previewSeq = isMultiStore
                      ? calculateOptimalDeliverySequence(
                          trip,
                          stores,
                          riderCurrentLat,
                          riderCurrentLng,
                        )
                      : null;
                    const orderedOrders = previewSeq
                      ? previewSeq.orderedPickupOrderIds
                          .map((id) => trip.orders.find((o) => o.orderId === id))
                          .filter((o): o is NonNullable<typeof o> => Boolean(o))
                      : trip.orders;

                    return (
                      <div style={{marginBottom: '0.85rem'}}>
                        {previewSeq && (
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.72rem',
                              color: '#38bdf8',
                              fontWeight: 700,
                              marginBottom: '4px',
                            }}
                          >
                            <span>
                              <i className="fa-solid fa-route" style={{marginRight: '5px'}} />
                              Suggested Order
                            </span>
                            <span className="tabular-nums">
                              ~{previewSeq.totalRemainingDistanceKm.toFixed(1)} km total
                            </span>
                          </div>
                        )}
                        <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                          {orderedOrders.map((o, idx) => {
                            const st = stores[o.restaurantId || ''] || {};
                            const d =
                              riderCurrentLat && st.lat !== undefined
                                ? calculateDistanceKm(
                                    riderCurrentLat,
                                    riderCurrentLng,
                                    st.lat,
                                    st.lng,
                                  )
                                : null;
                            return (
                              <div
                                key={o.orderId}
                                style={{
                                  fontSize: '0.78rem',
                                  color: '#cbd5e1',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  gap: '8px',
                                }}
                              >
                                <span>
                                  <strong style={{color: '#38bdf8'}}>{idx + 1}.</strong>{' '}
                                  {st.name || 'Store'}
                                </span>
                                {d !== null && (
                                  <span className="tabular-nums" style={{color: 'var(--text-muted)'}}>
                                    ~{d.toFixed(1)} km
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '10px',
                      padding: '0.65rem 0.75rem',
                      fontSize: '0.78rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.9rem',
                    }}
                  >
                    <strong style={{color: '#cbd5e1'}}>Items ({allItems.length}):</strong>{' '}
                    {allItems.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                  </div>

                  <div style={{display: 'flex', gap: '8px'}}>
                    {allowRiderPassTrip && !hasAnyPickedUp && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{
                          flex: 1,
                          borderColor: 'rgba(239, 68, 68, 0.45)',
                          color: '#fca5a5',
                          whiteSpace: 'nowrap',
                        }}
                        onClick={() => onPassTripDirect(trip.tripId, 'Rider declined')}
                      >
                        <i className="fa-solid fa-xmark" /> Pass
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{flex: 1.5, whiteSpace: 'nowrap'}}
                      onClick={() => onAcceptTrip(trip.tripId)}
                    >
                      <i className="fa-solid fa-check-double" /> Accept (+₹{totalTripFee.toFixed(0)})
                    </button>
                  </div>
                </div>
              );
            }

            const optimalSequence = isMultiStore
              ? calculateOptimalDeliverySequence(trip, stores, riderCurrentLat, riderCurrentLng)
              : null;

            const baseStops = sortStoreStops(
              trip.orders,
              stores,
              riderCurrentLat,
              riderCurrentLng,
            );
            const storeStops = optimalSequence
              ? [...baseStops].sort((a, b) => {
                  const idxA = optimalSequence.orderedPickupOrderIds.indexOf(a.order.orderId);
                  const idxB = optimalSequence.orderedPickupOrderIds.indexOf(b.order.orderId);
                  return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
                })
              : baseStops;
            const currentActiveStopIndex = storeStops.findIndex((s) => !s.isPickedUp);
            const allStoresPickedUp = currentActiveStopIndex === -1;

            const distToCustomer =
              riderCurrentLat && trip.customerLat !== null
                ? calculateDistanceKm(
                    riderCurrentLat,
                    riderCurrentLng,
                    trip.customerLat,
                    trip.customerLng,
                  )
                : null;
            const customerMapsLink = getSafeMapsUrl(
              trip.locationLink,
              trip.customerLat,
              trip.customerLng,
              trip.address || 'Gossaigaon',
            );
            const isOutForDelivery = trip.orders.some((o) => o.status === 'OUT_FOR_DELIVERY');
            const primaryOrder =
              trip.orders.find((o) => (unreadByOrder[o.orderId]?.customer || 0) > 0) ||
              trip.orders.find((o) =>
                canCommunicateWithCustomer({riderUid, isRiderApproved, order: o}),
              ) ||
              trip.orders[0];
            const primaryCustomer = primaryOrder ? resolveCustomerIdentity(primaryOrder) : null;
            const primaryRestaurant = primaryOrder
              ? resolveRestaurantIdentity(primaryOrder, stores)
              : null;
            const primaryCustomerEligible = Boolean(
              primaryOrder &&
                canCommunicateWithCustomer({
                  riderUid,
                  isRiderApproved,
                  order: primaryOrder,
                }),
            );
            const primaryCustomerUnread = trip.orders.reduce(
              (sum, o) => sum + (unreadByOrder[o.orderId]?.customer || 0),
              0,
            );
            const primaryCallStatus = primaryOrder
              ? callStatusByOrder[primaryOrder.orderId] || ''
              : '';

            return (
              <div
                key={trip.tripId}
                className="delivery-order-card"
                style={{
                  borderColor: allStoresPickedUp
                    ? 'rgba(16, 185, 129, 0.38)'
                    : 'rgba(56, 189, 248, 0.35)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--border)',
                    paddingBottom: '0.65rem',
                    marginBottom: '0.85rem',
                  }}
                >
                  <div>
                    <strong style={{fontSize: '1rem'}}>
                      {isMultiStore ? `${trip.orders.length}-Store Trip` : 'Single Store Trip'}
                    </strong>
                    <div
                      className="tabular-nums"
                      style={{fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700}}
                    >
                      Earning +₹{totalTripFee.toFixed(0)} · #{trip.tripId.slice(-6)}
                    </div>
                  </div>
                  <span className={`order-status-pill ${allStoresPickedUp ? 'pill-out' : 'pill-ready'}`}>
                    {allStoresPickedUp ? 'Doorstep Route' : 'Picking Stores'}
                  </span>
                </div>

                {optimalSequence && optimalSequence.steps.length > 0 && (
                  <div
                    data-testid={`optimal-sequence-${trip.tripId}`}
                    style={{
                      background: 'rgba(11, 17, 32, 0.75)',
                      border: '1px solid var(--border)',
                      borderRadius: '14px',
                      padding: '0.75rem 0.85rem',
                      marginBottom: '0.85rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: '#38bdf8',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <i className="fa-solid fa-route" />
                        <span>Optimal Route ({trip.orders.length} stops)</span>
                      </div>
                      <div
                        className="tabular-nums"
                        style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.72rem', fontWeight: 700}}
                      >
                        {optimalSequence.distanceSavedKm >= 0.05 && (
                          <span data-testid={`optimal-saved-${trip.tripId}`} style={{color: '#34d399'}}>
                            -{optimalSequence.distanceSavedKm.toFixed(2)} km saved
                          </span>
                        )}
                        <span data-testid={`optimal-total-${trip.tripId}`} style={{color: '#e2e8f0'}}>
                          ~{optimalSequence.totalRemainingDistanceKm.toFixed(2)} km
                        </span>
                      </div>
                    </div>

                    <ol style={{listStyle: 'none', padding: 0, margin: 0}}>
                      {optimalSequence.steps.map((step, idx) => {
                        const isPickup = step.type === 'PICKUP';
                        return (
                          <li
                            key={`${step.type}-${step.stepNumber}-${step.orderIds.join('_')}`}
                            data-testid={`sequence-step-${trip.tripId}-${step.stepNumber}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              padding: '0.45rem 0',
                              borderTop: idx > 0 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                            }}
                          >
                            <div style={{display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0}}>
                              <span
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '50%',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.68rem',
                                  fontWeight: 800,
                                  flexShrink: 0,
                                  background: step.isCompleted
                                    ? 'var(--primary)'
                                    : step.isCurrent
                                      ? '#38bdf8'
                                      : 'var(--surface-light)',
                                  color: step.isCompleted || step.isCurrent ? '#050811' : '#cbd5e1',
                                }}
                              >
                                {step.isCompleted ? (
                                  <i className="fa-solid fa-check" />
                                ) : (
                                  step.stepNumber
                                )}
                              </span>
                              <div style={{minWidth: 0}}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                                  <span
                                    style={{
                                      fontSize: '0.62rem',
                                      fontWeight: 800,
                                      textTransform: 'uppercase',
                                      color: isPickup ? '#38bdf8' : '#34d399',
                                    }}
                                  >
                                    {isPickup ? 'Pickup' : 'Drop'}
                                  </span>
                                  <strong
                                    style={{
                                      fontSize: '0.78rem',
                                      color: step.isCompleted ? '#94a3b8' : '#f8fafc',
                                      textDecoration: step.isCompleted ? 'line-through' : 'none',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {step.title}
                                  </strong>
                                </div>
                                <div
                                  style={{
                                    fontSize: '0.68rem',
                                    color: 'var(--text-muted)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {step.subtitle}
                                </div>
                              </div>
                            </div>

                            <span
                              className="tabular-nums"
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                color: step.isCompleted
                                  ? '#34d399'
                                  : step.isCurrent
                                    ? '#38bdf8'
                                    : 'var(--text-muted)',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}
                            >
                              {step.isCompleted
                                ? 'Done'
                                : step.legDistanceKm !== null
                                  ? `+${step.legDistanceKm.toFixed(2)} km`
                                  : 'Next'}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}

                {storeStops.map((stop, index) => {
                  const isCurrentTarget = !allStoresPickedUp && index === currentActiveStopIndex;
                  const storeMapsLink = getSafeMapsUrl(
                    '',
                    stop.store.lat,
                    stop.store.lng,
                    (stop.store.name || '') + ' Gossaigaon',
                  );
                  const itemsTxt = normalizeOrderItems(stop.order.items)
                    .map((i) => `${i.qty}× ${i.name}`)
                    .join(', ');
                  const isReadyForPickup = stop.order.status === 'READY_FOR_PICKUP';
                  const pickupCode = getStorePickupCode(stop.order, stop.order.orderId);
                  const restIdentity = resolveRestaurantIdentity(stop.order, stores);
                  const canMessageOrCallRest = canCommunicateWithRestaurant({
                    riderUid,
                    isRiderApproved,
                    order: stop.order,
                    stores,
                  });
                  const restUnread = unreadByOrder[stop.order.orderId]?.restaurant || 0;
                  const orderCallStatus = callStatusByOrder[stop.order.orderId] || '';

                  const renderRestaurantComms = () => {
                    if (!canMessageOrCallRest) return null;
                    return (
                      <div
                        data-testid={`restaurant-comms-${stop.order.orderId}`}
                        style={{
                          marginTop: '8px',
                          padding: '0.6rem 0.7rem',
                          borderRadius: '12px',
                          background: 'rgba(15, 23, 42, 0.78)',
                          border: '1px solid rgba(56, 189, 248, 0.22)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            marginBottom: '6px',
                          }}
                        >
                          <div style={{display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0}}>
                            {restIdentity.photo ? (
                              <img
                                src={restIdentity.photo}
                                alt={restIdentity.name}
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '8px',
                                  objectFit: 'cover',
                                  flexShrink: 0,
                                }}
                              />
                            ) : (
                              <div
                                aria-hidden="true"
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '8px',
                                  background: 'rgba(56, 189, 248, 0.16)',
                                  color: '#38bdf8',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.75rem',
                                  flexShrink: 0,
                                }}
                              >
                                <i className="fa-solid fa-store" />
                              </div>
                            )}
                            <div style={{minWidth: 0}}>
                              <div
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  color: '#94a3b8',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.03em',
                                }}
                              >
                                Restaurant Communication · #{stop.order.orderId.slice(-6)}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  color: '#f8fafc',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {restIdentity.name}
                              </div>
                            </div>
                          </div>
                          {orderCallStatus && (
                            <span
                              style={{
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                color: orderCallStatus === 'CONNECTED' ? '#34d399' : '#38bdf8',
                                background:
                                  orderCallStatus === 'CONNECTED'
                                    ? 'rgba(16, 185, 129, 0.15)'
                                    : 'rgba(56, 189, 248, 0.14)',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                flexShrink: 0,
                              }}
                            >
                              {orderCallStatus}
                            </span>
                          )}
                        </div>

                        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                          <button
                            type="button"
                            data-testid={`call-restaurant-btn-${stop.order.orderId}`}
                            className="action-btn-sm"
                            style={{
                              flex: 1,
                              minHeight: '44px',
                              justifyContent: 'center',
                              background: 'rgba(16, 131, 41, 0.22)',
                              borderColor: 'rgba(46, 158, 79, 0.5)',
                              color: '#4ade80',
                              cursor: 'pointer',
                            }}
                            onClick={() => onCallParticipant(stop.order, 'RESTAURANT')}
                          >
                            <i className="fa-solid fa-phone-volume" /> Call Restaurant (In-App)
                          </button>
                          <button
                            type="button"
                            data-testid={`message-restaurant-btn-${stop.order.orderId}`}
                            className="action-btn-sm"
                            style={{
                              flex: 1,
                              minHeight: '44px',
                              justifyContent: 'center',
                              background: 'rgba(56, 189, 248, 0.14)',
                              borderColor: 'rgba(56, 189, 248, 0.35)',
                              color: '#7dd3fc',
                              cursor: 'pointer',
                              position: 'relative',
                            }}
                            onClick={() => onOpenOrderChat(stop.order.orderId, 'RIDER_RESTAURANT')}
                          >
                            <i className="fa-solid fa-comment-dots" /> Message Restaurant
                            {restUnread > 0 && (
                              <span
                                data-testid={`unread-restaurant-badge-${stop.order.orderId}`}
                                style={{
                                  background: '#ef4444',
                                  color: '#fff',
                                  borderRadius: '999px',
                                  padding: '1px 6px',
                                  fontSize: '0.68rem',
                                  fontWeight: 800,
                                  marginLeft: '4px',
                                }}
                              >
                                {restUnread}
                              </span>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  };

                  if (stop.isPickedUp) {
                    return (
                      <div key={stop.order.orderId} className="stop-card completed-stop">
                        <span className="stop-badge stop-badge-green">
                          <i className="fa-solid fa-check" /> Stop {index + 1} · Picked Up
                        </span>
                        <strong style={{display: 'block', color: '#f8fafc', fontSize: '0.92rem'}}>
                          {stop.store.name || 'Store'}
                        </strong>
                        {renderRestaurantComms()}
                      </div>
                    );
                  }

                  if (isCurrentTarget) {
                    return (
                      <div key={stop.order.orderId} className="stop-card active-stop">
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span className="stop-badge stop-badge-blue">
                            Stop {index + 1} · Pickup Here
                          </span>
                          {stop.distance !== 999 && (
                            <span
                              className="tabular-nums"
                              style={{fontSize: '0.74rem', color: '#38bdf8', fontWeight: 700}}
                            >
                              ~{stop.distance.toFixed(1)} km
                            </span>
                          )}
                        </div>
                        <strong
                          style={{
                            display: 'block',
                            color: '#fff',
                            fontSize: '1rem',
                            marginTop: '2px',
                          }}
                        >
                          {stop.store.name || 'Store'}
                        </strong>
                        <div style={{fontSize: '0.78rem', color: 'var(--text-muted)'}}>
                          {stop.store.address || 'Gossaigaon Bazar'}
                        </div>

                        <div className="action-links-bar">
                          <a
                            href={storeMapsLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="action-btn-sm map-store"
                          >
                            <i className="fa-solid fa-diamond-turn-right" /> Store Maps
                          </a>
                        </div>

                        {renderRestaurantComms()}

                        <div
                          style={{
                            background: 'rgba(56, 189, 248, 0.08)',
                            border: '1px solid rgba(56, 189, 248, 0.32)',
                            borderRadius: '12px',
                            padding: '0.65rem 0.85rem',
                            marginTop: '10px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div>
                            <span
                              style={{
                                fontSize: '0.68rem',
                                color: '#38bdf8',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                display: 'block',
                              }}
                            >
                              Store Pickup Code
                            </span>
                            <small style={{color: 'var(--text-muted)', fontSize: '0.72rem'}}>
                              Show to storekeeper
                            </small>
                          </div>
                          <div
                            className="tabular-nums"
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '1.35rem',
                              fontWeight: 800,
                              color: '#38bdf8',
                              letterSpacing: '2px',
                            }}
                          >
                            {pickupCode}
                          </div>
                        </div>

                        <div
                          style={{
                            background: 'rgba(0, 0, 0, 0.25)',
                            borderRadius: '10px',
                            padding: '0.6rem 0.7rem',
                            marginTop: '8px',
                            fontSize: '0.76rem',
                            color: '#cbd5e1',
                          }}
                        >
                          <strong>Items:</strong> {itemsTxt}
                        </div>

                        {!isReadyForPickup ? (
                          <button
                            type="button"
                            className="btn btn-outline"
                            disabled
                            style={{
                              marginTop: '8px',
                              borderColor: 'rgba(245, 158, 11, 0.45)',
                              color: '#fbbf24',
                            }}
                          >
                            <i className="fa-solid fa-lock" /> Waiting for Store Ready
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{marginTop: '8px'}}
                            onClick={() => onConfirmStorePickup(stop.order.orderId)}
                          >
                            <i className="fa-solid fa-box-open" /> Confirm Picked Up
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={stop.order.orderId} className="stop-card locked-stop">
                      <span className="stop-badge stop-badge-locked">
                        <i className="fa-solid fa-lock" /> Stop {index + 1} · Next Store
                      </span>
                      <strong style={{display: 'block', color: '#94a3b8', fontSize: '0.9rem'}}>
                        {stop.store.name || 'Store'}
                      </strong>
                      {renderRestaurantComms()}
                    </div>
                  );
                })}

                {primaryCustomerEligible && primaryOrder && primaryCustomer && (
                  <div
                    data-testid={`customer-comms-${primaryOrder.orderId}`}
                    style={{
                      background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid rgba(34, 197, 94, 0.35)',
                      borderRadius: '14px',
                      padding: '0.75rem 0.85rem',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0}}>
                        {primaryCustomer.photo ? (
                          <img
                            src={primaryCustomer.photo}
                            alt={primaryCustomer.label}
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: '1.5px solid rgba(52, 211, 153, 0.6)',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            aria-hidden="true"
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: 'rgba(16, 185, 129, 0.16)',
                              color: '#34d399',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.95rem',
                              fontWeight: 800,
                              flexShrink: 0,
                            }}
                          >
                            <i className="fa-solid fa-user" />
                          </div>
                        )}
                        <div style={{minWidth: 0}}>
                          <div
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              color: '#34d399',
                              textTransform: 'uppercase',
                              letterSpacing: '0.03em',
                            }}
                          >
                            Customer Communication · #{primaryOrder.orderId.slice(-6)}
                          </div>
                          <div
                            style={{
                              fontSize: '0.86rem',
                              fontWeight: 700,
                              color: '#f8fafc',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {primaryCustomer.label}
                          </div>
                          {primaryRestaurant && (
                            <div
                              style={{
                                fontSize: '0.7rem',
                                color: '#94a3b8',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Store: {primaryRestaurant.name}
                            </div>
                          )}
                        </div>
                      </div>
                      {primaryCallStatus && (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            color: primaryCallStatus === 'CONNECTED' ? '#34d399' : '#38bdf8',
                            background:
                              primaryCallStatus === 'CONNECTED'
                                ? 'rgba(16, 185, 129, 0.16)'
                                : 'rgba(56, 189, 248, 0.15)',
                            padding: '3px 8px',
                            borderRadius: '999px',
                            flexShrink: 0,
                          }}
                        >
                          {primaryCallStatus}
                        </span>
                      )}
                    </div>

                    <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                      <button
                        type="button"
                        data-testid={`call-customer-btn-${primaryOrder.orderId}`}
                        className="action-btn-sm"
                        style={{
                          flex: 1,
                          minHeight: '44px',
                          justifyContent: 'center',
                          background: '#108329',
                          borderColor: '#2E9E4F',
                          color: '#FFFFFF',
                          cursor: 'pointer',
                        }}
                        onClick={() => onCallParticipant(primaryOrder, 'CUSTOMER')}
                      >
                        <i className="fa-solid fa-phone" /> Call Customer (In-App)
                      </button>
                      <button
                        type="button"
                        data-testid={`message-customer-btn-${primaryOrder.orderId}`}
                        className="action-btn-sm"
                        style={{
                          flex: 1,
                          minHeight: '44px',
                          justifyContent: 'center',
                          background: 'rgba(16, 185, 129, 0.14)',
                          borderColor: 'rgba(52, 211, 153, 0.4)',
                          color: '#34d399',
                          cursor: 'pointer',
                        }}
                        onClick={() => onOpenOrderChat(primaryOrder.orderId, 'RIDER_CUSTOMER')}
                      >
                        <i className="fa-solid fa-message" /> Message Customer
                        {primaryCustomerUnread > 0 && (
                          <span
                            data-testid={`unread-customer-badge-${primaryOrder.orderId}`}
                            style={{
                              background: '#ef4444',
                              color: '#fff',
                              borderRadius: '999px',
                              padding: '1px 6px',
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              marginLeft: '4px',
                            }}
                          >
                            {primaryCustomerUnread}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {!allStoresPickedUp ? (
                  <div className="stop-card locked-stop">
                    <span className="stop-badge stop-badge-locked">
                      <i className="fa-solid fa-lock" /> Final Stop · Customer (Locked)
                    </span>
                    <div style={{fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px'}}>
                      Pick up store items first to unlock doorstep route.
                    </div>
                  </div>
                ) : (
                  <div
                    className="stop-card active-stop"
                    style={{
                      borderColor: 'rgba(22, 163, 74, 0.45)',
                      background: 'rgba(22, 163, 74, 0.06)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span className="stop-badge stop-badge-green">
                        <i className="fa-solid fa-house" /> Final Stop · Customer
                      </span>
                      {distToCustomer !== null && (
                        <span
                          className="tabular-nums"
                          style={{fontSize: '0.74rem', color: '#34d399', fontWeight: 700}}
                        >
                          ~{distToCustomer.toFixed(1)} km
                        </span>
                      )}
                    </div>
                    <strong
                      style={{display: 'block', color: '#fff', fontSize: '0.98rem', marginTop: '2px'}}
                    >
                      {trip.address}
                    </strong>

                    <div className="action-links-bar">
                      <a
                        href={customerMapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="action-btn-sm map-customer"
                      >
                        <i className="fa-solid fa-diamond-turn-right" /> Navigate
                      </a>
                    </div>

                    <div
                      className={`payment-box ${
                        isPrepaidVerified ? 'upi-paid' : isUpiPending ? 'upi-pending' : 'cod'
                      }`}
                    >
                      <div>
                        <small
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: 'var(--text-muted)',
                          }}
                        >
                          Payment
                        </small>
                        <div style={{fontWeight: 700, fontSize: '0.88rem'}}>
                          {isWallet
                            ? 'Wallet Paid'
                            : isUpi
                              ? isPrepaidVerified
                                ? 'UPI Online Paid'
                                : 'UPI Unverified'
                              : 'Cash on Delivery'}
                        </div>
                      </div>
                      <div className="cod-val">₹{totalBillAmt.toFixed(0)}</div>
                    </div>

                    <div style={{marginTop: '10px'}}>
                      {!isOutForDelivery ? (
                        <button
                          type="button"
                          className="btn btn-info btn-action-lg"
                          onClick={() => onStartDoorstepRoute(trip.tripId)}
                        >
                          <i className="fa-solid fa-motorcycle" /> Start Doorstep Route
                        </button>
                      ) : (
                        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                          <button
                            type="button"
                            data-testid="open-pin-verify-btn"
                            className="btn btn-success btn-action-lg"
                            style={{flex: 1.2, minWidth: '140px'}}
                            onClick={() =>
                              onOpenVerifyModal(trip.tripId, totalBillAmt, isPrepaidVerified, 'pin')
                            }
                          >
                            <i className="fa-solid fa-key" /> Enter PIN
                          </button>
                          <button
                            type="button"
                            data-testid="open-qr-verify-btn"
                            className="btn btn-outline btn-action-lg"
                            style={{
                              flex: 1,
                              minWidth: '125px',
                              borderColor: 'rgba(52, 211, 153, 0.5)',
                              color: '#34d399',
                              background: 'rgba(16, 185, 129, 0.08)',
                            }}
                            onClick={() =>
                              onOpenVerifyModal(trip.tripId, totalBillAmt, isPrepaidVerified, 'qr')
                            }
                          >
                            <i className="fa-solid fa-qrcode" /> Scan QR
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    marginTop: '0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {allowRiderSos ? (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.4)'}}
                      onClick={() => onOpenSosModal(trip.tripId)}
                    >
                      <i className="fa-solid fa-triangle-exclamation" /> Road Issue
                    </button>
                  ) : (
                    <span />
                  )}

                  {hasAnyPickedUp ? (
                    <span style={{fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700}}>
                      <i className="fa-solid fa-lock" style={{color: '#fbbf24', marginRight: '4px'}} />
                      Picked Up · Cancel Locked
                    </span>
                  ) : (
                    allowRiderPassTrip && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.35)'}}
                        onClick={() => onOpenCancelModal(trip.tripId)}
                      >
                        <i className="fa-solid fa-ban" /> Pass Trip
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
