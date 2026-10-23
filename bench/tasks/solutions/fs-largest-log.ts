const root = (await filesystem.listAllowedDirectories({})).content.split('\n').pop()!;
const files: string[] = (await filesystem.searchFiles({ path: root, pattern: '**/*' })).content.split('\n').filter(Boolean);
const sizeOf = async (p: string) => Number((await filesystem.getFileInfo({ path: p })).content.match(/size: (\d+)/)![1]);
const isFile = async (p: string) => /isFile: true/.test((await filesystem.getFileInfo({ path: p })).content);
const rel = (p: string) => p.slice(root.length + 1);
const logs = files.filter((f) => f.endsWith('.log') && rel(f).startsWith('projects/'));
const sized = await Promise.all(logs.map(async (f) => [f, await sizeOf(f)] as const));
submit(rel(sized.sort((a, b) => b[1] - a[1])[0][0]));
