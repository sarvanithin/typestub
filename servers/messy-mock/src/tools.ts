import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Dataset } from './types.js';

type Args = Record<string, unknown>;
type Handler = (ds: Dataset, args: Args) => CallToolResult;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const str = (description: string) => ({ type: 'string', description });
const int = (description: string) => ({ type: 'integer', description });
const enumOf = (values: string[], description: string) => ({ type: 'string', enum: values, description });

/** Tool results are deliberately inconsistent: most wrap JSON in a text block, one uses structuredContent. */
const textJson = (value: unknown): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const notFound = (what: string, id: unknown): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text: `${what} not found: ${String(id)}` }],
});

/** Opaque cursors are just encoded offsets. */
const encodeCursor = (offset: number) => `c_${offset}`;
const decodeCursor = (cursor: unknown): number => {
  if (typeof cursor !== 'string') return 0;
  const n = Number(cursor.replace(/^c_/, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const clampLimit = (v: unknown, dflt: number) => Math.min(Math.max(Number.isInteger(v) ? (v as number) : dflt, 1), 50);

function paginate<T>(rows: T[], args: Args, dflt: number) {
  const offset = decodeCursor(args.cursor);
  const limit = clampLimit(args.limit, dflt);
  const page = rows.slice(offset, offset + limit);
  const next = offset + limit < rows.length ? encodeCursor(offset + limit) : null;
  return { page, next, total: rows.length };
}

interface ToolDef {
  tool: Tool;
  handler: Handler;
}

export const TOOLS: ToolDef[] = [
  {
    tool: {
      name: 'list_customers',
      description: 'List customers, optionally filtered by tier or tag. Paginated with cursor.',
      inputSchema: {
        type: 'object',
        properties: {
          tier: enumOf(['free', 'pro', 'enterprise'], 'Filter by plan tier'),
          tag: str('Only customers carrying this tag'),
          cursor: str('Pagination cursor from a previous call'),
          limit: int('Page size, 1-50 (default 10)'),
        },
      },
      annotations: READ_ONLY,
    },
    handler: (ds, args) => {
      let rows = ds.customers;
      if (args.tier) rows = rows.filter((c) => c.tier === args.tier);
      if (args.tag) rows = rows.filter((c) => c.tags.includes(String(args.tag)));
      const { page, next, total } = paginate(rows, args, 10);
      return textJson({ items: page, next_cursor: next, total });
    },
  },
  {
    tool: {
      name: 'get_customer',
      description: 'Fetch one customer by id.',
      inputSchema: { type: 'object', properties: { customer_id: str('Customer id (cus_...)') }, required: ['customer_id'] },
      annotations: READ_ONLY,
    },
    handler: (ds, args) => {
      const c = ds.customers.find((x) => x.id === args.customer_id);
      return c ? textJson(c) : notFound('customer', args.customer_id);
    },
  },
  {
    tool: {
      name: 'list_orders',
      description: 'List orders, oldest first. Filters combine with AND. Paginated with cursor.',
      inputSchema: {
        type: 'object',
        properties: {
          customer_id: str('Only orders for this customer'),
          status: enumOf(['pending', 'paid', 'shipped', 'refunded', 'cancelled'], 'Filter by status'),
          placed_after: str('ISO 8601 timestamp, inclusive'),
          placed_before: str('ISO 8601 timestamp, exclusive'),
          cursor: str('Pagination cursor from a previous call'),
          limit: int('Page size, 1-50 (default 20)'),
        },
      },
      annotations: READ_ONLY,
    },
    handler: (ds, args) => {
      let rows = ds.orders;
      if (args.customer_id) rows = rows.filter((o) => o.customer_id === args.customer_id);
      if (args.status) rows = rows.filter((o) => o.status === args.status);
      if (args.placed_after) rows = rows.filter((o) => o.placed_at >= String(args.placed_after));
      if (args.placed_before) rows = rows.filter((o) => o.placed_at < String(args.placed_before));
      const { page, next } = paginate(rows, args, 20);
      return textJson({ results: page, next });
    },
  },
  {
    tool: {
      name: 'get_order',
      description: 'Fetch one order by id.',
      inputSchema: { type: 'object', properties: { order_id: str('Order id (uuid)') }, required: ['order_id'] },
      // Partial declared schema: inference must keep these and fill in the rest.
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Order id' },
          status: { type: 'string', enum: ['pending', 'paid', 'shipped', 'refunded', 'cancelled'] },
          total_cents: { type: 'integer', description: 'Order total in minor units of currency' },
        },
        required: ['id', 'status', 'total_cents'],
      },
      annotations: READ_ONLY,
    },
    handler: (ds, args) => {
      const o = ds.orders.find((x) => x.id === args.order_id);
      if (!o) return notFound('order', args.order_id);
      return { structuredContent: { ...o }, content: [{ type: 'text', text: JSON.stringify(o) }] };
    },
  },
  {
    tool: {
      name: 'list_tickets',
      description: 'List support tickets. Paginated with cursor.',
      inputSchema: {
        type: 'object',
        properties: {
          state: enumOf(['open', 'pending', 'closed'], 'Filter by state'),
          priority: enumOf(['low', 'normal', 'high', 'urgent'], 'Filter by priority'),
          cursor: str('Pagination cursor from a previous call'),
          limit: int('Page size, 1-50 (default 20)'),
        },
      },
      annotations: READ_ONLY,
    },
    handler: (ds, args) => {
      let rows = ds.tickets;
      if (args.state) rows = rows.filter((t) => t.state === args.state);
      if (args.priority) rows = rows.filter((t) => t.priority === args.priority);
      const { page, next, total } = paginate(rows, args, 20);
      return textJson({ data: page, cursor: next, total });
    },
  },
  {
    tool: {
      name: 'get_ticket',
      description: 'Fetch one ticket with a short customer summary.',
      inputSchema: { type: 'object', properties: { ticket_id: int('Numeric ticket id') }, required: ['ticket_id'] },
      annotations: READ_ONLY,
    },
    handler: (ds, args) => {
      const t = ds.tickets.find((x) => x.id === Number(args.ticket_id));
      if (!t) return notFound('ticket', args.ticket_id);
      const c = ds.customers.find((x) => x.id === t.customer_id)!;
      return textJson({ ticket: t, customer: { id: c.id, name: c.name, tier: c.tier } });
    },
  },
  {
    tool: {
      name: 'list_events',
      description: 'Activity feed for all customers, oldest first. Paginated with cursor.',
      inputSchema: {
        type: 'object',
        properties: {
          customer_id: str('Only events for this customer'),
          type: enumOf(['order_created', 'payment_failed', 'ticket_opened', 'login', 'refund_issued'], 'Filter by event type'),
          cursor: str('Pagination cursor from a previous call'),
          limit: int('Page size, 1-50 (default 25)'),
        },
      },
      annotations: READ_ONLY,
    },
    handler: (ds, args) => {
      let rows = ds.events;
      if (args.customer_id) rows = rows.filter((e) => e.customer_id === args.customer_id);
      if (args.type) rows = rows.filter((e) => e.type === args.type);
      const { page, next } = paginate(rows, args, 25);
      return textJson({ items: page, next_cursor: next });
    },
  },
  {
    tool: {
      name: 'get_customer_stats',
      description: 'Per-customer order statistics, keyed by customer id. Only customers with matching orders appear.',
      inputSchema: {
        type: 'object',
        properties: { status: enumOf(['pending', 'paid', 'shipped', 'refunded', 'cancelled'], 'Only count orders with this status') },
      },
      annotations: READ_ONLY,
    },
    handler: (ds, args) => {
      const by: Record<string, { order_count: number; spend_cents: number; last_order_at: string }> = {};
      for (const o of ds.orders) {
        if (args.status && o.status !== args.status) continue;
        const s = (by[o.customer_id] ??= { order_count: 0, spend_cents: 0, last_order_at: o.placed_at });
        s.order_count += 1;
        s.spend_cents += o.total_cents;
        if (o.placed_at > s.last_order_at) s.last_order_at = o.placed_at;
      }
      return textJson({ generated_at: '2026-05-01T00:00:00.000Z', by_customer: by });
    },
  },
];
