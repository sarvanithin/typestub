const repo = { owner: 'atom', repo: 'teletype' };
submit((await github.listIssuesAll({ ...repo, state: 'CLOSED', labels: ['duplicate'], perPage: 100 })).length);
