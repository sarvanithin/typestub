import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { generateTs } from '@typestub/gen-ts';
import { inferServer, type Sample, type ToolInfo } from '@typestub/infer';

const sample = (tool: string, args: Record<string, unknown>, payload: unknown): Sample => ({
  tool, args, timestamp: 't', response: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
});

describe('generated stubs for recursive and overloaded tools', () => {
  it('type-check and use overloads per selecting argument', () => {
    const tools: ToolInfo[] = [
      { name: 'issue_read', inputSchema: { type: 'object', properties: { method: { type: 'string', enum: ['get', 'get_comments', 'get_labels'] }, n: { type: 'number' } }, required: ['method', 'n'] } },
      { name: 'directory_tree', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    ];
    const tree = [{ name: 'a', type: 'directory', children: [{ name: 'b', type: 'file' }, { name: 'c', type: 'directory', children: [] }] }, { name: 'd', type: 'file' }];
    const samples = new Map([
      ['issue_read', [sample('issue_read', { method: 'get', n: 1 }, { number: 1, title: 't' }), sample('issue_read', { method: 'get_comments', n: 1 }, [{ id: 2, body: 'x' }])]],
      ['directory_tree', [sample('directory_tree', { path: '/' }, tree)]],
    ]);
    const { dts } = generateTs(inferServer('gh', tools, samples));
    expect(dts).toMatch(/issueRead\(args: IssueReadArgs & \{ method: "get" \}\): Promise<Issue>;/);
    expect(dts).toMatch(/issueRead\(args: IssueReadArgs & \{ method: "get_comments" \}\): Promise<IssueComment\[\]>;/);
    expect(dts).toContain('issueRead(args: IssueReadArgs): Promise<unknown>;');
    const usage = `import { gh } from './stub.js';\nconst i = await gh.issueRead({ method: 'get', n: 1 });\nconst t: string = i.title;\nconst cs = await gh.issueRead({ method: 'get_comments', n: 1 });\nconst b: string = cs[0].body;\nconst tr = await gh.directoryTree({ path: '/' });\nfor (const e of tr) if (e.type === 'directory') for (const c of e.children) console.log(c.name, t, b);\n`;
    const dir = mkdtempSync(join(tmpdir(), 'ts-'));
    writeFileSync(join(dir, 'stub.d.ts'), dts);
    writeFileSync(join(dir, 'use.mts'), usage);
    const program = ts.createProgram([join(dir, 'use.mts')], {
      strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [], lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    });
    expect(ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
  });
});
