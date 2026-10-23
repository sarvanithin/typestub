const root = (await filesystem.listAllowedDirectories({})).content.split('\n').pop()!;
const names = (await filesystem.listDirectory({ path: root + '/projects/alpha/src' })).content.split('\n').map((l) => l.replace(/^\[FILE\] /, ''));
let n = 0;
for (const f of names) n += (await filesystem.readTextFile({ path: `${root}/projects/alpha/src/${f}` })).content.split('\n').filter((l, i, a) => i < a.length - 1 || l !== '').length;
submit(n);
