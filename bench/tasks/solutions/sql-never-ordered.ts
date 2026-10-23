const rows = async (query: string) => JSON.parse((await sqlite.readQuery({ query })).replace(/'/g, '"').replace(/\bNone\b/g, 'null'));
submit((await rows("SELECT name FROM products WHERE id NOT IN (SELECT product_id FROM order_items)")).map((x: any) => x.name));
