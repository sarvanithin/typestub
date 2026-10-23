const repo = { owner: 'atom', repo: 'teletype' };
const n = 365;
const files = await github.pullRequestRead({ ...repo, method: 'get_files', pullNumber: n, perPage: 100 });
submit(files.map((f) => f.filename));
