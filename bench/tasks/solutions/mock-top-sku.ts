const n = new Map<string, number>();
for (const o of await messyMock.listOrdersAll({})) if (o.status !== 'cancelled') for (const li of o.line_items) n.set(li.sku, (n.get(li.sku) ?? 0) + li.qty);
submit([...n].sort((a, b) => b[1] - a[1])[0][0]);
