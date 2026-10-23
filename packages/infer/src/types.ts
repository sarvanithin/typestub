/** JSON Schema 2020-12 node plus TypeStub's `x-` extensions. */
export interface JsonSchema {
  $schema?: string;
  type?: JsonType | JsonType[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: JsonSchema | boolean;
  items?: JsonSchema;
  enum?: Array<string | number | boolean | null>;
  const?: string | number | boolean | null;
  format?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  oneOf?: JsonSchema[];
  /** Reference to an ancestor carrying the matching `x-id` (recursive structures). */
  $ref?: string;
  anyOf?: JsonSchema[];
  description?: string;
  /** Fraction of parent objects in which this field was present (0-1). */
  'x-presence'?: number;
  /** Fraction of observations of this field that were null (0-1). */
  'x-nullRate'?: number;
  'x-examples'?: unknown[];
  /** Array only ever observed empty: item type unknown. */
  'x-emptyOnly'?: true;
  /** Object treated as an id-keyed map (Record<string, T>). */
  'x-map'?: true;
  /** Tag field for a discriminated union in `oneOf`. */
  'x-discriminator'?: string;
  /** Pagination envelope detected on this object. */
  'x-pagination'?: PaginationInfo;
  /** Field added by inference on top of a server-declared schema. */
  'x-inferred'?: true;
  /** Value arrives as a string of serialized JSON; this schema describes the parsed value. */
  'x-jsonString'?: true;
  /** Target id for `$ref`s inside this node (recursive structures). */
  'x-id'?: string;
  /** Subtree truncated by depth or field-count caps. */
  'x-truncated'?: true;
  /** Fields dropped by the stub generator's token budget (still present at runtime). */
  'x-pruned'?: number;
  [key: `x-${string}`]: unknown;
}

export type JsonType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

export interface PaginationInfo {
  /** Key holding the page's items. */
  items: string;
  /** Key (or dotted path, e.g. `pageInfo.endCursor`) holding the next cursor, if any. */
  next?: string;
  /** Key holding a total count, if any. */
  total?: string;
  /** Key or dotted path holding a has-more boolean, if any. */
  hasMore?: string;
}

/** How a tool's result payload is carried inside the MCP CallToolResult. */
export type WrapMode = 'structured' | 'json-text' | 'json-text-multi' | 'text' | 'content';

/** A recorded tool call, as stored in `<tool>.jsonl`. */
export interface Sample {
  tool: string;
  args: Record<string, unknown>;
  response: McpToolResult;
  server_version?: string;
  timestamp: string;
  source?: 'probe' | 'passive' | 'drift';
}

/** Minimal structural type for an MCP CallToolResult. */
export interface McpToolResult {
  content?: Array<{ type: string; text?: string; [k: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
  [k: string]: unknown;
}

/** Tool metadata from `tools/list`. */
export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  annotations?: Record<string, unknown>;
}

export interface ToolSchema {
  tool: string;
  description?: string;
  inputSchema: JsonSchema;
  /** Schema of the unwrapped success payload. */
  output: JsonSchema;
  /** Schema of the unwrapped error payload, when error samples exist. */
  error?: JsonSchema;
  wrap: WrapMode;
  samples: number;
  errorSamples: number;
  /** Share of fields whose type never changed, weighted by presence (0-1). */
  confidence: number;
  lowConfidence: boolean;
  source: 'inferred' | 'declared' | 'declared+inferred' | 'none';
  /**
   * When a required enum argument (e.g. `method`) selects differently shaped results, one
   * output schema per observed value. `output` remains the merge of all of them.
   */
  variants?: ToolVariant[];
}

export interface ToolVariant {
  arg: string;
  value: string;
  output: JsonSchema;
  samples: number;
}

export interface ServerSchema {
  server: string;
  serverVersion?: string;
  generatedAt: string;
  /** Stable hash of all tool schemas, stamped into generated stubs. */
  schemaHash: string;
  tools: ToolSchema[];
}
