import { parseEmbeddedJson } from './extract.js';
import { detectFormat, isIdLike, isTokenLike, REDACTED_PREFIX, TAG_KEYS, type StringFormat } from './patterns.js';

/** Accumulated observations of one position in a JSON tree, merged across samples. */
export interface Shape {
  /** Times this position was observed (any type, including null). */
  count: number;
  nulls: number;
  str?: StrStats;
  num?: { count: number; nonInteger: number; example?: number };
  bool?: { count: number };
  obj?: ObjShape;
  arr?: ArrShape;
  /** Subtree below the depth cap: type unknown. */
  opaque?: number;
  /** Observations that were strings holding serialized JSON (merged as their parsed value). */
  jsonStr?: number;
}

export interface StrStats {
  count: number;
  /** Distinct values seen, capped at MAX_TRACKED_VALUES. */
  values: Map<string, number>;
  overflow: boolean;
  formats: Partial<Record<StringFormat, number>>;
  tokenLike: number;
  idLike: number;
  redacted: number;
  example?: string;
}

export interface ObjShape {
  count: number;
  /** Field shapes; a field's `count` is how many parent objects contained it. */
  fields: Map<string, Shape>;
  /** Objects whose field count exceeded the cap. */
  overflow: boolean;
  /** Per candidate tag key, per tag value: the sub-shape of objects carrying that value. */
  variants?: Map<string, Map<string, ObjShape>>;
}

export interface ArrShape {
  count: number;
  empty: number;
  items: Shape | null;
}

export const MAX_DEPTH = 8;
export const MAX_FIELDS = 200;
const MAX_TRACKED_VALUES = 50;

export const emptyShape = (): Shape => ({ count: 0, nulls: 0 });

/** Build a single-observation shape from a JSON value. */
export function shapeOf(value: unknown, depth = 0): Shape {
  const s: Shape = { count: 1, nulls: 0 };
  if (depth > MAX_DEPTH) {
    s.opaque = 1;
    return s;
  }
  if (value === null || value === undefined) {
    s.nulls = 1;
  } else if (typeof value === 'string' && depth > 0 && parseEmbeddedJson(value) !== undefined) {
    const inner = shapeOf(parseEmbeddedJson(value), depth);
    inner.jsonStr = 1;
    return inner;
  } else if (typeof value === 'string') {
    const fmt = detectFormat(value);
    s.str = {
      count: 1,
      values: new Map([[value, 1]]),
      overflow: false,
      formats: fmt ? { [fmt]: 1 } : {},
      tokenLike: isTokenLike(value) ? 1 : 0,
      idLike: isIdLike(value) ? 1 : 0,
      redacted: value.startsWith(REDACTED_PREFIX) ? 1 : 0,
      example: value,
    };
  } else if (typeof value === 'number') {
    s.num = { count: 1, nonInteger: Number.isInteger(value) ? 0 : 1, example: value };
  } else if (typeof value === 'boolean') {
    s.bool = { count: 1 };
  } else if (Array.isArray(value)) {
    let items: Shape | null = null;
    for (const el of value) items = mergeShapes(items ?? emptyShape(), shapeOf(el, depth + 1));
    s.arr = { count: 1, empty: value.length === 0 ? 1 : 0, items };
  } else if (typeof value === 'object') {
    s.obj = objShapeOf(value as Record<string, unknown>, depth);
  }
  return s;
}

function objShapeOf(value: Record<string, unknown>, depth: number): ObjShape {
  const o: ObjShape = { count: 1, fields: new Map(), overflow: false };
  const keys = Object.keys(value);
  for (const k of keys) {
    if (o.fields.size >= MAX_FIELDS * 2) {
      o.overflow = true;
      break;
    }
    o.fields.set(k, shapeOf(value[k], depth + 1));
  }
  for (const tag of TAG_KEYS) {
    const tv = value[tag];
    if (typeof tv === 'string' && isTokenLike(tv)) {
      o.variants ??= new Map();
      // Each variant holds its own copy so variant shapes merge independently.
      const fields = new Map([...o.fields].map(([k, f]) => [k, cloneShape(f)] as const));
      o.variants.set(tag, new Map([[tv, { count: 1, fields, overflow: o.overflow }]]));
    }
  }
  return o;
}

/** Merge `b` into `a` (mutating and returning `a`). */
export function mergeShapes(a: Shape, b: Shape): Shape {
  a.count += b.count;
  a.nulls += b.nulls;
  if (b.opaque) a.opaque = (a.opaque ?? 0) + b.opaque;
  if (b.jsonStr) a.jsonStr = (a.jsonStr ?? 0) + b.jsonStr;
  if (b.str) a.str = a.str ? mergeStr(a.str, b.str) : cloneStr(b.str);
  if (b.num) {
    a.num = a.num
      ? { count: a.num.count + b.num.count, nonInteger: a.num.nonInteger + b.num.nonInteger, example: a.num.example ?? b.num.example }
      : { ...b.num };
  }
  if (b.bool) a.bool = { count: (a.bool?.count ?? 0) + b.bool.count };
  if (b.arr) {
    if (!a.arr) a.arr = { count: 0, empty: 0, items: null };
    a.arr.count += b.arr.count;
    a.arr.empty += b.arr.empty;
    if (b.arr.items) a.arr.items = a.arr.items ? mergeShapes(a.arr.items, b.arr.items) : cloneShape(b.arr.items);
  }
  if (b.obj) a.obj = a.obj ? mergeObj(a.obj, b.obj) : cloneObj(b.obj);
  return a;
}

export function mergeObj(a: ObjShape, b: ObjShape): ObjShape {
  a.count += b.count;
  a.overflow ||= b.overflow;
  for (const [k, fb] of b.fields) {
    const fa = a.fields.get(k);
    if (fa) mergeShapes(fa, fb);
    else if (a.fields.size < MAX_FIELDS * 2) a.fields.set(k, cloneShape(fb));
    else a.overflow = true;
  }
  if (b.variants) {
    a.variants ??= new Map();
    for (const [tag, byValue] of b.variants) {
      const target = a.variants.get(tag) ?? new Map<string, ObjShape>();
      for (const [v, vs] of byValue) {
        const existing = target.get(v);
        target.set(v, existing ? mergeObj(existing, vs) : cloneObj(vs));
      }
      a.variants.set(tag, target);
    }
  }
  return a;
}

function mergeStr(a: StrStats, b: StrStats): StrStats {
  a.count += b.count;
  a.tokenLike += b.tokenLike;
  a.idLike += b.idLike;
  a.redacted += b.redacted;
  a.example ??= b.example;
  for (const [f, n] of Object.entries(b.formats) as Array<[StringFormat, number]>) a.formats[f] = (a.formats[f] ?? 0) + n;
  for (const [v, n] of b.values) {
    if (a.values.has(v)) a.values.set(v, a.values.get(v)! + n);
    else if (a.values.size < MAX_TRACKED_VALUES) a.values.set(v, n);
    else a.overflow = true;
  }
  a.overflow ||= b.overflow;
  return a;
}

const cloneStr = (s: StrStats): StrStats => ({ ...s, values: new Map(s.values), formats: { ...s.formats } });

export function cloneShape(s: Shape): Shape {
  return mergeShapes(emptyShape(), s);
}

function cloneObj(o: ObjShape): ObjShape {
  return mergeObj({ count: 0, fields: new Map(), overflow: false }, o);
}

/** Distinct non-null kinds observed at a position. */
export function kindsOf(s: Shape): string[] {
  const k: string[] = [];
  if (s.obj) k.push('object');
  if (s.arr) k.push('array');
  if (s.str) k.push('string');
  if (s.num) k.push('number');
  if (s.bool) k.push('boolean');
  if (s.opaque) k.push('unknown');
  return k;
}
