import {
  isIdLike, PAGE_HASMORE_KEYS, PAGE_ITEM_KEYS, PAGE_NEXT_KEYS, PAGE_TOTAL_KEYS, type StringFormat,
} from './patterns.js';
import { foldRecursion } from './recursion.js';
import { kindsOf, MAX_FIELDS, mergeShapes, emptyShape, type ObjShape, type Shape, type StrStats } from './shape.js';
import type { JsonSchema, JsonType, PaginationInfo } from './types.js';

export const ENUM_MAX_VALUES = 12;
export const ENUM_MIN_OBSERVATIONS = 20;

interface Ctx {
  /** Field names that must never become enums (e.g. pagination cursors). */
  noEnum: Set<string>;
  examples: boolean;
  /** Server-wide enums by field name, for fields seen too rarely in one tool to qualify alone. */
  globalEnums?: Map<string, string[]>;
}

export interface SchemaOptions {
  examples?: boolean;
  globalEnums?: Map<string, string[]>;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Convert a merged Shape into JSON Schema, applying TypeStub's pattern rules. */
export function shapeToSchema(shape: Shape, opts: SchemaOptions = {}): JsonSchema {
  return foldRecursion(convert(shape, { noEnum: new Set(), examples: opts.examples ?? true, globalEnums: opts.globalEnums }, true));
}

const enumCandidate = (st: StrStats) =>
  !st.overflow && st.tokenLike === st.count && st.idLike === 0 && st.redacted === 0 && Object.keys(st.formats).length === 0;

const qualifiesAsEnum = (st: StrStats) =>
  enumCandidate(st) && st.count >= ENUM_MIN_OBSERVATIONS && st.values.size >= 2 && st.values.size <= ENUM_MAX_VALUES;

/** Merge string stats by field name across shapes, then keep the names that qualify as enums. */
export function collectGlobalEnums(shapes: Shape[]): Map<string, string[]> {
  const byName = new Map<string, Shape>();
  const visit = (s: Shape, name?: string) => {
    if (s.str && name) byName.set(name, mergeShapes(byName.get(name) ?? emptyShape(), { count: 0, nulls: 0, str: s.str }));
    if (s.obj) for (const [k, f] of s.obj.fields) visit(f, k);
    if (s.obj?.variants) for (const vs of s.obj.variants.values()) for (const v of vs.values()) for (const [k, f] of v.fields) visit(f, k);
    if (s.arr?.items) visit(s.arr.items, name);
  };
  shapes.forEach((s) => visit(s));
  const out = new Map<string, string[]>();
  for (const [name, s] of byName) if (s.str && qualifiesAsEnum(s.str)) out.set(name, [...s.str.values.keys()].sort());
  return out;
}

function convert(s: Shape, ctx: Ctx, topLevel = false, fieldName?: string): JsonSchema {
  const kinds = kindsOf(s);
  const nullable = s.nulls > 0;
  if (kinds.length === 0) {
    // Only ever null (or never observed).
    return s.nulls > 0 ? { type: 'null' } : {};
  }
  if (kinds.includes('unknown')) return { 'x-truncated': true };

  const parts: JsonSchema[] = [];
  if (s.obj) parts.push(convertObject(s.obj, ctx, topLevel));
  if (s.arr) {
    const arr: JsonSchema = { type: 'array' };
    if (s.arr.items && s.arr.items.count > 0) arr.items = convert(s.arr.items, ctx, false, fieldName);
    else {
      arr.items = {};
      arr['x-emptyOnly'] = true;
    }
    parts.push(arr);
  }
  if (s.str) parts.push(convertString(s.str, ctx, fieldName));
  if (s.num) parts.push(s.num.nonInteger > 0 ? { type: 'number' } : { type: 'integer' });
  if (s.bool) parts.push({ type: 'boolean' });

  let out: JsonSchema;
  if (parts.length === 1) {
    out = parts[0];
  } else {
    // Widen to a union. Merge type lists into one node when no part carries structure.
    const structural = parts.filter((p) => p.properties || p.items || p.oneOf || p.additionalProperties || p.enum);
    if (structural.length === 0) {
      out = { type: parts.flatMap((p) => p.type as JsonType) };
    } else {
      out = { anyOf: parts };
    }
  }
  // Every non-null observation was a JSON string: describe the parsed value and let the shim decode it.
  if (s.jsonStr && s.jsonStr === s.count - s.nulls) out['x-jsonString'] = true;
  if (nullable) out = addNull(out);
  const constant = constantOf(s);
  if (constant && !out.enum) out['x-constant'] = constant;
  if (ctx.examples) {
    if (s.str?.example !== undefined && !out.enum) out['x-examples'] = [s.str.example];
    else if (s.num?.example !== undefined) out['x-examples'] = [s.num.example];
  }
  return out;
}

/**
 * A boolean or token-like string that never varied over ENUM_MIN_OBSERVATIONS+ observations. The
 * type stays wide (other values may exist), but the stub warns that filtering on it found nothing.
 */
function constantOf(s: Shape): JsonSchema['x-constant'] {
  const kinds = kindsOf(s);
  if (kinds.length !== 1) return undefined;
  if (s.bool && s.bool.count >= ENUM_MIN_OBSERVATIONS && (s.bool.trues === 0 || s.bool.trues === s.bool.count)) {
    return { value: s.bool.trues > 0, count: s.bool.count };
  }
  const st = s.str;
  if (st && st.count >= ENUM_MIN_OBSERVATIONS && st.values.size === 1 && enumCandidate(st)) {
    return { value: [...st.values.keys()][0], count: st.count };
  }
  return undefined;
}

function addNull(s: JsonSchema): JsonSchema {
  if (s.anyOf) return { ...s, anyOf: [...s.anyOf, { type: 'null' }] };
  if (s.oneOf) return { anyOf: [s, { type: 'null' }] };
  const types = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type];
  const out: JsonSchema = { ...s, type: [...types, 'null'] };
  if (s.enum) out.enum = [...s.enum, null];
  return out;
}

function convertString(st: StrStats, ctx: Ctx, fieldName?: string): JsonSchema {
  const out: JsonSchema = { type: 'string' };
  for (const [fmt, n] of Object.entries(st.formats) as Array<[StringFormat, number]>) {
    if (n === st.count) {
      out.format = fmt;
      return out;
    }
  }
  const allowed = !(fieldName && ctx.noEnum.has(fieldName));
  const isEnum = allowed && qualifiesAsEnum(st);
  if (isEnum) out.enum = [...st.values.keys()].sort();
  else if (allowed && fieldName && enumCandidate(st)) {
    // Adopt only when this field's values fit the shared enum and cover at least half of it,
    // so same-named fields with different vocabularies (OPEN vs open) don't leak into each other.
    const global = ctx.globalEnums?.get(fieldName);
    const local = [...st.values.keys()];
    if (global && local.every((v) => global.includes(v)) && local.length * 2 >= global.length) out.enum = global;
  }
  return out;
}

/** Object keys that look like ids rather than a fixed set of field names. */
function isMapLike(o: ObjShape): boolean {
  const keys = [...o.fields.keys()];
  if (keys.length < 2) return false;
  const idKeys = keys.filter((k) => isIdLike(k) || /^[a-z]{2,8}_[A-Za-z0-9]{6,}$/.test(k)).length;
  if (idKeys / keys.length >= 0.8) return true;
  // Many keys, each present in few objects: keys vary per sample.
  if (o.count >= 3 && keys.length > 30) {
    const meanPresence = [...o.fields.values()].reduce((a, f) => a + f.count, 0) / keys.length / o.count;
    return meanPresence < 0.2;
  }
  return false;
}

const PAGE_INFO_KEYS = ['pageInfo', 'page_info', 'pagination', 'paging', 'meta', 'page', 'cursor', 'links'];

/** Detect a page envelope; nested cursors (GraphQL `pageInfo.endCursor`) are returned as dotted paths. */
function detectPagination(o: ObjShape): PaginationInfo | undefined {
  const always = (k: string) => o.fields.get(k)!.count === o.count;
  let items = PAGE_ITEM_KEYS.find((k) => o.fields.get(k)?.arr && always(k));
  if (!items) {
    const arrays = [...o.fields.keys()].filter((k) => o.fields.get(k)!.arr?.items?.obj && always(k));
    if (arrays.length === 1) items = arrays[0];
  }
  if (!items) return undefined;
  const find = (fields: Map<string, Shape>, keys: string[], test: (f: Shape) => boolean) => keys.find((k) => fields.has(k) && test(fields.get(k)!));
  const isCursor = (f: Shape) => !!f.str || f.nulls > 0;
  let next = find(o.fields, PAGE_NEXT_KEYS, isCursor);
  let hasMore = find(o.fields, PAGE_HASMORE_KEYS, (f) => !!f.bool);
  const total = find(o.fields, PAGE_TOTAL_KEYS, (f) => !!f.num);
  if (!next) {
    for (const info of PAGE_INFO_KEYS) {
      const nested = o.fields.get(info)?.obj?.fields;
      const n = nested && find(nested, PAGE_NEXT_KEYS, isCursor);
      if (n) {
        next = `${info}.${n}`;
        const h = find(nested, PAGE_HASMORE_KEYS, (f) => !!f.bool);
        if (h && !hasMore) hasMore = `${info}.${h}`;
        break;
      }
    }
  }
  if (!next && !total && !hasMore) return undefined;
  const p: PaginationInfo = { items };
  if (next) p.next = next;
  if (total) p.total = total;
  if (hasMore) p.hasMore = hasMore;
  return p;
}

function discriminatorOf(o: ObjShape): string | undefined {
  if (!o.variants) return undefined;
  for (const [tag, byValue] of o.variants) {
    const covered = [...byValue.values()].reduce((a, v) => a + v.count, 0);
    if (covered !== o.count || byValue.size < 2 || byValue.size > ENUM_MAX_VALUES) continue;
    // Only a real union if the variants carry different field sets.
    const keySets = [...byValue.values()].map((v) =>
      [...v.fields.entries()].filter(([, f]) => f.count === v.count).map(([k]) => k).sort().join(','),
    );
    if (new Set(keySets).size > 1) return tag;
  }
  return undefined;
}

function fieldSchema(f: Shape, parentCount: number, ctx: Ctx, name: string): JsonSchema {
  const fs = convert(f, ctx, false, name);
  fs['x-presence'] = round(f.count / parentCount);
  if (f.nulls > 0) fs['x-nullRate'] = round(f.nulls / f.count);
  return fs;
}

function plainObject(o: ObjShape, ctx: Ctx, constTag?: { key: string; value: string }): JsonSchema {
  if (o.overflow || o.fields.size > MAX_FIELDS) {
    return { type: 'object', additionalProperties: {}, 'x-truncated': true };
  }
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [k, f] of o.fields) {
    if (constTag && k === constTag.key) {
      properties[k] = { const: constTag.value, type: 'string', 'x-presence': 1 };
    } else {
      properties[k] = fieldSchema(f, o.count, ctx, k);
    }
    if (f.count === o.count) required.push(k);
  }
  return { type: 'object', properties, required };
}

function convertObject(o: ObjShape, ctx: Ctx, topLevel: boolean): JsonSchema {
  if (isMapLike(o)) {
    const merged = [...o.fields.values()].reduce((acc, f) => mergeShapes(acc, f), emptyShape());
    return { type: 'object', additionalProperties: convert(merged, ctx), 'x-map': true };
  }
  const tag = discriminatorOf(o);
  if (tag) {
    const variants = [...o.variants!.get(tag)!.entries()].sort(([a], [b]) => a.localeCompare(b));
    return {
      oneOf: variants.map(([value, vs]) => plainObject(vs, ctx, { key: tag, value })),
      'x-discriminator': tag,
    };
  }
  const pagination = topLevel ? detectPagination(o) : undefined;
  if (pagination?.next) ctx = { ...ctx, noEnum: new Set([...ctx.noEnum, pagination.next.split('.').pop()!]) };
  const out = plainObject(o, ctx);
  if (pagination) out['x-pagination'] = pagination;
  return out;
}
