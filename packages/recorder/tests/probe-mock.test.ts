import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inferServer, schemaAccuracy, type ServerSchema } from '@typestub/infer';
import { createMockServer, REFERENCE_SCHEMAS } from '@typestub/messy-mock';
import { connectUpstream, runProbe, SampleStore, type ProbeReport } from '@typestub/recorder';

let root: string;
let schema: ServerSchema;
let report: ProbeReport;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'typestub-'));
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await createMockServer().connect(serverT);
  const client = await connectUpstream(clientT);
  const store = new SampleStore(root, 'messy-mock');
  report = await runProbe(client, store, { perTool: 30 });
  await client.close();
  schema = inferServer('messy-mock', store.loadTools(), store.readSamples());
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('probe + infer on the messy mock', () => {
  it('probes every tool', () => {
    expect(report.skipped).toEqual([]);
    // get_customer_stats only has 6 distinct argument sets.
    for (const t of Object.keys(REFERENCE_SCHEMAS)) expect(report.called[t]).toBeGreaterThanOrEqual(t === 'get_customer_stats' ? 6 : 20);
  });

  it('reaches >= 95% field-level accuracy against the hand-written reference', () => {
    let matched = 0;
    let total = 0;
    const misses: string[] = [];
    for (const t of schema.tools) {
      const r = schemaAccuracy(REFERENCE_SCHEMAS[t.tool] as never, t.output);
      matched += r.matched;
      total += r.total;
      for (const m of r.mismatches) misses.push(`${t.tool} ${m.path}: expected ${JSON.stringify(m.expected)} got ${JSON.stringify(m.actual)}`);
    }
    const acc = matched / total;
    console.log(`field accuracy ${(acc * 100).toFixed(1)}% (${matched}/${total})\n${misses.join('\n')}`);
    expect(acc).toBeGreaterThanOrEqual(0.95);
  });

  it('detects the structural patterns', () => {
    const byName = Object.fromEntries(schema.tools.map((t) => [t.tool, t]));
    expect(byName.list_customers.output['x-pagination']).toEqual({ items: 'items', next: 'next_cursor', total: 'total' });
    expect(byName.list_events.output.properties!.items.items!['x-discriminator']).toBe('type');
    expect(byName.get_customer_stats.output.properties!.by_customer['x-map']).toBe(true);
    expect(byName.get_order.source).toBe('declared+inferred');
    expect(byName.get_order.wrap).toBe('structured');
    expect(byName.list_orders.wrap).toBe('json-text');
  });
});
