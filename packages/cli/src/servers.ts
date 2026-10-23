import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ServerSchema } from '@typestub/infer';
import { createLazyServer, type LazyServerOptions, type ServerProxy } from '@typestub/shim';

export * from '@typestub/shim';

/** Load a server proxy from the schema saved by `typestub init <name>`. */
export function loadServer(name: string, opts: LazyServerOptions = {}): ServerProxy {
  const root = resolve(opts.root ?? process.env.TYPESTUB_HOME ?? '.typestub');
  const schema = JSON.parse(readFileSync(join(root, name, 'schema.json'), 'utf8')) as ServerSchema;
  return createLazyServer(schema, { ...opts, root });
}
