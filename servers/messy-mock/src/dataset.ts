import { createRng, type Rng } from './rng.js';
import type { Customer, Dataset, Event, LineItem, Order, Priority, Ticket } from './types.js';

const FIRST = ['Ada', 'Grace', 'Alan', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Radia', 'Tim', 'Frances', 'Edsger', 'Hedy', 'John', 'Katherine'];
const LAST = ['Lovelace', 'Hopper', 'Turing', 'Torvalds', 'Hamilton', 'Ritchie', 'Liskov', 'Thompson', 'Perlman', 'Berners', 'Allen', 'Dijkstra', 'Lamarr', 'Backus', 'Johnson'];
const CITIES: Array<[string, NonNullable<Customer['address']>['country']]> = [
  ['Austin', 'US'], ['Berlin', 'DE'], ['London', 'GB'], ['Pune', 'IN'], ['Lyon', 'FR'], ['Denver', 'US'], ['Munich', 'DE'],
];
const TAGS = ['vip', 'beta', 'churn-risk', 'partner'];
const AGENTS = [
  { id: 'usr_k3n9', name: 'Priya Natarajan' },
  { id: 'usr_m2x7', name: 'Diego Alvarez' },
  { id: 'usr_q8w1', name: 'Mei Chen' },
];
const SUBJECTS = ['Cannot log in', 'Refund request', 'Invoice mismatch', 'Shipping delay', 'Feature question', 'Card charged twice', 'Account locked'];
const SKUS = ['SKU-100', 'SKU-205', 'SKU-310', 'SKU-420', 'SKU-555', 'SKU-610'];
const PRICES: Record<string, number> = { 'SKU-100': 1299, 'SKU-205': 4500, 'SKU-310': 899, 'SKU-420': 15000, 'SKU-555': 2599, 'SKU-610': 349 };

// All timestamps fall between 2026-01-01 and 2026-04-30 UTC.
const START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2026, 3, 30, 23, 59, 59);

function isoBetween(rng: Rng, from = START, to = END): string {
  const t = from + Math.floor(rng.next() * (to - from));
  return new Date(Math.floor(t / 1000) * 1000).toISOString();
}

function makeCustomer(rng: Rng, i: number): Customer {
  const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}`;
  const c: Customer = {
    id: `cus_${rng.alnum(8)}`,
    name,
    email: rng.chance(0.15) ? null : `${name.toLowerCase().replace(' ', '.')}${i}@example.com`,
    tier: rng.pick(['free', 'free', 'pro', 'pro', 'enterprise'] as const),
    created_at: isoBetween(rng, Date.UTC(2025, 0, 1), START),
    tags: rng.chance(0.6) ? [] : TAGS.filter(() => rng.chance(0.4)),
    manager_id: rng.chance(0.5) ? null : rng.pick(AGENTS).id,
  };
  if (rng.chance(0.7)) {
    const [city, country] = rng.pick(CITIES);
    c.address = rng.chance(0.6) ? { city, country, postal_code: String(rng.int(10000, 99999)) } : { city, country };
  }
  if (rng.chance(0.5)) {
    const source = rng.pick(['web', 'sales', 'referral'] as const);
    c.metadata = source === 'referral' && rng.chance(0.8) ? { source, referrer_id: `cus_${rng.alnum(8)}` } : { source };
  }
  return c;
}

function makeOrder(rng: Rng, customers: Customer[]): Order {
  const items: LineItem[] = [];
  const n = rng.int(1, 4);
  for (let k = 0; k < n; k++) {
    const sku = rng.pick(SKUS);
    const item: LineItem = { sku, qty: rng.int(1, 3), unit_price_cents: PRICES[sku] };
    if (rng.chance(0.2)) item.discount_cents = rng.pick([100, 250, 500]);
    items.push(item);
  }
  const total = items.reduce((s, it) => s + it.qty * it.unit_price_cents - (it.discount_cents ?? 0), 0);
  const status = rng.pick(['pending', 'paid', 'paid', 'shipped', 'shipped', 'refunded', 'cancelled'] as const);
  const placed_at = isoBetween(rng);
  let shipping: Order['shipping'] = null;
  if (status === 'shipped' || (status === 'refunded' && rng.chance(0.5))) {
    shipping = { carrier: rng.pick(['ups', 'fedex', 'dhl'] as const) };
    if (rng.chance(0.8)) shipping.tracking_number = `1Z${rng.alnum(10).toUpperCase()}`;
    if (rng.chance(0.7)) shipping.shipped_at = isoBetween(rng, Date.parse(placed_at), END);
  }
  const o: Order = {
    id: rng.uuid(),
    customer_id: rng.pick(customers).id,
    status,
    placed_at,
    currency: rng.pick(['USD', 'USD', 'EUR', 'GBP'] as const),
    total_cents: total,
    line_items: items,
    shipping,
    notes: rng.chance(0.75) ? null : rng.pick(['Leave at door', 'Gift wrap please', 'Call before delivery']),
  };
  if (rng.chance(0.15)) o.coupon = rng.pick(['SPRING10', 'WELCOME5', 'VIP20']);
  return o;
}

function makeTicket(rng: Rng, id: number, customers: Customer[]): Ticket {
  const state = rng.pick(['open', 'open', 'pending', 'closed'] as const);
  const created_at = isoBetween(rng);
  const t: Ticket = {
    id,
    customer_id: rng.pick(customers).id,
    subject: `${rng.pick(SUBJECTS)} (#${id})`,
    priority: rng.pick(['low', 'normal', 'normal', 'high', 'urgent'] as const),
    state,
    assignee: rng.chance(0.4) ? null : rng.pick(AGENTS),
    labels: rng.chance(0.5) ? [] : ['bug', 'billing', 'shipping', 'auth'].filter(() => rng.chance(0.35)),
    comment_count: rng.int(0, 14),
    created_at,
    attachments: [],
  };
  if (state === 'closed') t.closed_at = isoBetween(rng, Date.parse(created_at), END);
  return t;
}

function makeEvent(rng: Rng, ds: Omit<Dataset, 'events'>): Event {
  const base = { id: `evt_${rng.alnum(10)}`, occurred_at: isoBetween(rng) };
  const kind = rng.pick(['order_created', 'order_created', 'payment_failed', 'ticket_opened', 'login', 'login', 'refund_issued'] as const);
  switch (kind) {
    case 'order_created': {
      const o = rng.pick(ds.orders);
      return { ...base, customer_id: o.customer_id, type: kind, order_id: o.id, total_cents: o.total_cents };
    }
    case 'payment_failed': {
      const o = rng.pick(ds.orders);
      const e: Event = {
        ...base, customer_id: o.customer_id, type: kind, order_id: o.id,
        reason: rng.pick(['card_declined', 'insufficient_funds', 'expired_card'] as const),
      };
      if (rng.chance(0.6)) e.retry_at = isoBetween(rng, Date.parse(base.occurred_at), END);
      return e;
    }
    case 'ticket_opened': {
      const t = rng.pick(ds.tickets);
      return { ...base, customer_id: t.customer_id, type: kind, ticket_id: t.id, priority: t.priority as Priority };
    }
    case 'login': {
      const e: Event = {
        ...base, customer_id: rng.pick(ds.customers).id, type: kind,
        ip: `10.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(1, 254)}`,
      };
      if (rng.chance(0.7)) {
        const os = rng.pick(['ios', 'android', 'macos', 'windows'] as const);
        e.device = rng.chance(0.5) ? { os, app_version: `4.${rng.int(0, 9)}.${rng.int(0, 20)}` } : { os };
      }
      return e;
    }
    case 'refund_issued': {
      const o = rng.pick(ds.orders);
      const partial = rng.chance(0.4);
      return {
        ...base, customer_id: o.customer_id, type: kind, order_id: o.id,
        amount_cents: partial ? Math.floor(o.total_cents / 2) : o.total_cents, partial,
      };
    }
  }
}

const byTime = <T>(key: (x: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b));

export function createDataset(seed = 42): Dataset {
  const rng = createRng(seed);
  const customers = Array.from({ length: 40 }, (_, i) => makeCustomer(rng, i));
  const orders = Array.from({ length: 200 }, () => makeOrder(rng, customers)).sort(byTime((o) => o.placed_at));
  const tickets = Array.from({ length: 60 }, (_, i) => makeTicket(rng, 1001 + i, customers));
  const events = Array.from({ length: 300 }, () => makeEvent(rng, { customers, orders, tickets })).sort(
    byTime((e) => e.occurred_at),
  );
  return { customers, orders, tickets, events };
}
