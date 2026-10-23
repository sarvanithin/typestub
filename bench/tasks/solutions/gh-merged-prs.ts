const repo = { owner: 'atom', repo: 'teletype' };
let merged = 0;
for (let page = 1; ; page++) {
  const prs = await github.listPullRequests({ ...repo, state: 'closed', perPage: 100, page });
  merged += prs.filter((p) => p.merged_at).length;
  if (prs.length < 100) break;
}
submit(merged);
