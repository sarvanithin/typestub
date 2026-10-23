const rows = async (query: string) => JSON.parse((await sqlite.readQuery({ query })).replace(/'/g, '"').replace(/\bNone\b/g, 'null'));
submit(Math.round((await rows("SELECT SUM(o.total) AS t FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.country='DE' AND o.status='delivered'"))[0].t * 100) / 100);
