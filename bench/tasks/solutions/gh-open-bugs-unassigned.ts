const repo = { owner: 'atom', repo: 'teletype' };
const xs = await github.listIssuesAll({ ...repo, state: 'OPEN', labels: ['bug'], perPage: 100 });
submit(xs.filter((i) => i.assignees.length === 0).sort((a, b) => (b.comments ?? 0) - (a.comments ?? 0) || a.number - b.number).map((i) => i.number));
