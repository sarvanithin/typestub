import { createHash } from 'node:crypto';
import { detectFormat, parseEmbeddedJson, REDACTED_PREFIX, type McpToolResult } from '@typestub/infer';

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 10);

/** Lowercase or uppercase identifier tokens are kept so enum detection still works. */
const KEEP = /^(?:[a-z][a-z0-9_.:-]{0,31}|[A-Z][A-Z0-9_.-]{0,31})$/;

export function redactString(s: string): string {
  const embedded = parseEmbeddedJson(s);
  if (embedded !== undefined) return JSON.stringify(redactValue(embedded));
  const fmt = detectFormat(s);
  if (fmt === 'date-time' || fmt === 'date') return s;
  if (fmt === 'uuid') {
    const h = createHash('sha256').update(s).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  }
  if (fmt === 'uri') return `https://redacted.example/${hash(s)}`;
  if (fmt === 'email') return `u${hash(s)}@redacted.example`;
  if (KEEP.test(s) && !s.includes('@')) return s;
  return `${REDACTED_PREFIX}${hash(s)}`;
}

/** Round to two significant digits, preserving integer vs float. */
export function redactNumber(n: number): number {
  if (!Number.isFinite(n) || Math.abs(n) < 100) return n;
  const mag = 10 ** (Math.floor(Math.log10(Math.abs(n))) - 1);
  const r = Math.round(n / mag) * mag;
  if (Number.isInteger(n)) return Math.round(r);
  return Number.isInteger(r) ? r + 0.5 : r;
}

/** Deep-redact a JSON value: keys and types are kept, values are hashed or bucketed. */
export function redactValue(v: unknown): unknown {
  if (typeof v === 'string') return redactString(v);
  if (typeof v === 'number') return redactNumber(v);
  if (Array.isArray(v)) return v.map(redactValue);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, redactValue(x)]));
  }
  return v;
}

function redactText(text: string): string {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.stringify(redactValue(JSON.parse(t)));
    } catch {
      // not JSON: fall through
    }
  }
  return `${REDACTED_PREFIX}${hash(text)}`;
}

/** Redact a CallToolResult, including JSON carried inside text blocks. */
export function redactResult(r: McpToolResult): McpToolResult {
  const out: McpToolResult = { ...r };
  if (r.structuredContent !== undefined) out.structuredContent = redactValue(r.structuredContent);
  if (Array.isArray(r.content)) {
    out.content = r.content.map((c) =>
      c.type === 'text' && typeof c.text === 'string' ? { ...c, text: redactText(c.text) } : { type: c.type, redacted: true },
    );
  }
  return out;
}
