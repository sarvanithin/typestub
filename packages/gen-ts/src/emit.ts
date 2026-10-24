import { pascal, singular, stableStringify, type JsonSchema } from '@typestub/infer';

const FORMAT_ALIASES: Record<string, { name: string; doc: string }> = {
  'date-time': { name: 'IsoDateTime', doc: 'ISO 8601 date-time string, e.g. "2026-01-02T03:04:05Z"' },
  date: { name: 'IsoDate', doc: 'ISO 8601 date string, e.g. "2026-01-02"' },
  uuid: { name: 'Uuid', doc: 'UUID string' },
  uri: { name: 'Url', doc: 'Absolute URL string' },
  email: { name: 'Email', doc: 'Email address string' },
};

export interface EmitOptions {
  /** Include example values in doc comments. */
  examples: boolean;
  /** One line per interface, inline `N%` presence tags, link fields folded: for large servers. */
  compact?: boolean;
}

/** Hypermedia link fields (`events_url`, `url`, ...) that `compact` folds into one index signature. */
const isLinkField = (k: string, s: JsonSchema) => k !== 'html_url' && /(^|_)url$/.test(k) && s.format === 'uri';

/** Explains the compact notation; printed once at the top of compact stubs. */
export const COMPACT_LEGEND =
  '// /*N%*/ field present in N% of responses; /*null N%*/ null in N%. [link: `${string}url`]: more *_url fields.\n' +
  '// [more: string]: unknown = less-used fields omitted from this stub; they exist at runtime.\n';

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
export const propKey = (k: string) => (IDENT.test(k) ? k : JSON.stringify(k));

const ANNOTATION_KEYS = new Set(['x-presence', 'x-nullRate', 'x-examples', 'x-constant', 'description', 'x-inferred', 'x-id']);

/** Structural identity of a schema, ignoring per-tool annotations. */
export function structuralHash(s: JsonSchema): string {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v)
          .filter(([k]) => !ANNOTATION_KEYS.has(k))
          .map(([k, x]) => [k, (k === 'required' || k === 'enum') && Array.isArray(x) ? [...x].map(String).sort() : strip(x)]),
      );
    }
    return v;
  };
  return stableStringify(strip(s));
}

const isRedacted = (v: unknown) => typeof v === 'string' && /redacted[:.]/.test(v);

export function fieldDoc(s: JsonSchema, opts: EmitOptions): string[] {
  const parts: string[] = [];
  if (s.description) parts.push(s.description.trim().split('\n')[0]);
  const presence = s['x-presence'];
  if (presence !== undefined && presence < 1) parts.push(`present in ${Math.round(presence * 100)}%`);
  const nullRate = s['x-nullRate'];
  if (nullRate !== undefined && nullRate > 0) parts.push(`null in ${Math.round(nullRate * 100)}%`);
  const constant = s['x-constant'];
  if (constant) parts.push(`always ${JSON.stringify(constant.value)} in all ${constant.count} samples; don't filter on it alone`);
  if (s['x-emptyOnly']) parts.push('only ever seen empty; item type unknown');
  if (s['x-jsonString']) parts.push('sent as a JSON string; the runtime parses it for you');
  if (s['x-truncated']) parts.push('deeply nested or very wide; not typed further');
  const ex = s['x-examples']?.[0];
  if (opts.examples && typeof ex === 'string' && !isRedacted(ex) && !s.enum && !s.format) {
    const text = JSON.stringify(ex);
    if (text.length <= 40) parts.push(`e.g. ${text}`);
  }
  return parts;
}

/** Short inline annotation for compact stubs, e.g. `84%` wrapped in a block comment. */
export function compactDoc(s: JsonSchema): string {
  const parts: string[] = [];
  const presence = s['x-presence'];
  if (presence !== undefined && presence < 1) parts.push(`${Math.round(presence * 100)}%`);
  const nullRate = s['x-nullRate'];
  if (nullRate !== undefined && nullRate > 0 && nullRate < 1) parts.push(`null ${Math.round(nullRate * 100)}%`);
  if (s['x-constant']) parts.push(`always ${JSON.stringify(s['x-constant'].value)}`);
  if (s['x-jsonString']) parts.push('JSON string, parsed by the runtime');
  return parts.length ? `/*${parts.join(', ')}*/ ` : '';
}

export const docBlock = (lines: string[], indent = '', compact = false) => {
  if (lines.length === 0) return '';
  if (lines.length === 1 || compact) return `${indent}/** ${lines.join('; ').replace(/\*\//g, '*\\/')} */\n`;
  return `${indent}/**\n${lines.map((l) => `${indent} * ${l.replace(/\*\//g, '*\\/')}`).join('\n')}\n${indent} */\n`;
};

/** Key-derived names too vague to stand alone; these fall back to the parent-prefixed name. */
export const GENERIC_NAMES = new Set([
  'Item', 'Items', 'Data', 'Result', 'Results', 'Value', 'Values', 'Content', 'Entry', 'Node', 'Nodes', 'Info', 'Meta',
  'Metadata', 'Attributes', 'Detail', 'Details', 'Object', 'Record', 'Response', 'Payload', 'Body', 'Type', 'Status',
  'State', 'Options', 'Config', 'Context', 'Extra', 'Properties', 'Fields', 'Stats', 'Summary', 'Page', 'Edge', 'Edges',
]);

/** Collects named declarations, deduplicating structurally identical types. */
export class TypeRegistry {
  private decls = new Map<string, string>();
  private byHash = new Map<string, string>();
  readonly formats = new Set<string>();
  /** Argument interfaces, emitted after result types. */
  readonly argDecls: string[] = [];

  constructor(private opts: EmitOptions) {}

  /** Property keys that reference each named type, for the rename pass. */
  private refs = new Map<string, string[]>();
  /** Names claimed through the short (key-derived) path. */
  private shortNames = new Set<string>();

  /**
   * Types that kept a long parent-prefixed name but are mostly referenced under one key get
   * renamed after that key when free (GetCommitResultAuthor used as `user` everywhere -> User).
   */
  renames(): Map<string, string> {
    const out = new Map<string, string>();
    const taken = new Set(this.decls.keys());
    for (const [name, keys] of this.refs) {
      if (this.shortNames.has(name) || keys.length < 2) continue;
      const counts = new Map<string, number>();
      for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
      const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const candidate = pascal(singular(best));
      if (n * 2 > keys.length && !GENERIC_NAMES.has(candidate) && !taken.has(candidate) && /^[A-Z]/.test(candidate)) {
        out.set(name, candidate);
        taken.add(candidate);
      }
    }
    return out;
  }

  /** Apply renames() to generated text. */
  applyRenames(text: string): string {
    let out = text;
    for (const [from, to] of this.renames()) out = out.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
    return out;
  }

  private noteRef(type: string, key: string) {
    for (const name of type.match(/\b[A-Z][A-Za-z0-9]*\b/g) ?? []) {
      if (this.decls.has(name)) this.refs.set(name, [...(this.refs.get(name) ?? []), key]);
    }
  }

  declarations(): string[] {
    const aliases = [...this.formats].sort().map((f) => {
      const a = FORMAT_ALIASES[f];
      return this.opts.compact ? `export type ${a.name} = string; // ${a.doc}\n` : `/** ${a.doc} */\nexport type ${a.name} = string;\n`;
    });
    return [...aliases, ...this.decls.values()];
  }

  private claim(hint: string, hash: string, short?: string): { name: string; fresh: boolean } {
    const existing = this.byHash.get(hash);
    if (existing) return { name: existing, fresh: false };
    // Prefer the short, key-derived name (User, Address) when it is free and not too generic.
    if (short && !GENERIC_NAMES.has(short) && !this.decls.has(short) && /^[A-Z]/.test(short)) {
      this.decls.set(short, '');
      this.byHash.set(hash, short);
      this.shortNames.add(short);
      return { name: short, fresh: true };
    }
    let name = hint;
    for (let i = 2; this.decls.has(name); i++) name = `${hint}${i}`;
    this.decls.set(name, '');
    this.byHash.set(hash, name);
    return { name, fresh: true };
  }

  /** TypeScript type expression for `s`, registering named interfaces for objects. */
  /** Names of nodes that `$ref`s point at, by `x-id`. */
  private idNames = new Map<string, string>();

  typeOf(s: JsonSchema, hint: string, short?: string): string {
    if (s.$ref) return this.idNames.get(s.$ref.slice(1)) ?? 'unknown';
    if (s.const !== undefined) return JSON.stringify(s.const);
    if (s.enum) return s.enum.map((v) => (v === null ? 'null' : JSON.stringify(v))).join(' | ');
    if (s.oneOf) return this.union(s, hint, short);
    if (s.anyOf) return [...new Set(s.anyOf.map((p) => this.typeOf(p, hint, short)))].join(' | ');
    const types = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type];
    if (types.length === 0) return s.properties ? this.object(s, hint, short) : 'unknown';
    const parts = types.map((t) => this.single(s, t, hint, short));
    return [...new Set(parts)].join(' | ');
  }

  private single(s: JsonSchema, t: string, hint: string, short?: string): string {
    switch (t) {
      case 'null':
        return 'null';
      case 'string':
        if (s.format && FORMAT_ALIASES[s.format]) {
          this.formats.add(s.format);
          return FORMAT_ALIASES[s.format].name;
        }
        return 'string';
      case 'integer':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'array': {
        if (!s.items || Object.keys(s.items).length === 0) return 'unknown[]';
        const inner = this.typeOf(s.items, singularHint(hint), short ? singular(short) : undefined);
        return /[|&]/.test(inner) ? `Array<${inner}>` : `${inner}[]`;
      }
      case 'object':
        return this.object(s, hint, short);
      default:
        return 'unknown';
    }
  }

  private object(s: JsonSchema, hint: string, short?: string): string {
    if (s['x-map'] && s.additionalProperties && typeof s.additionalProperties === 'object') {
      return `Record<string, ${this.typeOf(s.additionalProperties, `${hint}Entry`, short ? `${singular(short)}Entry` : undefined)}>`;
    }
    if (!s.properties || Object.keys(s.properties).length === 0) {
      return s.additionalProperties === false ? '{}' : 'Record<string, unknown>';
    }
    const { name, fresh } = this.claim(hint, structuralHash(s), short);
    if (s['x-id']) this.idNames.set(s['x-id'], name);
    if (!fresh) return name;
    const req = new Set(s.required ?? []);
    const compact = this.opts.compact === true;
    const entries = Object.entries(s.properties);
    // Fold only when every `*url` key is a string, so the index signature can't conflict.
    const foldable = entries.every(([k, v]) => !/url$/.test(k) || v.type === 'string');
    const links = compact && foldable ? entries.filter(([k, v]) => isLinkField(k, v)) : [];
    const fields: string[] = [];
    for (const [k, v] of entries) {
      if (links.length >= 2 && isLinkField(k, v)) continue;
      const t = this.typeOf(v, name + pascal(k), pascal(k));
      this.noteRef(t, k);
      const decl = `${propKey(k)}${req.has(k) ? '' : '?'}: ${t};`;
      fields.push(compact ? `${compactDoc(v)}${decl}` : `${docBlock(fieldDoc(v, this.opts), '  ', true)}  ${decl}`);
    }
    if (s['x-pruned']) fields.push('[more: string]: unknown;');
    else if (links.length >= 2) {
      this.formats.add('uri');
      fields.push('[link: `${string}url`]: Url;');
    }
    const doc = s.description && !compact ? docBlock([s.description.split('\n')[0]]) : '';
    const body = compact ? ` ${fields.join(' ')} ` : `\n${fields.join('\n')}\n`;
    this.decls.set(name, `${doc}export interface ${name} {${body}}\n`);
    return name;
  }

  private union(s: JsonSchema, hint: string, short?: string): string {
    const tag = s['x-discriminator'];
    // Claim the union's name first so recursive `$ref`s inside variants can point at it.
    const { name, fresh } = this.claim(hint, structuralHash(s), short);
    if (s['x-id']) this.idNames.set(s['x-id'], name);
    if (!fresh) return name;
    const names = s.oneOf!.map((v, i) => {
      const tv = tag ? v.properties?.[tag]?.const : undefined;
      return this.typeOf(v, typeof tv === 'string' ? `${pascal(tv)}${name}` : `${name}Variant${i + 1}`);
    });
    {
      const doc = tag ? `/** Discriminated by \`${tag}\`. */\n` : '';
      const body = this.opts.compact ? ` ${names.join(' | ')};` : `\n${names.map((n) => `  | ${n}`).join('\n')};`;
      this.decls.set(name, `${doc}export type ${name} =${body}\n`);
    }
    return name;
  }
}

export function singularHint(hint: string): string {
  const m = hint.match(/^(.*?)([A-Z][a-z0-9]*)$/);
  if (!m) return `${hint}Item`;
  const [, head, last] = m;
  const s = singular(last);
  return s === last ? `${hint}Item` : head + s;
}
