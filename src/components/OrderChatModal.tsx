import {useEffect, useRef, useState, type FormEvent} from 'react';
import type {ChatChannel, OrderWithId, StoreInfo, TripChatMessage} from '../types/rider';
import {
  MAX_CHAT_MESSAGE_LENGTH,
  resolveCustomerIdentity,
  resolveRestaurantIdentity,
} from '../utils/communicationLogic';

interface OrderChatModalProps {
  open: boolean;
  order: OrderWithId | null;
  stores: Record<string, StoreInfo>;
  riderUid: string;
  initialChannel: ChatChannel;
  canChatCustomer: boolean;
  canChatRestaurant: boolean;
  customerUnread: number;
  restaurantUnread: number;
  getMessages: (orderId: string, channel: ChatChannel) => TripChatMessage[];
  onSwitchChannel: (orderId: string, channel: ChatChannel) => void;
  onSendMessage: (orderId: string, channel: ChatChannel, text: string) => Promise<boolean>;
  onRetryMessage: (orderId: string, message: TripChatMessage) => Promise<void>;
  onCallParticipant: (order: OrderWithId, role: 'CUSTOMER' | 'RESTAURANT') => void;
  onClose: () => void;
}

const CUSTOMER_QUICK_REPLIES = [
  'I am arriving shortly.',
  'I am outside your delivery address.',
  'Please keep the delivery PIN/QR ready.',
];

const RESTAURANT_QUICK_REPLIES = [
  'I have arrived for pickup.',
  'Please confirm when the order is ready.',
  'On my way to the store now.',
];

export function OrderChatModal({
  open,
  order,
  stores,
  riderUid,
  initialChannel,
  canChatCustomer,
  canChatRestaurant,
  customerUnread,
  restaurantUnread,
  getMessages,
  onSwitchChannel,
  onSendMessage,
  onRetryMessage,
  onCallParticipant,
  onClose,
}: OrderChatModalProps) {
  const [activeChannel, setActiveChannel] = useState<ChatChannel>(initialChannel);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setActiveChannel(initialChannel);
    }
  }, [open, initialChannel, order?.orderId]);

  const messages = order ? getMessages(order.orderId, activeChannel) : [];

  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [open, activeChannel, messages.length]);

  if (!open || !order) return null;

  const customer = resolveCustomerIdentity(order);
  const restaurant = resolveRestaurantIdentity(order, stores);
  const isCustomerTab = activeChannel === 'RIDER_CUSTOMER';
  const contactName = isCustomerTab ? customer.label : restaurant.name;
  const contactPhoto = isCustomerTab ? customer.photo : restaurant.photo;
  const canSendCurrent = isCustomerTab ? canChatCustomer : canChatRestaurant;
  const quickReplies = isCustomerTab ? CUSTOMER_QUICK_REPLIES : RESTAURANT_QUICK_REPLIES;

  const handleSelectChannel = (ch: ChatChannel) => {
    setActiveChannel(ch);
    onSwitchChannel(order.orderId, ch);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending || !draft.trim() || !canSendCurrent) return;
    setSending(true);
    try {
      const ok = await onSendMessage(order.orderId, activeChannel, draft.trim());
      if (ok) {
        setDraft('');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="modal-backdrop open"
      data-testid="order-chat-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Order Communication Chat"
    >
      <div
        className="modal-box"
        style={{
          maxWidth: '460px',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '88vh',
        }}
      >
        {/* Header with Contact profile, Order ID, In-App Call button */}
        <div
          style={{
            padding: '0.95rem 1rem',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(15, 23, 42, 0.96)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0}}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'rgba(22, 163, 74, 0.16)',
                border: '1px solid rgba(22, 163, 74, 0.4)',
                color: '#34D399',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {contactPhoto ? (
                <img
                  src={contactPhoto}
                  alt={contactName}
                  style={{width: '100%', height: '100%', objectFit: 'cover'}}
                />
              ) : (
                <i className={`fa-solid ${isCustomerTab ? 'fa-user' : 'fa-store'}`} />
              )}
            </div>
            <div style={{minWidth: 0}}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: '0.94rem',
                  color: '#F8FAFC',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {contactName}
              </div>
              <div className="tabular-nums" style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>
                Order #{order.orderId.slice(-6)} · {isCustomerTab ? 'Customer' : 'Restaurant'}
              </div>
            </div>
          </div>

          <div style={{display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0}}>
            {canSendCurrent && (
              <button
                type="button"
                data-testid="chat-header-call-btn"
                className="btn btn-primary btn-sm"
                style={{minHeight: '36px', padding: '0 0.75rem'}}
                onClick={() =>
                  onCallParticipant(order, isCustomerTab ? 'CUSTOMER' : 'RESTAURANT')
                }
              >
                <i className="fa-solid fa-phone" /> Call
              </button>
            )}
            <button
              type="button"
              className="modal-close-btn"
              aria-label="Close chat"
              onClick={onClose}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>

        {/* Two isolated communication tabs */}
        <div
          role="tablist"
          aria-label="Order Chat Channels"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '6px',
            padding: '0.6rem 0.9rem',
            background: '#0B1120',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            role="tab"
            data-testid="chat-tab-customer"
            aria-selected={isCustomerTab}
            onClick={() => handleSelectChannel('RIDER_CUSTOMER')}
            style={{
              minHeight: '38px',
              borderRadius: '10px',
              border: `1px solid ${
                isCustomerTab ? 'rgba(22, 163, 74, 0.5)' : 'var(--border)'
              }`,
              background: isCustomerTab ? 'rgba(22, 163, 74, 0.16)' : 'transparent',
              color: isCustomerTab ? '#34D399' : 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>Customer Chat</span>
            {customerUnread > 0 && (
              <span
                style={{
                  background: '#16A34A',
                  color: '#FFFFFF',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontSize: '0.66rem',
                }}
              >
                {customerUnread}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            data-testid="chat-tab-restaurant"
            aria-selected={!isCustomerTab}
            onClick={() => handleSelectChannel('RIDER_RESTAURANT')}
            style={{
              minHeight: '38px',
              borderRadius: '10px',
              border: `1px solid ${
                !isCustomerTab ? 'rgba(56, 189, 248, 0.5)' : 'var(--border)'
              }`,
              background: !isCustomerTab ? 'rgba(56, 189, 248, 0.16)' : 'transparent',
              color: !isCustomerTab ? '#38BDF8' : 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>Restaurant Chat</span>
            {restaurantUnread > 0 && (
              <span
                style={{
                  background: '#0284C7',
                  color: '#FFFFFF',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontSize: '0.66rem',
                }}
              >
                {restaurantUnread}
              </span>
            )}
          </button>
        </div>

        {/* Message History */}
        <div
          ref={scrollRef}
          data-testid="chat-messages-list"
          style={{
            flex: 1,
            minHeight: '230px',
            maxHeight: '360px',
            overflowY: 'auto',
            padding: '0.9rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            background: '#060A14',
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                margin: 'auto',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.78rem',
                padding: '1.5rem 0.5rem',
              }}
            >
              <i
                className="fa-regular fa-comments"
                style={{fontSize: '1.6rem', display: 'block', marginBottom: '6px', opacity: 0.6}}
              />
              Private {isCustomerTab ? 'Customer' : 'Restaurant'} chat for Order #
              {order.orderId.slice(-6)}.
              <div style={{fontSize: '0.7rem', marginTop: '4px'}}>
                Phone numbers are never shared.
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const isMine = m.senderUid === riderUid;
              const timeLabel = m.timestamp
                ? new Date(m.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';

              return (
                <div
                  key={m.messageId}
                  style={{
                    alignSelf: isMine ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    background: isMine
                      ? m.status === 'FAILED'
                        ? 'rgba(239, 68, 68, 0.2)'
                        : '#15803D'
                      : '#162033',
                    border: `1px solid ${
                      m.status === 'FAILED'
                        ? 'rgba(239, 68, 68, 0.45)'
                        : isMine
                          ? 'rgba(34, 197, 94, 0.35)'
                          : 'var(--border)'
                    }`,
                    color: '#F8FAFC',
                    borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    padding: '0.55rem 0.78rem',
                    fontSize: '0.83rem',
                    lineHeight: 1.4,
                  }}
                >
                  <div>{m.message}</div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '6px',
                      marginTop: '3px',
                      fontSize: '0.64rem',
                      color: isMine ? 'rgba(255, 255, 255, 0.78)' : 'var(--text-muted)',
                    }}
                  >
                    <span>{timeLabel}</span>
                    {isMine && m.status !== 'FAILED' && (
                      <span>
                        {m.status === 'READ' ? (
                          <i className="fa-solid fa-check-double" style={{color: '#38BDF8'}} />
                        ) : m.status === 'DELIVERED' ? (
                          <i className="fa-solid fa-check-double" />
                        ) : (
                          <i className="fa-solid fa-check" />
                        )}
                      </span>
                    )}
                    {isMine && m.status === 'FAILED' && (
                      <button
                        type="button"
                        onClick={() => void onRetryMessage(order.orderId, m)}
                        style={{
                          background: '#EF4444',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '1px 6px',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Quick replies */}
        {canSendCurrent && (
          <div
            style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              padding: '0.5rem 0.85rem',
              background: '#0B1120',
              borderTop: '1px solid var(--border)',
            }}
          >
            {quickReplies.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setDraft(q)}
                style={{
                  whiteSpace: 'nowrap',
                  borderRadius: '999px',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface-light)',
                  color: '#CBD5E1',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0.75rem 0.9rem',
            background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <input
            type="text"
            data-testid="chat-message-input"
            className="form-input"
            style={{flex: 1, minHeight: '42px', padding: '0.55rem 0.85rem'}}
            placeholder={
              canSendCurrent
                ? `Message ${isCustomerTab ? 'customer' : 'restaurant'}...`
                : 'Participant ID unavailable for this order'
            }
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            disabled={!canSendCurrent || sending}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="submit"
            data-testid="chat-send-btn"
            className="btn btn-primary btn-sm"
            style={{minHeight: '42px', minWidth: '64px'}}
            disabled={!canSendCurrent || sending || !draft.trim()}
          >
            <i className="fa-solid fa-paper-plane" />
          </button>
        </form>
      </div>
    </div>
  );
}
