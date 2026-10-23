import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createDataset } from './dataset.js';
import { TOOLS } from './tools.js';
import type { Dataset } from './types.js';

export const MOCK_SERVER_NAME = 'messy-mock';
export const MOCK_SERVER_VERSION = '1.0.0';

export function createMockServer(ds: Dataset = createDataset()): Server {
  const server = new Server({ name: MOCK_SERVER_NAME, version: MOCK_SERVER_VERSION }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS.map((t) => t.tool) }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = TOOLS.find((t) => t.tool.name === req.params.name);
    if (!def) return { isError: true, content: [{ type: 'text', text: `unknown tool: ${req.params.name}` }] };
    return def.handler(ds, (req.params.arguments ?? {}) as Record<string, unknown>);
  });
  return server;
}
