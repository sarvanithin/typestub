import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ServerSchema } from '@typestub/infer';
import { connectMcp, mcpCallTool, type UpstreamSpec } from './connect.js';
import { createServer, type ServerOptions, type ServerProxy } from './server.js';

const clients = new Set<Client>();

export interface LazyServerOptions extends ServerOptions {
  /** TypeStub state directory (default `.typestub`, or $TYPESTUB_HOME). */
  root?: string;
  /** Override the launch spec recorded in `<root>/<server>/server.json`. */
  upstream?: UpstreamSpec;
}

/**
 * A server proxy that connects on first call, using the schema and launch spec stored by
 * `typestub init`. Call `closeAll()` when done so stdio servers exit.
 */
export function createLazyServer(schema: ServerSchema, opts: LazyServerOptions = {}): ServerProxy {
  const root = resolve(opts.root ?? process.env.TYPESTUB_HOME ?? '.typestub');
  let pending: Promise<Client> | undefined;
  const connect = () => {
    pending ??= (async () => {
      let spec = opts.upstream;
      if (!spec) {
        const meta = join(root, schema.server, 'server.json');
        if (!existsSync(meta)) throw new Error(`no launch spec for ${schema.server}: run typestub init first (${meta})`);
        spec = (JSON.parse(readFileSync(meta, 'utf8')) as { launch: UpstreamSpec }).launch;
      }
      const c = await connectMcp(spec);
      clients.add(c);
      return c;
    })();
    return pending;
  };
  const drift = opts.drift ?? (opts.validate ? join(root, schema.server, 'drift.jsonl') : undefined);
  return createServer(schema, async (name, args) => mcpCallTool(await connect())(name, args), { ...opts, drift });
}

/** Close every connection opened by lazy servers. */
export async function closeAll(): Promise<void> {
  await Promise.all([...clients].map((c) => c.close()));
  clients.clear();
}
