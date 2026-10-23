import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServerSchema } from '@typestub/infer';
import { createDataset, createMockServer } from '@typestub/messy-mock';
import {
  connectMcp, createServer, mcpCallTool, runAnthropicToolUse, toAnthropicTools, toCodemodeTools, ToolError, validate,
  type CallTool, type DriftEntry,
} from '@typestub/shim';
import { mockSchema } from '../../../tests/helpers/mock-schema.js';

let schema: ServerSchema;
let callTool: CallTool;
let close: () => Promise<void>;
const ds = createDataset();

beforeAll(async () => {
  ({ schema } = await mockSchema());
  const [c, s] = InMemoryTransport.createLinkedPair();
  await createMockServer().connect(s);
  const client = await connectMcp(c);
  callTool = mcpCallTool(client);
  close = () => client.close();
});
afterAll(() => close());

describe('createServer', () => {
  it('unwraps text-wrapped JSON and structuredContent', async () => {
    const mock = createServer(schema, callTool);
    const page = (await mock.listCustomers({ limit: 2 })) as { items: unknown[]; next_cursor: string };
    expect(page.items).toHaveLength(2);
    const order = (await mock.getOrder({ order_id: ds.orders[0].id })) as { id: string };
    expect(order.id).toBe(ds.orders[0].id);
  });

  it('throws ToolError on isError', async () => {
    const mock = createServer(schema, callTool);
    await expect(mock.getCustomer({ customer_id: 'cus_nope' })).rejects.toBeInstanceOf(ToolError);
  });

  it('auto-paginates *All helpers', async () => {
    const mock = createServer(schema, callTool);
    const all = (await mock.listOrdersAll({ limit: 7 })) as unknown[];
    expect(all).toHaveLength(ds.orders.length);
  });

  it('logs drift without blocking', async () => {
    const drift: DriftEntry[] = [];
    const tampered: CallTool = async (name, args) => {
      const r = await callTool(name, args);
      const c = JSON.parse(r.content![0].text!);
      c.brand_new = 1;
      delete c.tier;
      return { content: [{ type: 'text', text: JSON.stringify(c) }] };
    };
    const mock = createServer(schema, tampered, { validate: true, drift: (e) => drift.push(e) });
    const c = await mock.getCustomer({ customer_id: ds.customers[0].id });
    expect(c).toBeDefined();
    const kinds = drift[0].mismatches.map((m) => `${m.kind}:${m.path}`);
    expect(kinds).toContain('new_field:$.brand_new');
    expect(kinds).toContain('missing_required:$.tier');
  });
});

describe('validate', () => {
  it('accepts every real response for the inferred schema', async () => {
    const t = schema.tools.find((x) => x.tool === 'list_events')!;
    const r = await callTool('list_events', { limit: 50 });
    expect(validate(t.output, JSON.parse(r.content![0].text!))).toEqual([]);
  });
  it('flags type changes', () => {
    expect(validate({ type: 'object', properties: { a: { type: 'integer' } } }, { a: 'x' })[0].kind).toBe('type_mismatch');
  });
});

describe('adapters', () => {
  it('builds programmatic-tool-calling definitions', () => {
    const defs = toAnthropicTools(schema, { get_order: 'class Order(TypedDict): ...' });
    const d = defs.find((x) => x.name === 'get_order')!;
    expect(d.allowed_callers).toEqual(['code_execution_20260120']);
    expect(d.description).toContain('class Order');
  });
  it('runs tool_use blocks', async () => {
    const r = await runAnthropicToolUse({ id: 'tu_1', name: 'get_customer', input: { customer_id: 'x' } }, callTool);
    expect(r.is_error).toBe(true);
  });
  it('exposes code-mode tool records', async () => {
    const tools = toCodemodeTools(schema, createServer(schema, callTool));
    expect(Object.keys(tools)).toContain('listEventsAll');
    expect(((await tools.listTickets.execute({ limit: 1 })) as { data: unknown[] }).data).toHaveLength(1);
  });
});
