#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDataset } from './dataset.js';
import { createMockServer } from './server.js';

if (process.argv[2] === 'export') {
  // Dump the seeded dataset so benchmark checkers can compute ground truth.
  process.stdout.write(JSON.stringify(createDataset(), null, 2));
} else {
  await createMockServer().connect(new StdioServerTransport());
}
