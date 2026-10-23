/** String-level pattern detectors shared by inference, redaction and generators. */

export type StringFormat = 'date-time' | 'date' | 'uuid' | 'uri' | 'email';

const RE_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_URI = /^https?:\/\/[^\s]+$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function detectFormat(s: string): StringFormat | undefined {
  if (RE_UUID.test(s)) return 'uuid';
  if (RE_DATE.test(s)) return 'date';
  if (RE_DATETIME.test(s) && !Number.isNaN(Date.parse(s))) return 'date-time';
  if (RE_URI.test(s)) return 'uri';
  if (RE_EMAIL.test(s)) return 'email';
  return undefined;
}

/** Short identifier-like token with no whitespace: a candidate enum value. */
export const isTokenLike = (s: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_.:\-/]{0,31}$/.test(s);

/** Looks like an opaque id (prefixed id, uuid, long hex, numeric id, node id). */
export function isIdLike(s: string): boolean {
  return (
    /^[a-z]{2,8}_[A-Za-z0-9]{3,}$/.test(s) ||
    RE_UUID.test(s) ||
    /^[0-9a-f]{12,}$/i.test(s) ||
    /^\d{3,}$/.test(s) ||
    /^[A-Z][A-Za-z]{0,3}_[A-Za-z0-9_-]{8,}$/.test(s)
  );
}

/** Keys that wrap a page of results. */
export const PAGE_ITEM_KEYS = ['items', 'data', 'results', 'nodes', 'entries', 'records', 'edges', 'values'];
export const PAGE_NEXT_KEYS = [
  'next', 'next_cursor', 'nextCursor', 'cursor', 'next_page', 'nextPage', 'next_page_token', 'nextPageToken',
  'continuation', 'next_token', 'nextToken', 'after', 'endCursor',
];
export const PAGE_TOTAL_KEYS = ['total', 'total_count', 'totalCount', 'count'];
export const PAGE_HASMORE_KEYS = ['has_more', 'hasMore', 'has_next', 'hasNextPage'];

/** Candidate discriminator fields for tagged unions. */
export const TAG_KEYS = ['type', 'kind', 'event', 'event_type', 'eventType', '__typename', '_type', 'object'];

/** Values the recorder substitutes for redacted strings start with this marker. */
export const REDACTED_PREFIX = 'redacted:';
