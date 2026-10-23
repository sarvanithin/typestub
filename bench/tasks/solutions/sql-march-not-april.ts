const rows = async (query: string) => JSON.parse((await sqlite.readQuery({ query })).replace(/'/g, '"').replace(/\bNone\b/g, 'null'));
const r = await rows("SELECT c.name FROM customers c WHERE (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id AND o.order_date LIKE '2026-03-%') > 2 AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id=c.id AND o.order_date LIKE '2026-04-%')");
submit(r.map((x: any) => x.name));
