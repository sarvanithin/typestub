const rows = async (query: string) => JSON.parse((await sqlite.readQuery({ query })).replace(/'/g, '"').replace(/\bNone\b/g, 'null'));
submit((await rows("SELECT COUNT(DISTINCT i.order_id) AS n FROM order_items i JOIN products p ON p.id=i.product_id WHERE p.category='garden'"))[0].n);
