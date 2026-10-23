import { existsSync, readFileSync } from 'node:fs';
import type { McpToolResult, Sample } from '@typestub/infer';
import type { DriftEntry, Mismatch, MismatchKind } from '@typestub/shim';

export type DriftClass = 'safe' | 'breaking';

/**
 * New fields and new enum values are additive: existing code keeps working, so stubs can be
 * regenerated automatically. Missing required fields and type changes break code written
 * against the current stubs and need review.
 */
export const CLASSIFICATION: Record<MismatchKind, DriftClass> = {
  new_field: 'safe',
  enum_value: 'safe',
  missing_required: 'breaking',
  type_mismatch: 'breaking',
};

export function classify(m: Mismatch): DriftClass {
  return CLASSIFICATION[m.kind];
}

export interface DriftFinding {
  tool: string;
  path: string;
  kind: MismatchKind;
  class: DriftClass;
  count: number;
  example: Mismatch;
}

export interface DriftReport {
  schemaHash?: string;
  entries: number;
  safe: DriftFinding[];
  breaking: DriftFinding[];
}

/** Read a drift log (JSONL written by the shim), skipping malformed lines. */
export function readDrift(path: string): DriftEntry[] {
  if (!existsSync(path)) return [];
  const out: DriftEntry[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as DriftEntry);
    } catch {
      // ignore partial writes
    }
  }
  return out;
}

/** Array indices are normalised so `$.items[3].x` and `$.items[7].x` group together. */
const normPath = (p: string) => p.replace(/\[\d+\]/g, '[]').replace(/\["[^"]*"\]/g, '{}');

/** Group mismatches by tool, path and kind; only entries for `schemaHash` (current stubs) count. */
export function analyze(entries: DriftEntry[], schemaHash?: string): DriftReport {
  const relevant = schemaHash ? entries.filter((e) => e.schemaHash === schemaHash) : entries;
  const groups = new Map<string, DriftFinding>();
  for (const e of relevant) {
    for (const m of e.mismatches) {
      const path = normPath(m.path);
      const key = `${e.tool}\u0000${path}\u0000${m.kind}`;
      const g = groups.get(key);
      if (g) g.count++;
      else groups.set(key, { tool: e.tool, path, kind: m.kind, class: classify(m), count: 1, example: m });
    }
  }
  const all = [...groups.values()].sort((a, b) => b.count - a.count);
  return { schemaHash, entries: relevant.length, safe: all.filter((f) => f.class === 'safe'), breaking: all.filter((f) => f.class === 'breaking') };
}

/** Responses captured with drift, as samples to fold back into inference. */
export function driftSamples(entries: DriftEntry[], redact: (r: McpToolResult) => McpToolResult): Sample[] {
  return entries
    .filter((e) => e.response)
    .map((e) => ({ tool: e.tool, args: {}, response: redact(e.response!), timestamp: e.timestamp, source: 'drift' as const }));
}

export function formatReport(server: string, r: DriftReport): string {
  const line = (f: DriftFinding) =>
    `- ${f.tool} ${f.path}: ${f.kind}${f.example.expected ? ` (expected ${f.example.expected}, got ${f.example.actual})` : f.example.actual ? ` (${f.example.actual})` : ''} ×${f.count}`;
  return [
    `# Drift report: ${server} (schema ${r.schemaHash ?? 'any'})`,
    `${r.entries} responses with mismatches.`,
    '',
    `## Breaking (${r.breaking.length}) — review before regenerating`,
    ...r.breaking.map(line),
    '',
    `## Safe (${r.safe.length}) — regenerated automatically`,
    ...r.safe.map(line),
    '',
  ].join('\n');
}
