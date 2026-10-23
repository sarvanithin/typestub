const ev = await messyMock.listEventsAll({ type: 'refund_issued' });
submit(ev.reduce((s, e) => s + (e.type === 'refund_issued' && e.partial ? e.amount_cents : 0), 0));
