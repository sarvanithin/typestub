import { camel, isSingleItemTool, paginationPlan, pascal, toolNoun, type JsonSchema, type ServerSchema, type ToolSchema } from '@typestub/infer';
import { fitToBudget } from './budget.js';
import { COMPACT_LEGEND, docBlock, propKey, TypeRegistry, type EmitOptions } from './emit.js';

export interface GenerateOptions {
  /** Include example values in doc comments (default true). */
  examples?: boolean;
  /** Emit input types only, with `Promise<unknown>` results: the untyped code-mode baseline. */
  untyped?: boolean;
  /** Restrict output to these tool names. */
  tools?: string[];
  /** Declare the runtime module's closeAll() (default true; off for prompt-only stubs). */
  runtimeDecls?: boolean;
  /**
   * Compact output (one line per interface, short presence tags, folded link fields, no examples).
   * `'auto'` (default) switches to compact when the typed stub would add more than `budget` tokens.
   */
  compact?: boolean | 'auto';
  /** Token budget for the output types that `compact: 'auto'` aims for (default 3000). */
  budget?: number;
}

/** Rough token estimate for TypeScript declarations (measured ~2.3 chars/token on Claude). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 2.3);

export interface GeneratedTs {
  /** Contents of `<server>.d.ts`. */
  dts: string;
  /** Compact tool index: one line per tool with its confidence. */
  index: string;
  /** Identifier the server object is exposed under, e.g. `messyMock`. */
  identifier: string;
}

const firstLine = (s?: string) => (s ?? '').trim().split('\n')[0].replace(/\s+/g, ' ').slice(0, 160);

/** Preferred short name for the result type: the tool's noun for single-item tools. */
function resultShort(t: ToolSchema): string | undefined {
  const noun = toolNoun(t.tool);
  // A wrapper like { ticket, customer } is not itself the noun.
  const wraps = noun && Object.keys(t.output.properties ?? {}).some((k) => pascal(k) === noun);
  return isSingleItemTool(t.tool) && noun && !wraps ? noun : undefined;
}

/** Page items take the tool's noun (list_customers -> Customer), else `<Tool>Item`. */
function itemTypeOf(t: ToolSchema, reg: TypeRegistry, out: JsonSchema): string | undefined {
  const plan = out['x-pagination'];
  const items = plan && out.properties?.[plan.items]?.items;
  return items ? reg.typeOf(items, `${pascal(t.tool)}Item`, toolNoun(t.tool)) : undefined;
}

function withItemNames(t: ToolSchema, reg: TypeRegistry, out: JsonSchema): string {
  // Register the item type first so it claims the noun name.
  itemTypeOf(t, reg, out);
  return reg.typeOf(out, `${pascal(t.tool)}Result`, resultShort(t));
}

/** Name for an argument-selected variant: issue_read method=get -> Issue, method=get_comments -> IssueComments. */
function variantHint(t: ToolSchema, value: string): string {
  const noun = toolNoun(t.tool) ?? pascal(t.tool);
  const rest = value.replace(/^(get|list|read|fetch)_?/i, '');
  return rest ? `${noun}${pascal(rest)}` : noun;
}

function argsType(t: ToolSchema, reg: TypeRegistry): { decl: string; optional: boolean } {
  const props = t.inputSchema.properties ?? {};
  if (Object.keys(props).length === 0) return { decl: 'Record<string, never>', optional: true };
  const name = `${pascal(t.tool)}Args`;
  const req = new Set(t.inputSchema.required ?? []);
  let body = '';
  for (const [k, v] of Object.entries(props)) {
    const doc = v.description ? [firstLine(v.description)] : [];
    if (v.default !== undefined) doc.push(`default ${JSON.stringify(v.default)}`);
    body += docBlock(doc, '  ');
    body += `  ${propKey(k)}${req.has(k) ? '' : '?'}: ${reg.typeOf(stripAnnotations(v), `${name}${pascal(k)}`)};\n`;
  }
  reg.argDecls.push(`export interface ${name} {\n${body}}\n`);
  return { decl: name, optional: req.size === 0 };
}

const stripAnnotations = (s: JsonSchema): JsonSchema => {
  const { description: _d, ...rest } = s;
  return rest;
};

function errorDoc(t: ToolSchema, compact: boolean): string | undefined {
  if (!t.errorSamples || compact) return undefined;
  const ex = t.error?.['x-examples']?.[0];
  const sample = typeof ex === 'string' && !/redacted[:.]/.test(ex) ? `, e.g. ${JSON.stringify(ex.slice(0, 60))}` : '';
  return `Throws ToolError when the tool reports an error (${t.errorSamples} seen while recording${sample}).`;
}

/** Generate the `.d.ts` stub and the compact index for one server. */
export function generateTs(schema: ServerSchema, opts: GenerateOptions = {}): GeneratedTs {
  const mode = opts.compact ?? 'auto';
  if (mode === 'auto') {
    if (opts.untyped) return render(schema, opts, false);
    const full = render(schema, opts, false);
    const base = render(schema, { ...opts, untyped: true }, false);
    const budget = opts.budget ?? 3000;
    const overhead = (g: GeneratedTs) => estimateTokens(g.dts) - estimateTokens(base.dts);
    if (overhead(full) <= budget) return full;
    // Compact notation first; then drop the lowest-value fields until the stub fits.
    const fitted = fitToBudget(schema, budget, (s) => overhead(render(s, opts, true)));
    return render(fitted, opts, true);
  }
  return render(schema, opts, mode);
}

function render(schema: ServerSchema, opts: GenerateOptions, compact: boolean): GeneratedTs {
  const emitOpts: EmitOptions = { examples: !compact && (opts.examples ?? true), compact };
  const reg = new TypeRegistry(emitOpts);
  const identifier = camel(schema.server);
  const iface = `${pascal(schema.server)}Server`;
  const tools = schema.tools.filter((t) => !opts.tools || opts.tools.includes(t.tool));

  let members = '';
  const indexLines: string[] = [];
  for (const t of tools) {
    const fn = camel(t.tool);
    const args = argsType(t, reg);
    const argSig = `args${args.optional ? '?' : ''}: ${args.decl}`;
    const plan = paginationPlan(t);
    let ret = 'unknown';
    let itemType = 'unknown';
    if (!opts.untyped && !t.variants) {
      ret = withItemNames(t, reg, t.output);
      if (plan) itemType = itemTypeOf(t, reg, t.output) ?? 'unknown';
    }
    const doc: string[] = [];
    if (t.description) doc.push(firstLine(t.description));
    if (!opts.untyped) {
      if (t.wrap === 'text') doc.push('Returns the raw text the tool produced.');
      if (plan) {
        doc.push(`Paginated: pass \`${plan.nextKey}\` back as \`${plan.cursorParam}\`${plan.hasMoreKey ? ` while \`${plan.hasMoreKey}\` is true` : ' (null on the last page)'}, or use ${fn}All().`);
      }
      const err = errorDoc(t, compact);
      if (err) doc.push(err);
      if (t.lowConfidence && !compact) doc.push(`Low confidence: inferred from only ${t.samples} sample(s); fields may be missing.`);
      else if (t.confidence < 0.9 && !compact) doc.push(`Confidence ${t.confidence.toFixed(2)}: some fields change type between responses.`);
    }
    members += docBlock(doc, '  ', compact);
    if (t.variants && !opts.untyped && compact) {
      // One generic signature over a per-value results map: far fewer tokens than overloads.
      const map = `${pascal(t.tool)}Results`;
      const entries = t.variants
        .map((v) => [v.value, reg.typeOf(v.output, `${pascal(t.tool)}${pascal(v.value)}`, variantHint(t, v.value))])
        .filter(([, vt]) => !/^unknown(\[\])?$/.test(vt));
      reg.argDecls.unshift(`export interface ${map} { ${entries.map(([k, vt]) => `${propKey(k)}: ${vt};`).join(' ')} }\n`);
      const arg = t.variants[0].arg;
      members += `  ${fn}<M extends ${args.decl}['${arg}']>(args: ${args.decl} & { ${propKey(arg)}: M }): Promise<By<${map}, M>>;\n`;
      ret = t.variants.map((v) => `${v.arg}=${v.value}`).join(' | ');
    } else if (t.variants && !opts.untyped) {
      // One overload per observed value of the selecting argument, then a catch-all for unseen values.
      for (const v of t.variants) {
        const vt = reg.typeOf(v.output, `${pascal(t.tool)}${pascal(v.value)}`, variantHint(t, v.value));
        members += `  ${fn}(args: ${args.decl} & { ${propKey(v.arg)}: ${JSON.stringify(v.value)} }): Promise<${vt}>;\n`;
      }
      const all = t.inputSchema.properties?.[t.variants[0].arg]?.enum ?? [];
      if (all.length > t.variants.length) members += `  ${fn}(${argSig}): Promise<unknown>;\n`;
      ret = t.variants.map((v) => `${v.arg}=${v.value}`).join(' | ');
    } else {
      members += `  ${fn}(${argSig}): Promise<${ret}>;\n`;
    }
    if (plan && !opts.untyped) {
      const allArgs = `Omit<${args.decl}, '${plan.cursorParam}'>`;
      if (!compact) members += `  /** Fetches every page of ${fn}() and returns all \`${plan.itemsKey}\` concatenated. */\n`;
      members += `  ${fn}All(args${args.optional ? '?' : ''}: ${allArgs}): Promise<${itemType}[]>;\n`;
    }
    const conf = t.lowConfidence ? `low confidence (${t.samples} samples)` : `confidence ${t.confidence.toFixed(2)}`;
    const desc = firstLine(t.description);
    indexLines.push(
      `- ${identifier}.${fn}(${args.decl === 'Record<string, never>' ? '' : 'args'})${opts.untyped ? '' : ` -> ${ret}`}${desc ? ` — ${desc}` : ''}${opts.untyped ? '' : ` [${conf}${plan ? `; paginated, ${fn}All()` : ''}]`}`,
    );
  }

  const header = [
    `// Generated by TypeStub. Do not edit.`,
    `// server: ${schema.server}${schema.serverVersion ? `@${schema.serverVersion}` : ''} · schema ${schema.schemaHash} · ${tools.length} tools${opts.untyped ? ' · untyped' : ''}${compact ? ' · compact' : ''}`,
    ...(compact ? [COMPACT_LEGEND.trimEnd()] : []),
    '',
  ].join('\n');
  const toolError = opts.untyped
    ? ''
    : compact
      ? `export declare class ToolError extends Error { tool: string; payload: unknown; } // thrown when a tool reports an error\n` +
        (tools.some((t) => t.variants) ? `type By<R, M> = M extends keyof R ? R[M] : unknown;\n` : '')
      : `/** Thrown when a tool returns isError. \`message\` is the tool's error text. */\nexport declare class ToolError extends Error {\n  tool: string;\n  payload: unknown;\n}\n`;
  const runtime = opts.runtimeDecls === false ? '' : `/** Close server connections opened by this module. */\nexport declare function closeAll(): Promise<void>;\n`;
  const dts = reg.applyRenames([
    header,
    toolError,
    ...reg.declarations(),
    ...reg.argDecls,
    `export interface ${iface} {\n${members}}\n`,
    `export declare const ${identifier}: ${iface};\n`,
    runtime,
  ]
    .filter(Boolean)
    .join('\n'));
  const index = reg.applyRenames(`# ${schema.server} tools (schema ${schema.schemaHash})\n${indexLines.join('\n')}\n`);
  return { dts, index, identifier };
}
