import { createHash } from 'node:crypto';
import { confidenceOf, LOW_CONFIDENCE_SAMPLES } from './confidence.js';
import { applyDeclared } from './declared.js';
import { extractPayload } from './extract.js';
import { emptyShape, mergeShapes, shapeOf, type Shape } from './shape.js';
import { collectGlobalEnums, shapeToSchema } from './to-schema.js';
import type { JsonSchema, Sample, ServerSchema, ToolInfo, ToolSchema, ToolVariant, WrapMode } from './types.js';

export interface InferOptions {
  /** Include an example value per field (default true). */
  examples?: boolean;
  globalEnums?: Map<string, string[]>;
}

function majority<T>(xs: T[], fallback: T): T {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best = fallback;
  let n = 0;
  for (const [x, c] of counts) if (c > n) [best, n] = [x, c];
  return best;
}

export interface Folded {
  ok: Shape;
  err: Shape;
  wraps: WrapMode[];
  okCount: number;
  errCount: number;
}

/** Merge every sample's unwrapped payload into success and error shapes. */
export function foldSamples(samples: Sample[]): Folded {
  const f: Folded = { ok: emptyShape(), err: emptyShape(), wraps: [], okCount: 0, errCount: 0 };
  for (const s of samples) {
    const ex = extractPayload(s.response);
    if (ex.isError) {
      mergeShapes(f.err, shapeOf(ex.payload));
      f.errCount++;
    } else {
      mergeShapes(f.ok, shapeOf(ex.payload));
      f.wraps.push(ex.wrap);
      f.okCount++;
    }
  }
  return f;
}

/** Fold all samples of one tool into a ToolSchema. */
export function inferTool(info: ToolInfo, samples: Sample[] | Folded, opts: InferOptions = {}): ToolSchema {
  const { ok, err, wraps, okCount, errCount } = Array.isArray(samples) ? foldSamples(samples) : samples;
  const declared = info.outputSchema;
  let output: JsonSchema;
  let source: ToolSchema['source'];
  if (okCount > 0) {
    const inferred = shapeToSchema(ok, opts);
    output = declared ? applyDeclared(declared, inferred) : inferred;
    source = declared ? 'declared+inferred' : 'inferred';
  } else if (declared) {
    output = structuredClone(declared);
    source = 'declared';
  } else {
    output = {};
    source = 'none';
  }
  const result: ToolSchema = {
    tool: info.name,
    description: info.description,
    inputSchema: info.inputSchema ?? { type: 'object' },
    output,
    wrap: declared && okCount === 0 ? 'structured' : majority(wraps, 'json-text'),
    samples: okCount,
    errorSamples: errCount,
    confidence: okCount > 0 ? confidenceOf(ok) : declared ? 1 : 0,
    lowConfidence: !declared && okCount < LOW_CONFIDENCE_SAMPLES,
    source,
  };
  if (errCount > 0) result.error = shapeToSchema(err, opts);
  return result;
}

/** Stable JSON stringify (sorted keys) for hashing. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export function hashSchemas(tools: ToolSchema[]): string {
  const material = tools.map((t) => ({ tool: t.tool, output: t.output, error: t.error, input: t.inputSchema, wrap: t.wrap, variants: t.variants }));
  return createHash('sha256').update(stableStringify(material)).digest('hex').slice(0, 16);
}

export function inferServer(
  server: string,
  tools: ToolInfo[],
  samplesByTool: Map<string, Sample[]>,
  opts: InferOptions & { serverVersion?: string } = {},
): ServerSchema {
  const folded = tools.map((t) => foldSamples(samplesByTool.get(t.name) ?? []));
  const globalEnums = collectGlobalEnums(folded.map((f) => f.ok));
  const schemas = tools.map((t, i) => {
    const schema = inferTool(t, folded[i], { ...opts, globalEnums });
    const variants = argVariants(t, samplesByTool.get(t.name) ?? [], { ...opts, globalEnums });
    if (variants) schema.variants = variants;
    return schema;
  });
  return {
    server,
    serverVersion: opts.serverVersion,
    generatedAt: new Date().toISOString(),
    schemaHash: hashSchemas(schemas),
    tools: schemas,
  };
}

const STRUCTURE_IGNORED = new Set(['x-presence', 'x-nullRate', 'x-examples', 'description']);

/** Schema identity ignoring per-sample annotations. */
export function structuralKey(s: JsonSchema): string {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).filter(([k]) => !STRUCTURE_IGNORED.has(k)).map(([k, x]) => [k, strip(x)]));
    }
    return v;
  };
  return stableStringify(strip(s));
}

/**
 * Split a tool's output by a required enum argument when different values return different
 * shapes (e.g. GitHub's issue_read with method=get vs method=get_comments).
 */
export function argVariants(info: ToolInfo, samples: Sample[], opts: InferOptions = {}): ToolVariant[] | undefined {
  const props = info.inputSchema?.properties ?? {};
  const required = info.inputSchema?.required ?? [];
  for (const arg of required) {
    const p = props[arg];
    if (!p?.enum || p.enum.length < 2 || p.enum.length > 12) continue;
    const groups = new Map<string, Sample[]>();
    for (const s of samples) {
      const v = s.args?.[arg];
      if (typeof v === 'string') groups.set(v, [...(groups.get(v) ?? []), s]);
    }
    const variants: ToolVariant[] = [];
    for (const [value, group] of groups) {
      const f = foldSamples(group);
      if (f.okCount === 0) continue;
      variants.push({ arg, value, output: shapeToSchema(f.ok, opts), samples: f.okCount });
    }
    if (variants.length >= 2 && new Set(variants.map((v) => structuralKey(v.output))).size > 1) {
      return variants.sort((a, b) => a.value.localeCompare(b.value));
    }
  }
  return undefined;
}
