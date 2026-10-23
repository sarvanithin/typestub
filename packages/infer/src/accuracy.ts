import type { JsonSchema } from './types.js';

export interface FieldDescriptor {
  types: string;
  nullable: boolean;
  optional: boolean;
  enum?: string;
  format?: string;
  const?: unknown;
}

export interface AccuracyReport {
  accuracy: number;
  matched: number;
  total: number;
  mismatches: Array<{ path: string; expected?: FieldDescriptor; actual?: FieldDescriptor }>;
}

function typesOf(s: JsonSchema): { types: string[]; nullable: boolean } {
  if (s.$ref) return { types: ['ref'], nullable: false };
  if (s.anyOf) {
    const parts = s.anyOf.map(typesOf);
    return { types: [...new Set(parts.flatMap((p) => p.types))], nullable: parts.some((p) => p.nullable) };
  }
  if (s.oneOf) return { types: ['union'], nullable: false };
  const raw = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type];
  const types = raw.filter((t) => t !== 'null').map((t) => (t === 'object' && s['x-map'] ? 'map' : t));
  return { types: types.length ? types : raw.includes('null') ? [] : ['unknown'], nullable: raw.includes('null') };
}

function describe(s: JsonSchema, optional: boolean): FieldDescriptor {
  const { types, nullable } = typesOf(s);
  const d: FieldDescriptor = { types: [...types].sort().join('|'), nullable, optional };
  const nonNullEnum = s.enum?.filter((v) => v !== null);
  if (nonNullEnum?.length) d.enum = nonNullEnum.map(String).sort().join('|');
  if (s.format) d.format = s.format;
  if (s.const !== undefined) d.const = s.const;
  return d;
}

/** Flatten a schema into path -> descriptor, e.g. `items[].shipping.carrier`. */
export function flatten(s: JsonSchema, path = '$', optional = false, out = new Map<string, FieldDescriptor>()) {
  out.set(path, describe(s, optional));
  const nodes = s.anyOf ? s.anyOf : [s];
  for (const n of nodes) {
    if (n.oneOf) {
      const tag = n['x-discriminator'];
      n.oneOf.forEach((v, i) => {
        const label = tag && v.properties?.[tag]?.const !== undefined ? `${tag}=${String(v.properties[tag].const)}` : String(i);
        flatten(v, `${path}<${label}>`, false, out);
      });
    }
    if (n.properties) {
      const req = new Set(n.required ?? []);
      for (const [k, v] of Object.entries(n.properties)) flatten(v, `${path}.${k}`, !req.has(k), out);
    }
    if (n.items) flatten(n.items, `${path}[]`, false, out);
    if (n.additionalProperties && typeof n.additionalProperties === 'object') {
      flatten(n.additionalProperties, `${path}{}`, false, out);
    }
  }
  return out;
}

/** Field-level accuracy of `actual` against a hand-written `expected` schema. */
export function schemaAccuracy(expected: JsonSchema, actual: JsonSchema): AccuracyReport {
  const e = flatten(expected);
  const a = flatten(actual);
  const paths = new Set([...e.keys(), ...a.keys()]);
  const mismatches: AccuracyReport['mismatches'] = [];
  let matched = 0;
  for (const p of paths) {
    const ed = e.get(p);
    const ad = a.get(p);
    if (ed && ad && JSON.stringify(ed) === JSON.stringify(ad)) matched++;
    else mismatches.push({ path: p, expected: ed, actual: ad });
  }
  return { accuracy: paths.size ? matched / paths.size : 1, matched, total: paths.size, mismatches };
}
