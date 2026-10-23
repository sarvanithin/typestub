import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { driftPass, init } from '../src/commands.js';

const MOCK = resolve(__dirname, '../../../servers/messy-mock/dist/bin.js');

describe('typestub init + watch against the messy mock (stdio)', () => {
  it('records, infers, generates, then folds safe drift and reports breaking drift', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cli-'));
    const root = join(dir, '.typestub');
    const out = join(dir, 'stubs');
    const { report, schema, files } = await init('messy-mock', { root, out, lang: 'both', command: ['node', MOCK], perTool: 20 });
    expect(report.skipped).toEqual([]);
    expect(schema.tools).toHaveLength(8);
    for (const f of ['messy-mock.d.ts', 'messy-mock.js', 'messy-mock.index.md', 'messy-mock.schema.json', 'messy_mock.py', 'index.js']) {
      expect(existsSync(join(out, f))).toBe(true);
    }
    expect(files.length).toBeGreaterThan(4);
    const meta = JSON.parse(readFileSync(join(root, 'messy-mock', 'server.json'), 'utf8'));
    expect(meta.launch).toEqual({ kind: 'stdio', command: 'node', args: [MOCK] });

    // Safe drift: a new field appears. It is folded in and the stubs are regenerated.
    const drift = join(root, 'messy-mock', 'drift.jsonl');
    const payload = { id: 'cus_x1y2z3w4', name: 'N', email: null, tier: 'pro', created_at: '2026-01-01T00:00:00.000Z', tags: [], manager_id: null, loyalty_points: 5 };
    const entry = { server: 'messy-mock', schemaHash: schema.schemaHash, tool: 'get_customer', timestamp: 'now', mismatches: [{ path: '$.loyalty_points', kind: 'new_field', actual: 'integer' }], response: { content: [{ type: 'text', text: JSON.stringify(payload) }] } };
    appendFileSync(drift, JSON.stringify(entry) + '\n');
    const safe = driftPass('messy-mock', { root, out });
    expect(safe).toMatchObject({ regenerated: true, safe: 1, breaking: 0 });
    expect(readFileSync(join(out, 'messy-mock.d.ts'), 'utf8')).toContain('loyalty_points?: number;');

    // Breaking drift against the new schema: reported, not folded in.
    const newHash = JSON.parse(readFileSync(join(root, 'messy-mock', 'schema.json'), 'utf8')).schemaHash;
    appendFileSync(drift, JSON.stringify({ ...entry, schemaHash: newHash, mismatches: [{ path: '$.tier', kind: 'missing_required' }] }) + '\n');
    const breaking = driftPass('messy-mock', { root, out });
    expect(breaking).toMatchObject({ regenerated: false, breaking: 1 });
    expect(readFileSync(breaking.reportPath!, 'utf8')).toContain('missing_required');
  });
});
