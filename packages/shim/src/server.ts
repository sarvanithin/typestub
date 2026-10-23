import { appendFileSync } from 'node:fs';
import { camel, decodeEmbedded, extractPayload, getPath, hasEmbedded, paginationPlan, type McpToolResult, type ServerSchema, type ToolSchema } from '@typestub/infer';
import { ToolError } from './errors.js';
import { validate, type Mismatch } from './validate.js';

/** Anything that can execute an MCP tool call: an MCP client, a sandbox bridge, a test double. */
export type CallTool = (name: string, args: Record<string, unknown>) => Promise<McpToolResult>;

export interface DriftEntry {
  server: string;
  schemaHash: string;
  tool: string;
  timestamp: string;
  mismatches: Mismatch[];
  /** The raw response, so drift can be folded back into samples. Redact before sharing. */
  response?: McpToolResult;
}

export interface ServerOptions {
  /** Validate live responses against the schema and report mismatches (never blocks). */
  validate?: boolean;
  /** Where mismatches go: a JSONL file path or a callback. */
  drift?: string | ((entry: DriftEntry) => void);
  /** Include the raw response in drift entries (default true). */
  driftResponses?: boolean;
  /** Safety cap on pages fetched by *All() helpers (default 100). */
  maxPages?: number;
}

export type ServerProxy = Record<string, (args?: Record<string, unknown>) => Promise<unknown>>;

/** Build `{ listCustomers, listCustomersAll, ... }` functions that call real tools and unwrap results. */
export function createServer(schema: ServerSchema, callTool: CallTool, opts: ServerOptions = {}): ServerProxy {
  const proxy: ServerProxy = {};
  const embedded = new Set(schema.tools.filter((t) => hasEmbedded(t.output)).map((t) => t.tool));
  const report = (entry: DriftEntry) => {
    if (typeof opts.drift === 'function') opts.drift(entry);
    else if (typeof opts.drift === 'string') appendFileSync(opts.drift, JSON.stringify(entry) + '\n');
  };

  const invoke = async (t: ToolSchema, args: Record<string, unknown>) => {
    const res = await callTool(t.tool, args ?? {});
    const ex = extractPayload(res);
    if (ex.isError) {
      const msg = typeof ex.payload === 'string' ? ex.payload : JSON.stringify(ex.payload);
      throw new ToolError(t.tool, msg, ex.payload);
    }
    const payload = embedded.has(t.tool) ? decodeEmbedded(t.output, ex.payload) : ex.payload;
    if (opts.validate && opts.drift && t.source !== 'none') {
      const mismatches = validate(t.output, payload);
      if (mismatches.length) {
        report({
          server: schema.server,
          schemaHash: schema.schemaHash,
          tool: t.tool,
          timestamp: new Date().toISOString(),
          mismatches,
          response: opts.driftResponses === false ? undefined : res,
        });
      }
    }
    return payload;
  };

  for (const t of schema.tools) {
    const fn = camel(t.tool);
    proxy[fn] = (args = {}) => invoke(t, args);
    const plan = paginationPlan(t);
    if (plan) {
      proxy[`${fn}All`] = async (args = {}) => {
        const all: unknown[] = [];
        let cursor: unknown;
        for (let page = 0; page < (opts.maxPages ?? 100); page++) {
          const res = (await invoke(t, cursor ? { ...args, [plan.cursorParam]: cursor } : args)) as Record<string, unknown>;
          const items = res?.[plan.itemsKey];
          if (Array.isArray(items)) all.push(...items);
          cursor = getPath(res, plan.nextKey);
          if (!cursor || (plan.hasMoreKey && getPath(res, plan.hasMoreKey) === false)) break;
        }
        return all;
      };
    }
  }
  return proxy;
}
