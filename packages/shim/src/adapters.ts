import { camel, extractPayload, type ServerSchema } from '@typestub/infer';
import type { CallTool, ServerProxy } from './server.js';

/** Code-execution tool version that can call custom tools programmatically. */
export const ANTHROPIC_CODE_EXECUTION = 'code_execution_20260120';

export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  allowed_callers: string[];
}

/**
 * Anthropic programmatic tool calling: tool definitions callable from code execution, with
 * each tool's inferred return type (e.g. from the Python emitter) appended to its description.
 */
export function toAnthropicTools(schema: ServerSchema, returnTypes: Record<string, string> = {}): AnthropicToolDef[] {
  return schema.tools.map((t) => {
    const ret = returnTypes[t.tool];
    return {
      name: t.tool,
      description: [t.description ?? '', ret ? `Returns (JSON string of):\n${ret}` : ''].filter(Boolean).join('\n\n'),
      input_schema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object' },
      allowed_callers: [ANTHROPIC_CODE_EXECUTION],
    };
  });
}

/** Execute a `tool_use` block from the Messages API and build its `tool_result`, unwrapping text-JSON. */
export async function runAnthropicToolUse(
  block: { id: string; name: string; input: unknown },
  callTool: CallTool,
): Promise<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> {
  const res = await callTool(block.name, (block.input ?? {}) as Record<string, unknown>);
  const ex = extractPayload(res);
  const content = typeof ex.payload === 'string' ? ex.payload : JSON.stringify(ex.payload);
  return { type: 'tool_result', tool_use_id: block.id, content, ...(ex.isError ? { is_error: true } : {}) };
}

export interface CodemodeTool {
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Cloudflare-style code mode: a record of executable tools keyed by function name. Pair it with
 * the generated `.d.ts` as the API the sandboxed script is written against.
 */
export function toCodemodeTools(schema: ServerSchema, proxy: ServerProxy): Record<string, CodemodeTool> {
  const out: Record<string, CodemodeTool> = {};
  for (const t of schema.tools) {
    const fn = camel(t.tool);
    out[fn] = {
      description: t.description ?? '',
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object' },
      execute: (args) => proxy[fn](args),
    };
    if (proxy[`${fn}All`]) {
      out[`${fn}All`] = { description: `All pages of ${fn}`, inputSchema: out[fn].inputSchema, execute: (a) => proxy[`${fn}All`](a) };
    }
  }
  return out;
}
