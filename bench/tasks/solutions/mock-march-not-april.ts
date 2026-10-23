const mar = await messyMock.listOrdersAll({ placed_after: '2026-03-01', placed_before: '2026-04-01' });
const apr = await messyMock.listOrdersAll({ placed_after: '2026-04-01', placed_before: '2026-05-01' });
const n = new Map<string, number>();
for (const o of mar) n.set(o.customer_id, (n.get(o.customer_id) ?? 0) + 1);
const inApr = new Set(apr.map((o) => o.customer_id));
submit([...n].filter(([c, k]) => k > 2 && !inApr.has(c)).map(([c]) => c));
