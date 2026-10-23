const none = new Set((await messyMock.listCustomersAll({})).filter((c) => c.email === null).map((c) => c.id));
submit([...new Set((await messyMock.listTicketsAll({})).map((t) => t.customer_id))].filter((c) => none.has(c)));
