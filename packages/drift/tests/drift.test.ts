import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze, classify, driftSamples, formatReport, readDrift } from '@typestub/drift';
import type { DriftEntry } from '@typestub/shim';

const entry = (hash: string, mismatches: DriftEntry['mismatches']): DriftEntry => ({
  server: 's', schemaHash: hash, tool: 'get_x', timestamp: 't', mismatches, response: { content: [{ type: 'text', text: '{}' }] },
});

describe('drift', () => {
  it('classifies new fields as safe and removals/type changes as breaking', () => {
    expect(classify({ path: '$.a', kind: 'new_field' })).toBe('safe');
    expect(classify({ path: '$.a', kind: 'enum_value' })).toBe('safe');
    expect(classify({ path: '$.a', kind: 'missing_required' })).toBe('breaking');
    expect(classify({ path: '$.a', kind: 'type_mismatch' })).toBe('breaking');
  });

  it('groups by normalised path and ignores entries from older stubs', () => {
    const entries = [
      entry('h1', [{ path: '$.items[0].x', kind: 'new_field' }, { path: '$.id', kind: 'type_mismatch', expected: '"string"', actual: 'integer' }]),
      entry('h1', [{ path: '$.items[5].x', kind: 'new_field' }]),
      entry('old', [{ path: '$.zzz', kind: 'missing_required' }]),
    ];
    const r = analyze(entries, 'h1');
    expect(r.entries).toBe(2);
    expect(r.safe).toEqual([expect.objectContaining({ path: '$.items[].x', count: 2 })]);
    expect(r.breaking).toHaveLength(1);
    expect(formatReport('s', r)).toContain('Breaking (1)');
  });

  it('reads JSONL logs and turns them into samples', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'drift-')), 'drift.jsonl');
    writeFileSync(p, JSON.stringify(entry('h', [])) + '\n{broken\n');
    const entries = readDrift(p);
    expect(entries).toHaveLength(1);
    expect(driftSamples(entries, (r) => r)[0].source).toBe('drift');
  });
});
