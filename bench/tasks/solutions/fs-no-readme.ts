const root = (await filesystem.listAllowedDirectories({})).content.split('\n').pop()!;
const tree = await filesystem.directoryTree({ path: root + '/projects' });
submit(tree.content.filter((d) => d.type === 'directory' && !d.children.some((c) => c.name === 'README.md')).map((d) => d.name));
