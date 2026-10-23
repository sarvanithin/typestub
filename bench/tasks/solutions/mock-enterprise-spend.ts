const ent = new Set((await messyMock.listCustomersAll({ tier: 'enterprise' })).map((c) => c.id));
let sum = 0;
for (const status of ['paid', 'shipped'] as const) for (const o of await messyMock.listOrdersAll({ status })) if (ent.has(o.customer_id)) sum += o.total_cents;
submit(sum);
