import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateTs } from '@typestub/gen-ts';
import type { ServerSchema } from '@typestub/infer';
import { mockSchema } from '../../../tests/helpers/mock-schema.js';

let schema: ServerSchema;
let root: string;
beforeAll(async () => ({ schema, root } = await mockSchema()));

function compiles(source: string, dir: string): string[] {
  const file = join(dir, 'stub.d.ts');
  writeFileSync(file, source);
  const program = ts.createProgram([file], { strict: true, noEmit: true, skipLibCheck: false, types: [] });
  return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('generateTs', () => {
  it('emits a .d.ts that type-checks', () => {
    const { dts } = generateTs(schema);
    if (process.env.PRINT_STUB) console.log(dts);
    expect(compiles(dts, root)).toEqual([]);
  });

  it('names types after tool nouns and uses literal unions, branded formats, Record maps and unions', () => {
    const { dts } = generateTs(schema);
    expect(dts).toContain('export interface Customer {');
    expect(dts).toMatch(/tier: "enterprise" \| "free" \| "pro";/);
    expect(dts).toContain('export type IsoDateTime = string;');
    expect(dts).toMatch(/by_customer: Record<string, \w+>;/);
    expect(dts).toMatch(/export type Event =\n {2}\| /);
    expect(dts).toContain('listCustomersAll(');
    expect(dts).toMatch(/present in \d+%/);
    expect(dts).toContain('schema ' + schema.schemaHash);
  });

  it('untyped mode keeps inputs but hides outputs', () => {
    const { dts } = generateTs(schema, { untyped: true });
    expect(dts).toContain('listCustomers(args?: ListCustomersArgs): Promise<unknown>;');
    expect(dts).not.toContain('interface Customer ');
    expect(compiles(dts, root)).toEqual([]);
  });

  it('writes a compact index', () => {
    const { index } = generateTs(schema);
    expect(index.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(schema.tools.length);
  });
});
