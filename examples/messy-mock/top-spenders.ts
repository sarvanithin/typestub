// Which pro-tier customers spent the most on shipped orders in March 2026?
import { closeAll, messyMock } from './stubs/index.js';

const customers = await messyMock.listCustomersAll({ tier: 'pro' });
const orders = await messyMock.listOrdersAll({
  status: 'shipped',
  placed_after: '2026-03-01T00:00:00Z',
  placed_before: '2026-04-01T00:00:00Z',
});

const spend = new Map<string, number>();
for (const o of orders) spend.set(o.customer_id, (spend.get(o.customer_id) ?? 0) + o.total_cents);

const top = customers
  .map((c) => ({ name: c.name, city: c.address?.city ?? 'unknown', spend: spend.get(c.id) ?? 0 }))
  .filter((c) => c.spend > 0)
  .sort((a, b) => b.spend - a.spend)
  .slice(0, 3);

console.log(top);
await closeAll();
