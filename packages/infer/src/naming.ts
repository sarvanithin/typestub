import { PAGE_NEXT_KEYS } from './patterns.js';
import type { ToolSchema } from './types.js';

const words = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

export const pascal = (s: string) => words(s).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('') || 'X';
export const camel = (s: string) => {
  const p = pascal(s);
  const out = p[0].toLowerCase() + p.slice(1);
  return /^[0-9]/.test(out) ? `_${out}` : out;
};
export const snake = (s: string) => words(s).map((w) => w.toLowerCase()).join('_') || 'x';

export function singular(word: string): string {
  if (/ies$/i.test(word)) return word.slice(0, -3) + 'y';
  if (/(ss|us|is)$/i.test(word)) return word;
  if (/(sh|ch|x|z)es$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
}

const VERBS = new Set(['get', 'list', 'search', 'read', 'fetch', 'find', 'query', 'describe', 'show', 'view', 'lookup', 'count']);
const SINGLE_VERBS = new Set(['get', 'read', 'fetch', 'describe', 'show', 'view', 'lookup']);

/** Split a tool name into verb and noun: list_customers, get_order, issue_read. */
export function toolParts(tool: string): { verb?: string; noun?: string } {
  const w = words(tool).map((x) => x.toLowerCase());
  if (w.length < 2) return {};
  if (VERBS.has(w[0])) return { verb: w[0], noun: pascal(singular(w.slice(1).join(' '))) };
  if (VERBS.has(w[w.length - 1])) return { verb: w[w.length - 1], noun: pascal(singular(w.slice(0, -1).join(' '))) };
  return {};
}

/** Noun a tool returns: list_customers -> Customer, get_order -> Order, issue_read -> Issue. */
export function toolNoun(tool: string): string | undefined {
  return toolParts(tool).noun;
}

/** Tool returns a single item (get_x, read_x, x_read). */
export function isSingleItemTool(tool: string): boolean {
  const v = toolParts(tool).verb;
  return !!v && SINGLE_VERBS.has(v);
}

export const CURSOR_PARAMS = ['cursor', 'page_token', 'pageToken', 'after', 'next', 'next_cursor', 'nextCursor', 'continuation'];

export interface PaginationPlan {
  itemsKey: string;
  /** Key or dotted path of the next cursor in the response. */
  nextKey: string;
  /** Optional dotted path of a has-more boolean; pagination stops when it is false. */
  hasMoreKey?: string;
  cursorParam: string;
}

/** How to auto-paginate a tool, if its output is a page envelope and its input takes a cursor. */
export function paginationPlan(t: ToolSchema): PaginationPlan | undefined {
  const p = t.output['x-pagination'];
  if (!p?.next) return undefined;
  const props = t.inputSchema.properties ?? {};
  const last = p.next.split('.').pop()!;
  const cursorParam = CURSOR_PARAMS.find((c) => c in props) ?? (last in props ? last : undefined);
  if (!cursorParam || !PAGE_NEXT_KEYS.includes(last)) return undefined;
  return { itemsKey: p.items, nextKey: p.next, hasMoreKey: p.hasMore, cursorParam };
}

/** Read a dotted path from a JSON value. */
export function getPath(v: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, k) => (cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[k] : undefined), v);
}
