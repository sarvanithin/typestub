const repo = { owner: 'atom', repo: 'teletype' };
const cs = await github.listCommits({ ...repo, perPage: 10 });
const n = new Map<string, number>();
for (const c of cs) if (c.author) n.set(c.author.login, (n.get(c.author.login) ?? 0) + 1);
submit([...n].sort((a, b) => b[1] - a[1])[0][0]);
