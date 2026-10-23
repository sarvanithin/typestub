const rows = async (query: string) => JSON.parse((await sqlite.readQuery({ query })).replace(/'/g, '"').replace(/\bNone\b/g, 'null'));
submit((await rows("SELECT c.name FROM customers c JOIN orders o ON o.customer_id=c.id GROUP BY c.id HAVING COUNT(*)>=3 ORDER BY AVG(o.total) DESC LIMIT 1"))[0].name);
