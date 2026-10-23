const out: Record<string, number> = {};
for (const o of await messyMock.listOrdersAll({})) out[o.currency] = (out[o.currency] ?? 0) + (o.coupon ? 1 : 0);
submit(out);
