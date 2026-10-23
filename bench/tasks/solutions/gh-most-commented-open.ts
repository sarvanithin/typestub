const repo = { owner: 'atom', repo: 'teletype' };
const xs = await github.listIssues({ ...repo, state: 'OPEN', orderBy: 'COMMENTS', direction: 'DESC', perPage: 1 });
submit(xs.issues[0].number);
