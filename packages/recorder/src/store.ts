import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { Sample, ToolInfo } from '@typestub/infer';
import type { UpstreamSpec } from '@typestub/shim';

export type { UpstreamSpec };

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

/** Reject names that could escape the store directory. */
export function safeName(name: string, what = 'name'): string {
  if (!SAFE_NAME.test(name) || name.includes('..')) throw new Error(`invalid ${what}: ${JSON.stringify(name)}`);
  return name;
}

/** Resolve `child` under `root`, refusing anything that escapes it. */
export function within(root: string, ...child: string[]): string {
  const base = resolve(root);
  const p = resolve(base, ...child);
  if (p !== base && !p.startsWith(base + sep)) throw new Error(`path escapes ${base}: ${p}`);
  return p;
}

export interface ServerMeta {
  name: string;
  version?: string;
  launch?: UpstreamSpec;
}


/** On-disk layout: <root>/<server>/{server.json, tools.json, samples/<tool>.jsonl, schema.json, drift.jsonl}. */
export class SampleStore {
  readonly dir: string;

  constructor(root: string, server: string) {
    this.dir = within(root, safeName(server, 'server name'));
    mkdirSync(join(this.dir, 'samples'), { recursive: true });
  }

  path(...parts: string[]): string {
    return within(this.dir, ...parts);
  }

  append(sample: Sample): void {
    appendFileSync(this.path('samples', `${safeName(sample.tool, 'tool name')}.jsonl`), JSON.stringify(sample) + '\n');
  }

  readSamples(): Map<string, Sample[]> {
    const out = new Map<string, Sample[]>();
    const dir = this.path('samples');
    if (!existsSync(dir)) return out;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
      const rows = readFileSync(join(dir, f), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Sample);
      for (const r of rows) {
        const list = out.get(r.tool) ?? [];
        list.push(r);
        out.set(r.tool, list);
      }
    }
    return out;
  }

  writeJson(file: string, value: unknown): void {
    writeFileSync(this.path(file), JSON.stringify(value, null, 2) + '\n');
  }

  readJson<T>(file: string): T | undefined {
    const p = this.path(file);
    return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : undefined;
  }

  saveTools(tools: ToolInfo[]): void {
    this.writeJson('tools.json', tools);
  }

  loadTools(): ToolInfo[] {
    return this.readJson<ToolInfo[]>('tools.json') ?? [];
  }

  saveMeta(meta: ServerMeta): void {
    this.writeJson('server.json', meta);
  }

  loadMeta(): ServerMeta | undefined {
    return this.readJson<ServerMeta>('server.json');
  }
}
