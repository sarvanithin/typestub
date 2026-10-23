const ts = await messyMock.listTicketsAll({ state: 'open', priority: 'urgent' });
submit(ts.filter((t) => t.assignee === null).sort((a, b) => b.comment_count - a.comment_count || a.id - b.id).map((t) => t.id));
