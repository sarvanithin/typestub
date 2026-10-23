const root = (await filesystem.listAllowedDirectories({})).content.split('\n').pop()!;
const files: string[] = (await filesystem.searchFiles({ path: root, pattern: '**/*' })).content.split('\n').filter(Boolean);
const sizeOf = async (p: string) => Number((await filesystem.getFileInfo({ path: p })).content.match(/size: (\d+)/)![1]);
const isFile = async (p: string) => /isFile: true/.test((await filesystem.getFileInfo({ path: p })).content);
const rel = (p: string) => p.slice(root.length + 1);
const sized: Array<[string, number]> = [];
for (const f of files) if (await isFile(f)) sized.push([rel(f), await sizeOf(f)]);
submit(sized.sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]));
