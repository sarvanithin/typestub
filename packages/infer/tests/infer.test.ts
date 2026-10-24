import { describe, expect, it } from 'vitest';
import {
  applyDeclared, confidenceOf, emptyShape, extractPayload, inferTool, mergeShapes, schemaAccuracy, shapeOf, shapeToSchema,
  type JsonSchema, type Sample,
} from '@typestub/infer';

const fold = (values: unknown[]) => values.reduce<ReturnType<typeof emptyShape>>((acc, v) => mergeShapes(acc, shapeOf(v)), emptyShape());
const infer = (values: unknown[], examples = false) => shapeToSchema(fold(values), { examples });
const sample = (payload: unknown, isError = false): Sample => ({
  tool: 't',
  args: {},
  timestamp: '2026-01-01T00:00:00Z',
  response: { content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }], isError },
});

describe('core merge', () => {
  it('marks fields present in every sample as required', () => {
    const s = infer([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    expect(s.required).toEqual(['a', 'b']);
    expect(s.properties!.a.type).toBe('integer');
  });

  it('marks fields missing from some samples optional with presence rate', () => {
    const s = infer([{ a: 1, b: 'x' }, { a: 2 }, { a: 3 }, { a: 4, b: 'z' }]);
    expect(s.required).toEqual(['a']);
    expect(s.properties!.b['x-presence']).toBe(0.5);
  });

  it('tracks null separately from absent', () => {
    const s = infer([{ a: null }, { a: 'x' }, {}]);
    expect(s.required).toEqual([]);
    expect(s.properties!.a.type).toEqual(['string', 'null']);
    expect(s.properties!.a['x-nullRate']).toBe(0.5);
    expect(s.properties!.a['x-presence']).toBe(0.667);
  });

  it('widens conflicting scalar types to a union', () => {
    const s = infer([{ v: 1 }, { v: 'one' }]);
    expect(s.properties!.v.type).toEqual(['string', 'integer']);
  });

  it('widens integer to number when a float appears', () => {
    expect(infer([{ v: 1 }, { v: 1.5 }]).properties!.v.type).toBe('number');
  });

  it('merges all array elements into one item schema', () => {
    const s = infer([[{ id: 1 }, { id: 2, extra: true }]]);
    expect(s.items!.required).toEqual(['id']);
    expect(s.items!.properties!.extra['x-presence']).toBe(0.5);
  });

  it('emits unknown[] for arrays only ever seen empty', () => {
    const s = infer([{ xs: [] }, { xs: [] }]);
    expect(s.properties!.xs.items).toEqual({});
    expect(s.properties!.xs['x-emptyOnly']).toBe(true);
  });

  it('fills item type once a non-empty array appears', () => {
    const s = infer([{ xs: [] }, { xs: [1] }]);
    expect(s.properties!.xs.items!.type).toBe('integer');
  });

  it('caps depth', () => {
    let v: unknown = { leaf: 1 };
    for (let i = 0; i < 12; i++) v = { next: v };
    const s = infer([v]);
    let node: JsonSchema = s;
    let depth = 0;
    while (node.properties?.next) {
      node = node.properties.next;
      depth++;
    }
    expect(depth).toBeLessThanOrEqual(9);
    expect(node['x-truncated']).toBe(true);
  });

  it('caps fields per object', () => {
    const wide = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`field${i}x`, i]));
    const s = infer([wide]);
    expect(s.additionalProperties).toEqual({});
    expect(s['x-truncated']).toBe(true);
  });
});

describe('pattern rules', () => {
  it('detects enums with <=12 distinct token values over 20+ observations', () => {
    const vals = Array.from({ length: 24 }, (_, i) => ({ state: ['open', 'closed', 'merged'][i % 3] }));
    expect(infer(vals).properties!.state.enum).toEqual(['closed', 'merged', 'open']);
  });

  it('does not make enums from too few observations', () => {
    expect(infer([{ s: 'a' }, { s: 'b' }]).properties!.s.enum).toBeUndefined();
  });

  it('does not make enums from ids or free text', () => {
    const ids = Array.from({ length: 24 }, (_, i) => ({ id: `usr_ab${i % 3}c`, t: ['hello world', 'bye now'][i % 2] }));
    const s = infer(ids);
    expect(s.properties!.id.enum).toBeUndefined();
    expect(s.properties!.t.enum).toBeUndefined();
  });

  it('keeps null in a nullable enum', () => {
    const vals = Array.from({ length: 33 }, (_, i) => ({ c: [null, 'ups', 'dhl'][i % 3] }));
    expect(infer(vals).properties!.c.enum).toEqual(['dhl', 'ups', null]);
  });

  it('flags booleans and token strings that never varied over 20+ observations', () => {
    const vals = Array.from({ length: 24 }, (_, i) => ({ merged: false, kind: 'pr', draft: i % 2 === 0 }));
    const s = infer(vals);
    expect(s.properties!.merged['x-constant']).toEqual({ value: false, count: 24 });
    expect(s.properties!.merged.type).toBe('boolean');
    expect(s.properties!.kind['x-constant']).toEqual({ value: 'pr', count: 24 });
    expect(s.properties!.draft['x-constant']).toBeUndefined();
  });

  it('does not flag constants from too few observations', () => {
    expect(infer([{ merged: false }, { merged: false }]).properties!.merged['x-constant']).toBeUndefined();
  });

  it('detects date, uuid, url, email formats', () => {
    const s = infer([
      { d: '2026-01-02T03:04:05Z', day: '2026-01-02', u: '123e4567-e89b-42d3-a456-426614174000', w: 'https://x.io/a', e: 'a@b.co' },
    ]);
    expect(s.properties!.d.format).toBe('date-time');
    expect(s.properties!.day.format).toBe('date');
    expect(s.properties!.u.format).toBe('uuid');
    expect(s.properties!.w.format).toBe('uri');
    expect(s.properties!.e.format).toBe('email');
  });

  it('detects pagination envelopes and never enumerates the cursor', () => {
    const pages = Array.from({ length: 25 }, (_, i) => ({ items: [{ id: i }], next_cursor: i % 2 ? `c_${i % 3}` : null, total: 9 }));
    const s = infer(pages);
    expect(s['x-pagination']).toEqual({ items: 'items', next: 'next_cursor', total: 'total' });
    expect(s.properties!.next_cursor.enum).toBeUndefined();
  });

  it('detects discriminated unions with different key sets', () => {
    const events = [
      { type: 'login', ip: '1.2.3.4' },
      { type: 'purchase', amount: 5 },
      { type: 'login', ip: '5.6.7.8', device: 'ios' },
    ];
    const s = infer([events]);
    expect(s.items!['x-discriminator']).toBe('type');
    expect(s.items!.oneOf).toHaveLength(2);
    const login = s.items!.oneOf!.find((v) => v.properties!.type.const === 'login')!;
    expect(login.required).toEqual(['type', 'ip']);
    expect(login.properties!.device['x-presence']).toBe(0.5);
  });

  it('does not treat a shared-shape type field as a union', () => {
    const s = infer([[{ type: 'User', login: 'a' }, { type: 'Bot', login: 'b' }]]);
    expect(s.items!.oneOf).toBeUndefined();
  });

  it('detects map-like objects keyed by ids', () => {
    const s = infer([{ by: { cus_aaaaaaaa: { n: 1 }, cus_bbbbbbbb: { n: 2 } } }, { by: { cus_cccccccc: { n: 3 } } }]);
    expect(s.properties!.by['x-map']).toBe(true);
    expect((s.properties!.by.additionalProperties as JsonSchema).properties!.n.type).toBe('integer');
  });
});

describe('extraction', () => {
  it('parses text-wrapped JSON', () => {
    expect(extractPayload({ content: [{ type: 'text', text: '{"a":1}' }] })).toEqual({ payload: { a: 1 }, wrap: 'json-text', isError: false });
  });
  it('prefers structuredContent', () => {
    expect(extractPayload({ structuredContent: { a: 1 }, content: [{ type: 'text', text: 'x' }] }).wrap).toBe('structured');
  });
  it('keeps plain text as a string', () => {
    expect(extractPayload({ content: [{ type: 'text', text: 'hello' }] })).toEqual({ payload: 'hello', wrap: 'text', isError: false });
  });
});

describe('inferTool', () => {
  it('types error responses separately from success', () => {
    const t = inferTool({ name: 't' }, [sample({ a: 1 }), sample('not found: x', true)]);
    expect(t.output.properties!.a).toBeDefined();
    expect(t.error!.type).toBe('string');
    expect(t.errorSamples).toBe(1);
  });

  it('flags low-confidence tools with < 10 samples', () => {
    expect(inferTool({ name: 't' }, [sample({ a: 1 })]).lowConfidence).toBe(true);
  });

  it('lets declared outputSchema win and fills gaps', () => {
    const declared: JsonSchema = { type: 'object', properties: { id: { type: 'string', description: 'd' } }, required: ['id'] };
    const t = inferTool({ name: 't', outputSchema: declared }, Array.from({ length: 10 }, () => sample({ id: 1, extra: 'x' })));
    expect(t.source).toBe('declared+inferred');
    expect(t.output.properties!.id.type).toBe('string');
    expect(t.output.properties!.extra['x-inferred']).toBe(true);
    expect(t.output.required).toEqual(['id', 'extra']);
  });
});

describe('confidence', () => {
  it('is 1 for stable types and lower when types flip', () => {
    expect(confidenceOf(fold([{ a: 1 }, { a: 2 }]))).toBe(1);
    expect(confidenceOf(fold([{ a: 1 }, { a: 'x' }]))).toBeLessThan(1);
  });
});

describe('applyDeclared', () => {
  it('keeps declared types over inferred ones', () => {
    const out = applyDeclared({ type: 'object', properties: { n: { type: 'number' } } }, { type: 'object', properties: { n: { type: 'integer', 'x-presence': 1 } } });
    expect(out.properties!.n).toEqual({ type: 'number', 'x-presence': 1 });
  });
});

describe('schemaAccuracy', () => {
  it('scores identical schemas as 1 and penalises differences', () => {
    const a = infer([{ a: 1, b: 'x' }]);
    expect(schemaAccuracy(a, a).accuracy).toBe(1);
    const b = infer([{ a: 'x', b: 'x' }]);
    expect(schemaAccuracy(a, b).accuracy).toBeLessThan(1);
  });
});
