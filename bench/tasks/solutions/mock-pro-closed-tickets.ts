const pro = new Set((await messyMock.listCustomersAll({ tier: 'pro' })).map((c) => c.id));
submit((await messyMock.listTicketsAll({ state: 'closed' })).filter((t) => pro.has(t.customer_id)).map((t) => t.id).sort((a, b) => a - b));
