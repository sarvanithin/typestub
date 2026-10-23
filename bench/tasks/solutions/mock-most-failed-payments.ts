const ev = await messyMock.listEventsAll({ type: 'payment_failed' });
const n = new Map<string, number>();
for (const e of ev) n.set(e.customer_id, (n.get(e.customer_id) ?? 0) + 1);
const [id] = [...n].sort((a, b) => b[1] - a[1])[0];
submit((await messyMock.getCustomer({ customer_id: id })).name);
