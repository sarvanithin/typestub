const de = new Set((await messyMock.listCustomersAll({})).filter((c) => c.address?.country === 'DE').map((c) => c.id));
submit([...new Set((await messyMock.listOrdersAll({ status: 'refunded' })).map((o) => o.customer_id))].filter((c) => de.has(c)));
