import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { extractPayload, PAGE_NEXT_KEYS, type JsonSchema, type ToolInfo } from '@typestub/infer';
import { parse as parseYaml } from 'yaml';
import { callAndRecord } from './proxy.js';
import type { SampleStore } from './store.js';

export interface ProbeConfig {
  /** Explicit allowlist of tools to call. When absent, only tools annotated readOnlyHint are called. */
  allow?: string[];
  /** Also allow tools whose names start with a read-only verb (get_, list_, search_, ...). */
  allowReadOnlyNames?: boolean;
  /** Tools never to call, even if allowed. */
  deny?: string[];
  /** Explicit argument sets per tool. */
  tools?: Record<string, Array<Record<string, unknown>>>;
  /** Values used for any parameter with this name (e.g. owner, repo). */
  defaults?: Record<string, unknown>;
  /** Generate extra argument sets from input schemas and earlier responses (default true). */
  auto?: boolean;
  /** Target number of calls per tool (default 25). */
  perTool?: number;
}

export interface ProbeReport {
  called: Record<string, number>;
  skipped: Array<{ tool: string; reason: string }>;
  errors: Record<string, number>;
}

export function parseProbeConfig(text: string): ProbeConfig {
  const cfg = (parseYaml(text) ?? {}) as ProbeConfig;
  if (typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('probe config must be a mapping');
  return cfg;
}

const READ_VERB = /^(get|list|search|read|describe|fetch|find|query|show|view|count|lookup)[_A-Z-]/i;
const CURSOR_PARAMS = ['cursor', 'page_token', 'pageToken', 'after', 'next', 'next_cursor', 'nextCursor'];
const PAGE_SIZE_PARAMS = ['limit', 'per_page', 'perPage', 'page_size', 'pageSize', 'max_results', 'maxResults', 'count'];

/** Decide whether probe mode may call a tool. Destructive tools always need an explicit allow. */
export function probeAllowed(tool: ToolInfo, cfg: ProbeConfig): { ok: boolean; reason?: string } {
  if (cfg.deny?.includes(tool.name)) return { ok: false, reason: 'denied by config' };
  if (cfg.allow) return cfg.allow.includes(tool.name) ? { ok: true } : { ok: false, reason: 'not in allowlist' };
  const a = tool.annotations ?? {};
  if (a.destructiveHint === true && a.readOnlyHint !== true) return { ok: false, reason: 'destructive' };
  if (a.readOnlyHint === true) return { ok: true };
  if (cfg.allowReadOnlyNames && READ_VERB.test(tool.name)) return { ok: true };
  return { ok: false, reason: 'not annotated readOnlyHint (add to allow list to probe)' };
}

/** Values harvested from responses, keyed by field name, for chaining ids into later calls. */
class Harvest {
  private byKey = new Map<string, Set<string | number>>();
  private byTool = new Map<string, Set<string | number>>();

  add(tool: string, value: unknown, depth = 0, args: Record<string, unknown> = {}): void {
    if (typeof value === 'string') {
      this.scanText(value, args);
      return;
    }
    if (depth > 6 || value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const v of value.slice(0, 50)) this.add(tool, v, depth + 1);
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((typeof v === 'string' && v.length < 200) || typeof v === 'number') {
        this.put(this.byKey, k, v);
        if (k === 'id' || k === 'number' || k === 'name' || k === 'path') this.put(this.byTool, `${tool}:${k}`, v);
      }
      if (typeof v === 'string') this.scanText(v, args);
      else this.add(tool, v, depth + 1, args);
    }
  }

  /** Absolute paths in text, and `[FILE] name` / `[DIR] name` listing lines relative to the listed path. */
  private scanText(text: string, args: Record<string, unknown>) {
    for (const m of text.matchAll(/(?:^|[\s"'(])(\/[^\s"'():,]+)/g)) this.put(this.byKey, 'path', m[1]);
    const parent = typeof args.path === 'string' ? args.path.replace(/\/$/, '') : undefined;
    if (!parent) return;
    for (const m of text.matchAll(/^\[(FILE|DIR)\]\s+(.+?)\s*$/gm)) {
      const p = `${parent}/${m[2].replace(/\s+\(.*\)$/, '')}`;
      this.put(this.byKey, 'path', p);
      this.put(this.byKey, m[1] === 'DIR' ? 'directory' : 'file', p);
    }
  }

  private put(m: Map<string, Set<string | number>>, k: string, v: string | number) {
    const s = m.get(k) ?? new Set();
    if (s.size < 200) s.add(v);
    m.set(k, s);
  }

  /** Candidate values for a parameter, e.g. `customer_id` <- customer_id fields or ids from *customer* tools. */
  candidates(param: string): Array<string | number> {
    const direct = [...(this.byKey.get(param) ?? [])];
    if (direct.length) return direct;
    const noun = param.replace(/(_id|Id|_number|Number|_name|Name)$/, '').toLowerCase();
    const suffix = /number$/i.test(param) ? 'number' : /name$/i.test(param) ? 'name' : 'id';
    const out: Array<string | number> = [];
    for (const [k, vals] of this.byTool) {
      const [tool, key] = k.split(':');
      if (key === suffix && tool.toLowerCase().includes(noun)) out.push(...vals);
    }
    return out;
  }
}

function pickN<T>(xs: T[], n: number, seed: number): T[] {
  if (xs.length <= n) return xs;
  const out: T[] = [];
  const step = xs.length / n;
  for (let i = 0; i < n; i++) out.push(xs[Math.floor((i * step + seed) % xs.length)]);
  return out;
}

/** Generate argument sets for one tool from its input schema, config defaults and harvested values. */
export function autoArgs(tool: ToolInfo, cfg: ProbeConfig, harvest: Harvest, n: number): Array<Record<string, unknown>> {
  const schema: JsonSchema = tool.inputSchema ?? {};
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const base: Record<string, unknown> = {};
  for (const [k] of Object.entries(props)) if (cfg.defaults && k in cfg.defaults) base[k] = cfg.defaults[k];

  const missing = [...required].filter((k) => !(k in base));
  const fills: Record<string, Array<unknown>> = {};
  for (const k of missing) {
    const p = props[k] ?? {};
    if (p.enum?.length) fills[k] = p.enum;
    else {
      const c = harvest.candidates(k).filter((v) => (p.type === 'integer' || p.type === 'number' ? typeof v === 'number' : true));
      if (!c.length) return [];
      fills[k] = c;
    }
  }
  const sets: Array<Record<string, unknown>> = [];
  for (let i = 0; i < n; i++) {
    const args = { ...base };
    for (const [k, vals] of Object.entries(fills)) args[k] = pickN(vals, n, 0)[i % Math.min(vals.length, n)];
    sets.push(args);
  }
  // Vary optional enum filters across calls so enum values and optional fields show up.
  const optionalEnums = Object.entries(props).filter(([k, p]) => !required.has(k) && !(k in base) && p.enum?.length);
  optionalEnums.forEach(([k, p], j) => {
    p.enum!.forEach((v, i) => {
      const idx = (i * (optionalEnums.length + 1) + j + 1) % sets.length;
      if (idx !== 0) sets[idx] = { ...sets[idx], [k]: v };
    });
  });
  // Vary page size too, so list tools yield distinct calls instead of collapsing into one.
  const sizeParam = Object.keys(props).find((k) => !required.has(k) && !(k in base) && PAGE_SIZE_PARAMS.includes(k));
  if (sizeParam) {
    const max = props[sizeParam].maximum ?? 50;
    const sizes = [undefined, 5, 1, 20, 3, 50, 10, 2].map((v) => (v === undefined ? v : Math.min(v, max)));
    sets.forEach((s, i) => {
      const v = sizes[Math.floor(i / Math.max(1, optionalEnums.length)) % sizes.length];
      if (v !== undefined) sets[i] = { ...s, [sizeParam]: v };
    });
  }
  const dedup = new Map(sets.map((s) => [JSON.stringify(s), s]));
  return [...dedup.values()];
}

function nextCursorOf(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const obj = payload as Record<string, unknown>;
  for (const holder of [obj, obj.pageInfo, obj.page_info, obj.pagination, obj.meta]) {
    if (!holder || typeof holder !== 'object') continue;
    const h = holder as Record<string, unknown>;
    if (h.hasNextPage === false || h.has_more === false) return undefined;
    for (const k of PAGE_NEXT_KEYS) {
      const v = h[k];
      if (typeof v === 'string' && v) return v;
    }
  }
  return undefined;
}

/**
 * Probe mode: call each allowed read-only tool with configured and generated arguments,
 * recording every response. Tools needing ids run after tools that can supply them.
 */
export async function runProbe(
  upstream: Client,
  store: SampleStore,
  cfg: ProbeConfig = {},
  opts: { redact?: boolean; log?: (msg: string) => void } = {},
): Promise<ProbeReport> {
  const tools = (await upstream.listTools()).tools as ToolInfo[];
  store.saveTools(tools);
  const perTool = cfg.perTool ?? 25;
  const report: ProbeReport = { called: {}, skipped: [], errors: {} };
  const harvest = new Harvest();
  const allowed = tools.filter((t) => {
    const a = probeAllowed(t, cfg);
    if (!a.ok) report.skipped.push({ tool: t.name, reason: a.reason! });
    return a.ok;
  });
  // Tools without required params first, so their responses seed ids for the rest.
  const needs = (t: ToolInfo) => (t.inputSchema?.required ?? []).filter((k) => !(cfg.defaults && k in cfg.defaults)).length;
  const ordered = [...allowed].sort((a, b) => needs(a) - needs(b));

  const call = async (t: ToolInfo, args: Record<string, unknown>) => {
    try {
      const res = await callAndRecord(upstream, store, t.name, args, { redact: opts.redact, source: 'probe' });
      report.called[t.name] = (report.called[t.name] ?? 0) + 1;
      const ex = extractPayload(res);
      if (ex.isError) report.errors[t.name] = (report.errors[t.name] ?? 0) + 1;
      else harvest.add(t.name, ex.payload, 0, args);
      return ex;
    } catch (e) {
      report.errors[t.name] = (report.errors[t.name] ?? 0) + 1;
      opts.log?.(`  ${t.name}: ${(e as Error).message}`);
      return undefined;
    }
  };

  for (const t of ordered) {
    const explicit = cfg.tools?.[t.name] ?? [];
    let sets = [...explicit.map((a) => ({ ...(cfg.defaults ?? {}), ...a }))];
    if (cfg.auto !== false && sets.length < perTool) sets.push(...autoArgs(t, cfg, harvest, perTool - sets.length));
    if (!sets.length) {
      report.skipped.push({ tool: t.name, reason: 'could not build arguments (add it under tools: in probe.yaml)' });
      continue;
    }
    const cursorParam = CURSOR_PARAMS.find((c) => t.inputSchema?.properties?.[c]);
    sets = sets.slice(0, perTool);
    // Spend the remaining budget following pagination so later pages are sampled too.
    const hops = Math.ceil((perTool - sets.length) / sets.length);
    for (const args of sets) {
      if ((report.called[t.name] ?? 0) >= perTool) break;
      let ex = await call(t, args);
      for (let h = 0; h < hops && cursorParam && ex && !ex.isError; h++) {
        const next = nextCursorOf(ex.payload);
        if (!next || (report.called[t.name] ?? 0) >= perTool) break;
        ex = await call(t, { ...args, [cursorParam]: next });
      }
    }
    opts.log?.(`  ${t.name}: ${report.called[t.name] ?? 0} calls`);
  }
  return report;
}

export { Harvest };
