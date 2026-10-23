export type Tier = 'free' | 'pro' | 'enterprise';
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'refunded' | 'cancelled';
export type Currency = 'USD' | 'EUR' | 'GBP';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketState = 'open' | 'pending' | 'closed';

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  tier: Tier;
  created_at: string;
  address?: { city: string; country: 'US' | 'DE' | 'GB' | 'IN' | 'FR'; postal_code?: string };
  tags: string[];
  manager_id: string | null;
  metadata?: { source: 'web' | 'sales' | 'referral'; referrer_id?: string };
}

export interface LineItem {
  sku: string;
  qty: number;
  unit_price_cents: number;
  discount_cents?: number;
}

export interface Order {
  id: string;
  customer_id: string;
  status: OrderStatus;
  placed_at: string;
  currency: Currency;
  total_cents: number;
  line_items: LineItem[];
  shipping: null | { carrier: 'ups' | 'fedex' | 'dhl'; tracking_number?: string; shipped_at?: string };
  coupon?: string;
  notes: string | null;
}

export interface Ticket {
  id: number;
  customer_id: string;
  subject: string;
  priority: Priority;
  state: TicketState;
  assignee: null | { id: string; name: string };
  labels: string[];
  comment_count: number;
  created_at: string;
  closed_at?: string;
  attachments: never[];
}

interface EventBase {
  id: string;
  occurred_at: string;
  customer_id: string;
}

export type Event =
  | (EventBase & { type: 'order_created'; order_id: string; total_cents: number })
  | (EventBase & {
      type: 'payment_failed';
      order_id: string;
      reason: 'card_declined' | 'insufficient_funds' | 'expired_card';
      retry_at?: string;
    })
  | (EventBase & { type: 'ticket_opened'; ticket_id: number; priority: Priority })
  | (EventBase & {
      type: 'login';
      ip: string;
      device?: { os: 'ios' | 'android' | 'macos' | 'windows'; app_version?: string };
    })
  | (EventBase & { type: 'refund_issued'; order_id: string; amount_cents: number; partial: boolean });

export interface Dataset {
  customers: Customer[];
  orders: Order[];
  tickets: Ticket[];
  events: Event[];
}
