import { isSingleItemTool, paginationPlan, pascal, snake, toolNoun, type JsonSchema, type ServerSchema, type ToolSchema } from '@typestub/infer';
import { fieldDoc, singularHint, structuralHash } from '@typestub/gen-ts';

const FORMAT_ALIASES: Record<string, [string, string]> = {
  'date-time': ['IsoDateTime', 'ISO 8601 date-time string'],
  date: ['IsoDate', 'ISO 8601 date string'],
  uuid: ['Uuid', 'UUID string'],
  uri: ['Url', 'absolute URL string'],
  email: ['Email', 'email address string'],
};

const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif',
  'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or',
  'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);
const isPyIdent = (k: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !PY_KEYWORDS.has(k);

export interface GeneratePyOptions {
  examples?: boolean;
  untyped?: boolean;
  tools?: string[];
}

export interface GeneratedPy {
  /** Contents of `<server>.py`: TypedDicts plus a Protocol of async tool functions. */
  source: string;
  /** Return type expression per tool name, for embedding in tool descriptions. */
  returnTypes: Record<string, string>;
}

class PyRegistry {
  private decls = new Map<string, string>();
  private byHash = new Map<string, string>();
  readonly formats = new Set<string>();

  constructor(private examples: boolean) {}

  declarations(): string[] {
    const aliases = [...this.formats].sort().map((f) => `${FORMAT_ALIASES[f][0]} = str  # ${FORMAT_ALIASES[f][1]}`);
    return [aliases.join('\n'), ...this.decls.values()].filter(Boolean);
  }

  /** Every declaration whose name appears in `expr`, transitively (for per-tool descriptions). */
  closure(expr: string): string {
    const seen = new Set<string>();
    const visit = (text: string) => {
      for (const name of this.decls.keys()) {
        if (!seen.has(name) && new RegExp(`\\b${name}\\b`).test(text)) {
          seen.add(name);
          visit(this.decls.get(name)!);
        }
      }
    };
    visit(expr);
    return [...this.decls.entries()].filter(([n]) => seen.has(n)).map(([, d]) => d).join('\n');
  }

  private claim(hint: string, hash: string) {
    const existing = this.byHash.get(hash);
    if (existing) return { name: existing, fresh: false };
    let name = hint;
    for (let i = 2; this.decls.has(name); i++) name = `${hint}${i}`;
    this.decls.set(name, '');
    this.byHash.set(hash, name);
    return { name, fresh: true };
  }

  private idNames = new Map<string, string>();

  typeOf(s: JsonSchema, hint: string): string {
    if (s.$ref) return this.idNames.get(s.$ref.slice(1)) ?? 'Any';
    if (s.const !== undefined) return `Literal[${JSON.stringify(s.const)}]`;
    if (s.enum) {
      const vals = s.enum.filter((v) => v !== null).map((v) => JSON.stringify(v));
      const lit = `Literal[${vals.join(', ')}]`;
      return s.enum.includes(null) ? `${lit} | None` : lit;
    }
    if (s.oneOf) return this.union(s, hint);
    if (s.anyOf) return [...new Set(s.anyOf.map((p) => this.typeOf(p, hint)))].join(' | ');
    const types = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type];
    if (types.length === 0) return s.properties ? this.object(s, hint) : 'Any';
    return [...new Set(types.map((t) => this.single(s, t, hint)))].join(' | ');
  }

  private single(s: JsonSchema, t: string, hint: string): string {
    switch (t) {
      case 'null':
        return 'None';
      case 'string':
        if (s.format && FORMAT_ALIASES[s.format]) {
          this.formats.add(s.format);
          return FORMAT_ALIASES[s.format][0];
        }
        return 'str';
      case 'integer':
        return 'int';
      case 'number':
        return 'float';
      case 'boolean':
        return 'bool';
      case 'array':
        if (!s.items || Object.keys(s.items).length === 0) return 'list[Any]';
        return `list[${this.typeOf(s.items, singularHint(hint))}]`;
      case 'object':
        return this.object(s, hint);
      default:
        return 'Any';
    }
  }

  private object(s: JsonSchema, hint: string): string {
    if (s['x-map'] && s.additionalProperties && typeof s.additionalProperties === 'object') {
      return `dict[str, ${this.typeOf(s.additionalProperties, `${hint}Entry`)}]`;
    }
    if (!s.properties || Object.keys(s.properties).length === 0) return 'dict[str, Any]';
    const { name, fresh } = this.claim(hint, structuralHash(s));
    if (s['x-id']) this.idNames.set(s['x-id'], name);
    if (!fresh) return name;
    const req = new Set(s.required ?? []);
    const fields = Object.entries(s.properties).map(([k, v]) => {
      const t = this.typeOf(v, hint + pascal(k));
      const doc = fieldDoc(v, { examples: this.examples });
      return { k, t: req.has(k) ? t : `NotRequired[${t}]`, doc: doc.length ? `  # ${doc.join('; ')}` : '' };
    });
    let decl: string;
    if (fields.every((f) => isPyIdent(f.k))) {
      decl = `class ${name}(TypedDict):\n${fields.map((f) => `    ${f.k}: ${f.t}${f.doc}`).join('\n')}\n`;
    } else {
      decl = `${name} = TypedDict(${JSON.stringify(name)}, {\n${fields.map((f) => `    ${JSON.stringify(f.k)}: ${JSON.stringify(f.t)},${f.doc}`).join('\n')}\n})\n`;
    }
    this.decls.set(name, decl);
    return name;
  }

  private union(s: JsonSchema, hint: string): string {
    const tag = s['x-discriminator'];
    const { name, fresh } = this.claim(hint, structuralHash(s));
    if (s['x-id']) this.idNames.set(s['x-id'], name);
    if (!fresh) return name;
    const names = s.oneOf!.map((v, i) => {
      const tv = tag ? v.properties?.[tag]?.const : undefined;
      return this.typeOf(v, typeof tv === 'string' ? `${pascal(tv)}${name}` : `${name}Variant${i + 1}`);
    });
    this.decls.set(name, `${name} = Union[${names.map((n) => JSON.stringify(n)).join(', ')}]${tag ? `  # discriminated by "${tag}"` : ''}\n`);
    return name;
  }
}

function resultHint(t: ToolSchema): string {
  const noun = toolNoun(t.tool);
  const single = isSingleItemTool(t.tool);
  const wraps = noun && Object.keys(t.output.properties ?? {}).some((k) => pascal(k) === noun);
  return single && noun && !wraps ? noun : `${pascal(t.tool)}Result`;
}

function params(t: ToolSchema, reg: PyRegistry, overrides: Record<string, string> = {}): string {
  const props = t.inputSchema.properties ?? {};
  const req = new Set(t.inputSchema.required ?? []);
  const entries = Object.entries(props).sort(([a], [b]) => Number(req.has(b)) - Number(req.has(a)));
  if (!entries.length) return 'self';
  const ps = entries.map(([k, v]) => {
    const { description: _d, ...rest } = v;
    const type = overrides[k] ?? reg.typeOf(rest, `${pascal(t.tool)}Arg${pascal(k)}`);
    const name = isPyIdent(k) ? k : `${snake(k)}_`;
    return req.has(k) ? `${name}: ${type}` : `${name}: ${type} | None = None`;
  });
  return `self, *, ${ps.join(', ')}`;
}

/** Generate a Python module of TypedDicts and a Protocol with one async method per tool. */
export function generatePy(schema: ServerSchema, opts: GeneratePyOptions = {}): GeneratedPy {
  const reg = new PyRegistry(opts.examples ?? true);
  const tools = schema.tools.filter((t) => !opts.tools || opts.tools.includes(t.tool));
  const methods: string[] = [];
  const returnTypes: Record<string, string> = {};
  for (const t of tools) {
    const plan = paginationPlan(t);
    let ret = 'Any';
    const overloads: string[] = [];
    if (!opts.untyped && t.variants) {
      const noun = toolNoun(t.tool) ?? pascal(t.tool);
      for (const v of t.variants) {
        const rest = v.value.replace(/^(get|list|read|fetch)_?/i, '');
        const vt = reg.typeOf(v.output, rest ? `${noun}${pascal(rest)}` : noun);
        const ps = params(t, reg, { [v.arg]: `Literal[${JSON.stringify(v.value)}]` });
        overloads.push(`    @overload\n    async def ${snake(t.tool)}(${ps}) -> ${vt}: ...\n`);
        returnTypes[t.tool] = `${returnTypes[t.tool] ?? ''}${reg.closure(vt)}\n# ${v.arg}=${JSON.stringify(v.value)} returns: ${vt}\n`;
      }
    } else if (!opts.untyped) {
      const noun = toolNoun(t.tool);
      if (plan && noun && t.output.properties?.[plan.itemsKey]?.items) reg.typeOf(t.output.properties[plan.itemsKey].items!, noun);
      ret = reg.typeOf(t.output, resultHint(t));
      returnTypes[t.tool] = `${reg.closure(ret)}\n# returns: ${ret}`.trim();
    }
    const doc: string[] = [];
    if (t.description) doc.push(t.description.trim().split('\n')[0]);
    if (!opts.untyped && plan) {
      const path = plan.nextKey.split('.').map((k) => `["${k}"]`).join('');
      doc.push(`Paginated: pass result${path} back as ${plan.cursorParam}= (None/empty on the last page).`);
    }
    if (!opts.untyped && t.errorSamples) doc.push('Raises ToolError when the tool reports an error.');
    if (!opts.untyped && t.lowConfidence) doc.push(`Low confidence: inferred from only ${t.samples} sample(s).`);
    const docstr = doc.length ? `        """${doc.join(' ').replace(/"""/g, "'''")}"""\n` : '';
    methods.push(`${overloads.join('')}    async def ${snake(t.tool)}(${params(t, reg)}) -> ${ret}:\n${docstr}        ...\n`);
  }
  const header = [
    '# Generated by TypeStub. Do not edit.',
    `# server: ${schema.server}${schema.serverVersion ? `@${schema.serverVersion}` : ''} · schema ${schema.schemaHash} · ${tools.length} tools${opts.untyped ? ' · untyped' : ''}`,
    'from __future__ import annotations',
    '',
    'from typing import Any, Literal, NotRequired, Protocol, TypedDict, Union, overload',
    '',
  ].join('\n');
  const cls = `class ${pascal(schema.server)}Server(Protocol):\n${methods.join('\n') || '    pass\n'}`;
  const source = [header, ...reg.declarations(), cls].join('\n\n');
  return { source, returnTypes };
}
