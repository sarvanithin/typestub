const root = (await filesystem.listAllowedDirectories({})).content.split('\n').pop()!;
const files: string[] = (await filesystem.searchFiles({ path: root, pattern: '**/*' })).content.split('\n').filter(Boolean);
const sizeOf = async (p: string) => Number((await filesystem.getFileInfo({ path: p })).content.match(/size: (\d+)/)![1]);
const isFile = async (p: string) => /isFile: true/.test((await filesystem.getFileInfo({ path: p })).content);
const rel = (p: string) => p.slice(root.length + 1);
const csv = files.filter((f) => rel(f).startsWith('data/') && f.endsWith('.csv'));
submit((await Promise.all(csv.map(sizeOf))).reduce((a, b) => a + b, 0));
