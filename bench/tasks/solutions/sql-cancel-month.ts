const rows = async (query: string) => JSON.parse((await sqlite.readQuery({ query })).replace(/'/g, '"').replace(/\bNone\b/g, 'null'));
submit((await rows("SELECT substr(order_date,1,7) AS m FROM orders WHERE status='cancelled' GROUP BY m ORDER BY COUNT(*) DESC LIMIT 1"))[0].m);
