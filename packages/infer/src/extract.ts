import type { JsonSchema, McpToolResult, WrapMode } from './types.js';

export interface Extracted {
  payload: unknown;
  wrap: WrapMode;
  isError: boolean;
}

function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false } {
  const t = text.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(t) };
  } catch {
    return { ok: false };
  }
}

/**
 * Unwrap the value a tool actually returns. Prefers structuredContent, then JSON carried in
 * text blocks (the common MCP "text-wrapped JSON" pattern), then plain text.
 */
export function extractPayload(result: McpToolResult): Extracted {
  const isError = result.isError === true;
  if (result.structuredContent !== undefined && !isError) {
    return { payload: result.structuredContent, wrap: 'structured', isError };
  }
  const content = Array.isArray(result.content) ? result.content : [];
  const texts = content.filter((c) => c.type === 'text' && typeof c.text === 'string');
  if (texts.length === 0 || texts.length !== content.length) {
    return { payload: content, wrap: 'content', isError };
  }
  if (texts.length === 1) {
    const parsed = parseJsonText(texts[0].text!);
    return parsed.ok
      ? { payload: parsed.value, wrap: 'json-text', isError }
      : { payload: texts[0].text, wrap: 'text', isError };
  }
  const parsedAll = texts.map((t) => parseJsonText(t.text!));
  if (parsedAll.every((p) => p.ok)) {
    return { payload: parsedAll.map((p) => (p as { value: unknown }).value), wrap: 'json-text-multi', isError };
  }
  return { payload: texts.map((t) => t.text).join('\n'), wrap: 'text', isError };
}

/** A string field whose value is itself serialized JSON (object or array), parsed; else undefined. */
export function parseEmbeddedJson(s: string): unknown {
  if (s.length < 2) return undefined;
  const parsed = parseJsonText(s);
  return parsed.ok && parsed.value !== null && typeof parsed.value === 'object' ? parsed.value : undefined;
}

/**
 * Apply the schema's `x-jsonString` markers to a live payload: fields that carry serialized
 * JSON are replaced by their parsed value, matching what the generated types describe.
 */
export function decodeEmbedded(schema: JsonSchema, value: unknown): unknown {
  if (schema['x-jsonString'] && typeof value === 'string') {
    const parsed = parseEmbeddedJson(value);
    return parsed === undefined ? value : decodeEmbedded({ ...schema, 'x-jsonString': undefined }, parsed);
  }
  if (Array.isArray(value)) return schema.items ? value.map((v) => decodeEmbedded(schema.items!, v)) : value;
  if (value && typeof value === 'object') {
    const props = schema.properties;
    const extra = typeof schema.additionalProperties === 'object' ? schema.additionalProperties : undefined;
    const alts = schema.oneOf ?? schema.anyOf;
    if (!props && !extra && !alts) return value;
    if (alts && !props) {
      const tag = schema['x-discriminator'];
      const alt = tag ? alts.find((a) => a.properties?.[tag]?.const === (value as Record<string, unknown>)[tag]) : alts.find((a) => a.properties);
      return alt ? decodeEmbedded(alt, value) : value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const s = props?.[k] ?? extra;
      out[k] = s ? decodeEmbedded(s, v) : v;
    }
    return out;
  }
  return value;
}

/** Whether any node in the schema needs decodeEmbedded(). */
export function hasEmbedded(schema: JsonSchema): boolean {
  return JSON.stringify(schema).includes('"x-jsonString":true');
}
