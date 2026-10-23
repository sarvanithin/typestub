const rows = async (query: string) => JSON.parse((await sqlite.readQuery({ query })).replace(/'/g, '"').replace(/\bNone\b/g, 'null'));
submit((await rows("SELECT country FROM customers GROUP BY country HAVING COUNT(*)>8 ORDER BY COUNT(*) DESC, country")).map((x: any) => x.country));
