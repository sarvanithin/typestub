import { refIndex, type JsonSchema } from '@typestub/infer';

export type MismatchKind = 'new_field' | 'missing_required' | 'type_mismatch' | 'enum_value';

export interface Mismatch {
  path: string;
  kind: MismatchKind;
  expected?: string;
  actual?: string;
}

const kindOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v;

function typeMatches(s: JsonSchema, v: unknown): boolean {
  if (s.type === undefined) return true;
  const types = Array.isArray(s.type) ? s.type : [s.type];
  const k = kindOf(v);
  return types.some((t) => t === k || (t === 'number' && k === 'integer'));
}

/**
 * Check a live value against an inferred schema. Never throws: returns every mismatch so
 * the drift monitor can classify them. Stops after `limit` mismatches.
 */
export function validate(schema: JsonSchema, value: unknown, limit = 50): Mismatch[] {
  const out: Mismatch[] = [];
  const refs = refIndex(schema);
  const walk = (s: JsonSchema, v: unknown, path: string) => {
    if (out.length >= limit || s['x-truncated']) return;
    if (s.$ref) {
      const target = refs.get(s.$ref.slice(1));
      if (target) walk(target, v, path);
      return;
    }
    if (s.anyOf) {
      const fits = s.anyOf.map((alt) => {
        const sub: Mismatch[] = [];
        const saved = out.length;
        walk(alt, v, path);
        sub.push(...out.splice(saved));
        return sub;
      });
      const best = fits.reduce((a, b) => (b.length < a.length ? b : a));
      out.push(...best);
      return;
    }
    if (s.oneOf) {
      const tag = s['x-discriminator'];
      const variant =
        tag && v && typeof v === 'object'
          ? s.oneOf.find((alt) => alt.properties?.[tag]?.const === (v as Record<string, unknown>)[tag])
          : undefined;
      if (variant) walk(variant, v, path);
      else out.push({ path: tag ? `${path}.${tag}` : path, kind: 'enum_value', actual: JSON.stringify(tag ? (v as Record<string, unknown>)?.[tag] : v) });
      return;
    }
    if (s.const !== undefined && v !== s.const) {
      out.push({ path, kind: 'enum_value', expected: JSON.stringify(s.const), actual: JSON.stringify(v) });
      return;
    }
    if (!typeMatches(s, v)) {
      out.push({ path, kind: 'type_mismatch', expected: JSON.stringify(s.type), actual: kindOf(v) });
      return;
    }
    if (s.enum && !s.enum.includes(v as never)) {
      out.push({ path, kind: 'enum_value', expected: s.enum.join('|'), actual: JSON.stringify(v) });
    }
    if (Array.isArray(v) && s.items && Object.keys(s.items).length) {
      v.forEach((el, i) => walk(s.items!, el, `${path}[${i}]`));
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      if (s['x-map'] && s.additionalProperties && typeof s.additionalProperties === 'object') {
        for (const [k, x] of Object.entries(obj)) walk(s.additionalProperties, x, `${path}[${JSON.stringify(k)}]`);
        return;
      }
      if (!s.properties) return;
      for (const k of s.required ?? []) if (!(k in obj)) out.push({ path: `${path}.${k}`, kind: 'missing_required' });
      for (const [k, x] of Object.entries(obj)) {
        const ps = s.properties[k];
        if (ps) walk(ps, x, `${path}.${k}`);
        else out.push({ path: `${path}.${k}`, kind: 'new_field', actual: kindOf(x) });
      }
    }
  };
  walk(schema, value, '$');
  return out;
}
