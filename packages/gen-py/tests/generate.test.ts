import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { generatePy } from '@typestub/gen-py';
import type { ServerSchema } from '@typestub/infer';
import { mockSchema } from '../../../tests/helpers/mock-schema.js';

let schema: ServerSchema;
let root: string;
beforeAll(async () => ({ schema, root } = await mockSchema()));

describe('generatePy', () => {
  it('emits importable Python with TypedDicts and a Protocol', () => {
    const { source } = generatePy(schema);
    const file = join(root, 'messy_mock.py');
    writeFileSync(file, source);
    // Import it and resolve the type hints of every TypedDict, so forward references are valid.
    const check = `import importlib.util, typing, sys
spec = importlib.util.spec_from_file_location("m", ${JSON.stringify(file)})
m = importlib.util.module_from_spec(spec); sys.modules["m"] = m; spec.loader.exec_module(m)
n = 0
for k, v in vars(m).items():
    if isinstance(v, type) and typing.is_typeddict(v):
        typing.get_type_hints(v); n += 1
typing.get_type_hints(m.MessyMockServer.list_customers)
print(n)`;
    const out = execFileSync('python3', ['-I', '-c', check], { encoding: 'utf8' });
    expect(Number(out.trim())).toBeGreaterThan(5);
    expect(source).toContain('class Customer(TypedDict):');
    expect(source).toMatch(/tier: Literal\["enterprise", "free", "pro"\]/);
    expect(source).toContain('NotRequired[');
    expect(source).toMatch(/async def list_customers\(self, \*, .*\) -> ListCustomersResult:/);
  });

  it('exposes per-tool return types for tool descriptions', () => {
    const { returnTypes } = generatePy(schema);
    expect(returnTypes.get_order).toContain('class Order(TypedDict):');
    expect(returnTypes.get_order).toContain('# returns: Order');
  });

  it('untyped mode returns Any', () => {
    expect(generatePy(schema, { untyped: true }).source).toContain('-> Any:');
  });

  it('prunes to a token budget and stays importable', () => {
    const { source } = generatePy(schema, { budget: 1200 });
    expect(source).toContain('· compact');
    expect(source).toMatch(/# \+\d+ less-used fields omitted/);
    expect(source).toContain('class Customer(TypedDict):');
    const file = join(root, 'messy_mock_budget.py');
    writeFileSync(file, source);
    const check = `import importlib.util, typing, sys
spec = importlib.util.spec_from_file_location("m", ${JSON.stringify(file)})
m = importlib.util.module_from_spec(spec); sys.modules["m"] = m; spec.loader.exec_module(m)
for k, v in vars(m).items():
    if isinstance(v, type) and typing.is_typeddict(v): typing.get_type_hints(v)
print("ok")`;
    expect(execFileSync('python3', ['-I', '-c', check], { encoding: 'utf8' }).trim()).toBe('ok');
  });

  it('leaves Python stubs under budget untouched', () => {
    expect(generatePy(schema, { budget: 100_000 }).source).toBe(generatePy(schema, { compact: false }).source);
  });
});
