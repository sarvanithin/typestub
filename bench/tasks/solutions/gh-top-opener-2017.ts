const repo = { owner: 'atom', repo: 'teletype' };
const xs = await github.listIssuesAll({ ...repo, perPage: 100 });
const n = new Map<string, number>();
for (const i of xs) if (i.created_at.startsWith('2017')) n.set(i.user.login, (n.get(i.user.login) ?? 0) + 1);
submit([...n].sort((a, b) => b[1] - a[1])[0][0]);
