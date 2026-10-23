const repo = { owner: 'atom', repo: 'teletype' };
const rs = await github.listReleases({ ...repo, perPage: 100 });
submit(rs.sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, 3).map((r) => r.tag_name));
