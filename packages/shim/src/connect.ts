import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { McpToolResult } from '@typestub/infer';
import type { CallTool } from './server.js';

export type UpstreamSpec =
  | { kind: 'stdio'; command: string; args: string[]; env?: Record<string, string>; cwd?: string }
  | { kind: 'http'; url: string };

/** Connect an MCP client to a server described by `spec` (or an existing transport). */
export async function connectMcp(spec: UpstreamSpec | Transport, clientName = 'typestub'): Promise<Client> {
  const client = new Client({ name: clientName, version: '0.1.0' });
  let transport: Transport;
  if ('kind' in spec) {
    transport =
      spec.kind === 'stdio'
        ? new StdioClientTransport({
            command: spec.command,
            args: spec.args,
            env: { ...(process.env as Record<string, string>), ...(spec.env ?? {}) },
            cwd: spec.cwd,
            stderr: 'ignore',
          })
        : new StreamableHTTPClientTransport(new URL(spec.url));
  } else {
    transport = spec;
  }
  await client.connect(transport);
  return client;
}

/** Generic adapter: route generated functions through an MCP client's tools/call. */
export const mcpCallTool =
  (client: Client): CallTool =>
  async (name, args) =>
    (await client.callTool({ name, arguments: args })) as McpToolResult;
