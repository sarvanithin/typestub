import { paginationPlan, type JsonSchema, type ServerSchema, type ToolSchema } from '@typestub/infer';

/** Fields the model almost always needs to identify or filter records; never pruned first. */
const IDENTITY = /^(id|number|name|title|login|sha|state|status|type|kind|path|filename|tag_name|ref|key|label)$/;
/** Hypermedia and opaque bookkeeping fields: least useful per token. */
const NOISE = /(^|_)(url|node_id|gravatar_id)$/;

const isRecordArray = (s: JsonSchema) => !!s.items?.properties && Object.keys(s.items.properties).length > 1;

interface Candidate {
  owner: JsonSchema;
  key: string;
  score: number;
}

/**
 * Value of keeping a field, per token it costs: shallow, usually-present, identifying fields
 * score high; deep, rare, link-like fields and fields of low-confidence tools score low.
 */
function fieldScore(key: string, s: JsonSchema, depth: number, lowConfidence: boolean): number {
  let score = 1 / (1 + depth);
  // Rare-but-real fields (merged_at, closed_at) carry the information; only near-absent ones lose.
  const presence = s['x-presence'] ?? 1;
  score *= presence >= 0.1 ? 1 : 0.4;
  if (IDENTITY.test(key)) score *= 3;
  if (key !== 'html_url' && NOISE.test(key)) score *= 0.2;
  if (lowConfidence) score *= 0.5;
  // Per token: a nested object costs as much as all its fields, a scalar costs one.
  // Collections of records are what scripts iterate over.
  if (isRecordArray(s)) score *= 2;
  return score / Math.cbrt(subtreeSize(s)) / (1 + key.length / 40);
}

function subtreeSize(s: JsonSchema, seen = new Set<JsonSchema>()): number {
  if (!s || typeof s !== 'object' || seen.has(s)) return 1;
  seen.add(s);
  let n = 1;
  // Link fields fold into one signature and cost nearly nothing.
  for (const [k, v] of Object.entries(s.properties ?? {})) if (k === 'html_url' || !NOISE.test(k)) n += subtreeSize(v, seen);
  for (const v of [...(s.oneOf ?? []), ...(s.anyOf ?? [])]) n += subtreeSize(v, seen);
  if (s.items) n += subtreeSize(s.items, seen) - 1;
  return n;
}

/** Collect prunable fields of one tool output; pagination and discriminator keys are protected. */
function collect(root: JsonSchema, protectedKeys: Set<string>, lowConfidence: boolean, out: Candidate[]) {
  const seen = new Set<JsonSchema>();
  const walk = (s: JsonSchema | undefined, depth: number, tag?: string) => {
    if (!s || typeof s !== 'object' || seen.has(s)) return;
    seen.add(s);
    for (const v of s.oneOf ?? []) walk(v, depth, s['x-discriminator']);
    for (const v of s.anyOf ?? []) walk(v, depth);
    if (s.items) walk(s.items, depth);
    if (typeof s.additionalProperties === 'object') walk(s.additionalProperties, depth + 1);
    for (const [k, v] of Object.entries(s.properties ?? {})) {
      const isProtected = protectedKeys.has(k) || k === tag || (depth <= 1 && IDENTITY.test(k));
      if (!isProtected) out.push({ owner: s, key: k, score: fieldScore(k, v, depth, lowConfidence) });
      // Records in an array (a page's items, a commit's files) count as top level of their own.
      walk(v, protectedKeys.has(k) || isRecordArray(v) ? depth : depth + 1);
    }
  };
  walk(root, 0);
}

function protectedKeysOf(t: ToolSchema): Set<string> {
  const plan = paginationPlan(t);
  const keys = new Set<string>();
  if (plan) for (const p of [plan.itemsKey, plan.nextKey, plan.hasMoreKey]) p?.split('.').forEach((k) => keys.add(k));
  return keys;
}

/**
 * Copy of `schema` keeping only fields scoring at least `threshold`. Objects that lost fields get
 * `x-pruned` (the emitter adds an open index signature, so the omitted keys stay accessible).
 */
export function pruneSchema(schema: ServerSchema, threshold: number): ServerSchema {
  const copy: ServerSchema = structuredClone(schema);
  for (const c of candidates(copy)) {
    if (c.score >= threshold || !c.owner.properties?.[c.key]) continue;
    delete c.owner.properties[c.key];
    c.owner.required = c.owner.required?.filter((k) => k !== c.key);
    c.owner['x-pruned'] = (c.owner['x-pruned'] ?? 0) + 1;
  }
  return copy;
}

export function candidates(schema: ServerSchema): Candidate[] {
  const out: Candidate[] = [];
  for (const t of schema.tools) {
    const keys = protectedKeysOf(t);
    collect(t.output, keys, t.lowConfidence, out);
    for (const v of t.variants ?? []) collect(v.output, keys, t.lowConfidence, out);
  }
  return out;
}

/**
 * Smallest pruning that brings `cost(schema)` within `budget`: binary search over the distinct
 * field scores. Returns the original schema when it already fits, and the most-pruned schema
 * (protected fields only) when nothing fits.
 */
export function fitToBudget(schema: ServerSchema, budget: number, cost: (s: ServerSchema) => number): ServerSchema {
  if (cost(schema) <= budget) return schema;
  const scores = [...new Set(candidates(schema).map((c) => c.score))].sort((a, b) => a - b);
  let lo = 0;
  let hi = scores.length - 1;
  let best = pruneSchema(schema, Infinity);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    // Keep fields scoring above scores[mid]; drop it and everything below.
    const pruned = pruneSchema(schema, scores[mid] + Number.EPSILON);
    if (cost(pruned) <= budget) {
      best = pruned;
      hi = mid - 1;
    } else lo = mid + 1;
  }
  return best;
}
