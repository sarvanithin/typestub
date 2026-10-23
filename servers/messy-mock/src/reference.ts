/**
 * Hand-written reference output schemas for every mock tool, in the same JSON Schema
 * conventions TypeStub emits. Used to score field-level inference accuracy.
 */
type S = Record<string, unknown>;

const OPT = Symbol('optional');
type Field = S & { [OPT]?: true };

const opt = (s: S): Field => ({ ...s, [OPT]: true });
const str = (format?: string): S => (format ? { type: 'string', format } : { type: 'string' });
const int = (): S => ({ type: 'integer' });
const bool = (): S => ({ type: 'boolean' });
const en = (...values: string[]): S => ({ type: 'string', enum: values });
const arr = (items: S): S => ({ type: 'array', items });
const emptyArr = (): S => ({ type: 'array', items: {}, 'x-emptyOnly': true });
const map = (value: S): S => ({ type: 'object', additionalProperties: value, 'x-map': true });

function nullable(s: S): S {
  const out: S = { ...s, type: [s.type as string, 'null'] };
  if (Array.isArray(s.enum)) out.enum = [...s.enum, null];
  return out;
}

function obj(fields: Record<string, Field>): S {
  const properties: Record<string, S> = {};
  const required: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    const { [OPT]: optional, ...rest } = v;
    properties[k] = rest;
    if (!optional) required.push(k);
  }
  return { type: 'object', properties, required };
}

function union(tag: string, variants: Record<string, Record<string, Field>>, base: Record<string, Field>): S {
  return {
    oneOf: Object.entries(variants).map(([value, fields]) => obj({ ...base, [tag]: { const: value, type: 'string' }, ...fields })),
    'x-discriminator': tag,
  };
}

const DATE = 'date-time';
const priority = en('low', 'normal', 'high', 'urgent');
const orderStatus = en('pending', 'paid', 'shipped', 'refunded', 'cancelled');

const customer = obj({
  id: str(),
  name: str(),
  email: nullable(str('email')),
  tier: en('free', 'pro', 'enterprise'),
  created_at: str(DATE),
  address: opt(obj({ city: str(), country: en('US', 'DE', 'GB', 'IN', 'FR'), postal_code: opt(str()) })),
  tags: arr(en('vip', 'beta', 'churn-risk', 'partner')),
  manager_id: nullable(str()),
  metadata: opt(obj({ source: en('web', 'sales', 'referral'), referrer_id: opt(str()) })),
});

const order = obj({
  id: str('uuid'),
  customer_id: str(),
  status: orderStatus,
  placed_at: str(DATE),
  currency: en('USD', 'EUR', 'GBP'),
  total_cents: int(),
  line_items: arr(
    obj({
      sku: en('SKU-100', 'SKU-205', 'SKU-310', 'SKU-420', 'SKU-555', 'SKU-610'),
      qty: int(),
      unit_price_cents: int(),
      discount_cents: opt(int()),
    }),
  ),
  shipping: nullable(
    obj({ carrier: en('ups', 'fedex', 'dhl'), tracking_number: opt(str()), shipped_at: opt(str(DATE)) }),
  ),
  coupon: opt(en('SPRING10', 'WELCOME5', 'VIP20')),
  notes: nullable(str()),
});

const ticket = obj({
  id: int(),
  customer_id: str(),
  subject: str(),
  priority,
  state: en('open', 'pending', 'closed'),
  assignee: nullable(obj({ id: str(), name: str() })),
  labels: arr(en('bug', 'billing', 'shipping', 'auth')),
  comment_count: int(),
  created_at: str(DATE),
  closed_at: opt(str(DATE)),
  attachments: emptyArr(),
});

const event = union(
  'type',
  {
    order_created: { order_id: str('uuid'), total_cents: int() },
    payment_failed: {
      order_id: str('uuid'),
      reason: en('card_declined', 'insufficient_funds', 'expired_card'),
      retry_at: opt(str(DATE)),
    },
    ticket_opened: { ticket_id: int(), priority },
    login: { ip: str(), device: opt(obj({ os: en('ios', 'android', 'macos', 'windows'), app_version: opt(str()) })) },
    refund_issued: { order_id: str('uuid'), amount_cents: int(), partial: bool() },
  },
  { id: str(), occurred_at: str(DATE), customer_id: str() },
);

export const REFERENCE_SCHEMAS: Record<string, S> = {
  list_customers: obj({ items: arr(customer), next_cursor: nullable(str()), total: int() }),
  get_customer: customer,
  list_orders: obj({ results: arr(order), next: nullable(str()) }),
  get_order: order,
  list_tickets: obj({ data: arr(ticket), cursor: nullable(str()), total: int() }),
  get_ticket: obj({ ticket, customer: obj({ id: str(), name: str(), tier: en('free', 'pro', 'enterprise') }) }),
  list_events: obj({ items: arr(event), next_cursor: nullable(str()) }),
  get_customer_stats: obj({
    generated_at: str(DATE),
    by_customer: map(obj({ order_count: int(), spend_cents: int(), last_order_at: str(DATE) })),
  }),
};
