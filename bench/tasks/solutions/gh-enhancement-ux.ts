const repo = { owner: 'atom', repo: 'teletype' };
const xs = await github.listIssuesAll({ ...repo, state: 'OPEN', labels: ['enhancement'], perPage: 100 });
submit(xs.filter((i) => (i.labels ?? []).includes('ux')).length);
