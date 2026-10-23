const root = (await filesystem.listAllowedDirectories({})).content.split('\n').pop()!;
const out: string[] = [];
for (const p of ['alpha', 'bravo', 'charlie', 'delta', 'echo']) {
  try {
    const pj = JSON.parse((await filesystem.readTextFile({ path: `${root}/projects/${p}/package.json` })).content);
    if (pj.dependencies?.lodash) out.push(p);
  } catch {}
}
submit(out);
