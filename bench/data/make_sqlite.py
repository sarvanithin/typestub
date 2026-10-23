"""Deterministic shop database served by the SQLite MCP server in the benchmark."""
import random
import sqlite3
import sys
from datetime import date, timedelta
from pathlib import Path

DB = Path(__file__).parent / "shop.db"
COUNTRIES = ["US", "DE", "FR", "IN", "GB", "BR"]
CATEGORIES = ["garden", "kitchen", "toys", "books", "outdoor"]
FIRST = ["Ana", "Ben", "Chloe", "Dev", "Eli", "Fatima", "Gus", "Hana", "Ivan", "Jade", "Kofi", "Lena", "Milo", "Nia", "Omar"]
LAST = ["Smith", "Garcia", "Muller", "Rossi", "Khan", "Silva", "Kim", "Novak"]


def build(path: Path = DB, seed: int = 11) -> Path:
    rng = random.Random(seed)
    if path.exists():
        path.unlink()
    con = sqlite3.connect(path)
    con.executescript(
        """
        CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT, country TEXT NOT NULL, signup_date TEXT NOT NULL);
        CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price REAL NOT NULL);
        CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), order_date TEXT NOT NULL,
                             status TEXT NOT NULL CHECK (status IN ('pending','shipped','delivered','cancelled')), total REAL NOT NULL);
        CREATE TABLE order_items (order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id),
                                  qty INTEGER NOT NULL, unit_price REAL NOT NULL);
        """
    )
    names = set()
    for cid in range(1, 61):
        while True:
            n = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            if n not in names:
                names.add(n)
                break
        email = None if rng.random() < 0.1 else f"{n.lower().replace(' ', '.')}@example.org"
        con.execute("INSERT INTO customers VALUES (?,?,?,?,?)", (cid, n, email, rng.choice(COUNTRIES), str(date(2025, 1, 1) + timedelta(days=rng.randint(0, 400)))))
    for pid in range(1, 31):
        cat = CATEGORIES[pid % len(CATEGORIES)]
        con.execute("INSERT INTO products VALUES (?,?,?,?)", (pid, f"{cat}-item-{pid}", cat, round(rng.uniform(3, 120), 2)))
    prices = dict(con.execute("SELECT id, price FROM products"))
    oid = 0
    for cid in range(1, 61):
        for _ in range(rng.randint(0, 9)):
            oid += 1
            d = date(2026, 1, 1) + timedelta(days=rng.randint(0, 150))
            status = rng.choice(["pending", "shipped", "delivered", "delivered", "cancelled"])
            items = []
            for pid in rng.sample(range(1, 30), rng.randint(1, 4)):  # product 30 is never ordered
                items.append((oid, pid, rng.randint(1, 3), prices[pid]))
            total = round(sum(q * p for _, _, q, p in items), 2)
            con.execute("INSERT INTO orders VALUES (?,?,?,?,?)", (oid, cid, str(d), status, total))
            con.executemany("INSERT INTO order_items VALUES (?,?,?,?)", items)
    con.commit()
    con.close()
    return path


if __name__ == "__main__":
    print(build(Path(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else build())
