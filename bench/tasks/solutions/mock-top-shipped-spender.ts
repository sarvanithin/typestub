const stats = await messyMock.getCustomerStats({ status: 'shipped' });
const [id] = Object.entries(stats.by_customer).sort((a, b) => b[1].spend_cents - a[1].spend_cents)[0];
submit({ id, name: (await messyMock.getCustomer({ customer_id: id })).name });
