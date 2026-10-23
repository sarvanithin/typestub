import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { inferServer, type ServerSchema } from '@typestub/infer';
import { createMockServer, MOCK_SERVER_VERSION } from '@typestub/messy-mock';
import { connectUpstream, runProbe, SampleStore } from '@typestub/recorder';

/** Probe the in-process messy mock and infer its schema (shared by generator/shim tests). */
export async function mockSchema(perTool = 30): Promise<{ schema: ServerSchema; root: string }> {
  const root = mkdtempSync(join(tmpdir(), 'typestub-'));
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await createMockServer().connect(serverT);
  const client = await connectUpstream(clientT);
  const store = new SampleStore(root, 'messy-mock');
  await runProbe(client, store, { perTool });
  await client.close();
  return { schema: inferServer('messy-mock', store.loadTools(), store.readSamples(), { serverVersion: MOCK_SERVER_VERSION }), root };
}
