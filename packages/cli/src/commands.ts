import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { analyze, driftSamples, formatReport, readDrift } from '@typestub/drift';
import { generatePy } from '@typestub/gen-py';
import { generateTs } from '@typestub/gen-ts';
import { camel, inferServer, type ServerSchema } from '@typestub/infer';
import {
  connectUpstream, createRecordingProxy, parseProbeConfig, redactResult, runProbe, safeName, SampleStore, within,
  type ProbeConfig, type ProbeReport, type UpstreamSpec,
} from '@typestub/recorder';

export interface CommonOptions {
  /** State directory (default .typestub). */
  root?: string;
  log?: (msg: string) => void;
}

export interface UpstreamOptions {
  /** Command and args for a stdio server. */
  command?: string[];
  /** URL of a Streamable HTTP server. */
  url?: string;
  cwd?: string;
}

const rootOf = (o: CommonOptions) => resolve(o.root ?? '.typestub');
const noop = () => {};

/** Build an upstream spec from CLI input, or fall back to the one saved for this server. */
export function resolveUpstream(store: SampleStore, o: UpstreamOptions): UpstreamSpec {
  if (o.url) {
    const u = new URL(o.url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`unsupported URL scheme: ${u.protocol}`);
    return { kind: 'http', url: u.toString() };
  }
  if (o.command?.length) {
    const [command, ...args] = o.command;
    return { kind: 'stdio', command, args, ...(o.cwd ? { cwd: resolve(o.cwd) } : {}) };
  }
  const saved = store.loadMeta()?.launch;
  if (!saved) throw new Error('no server given: pass `-- <command...>` or --url (none saved yet)');
  return saved;
}

/** Passive mode: serve an MCP proxy on stdio that records everything it forwards. */
export async function record(name: string, o: CommonOptions & UpstreamOptions & { redact?: boolean }): Promise<void> {
  const store = new SampleStore(rootOf(o), name);
  const spec = resolveUpstream(store, o);
  const upstream = await connectUpstream(spec);
  store.saveMeta({ name, version: upstream.getServerVersion()?.version, launch: spec });
  const proxy = createRecordingProxy(upstream, store, { redact: o.redact });
  await proxy.connect(new StdioServerTransport());
}

export async function probe(
  name: string,
  o: CommonOptions & UpstreamOptions & { config?: string; perTool?: number; redact?: boolean; allowReadOnlyNames?: boolean },
): Promise<ProbeReport> {
  const log = o.log ?? noop;
  const store = new SampleStore(rootOf(o), name);
  const spec = resolveUpstream(store, o);
  let cfg: ProbeConfig = {};
  if (o.config) cfg = parseProbeConfig(readFileSync(resolve(o.config), 'utf8'));
  else if (existsSync('probe.yaml')) cfg = parseProbeConfig(readFileSync('probe.yaml', 'utf8'));
  if (o.perTool) cfg.perTool = o.perTool;
  if (o.allowReadOnlyNames) cfg.allowReadOnlyNames = true;
  const upstream = await connectUpstream(spec);
  try {
    store.saveMeta({ name, version: upstream.getServerVersion()?.version, launch: spec });
    log(`probing ${name}`);
    const report = await runProbe(upstream, store, cfg, { redact: o.redact, log });
    for (const s of report.skipped) log(`  skipped ${s.tool}: ${s.reason}`);
    return report;
  } finally {
    await upstream.close();
  }
}

export function infer(name: string, o: CommonOptions & { examples?: boolean } = {}): ServerSchema {
  const store = new SampleStore(rootOf(o), name);
  const tools = store.loadTools();
  if (!tools.length) throw new Error(`no tools recorded for ${name}: run typestub probe or record first`);
  const schema = inferServer(name, tools, store.readSamples(), { examples: o.examples, serverVersion: store.loadMeta()?.version });
  store.writeJson('schema.json', schema);
  (o.log ?? noop)(`inferred ${schema.tools.length} tools · schema ${schema.schemaHash}`);
  return schema;
}

export interface GenOptions extends CommonOptions {
  out?: string;
  lang?: 'ts' | 'py' | 'both';
  untyped?: boolean;
  examples?: boolean;
}

/** Write `<out>/<server>.d.ts`, `.js` runtime, `.index.md`, `.schema.json`, `.py`, and the aggregate index. */
export function gen(name: string, o: GenOptions = {}): string[] {
  const store = new SampleStore(rootOf(o), name);
  const schema = store.readJson<ServerSchema>('schema.json');
  if (!schema) throw new Error(`no schema for ${name}: run typestub infer first`);
  const out = resolve(o.out ?? 'stubs');
  mkdirSync(out, { recursive: true });
  const base = safeName(name, 'server name');
  const lang = o.lang ?? 'ts';
  const written: string[] = [];
  const write = (file: string, text: string) => {
    const p = within(out, file);
    writeFileSync(p, text);
    written.push(p);
  };
  write(`${base}.schema.json`, JSON.stringify(schema, null, 2) + '\n');
  if (lang === 'ts' || lang === 'both') {
    const ts = generateTs(schema, { untyped: o.untyped, examples: o.examples });
    write(`${base}.d.ts`, ts.dts);
    write(`${base}.index.md`, ts.index);
    write(`${base}.js`, runtimeModule(base, ts.identifier));
    writeAggregate(out);
  }
  if (lang === 'py' || lang === 'both') write(`${base.replace(/[^A-Za-z0-9_]/g, '_')}.py`, generatePy(schema, { untyped: o.untyped, examples: o.examples }).source);
  (o.log ?? noop)(`wrote ${written.length} files to ${out}`);
  return written;
}

function runtimeModule(base: string, identifier: string): string {
  return `// Generated by TypeStub. Runtime for ${base}.d.ts.
import { readFileSync } from 'node:fs';
import { createLazyServer } from 'typestub/servers';

const schema = JSON.parse(readFileSync(new URL('./${base}.schema.json', import.meta.url), 'utf8'));
export const ${identifier} = createLazyServer(schema, { validate: process.env.TYPESTUB_VALIDATE !== '0' });
export { ToolError, closeAll } from 'typestub/servers';
`;
}

/** stubs/index.{js,d.ts} re-exporting every generated server. */
function writeAggregate(out: string): void {
  const servers = readdirSync(out)
    .filter((f) => f.endsWith('.schema.json'))
    .map((f) => f.replace(/\.schema\.json$/, ''))
    .filter((b) => existsSync(join(out, `${b}.d.ts`)))
    .sort();
  const lines = servers.map((b) => `export { ${camel(b)} } from './${b}.js';`);
  const tail = `export { ToolError, closeAll } from 'typestub/servers';\n`;
  writeFileSync(join(out, 'index.js'), `${lines.join('\n')}\n${tail}`);
  writeFileSync(join(out, 'index.d.ts'), `${lines.join('\n')}\nexport declare function closeAll(): Promise<void>;\n`);
}

export async function init(
  name: string,
  o: CommonOptions & UpstreamOptions & GenOptions & { config?: string; perTool?: number; redact?: boolean; allowReadOnlyNames?: boolean },
): Promise<{ report: ProbeReport; schema: ServerSchema; files: string[] }> {
  const started = Date.now();
  const report = await probe(name, o);
  const schema = infer(name, o);
  const files = gen(name, o);
  (o.log ?? noop)(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return { report, schema, files };
}

export interface WatchResult {
  regenerated: boolean;
  safe: number;
  breaking: number;
  reportPath?: string;
}

/**
 * One drift pass: fold safe drift back into samples and regenerate; write a report for
 * breaking drift (and only fold it in with acceptBreaking).
 */
export function driftPass(name: string, o: GenOptions & { acceptBreaking?: boolean; redact?: boolean } = {}): WatchResult {
  const log = o.log ?? noop;
  const store = new SampleStore(rootOf(o), name);
  const schema = store.readJson<ServerSchema>('schema.json');
  if (!schema) throw new Error(`no schema for ${name}: run typestub infer first`);
  const entries = readDrift(store.path('drift.jsonl'));
  const report = analyze(entries, schema.schemaHash);
  if (!report.entries) return { regenerated: false, safe: 0, breaking: 0 };
  const reportPath = store.path('drift-report.md');
  writeFileSync(reportPath, formatReport(name, report));
  const fold = report.breaking.length === 0 || o.acceptBreaking;
  if (report.breaking.length) log(`${report.breaking.length} breaking drift finding(s): see ${reportPath}`);
  if (!fold) return { regenerated: false, safe: report.safe.length, breaking: report.breaking.length, reportPath };
  const current = entries.filter((e) => e.schemaHash === schema.schemaHash);
  const redact = o.redact === false ? (r: typeof current[number]['response'] & object) => r : redactResult;
  for (const s of driftSamples(current, redact as never)) store.append(s);
  infer(name, o);
  gen(name, o);
  log(`regenerated ${name} from ${current.length} drifted response(s)`);
  return { regenerated: true, safe: report.safe.length, breaking: report.breaking.length, reportPath };
}

/** Watch the drift log and run a drift pass whenever it grows. */
export async function watch(name: string, o: GenOptions & { acceptBreaking?: boolean; intervalMs?: number } = {}): Promise<never> {
  const store = new SampleStore(rootOf(o), name);
  const path = store.path('drift.jsonl');
  let lastSize = -1;
  for (;;) {
    const size = existsSync(path) ? readFileSync(path).length : 0;
    if (size !== lastSize) {
      lastSize = size;
      if (size > 0) driftPass(name, o);
    }
    await new Promise((r) => setTimeout(r, o.intervalMs ?? 2000));
  }
}
