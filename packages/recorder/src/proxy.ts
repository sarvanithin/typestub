import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolResult, ToolInfo } from '@typestub/infer';
import { redactResult } from './redact.js';
import type { SampleStore } from './store.js';

export interface RecordOptions {
  redact?: boolean;
  source?: 'probe' | 'passive' | 'drift';
}

/** Call a tool upstream and append the (redacted) request/response pair to the store. */
export async function callAndRecord(
  upstream: Client,
  store: SampleStore,
  name: string,
  args: Record<string, unknown>,
  opts: RecordOptions = {},
): Promise<McpToolResult> {
  const result = (await upstream.callTool({ name, arguments: args })) as McpToolResult;
  store.append({
    tool: name,
    args,
    response: opts.redact === false ? result : redactResult(result),
    server_version: upstream.getServerVersion()?.version,
    timestamp: new Date().toISOString(),
    source: opts.source ?? 'passive',
  });
  return result;
}

/**
 * An MCP server that forwards every request to `upstream` and records tool traffic.
 * Clients connect to this proxy instead of the real server (passive mode).
 */
export function createRecordingProxy(upstream: Client, store: SampleStore, opts: RecordOptions = {}): Server {
  const info = upstream.getServerVersion();
  const server = new Server(
    { name: `typestub-proxy:${info?.name ?? 'upstream'}`, version: info?.version ?? '0.0.0' },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async (req) => {
    const res = await upstream.listTools(req.params);
    store.saveTools(res.tools as ToolInfo[]);
    return res;
  });
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    return (await callAndRecord(upstream, store, req.params.name, args, { ...opts, source: 'passive' })) as never;
  });
  return server;
}
