const root = (await filesystem.listAllowedDirectories({})).content.split('\n').pop()!;
const names = (await filesystem.listDirectory({ path: root + '/configs' })).content.split('\n').map((l) => l.replace(/^\[FILE\] /, ''));
const out: string[] = [];
for (const n of names) if (JSON.parse((await filesystem.readTextFile({ path: `${root}/configs/${n}` })).content).debug === true) out.push(n);
submit(out);
