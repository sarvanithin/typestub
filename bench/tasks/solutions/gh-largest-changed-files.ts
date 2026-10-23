const repo = { owner: 'atom', repo: 'teletype' };
const cs = await github.listCommits({ ...repo, perPage: 10 });
const n = new Map<string, number>();
for (const c of cs) for (const f of (await github.getCommit({ ...repo, sha: c.sha })).files) n.set(f.filename, (n.get(f.filename) ?? 0) + (f.additions ?? 0) + (f.deletions ?? 0));
submit([...n].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]));
