import { describe, expect, it } from 'vitest';
import {
  argVariants, decodeEmbedded, emptyShape, inferServer, mergeShapes, paginationPlan, refIndex, shapeOf, shapeToSchema,
  type JsonSchema, type Sample,
} from '@typestub/infer';

const infer = (values: unknown[]) => shapeToSchema(values.reduce<ReturnType<typeof emptyShape>>((a, v) => mergeShapes(a, shapeOf(v)), emptyShape()), { examples: false });
const sample = (args: Record<string, unknown>, payload: unknown): Sample => ({
  tool: 't', args, timestamp: 't', response: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
});

describe('patterns seen on real servers', () => {
  it('types JSON carried inside a string field and decodes it at runtime', () => {
    const s = infer([{ content: JSON.stringify([{ name: 'a', type: 'file' }]) }]);
    expect(s.properties!.content['x-jsonString']).toBe(true);
    expect(s.properties!.content.type).toBe('array');
    expect(decodeEmbedded(s, { content: '[{"name":"b","type":"file"}]' })).toEqual({ content: [{ name: 'b', type: 'file' }] });
  });

  it('folds recursive trees into a self-reference', () => {
    const tree = [{ name: 'src', type: 'directory', children: [{ name: 'lib', type: 'directory', children: [{ name: 'a.ts', type: 'file' }] }, { name: 'b.ts', type: 'file' }] }, { name: 'README', type: 'file' }];
    const s = infer([tree, tree]);
    const dir = s.items!.oneOf!.find((v) => v.properties!.type.const === 'directory')!;
    expect(dir.properties!.children.items!.$ref).toBe(`#${s.items!['x-id']}`);
    expect(refIndex(s).get(s.items!['x-id']!)).toBe(s.items);
  });

  it('detects GraphQL-style nested cursors', () => {
    const pages = Array.from({ length: 3 }, (_, i) => ({ issues: [{ number: i }], totalCount: 3, pageInfo: { hasNextPage: i < 2, endCursor: `c${i}` } }));
    const s = infer(pages);
    expect(s['x-pagination']).toEqual({ items: 'issues', next: 'pageInfo.endCursor', hasMore: 'pageInfo.hasNextPage', total: 'totalCount' });
    const plan = paginationPlan({ tool: 'list_issues', inputSchema: { type: 'object', properties: { after: { type: 'string' } } }, output: s } as never);
    expect(plan).toEqual({ itemsKey: 'issues', nextKey: 'pageInfo.endCursor', hasMoreKey: 'pageInfo.hasNextPage', cursorParam: 'after' });
  });

  it('splits outputs by a selecting enum argument', () => {
    const info = { name: 't', inputSchema: { type: 'object', properties: { method: { type: 'string', enum: ['get', 'get_comments'] } }, required: ['method'] } as JsonSchema };
    const samples = [sample({ method: 'get' }, { number: 1, title: 'x' }), sample({ method: 'get_comments' }, [{ id: 1, body: 'b' }])];
    const v = argVariants(info, samples)!;
    expect(v.map((x) => x.value)).toEqual(['get', 'get_comments']);
    expect(v[1].output.type).toBe('array');
    expect(inferServer('s', [info], new Map([['t', samples]])).tools[0].variants).toHaveLength(2);
  });
});
