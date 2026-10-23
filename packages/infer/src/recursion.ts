import type { JsonSchema } from './types.js';

/** Keys (and union tags) that identify a node's shape, ignoring how deep it was observed. */
function signature(s: JsonSchema): { keys: Set<string>; tags: Set<string> } | undefined {
  if (s.oneOf) {
    const tag = s['x-discriminator'];
    const keys = new Set<string>();
    const tags = new Set<string>();
    for (const v of s.oneOf) {
      Object.keys(v.properties ?? {}).forEach((k) => keys.add(k));
      if (tag && v.properties?.[tag]?.const !== undefined) tags.add(String(v.properties[tag].const));
    }
    return keys.size ? { keys, tags } : undefined;
  }
  if (s.properties && Object.keys(s.properties).length) return { keys: new Set(Object.keys(s.properties)), tags: new Set() };
  return undefined;
}

const subset = <T>(a: Set<T>, b: Set<T>) => [...a].every((x) => b.has(x));

/** `inner` looks like a (possibly shallower-observed) copy of `outer`. */
function sameShape(inner: JsonSchema, outer: JsonSchema): boolean {
  const a = signature(inner);
  const b = signature(outer);
  if (!a || !b || a.keys.size < 2) return false;
  return a.keys.size * 2 >= b.keys.size && subset(a.keys, b.keys) && subset(a.tags, b.tags) && (a.tags.size > 0) === (b.tags.size > 0);
}

/**
 * Fold recursive structures (file trees, comment threads): a node nested under an ancestor
 * with the same shape becomes `{ $ref: "#<id>" }` pointing at that ancestor, which gets `x-id`.
 */
export function foldRecursion(root: JsonSchema): JsonSchema {
  let next = 0;
  const visit = (s: JsonSchema, ancestors: JsonSchema[]): JsonSchema => {
    const isNode = !!signature(s);
    if (isNode) {
      for (const a of ancestors) {
        if (a !== s && sameShape(s, a)) {
          a['x-id'] ??= `r${next++}`;
          const ref: JsonSchema = { $ref: `#${a['x-id']}` };
          for (const k of ['x-presence', 'x-nullRate'] as const) if (s[k] !== undefined) ref[k] = s[k];
          return ref;
        }
      }
    }
    const chain = isNode ? [...ancestors, s] : ancestors;
    const out = s;
    if (s.properties) for (const k of Object.keys(s.properties)) s.properties[k] = visit(s.properties[k], chain);
    if (s.items) s.items = visit(s.items, chain);
    if (s.oneOf) s.oneOf = s.oneOf.map((v) => visit(v, [...chain]));
    if (s.anyOf) s.anyOf = s.anyOf.map((v) => visit(v, chain));
    if (s.additionalProperties && typeof s.additionalProperties === 'object') s.additionalProperties = visit(s.additionalProperties, chain);
    return out;
  };
  return visit(root, []);
}

/** Map of `x-id` -> node, for resolving `$ref`s produced by foldRecursion. */
export function refIndex(root: JsonSchema): Map<string, JsonSchema> {
  const out = new Map<string, JsonSchema>();
  const seen = new Set<JsonSchema>();
  const walk = (s: JsonSchema | undefined) => {
    if (!s || typeof s !== 'object' || seen.has(s)) return;
    seen.add(s);
    if (typeof s['x-id'] === 'string') out.set(s['x-id'], s);
    Object.values(s.properties ?? {}).forEach(walk);
    walk(s.items);
    s.oneOf?.forEach(walk);
    s.anyOf?.forEach(walk);
    if (typeof s.additionalProperties === 'object') walk(s.additionalProperties);
  };
  walk(root);
  return out;
}
