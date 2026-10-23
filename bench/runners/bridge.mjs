// Benchmark bridge: one Node process per server, driven over JSON lines on stdin/stdout.
//   {op:"init", ...}  connect to the real server, return tool defs and prompt stubs
//   {op:"call", ...}  direct tool call (condition A): raw MCP text, as the model would see it
//   {op:"exec", ...}  run a model-written TypeScript script against the server (conditions B, C)
// Both code-mode conditions share this runtime; only the stubs shown to the model differ.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { formatWithOptions } from 'node:util';
import vm from 'node:vm';
import ts from 'typescript';
import { generateTs } from '@typestub/gen-ts';
import { connectMcp, createServer, mcpCallTool } from '@typestub/shim';
import { camel } from '@typestub/infer';

let client;
let proxy;
let identifier;
let toolNames;
let outputCap = 30000;
let schemaForTypes;
let typeOpts;

const cap = (s) => (s.length > outputCap ? `${s.slice(0, outputCap)}\n...[truncated ${s.length - outputCap} chars]` : s);

function resultText(res) {
  const parts = (res.content ?? []).map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)));
  if (!parts.length && res.structuredContent !== undefined) parts.push(JSON.stringify(res.structuredContent));
  return parts.join('\n');
}

async function init(msg) {
  outputCap = msg.outputCap ?? outputCap;
  identifier = msg.identifier;
  client = await connectMcp({ kind: 'stdio', command: msg.command, args: msg.args, env: msg.env });
  const listed = (await client.listTools()).tools;
  toolNames = msg.tools ?? listed.map((t) => t.name);
  const tools = listed.filter((t) => toolNames.includes(t.name));
  const full = JSON.parse(readFileSync(msg.schemaPath, 'utf8'));
  const schema = { ...full, server: msg.identifier, tools: full.tools.filter((t) => toolNames.includes(t.tool)) };
  proxy = createServer(schema, mcpCallTool(client));
  // Stub budget per server (servers.yaml `stub_budget`); without one, full stubs as in run v0.
  const opts = { tools: toolNames, runtimeDecls: false, examples: msg.examples ?? true, compact: msg.budget ? 'auto' : false, budget: msg.budget };
  schemaForTypes = schema;
  typeOpts = opts;
  const typed = generateTs(schema, opts);
  const untyped = generateTs(schema, { ...opts, untyped: true });
  return {
    tools: tools.map((t) => ({ name: t.name, description: t.description ?? '', input_schema: t.inputSchema })),
    stubs: { typed: typed.dts, untyped: untyped.dts, index: typed.index },
    schemaHash: full.schemaHash,
  };
}

async function call(msg) {
  if (!toolNames.includes(msg.name)) return { text: `unknown tool: ${msg.name}`, isError: true };
  try {
    const res = await client.callTool({ name: msg.name, arguments: msg.args ?? {} });
    return { text: cap(resultText(res)), isError: res.isError === true };
  } catch (e) {
    return { text: `error: ${e.message}`, isError: true };
  }
}

const IMPORT_LINE = /^\s*import\s[^;\n]*from\s*['"][^'"]+['"];?\s*$/gm;

async function exec(msg) {
  const started = Date.now();
  let out = '';
  let submitted = false;
  let answer;
  let toolCalls = 0;
  const write = (...a) => {
    out += formatWithOptions({ depth: 6, maxArrayLength: 200, breakLength: 120 }, ...a) + '\n';
  };
  const counted = new Proxy(proxy, {
    get(target, prop) {
      const fn = target[prop];
      if (typeof fn !== 'function') return undefined;
      return (...args) => {
        toolCalls++;
        return fn(...args);
      };
    },
  });
  const source = msg.code.replace(IMPORT_LINE, '');
  let js;
  try {
    js = ts.transpileModule(`export {};\n(async () => {\n${source}\n})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      reportDiagnostics: false,
    }).outputText.replace(/^export \{\};\s*/m, '');
  } catch (e) {
    return { stdout: '', error: `transpile error: ${e.message}`, submitted, toolCalls, ms: Date.now() - started };
  }
  const ctx = vm.createContext({
    [identifier]: counted,
    console: { log: write, info: write, warn: write, error: write, debug: write, dir: write, table: write },
    submit: (v) => {
      if (!submitted) {
        submitted = true;
        answer = v === undefined ? null : JSON.parse(JSON.stringify(v));
      }
    },
    setTimeout,
    clearTimeout,
  });
  let error = null;
  try {
    const fn = vm.runInContext(js, ctx, { timeout: 10000 });
    const result = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`script timed out after ${msg.timeoutMs ?? 60000}ms`)), msg.timeoutMs ?? 60000)),
    ]);
    if (!submitted && result !== undefined) {
      submitted = true;
      answer = JSON.parse(JSON.stringify(result));
    }
  } catch (e) {
    error = `${e?.name ?? 'Error'}: ${e?.message ?? String(e)}`;
  }
  return { stdout: cap(out), error, submitted, answer, toolCalls, ms: Date.now() - started };
}

/** Lazy loading (condition L): full typed declarations for just the requested functions. */
async function types(msg) {
  const wanted = new Set((msg.functions ?? []).map((f) => String(f).replace(/All$/, '').replace(/^.*\./, '')));
  const tools = schemaForTypes.tools.filter((t) => wanted.has(camel(t.tool))).map((t) => t.tool);
  if (!tools.length) return { text: `no such functions: ${[...wanted].join(', ')}` };
  return { text: generateTs(schemaForTypes, { ...typeOpts, tools }).dts };
}

const handlers = { init, call, exec, types, close: async () => ({}) };
const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  if (!line.trim()) continue;
  const msg = JSON.parse(line);
  let reply;
  try {
    reply = { id: msg.id, ok: true, ...(await handlers[msg.op](msg)) };
  } catch (e) {
    reply = { id: msg.id, ok: false, error: e.message };
  }
  process.stdout.write(JSON.stringify(reply) + '\n');
  if (msg.op === 'close') break;
}
await Promise.race([client?.close(), new Promise((r) => setTimeout(r, 2000))]);
process.exit(0);
