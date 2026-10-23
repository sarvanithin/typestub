import type { JsonSchema } from './types.js';

const ANNOTATIONS = ['x-presence', 'x-nullRate', 'x-examples', 'x-pagination', 'x-emptyOnly'] as const;

/**
 * Overlay inferred knowledge onto a server-declared schema. The declared schema wins
 * wherever it says something; inference only fills gaps (missing properties, items,
 * presence annotations).
 */
export function applyDeclared(declared: JsonSchema, inferred: JsonSchema): JsonSchema {
  // A declared string that always carries serialized JSON: the inferred, decoded shape is more useful.
  if (declared.type === 'string' && inferred['x-jsonString']) {
    return { ...inferred, ...(declared.description ? { description: declared.description } : {}) };
  }
  const out: JsonSchema = structuredClone(declared);
  for (const a of ANNOTATIONS) {
    if (inferred[a] !== undefined && out[a] === undefined) (out as Record<string, unknown>)[a] = inferred[a];
  }
  // A declared string without format or enum gets the inferred ones.
  if (out.type === 'string' && !out.format && !out.enum && out.const === undefined) {
    if (inferred.format) out.format = inferred.format;
    else if (inferred.enum) out.enum = inferred.enum;
  }
  if (inferred.properties) {
    out.properties ??= {};
    for (const [k, inf] of Object.entries(inferred.properties)) {
      const dec = out.properties[k];
      out.properties[k] = dec ? applyDeclared(dec, inf) : { ...inf, 'x-inferred': true };
    }
    // Declared required list stays authoritative; add inferred always-present fields that it did not mention.
    const declaredProps = new Set(Object.keys(declared.properties ?? {}));
    const extraRequired = (inferred.required ?? []).filter((k) => !declaredProps.has(k));
    if (extraRequired.length) out.required = [...(out.required ?? []), ...extraRequired];
  }
  if (inferred.items && out.type === 'array') {
    out.items = out.items ? applyDeclared(out.items, inferred.items) : inferred.items;
  }
  return out;
}
