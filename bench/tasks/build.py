"""Build bench/tasks/<server>.yaml: prompts plus ground truth computed from the frozen data.

Every truth function asserts its answer is unambiguous (no ties) so checkers can be exact.
"""
import json
import sqlite3
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

import yaml

BENCH = Path(__file__).resolve().parent.parent
REPO = BENCH.parent
DATA = BENCH / "data"
TASKS: dict[str, list[dict]] = defaultdict(list)


def task(server: str, tid: str, prompt: str, check: str, answer_format: str, **extra):
    def deco(fn):
        TASKS[server].append({"id": tid, "server": server, "prompt": prompt, "answer_format": answer_format, "check": check, "_fn": fn, **extra})
        return fn
    return deco


def unique_max(counter: dict, what: str):
    items = sorted(counter.items(), key=lambda kv: -kv[1])
    assert len(items) == 1 or items[0][1] != items[1][1], f"tie for {what}: {items[:3]}"
    return items[0][0]


# --- messy-mock ---------------------------------------------------------------------------

def mock_data():
    out = subprocess.run(["node", str(REPO / "servers/messy-mock/dist/bin.js"), "export"], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


M = "messy-mock"


@task(M, "mock-urgent-unassigned", "List the ids of open tickets with priority urgent that have no assignee, sorted by comment_count descending, then id ascending.", "list", "JSON array of ticket ids (numbers)")
def _(d):
    ts = [t for t in d["tickets"] if t["state"] == "open" and t["priority"] == "urgent" and t["assignee"] is None]
    return [t["id"] for t in sorted(ts, key=lambda t: (-t["comment_count"], t["id"]))]


@task(M, "mock-march-not-april", "Which customers placed more than 2 orders in March 2026 but no orders in April 2026? (Any order status counts.)", "set", "JSON array of customer ids")
def _(d):
    mar, apr = Counter(), Counter()
    for o in d["orders"]:
        if o["placed_at"].startswith("2026-03"):
            mar[o["customer_id"]] += 1
        if o["placed_at"].startswith("2026-04"):
            apr[o["customer_id"]] += 1
    return sorted(c for c, n in mar.items() if n > 2 and apr[c] == 0)


@task(M, "mock-enterprise-spend", "What is the total of total_cents across paid or shipped orders placed by enterprise-tier customers?", "number", "a single integer (cents)")
def _(d):
    ent = {c["id"] for c in d["customers"] if c["tier"] == "enterprise"}
    return sum(o["total_cents"] for o in d["orders"] if o["customer_id"] in ent and o["status"] in ("paid", "shipped"))


@task(M, "mock-coupons-by-currency", "For each currency, how many orders used a coupon? Include every currency that appears on any order (use 0 when none used a coupon).", "exact", 'JSON object mapping currency code to count, e.g. {"USD": 3}')
def _(d):
    out = {o["currency"]: 0 for o in d["orders"]}
    for o in d["orders"]:
        if o.get("coupon"):
            out[o["currency"]] += 1
    return out


@task(M, "mock-most-failed-payments", "Which customer has the most payment_failed events? Return the customer's name.", "string", "the customer's name as a string")
def _(d):
    c = Counter(e["customer_id"] for e in d["events"] if e["type"] == "payment_failed")
    cid = unique_max(c, "failed payments")
    return next(x["name"] for x in d["customers"] if x["id"] == cid)


@task(M, "mock-de-refunded", "Which customers with an address in Germany (country DE) have at least one refunded order?", "set", "JSON array of customer ids")
def _(d):
    de = {c["id"] for c in d["customers"] if (c.get("address") or {}).get("country") == "DE"}
    return sorted({o["customer_id"] for o in d["orders"] if o["status"] == "refunded" and o["customer_id"] in de})


@task(M, "mock-dhl-line-items", "Among shipped orders whose shipping carrier is dhl, what is the average number of line items per order? Round to 2 decimals.", "number", "a number rounded to 2 decimals")
def _(d):
    os_ = [o for o in d["orders"] if o["status"] == "shipped" and (o["shipping"] or {}).get("carrier") == "dhl"]
    return round(sum(len(o["line_items"]) for o in os_) / len(os_), 2)


@task(M, "mock-top-sku", "Which SKU has the highest total quantity across all orders that are not cancelled?", "string", "the SKU as a string")
def _(d):
    c = Counter()
    for o in d["orders"]:
        if o["status"] != "cancelled":
            for li in o["line_items"]:
                c[li["sku"]] += li["qty"]
    return unique_max(c, "sku")


@task(M, "mock-ios-logins", "How many login events came from an iOS device whose app_version starts with \"4.5\"?", "number", "a single integer")
def _(d):
    return sum(1 for e in d["events"] if e["type"] == "login" and (e.get("device") or {}).get("os") == "ios" and str((e.get("device") or {}).get("app_version", "")).startswith("4.5"))


@task(M, "mock-pro-closed-tickets", "List the ids of closed tickets that belong to pro-tier customers, sorted ascending.", "list", "JSON array of ticket ids (numbers)")
def _(d):
    pro = {c["id"] for c in d["customers"] if c["tier"] == "pro"}
    return sorted(t["id"] for t in d["tickets"] if t["state"] == "closed" and t["customer_id"] in pro)


@task(M, "mock-partial-refunds", "What is the sum of amount_cents over refund_issued events where the refund was partial?", "number", "a single integer (cents)")
def _(d):
    return sum(e["amount_cents"] for e in d["events"] if e["type"] == "refund_issued" and e["partial"])


@task(M, "mock-no-email-with-ticket", "Which customers have no email address on file (email is null) and have at least one support ticket?", "set", "JSON array of customer ids")
def _(d):
    none = {c["id"] for c in d["customers"] if c["email"] is None}
    return sorted({t["customer_id"] for t in d["tickets"] if t["customer_id"] in none})


@task(M, "mock-top-shipped-spender", "Using per-customer order statistics restricted to shipped orders, which customer has the highest spend? Return the customer's id and name.", "exact", 'JSON object {"id": ..., "name": ...}')
def _(d):
    spend = Counter()
    for o in d["orders"]:
        if o["status"] == "shipped":
            spend[o["customer_id"]] += o["total_cents"]
    cid = unique_max(spend, "shipped spend")
    return {"id": cid, "name": next(c["name"] for c in d["customers"] if c["id"] == cid)}


@task(M, "mock-shipping-no-tracking", "How many orders have shipping information but no tracking number?", "number", "a single integer")
def _(d):
    return sum(1 for o in d["orders"] if o["shipping"] is not None and not o["shipping"].get("tracking_number"))


# --- filesystem ---------------------------------------------------------------------------

F = "filesystem"


def fs_files(root):
    return sorted(p for p in root.rglob("*") if p.is_file())


@task(F, "fs-largest-log", "Which .log file is the largest (in bytes) anywhere under projects/? Return its path relative to the root directory you are allowed to access.", "path", 'a relative path such as "projects/x/logs/y.log"')
def _(root):
    logs = {str(p.relative_to(root)): p.stat().st_size for p in fs_files(root) if p.suffix == ".log"}
    return unique_max(logs, "largest log")


@task(F, "fs-count-py", "How many .py files are there in the whole tree?", "number", "a single integer")
def _(root):
    return sum(1 for p in fs_files(root) if p.suffix == ".py")


@task(F, "fs-lodash-projects", "Which projects (directory names directly under projects/) have a package.json that declares a dependency on lodash?", "set", "JSON array of project directory names")
def _(root):
    out = []
    for pj in (root / "projects").glob("*/package.json"):
        if "lodash" in json.loads(pj.read_text()).get("dependencies", {}):
            out.append(pj.parent.name)
    return sorted(out)


@task(F, "fs-csv-bytes", "What is the total size in bytes of all .csv files under data/?", "number", "a single integer (bytes)")
def _(root):
    return sum(p.stat().st_size for p in (root / "data").glob("*.csv"))


@task(F, "fs-debug-configs", "Which config files in configs/ have debug set to true?", "set", 'JSON array of file names such as ["x.json"]')
def _(root):
    return sorted(p.name for p in (root / "configs").glob("*.json") if json.loads(p.read_text())["debug"] is True)


@task(F, "fs-three-largest", "List the three largest files in the whole tree, largest first, as paths relative to the root directory.", "list", "JSON array of three relative paths")
def _(root):
    files = sorted(fs_files(root), key=lambda p: -p.stat().st_size)
    sizes = [p.stat().st_size for p in files[:4]]
    assert len(set(sizes)) == 4, "tie among largest files"
    return [str(p.relative_to(root)) for p in files[:3]]


@task(F, "fs-no-readme", "Which project directories under projects/ have no README.md?", "set", "JSON array of project directory names")
def _(root):
    return sorted(p.name for p in (root / "projects").iterdir() if p.is_dir() and not (p / "README.md").exists())


@task(F, "fs-alpha-src-lines", "How many lines in total are in the files under projects/alpha/src?", "number", "a single integer")
def _(root):
    return sum(len(p.read_text().splitlines()) for p in (root / "projects/alpha/src").glob("*"))


# --- sqlite -------------------------------------------------------------------------------

S = "sqlite"


def q(con, sql, *a):
    return con.execute(sql, a).fetchall()


@task(S, "sql-march-not-april", "Which customers ordered more than twice in March 2026 but not at all in April 2026? (Any status counts.)", "set", "JSON array of customer names")
def _(con):
    rows = q(con, """SELECT c.name FROM customers c WHERE
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id AND o.order_date LIKE '2026-03-%') > 2 AND
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id AND o.order_date LIKE '2026-04-%') = 0""")
    return sorted(r[0] for r in rows)


@task(S, "sql-top-categories", "What are the top 3 product categories by revenue (qty * unit_price) from non-cancelled orders placed in Q1 2026 (January to March)? Largest first.", "list", "JSON array of three category names")
def _(con):
    rows = q(con, """SELECT p.category, SUM(i.qty*i.unit_price) r FROM order_items i JOIN orders o ON o.id=i.order_id JOIN products p ON p.id=i.product_id
        WHERE o.status != 'cancelled' AND o.order_date BETWEEN '2026-01-01' AND '2026-03-31' GROUP BY 1 ORDER BY 2 DESC""")
    assert rows[2][1] != rows[3][1]
    return [r[0] for r in rows[:3]]


@task(S, "sql-best-avg-order", "Among customers with at least 3 orders, who has the highest average order total? Return the name.", "string", "the customer's name")
def _(con):
    rows = q(con, "SELECT c.name, AVG(o.total) a FROM customers c JOIN orders o ON o.customer_id=c.id GROUP BY c.id HAVING COUNT(*)>=3 ORDER BY a DESC LIMIT 2")
    assert rows[0][1] != rows[1][1]
    return rows[0][0]


@task(S, "sql-garden-orders", "How many orders contain at least one product from the garden category?", "number", "a single integer")
def _(con):
    return q(con, "SELECT COUNT(DISTINCT i.order_id) FROM order_items i JOIN products p ON p.id=i.product_id WHERE p.category='garden'")[0][0]


@task(S, "sql-countries", "Which countries have more than 8 customers? Sort by customer count descending, then country code ascending.", "list", "JSON array of country codes")
def _(con):
    return [r[0] for r in q(con, "SELECT country FROM customers GROUP BY country HAVING COUNT(*)>8 ORDER BY COUNT(*) DESC, country")]


@task(S, "sql-never-ordered", "Which products have never been ordered? Return their names.", "set", "JSON array of product names")
def _(con):
    return sorted(r[0] for r in q(con, "SELECT name FROM products WHERE id NOT IN (SELECT product_id FROM order_items)"))


@task(S, "sql-cancel-month", "Which month had the most cancelled orders?", "string", 'month as "YYYY-MM"')
def _(con):
    rows = q(con, "SELECT substr(order_date,1,7) m, COUNT(*) n FROM orders WHERE status='cancelled' GROUP BY m ORDER BY n DESC")
    assert rows[0][1] != rows[1][1]
    return rows[0][0]


@task(S, "sql-de-delivered", "What is the total revenue (sum of order totals) from delivered orders placed by customers in Germany (DE)? Round to 2 decimals.", "number", "a number rounded to 2 decimals")
def _(con):
    return round(q(con, "SELECT SUM(o.total) FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.country='DE' AND o.status='delivered'")[0][0], 2)


# --- github -------------------------------------------------------------------------------

G = "github"
GH = "The repository is atom/teletype on GitHub. "


@task(G, "gh-open-bugs-unassigned", GH + "List open issues (not pull requests) labeled bug that have no assignee, sorted by comment count descending, then issue number ascending.", "list", "JSON array of issue numbers")
def _(s):
    xs = [i for i in s["issues"] if not i["is_pr"] and i["state"] == "open" and "bug" in i["labels"] and not i["assignees"]]
    return [i["number"] for i in sorted(xs, key=lambda i: (-i["comments"], i["number"]))]


@task(G, "gh-duplicates", GH + "How many closed issues (not pull requests) carry the duplicate label?", "number", "a single integer")
def _(s):
    return sum(1 for i in s["issues"] if not i["is_pr"] and i["state"] == "closed" and "duplicate" in i["labels"])


@task(G, "gh-recent-releases", GH + "What are the tag names of the 3 most recently published releases, newest first?", "list", "JSON array of three tag names")
def _(s):
    rs = sorted(s["releases"], key=lambda r: r["published_at"], reverse=True)
    return [r["tag_name"] for r in rs[:3]]


@task(G, "gh-most-commented-open", GH + "Which open issue (not a pull request) has the most comments? Return its number.", "number", "a single integer (issue number)")
def _(s):
    return unique_max({i["number"]: i["comments"] for i in s["issues"] if not i["is_pr"] and i["state"] == "open"}, "comments")


@task(G, "gh-recent-commit-author", GH + "Among the 10 most recent commits on the default branch, which GitHub user (login) authored the most?", "string", "a GitHub login")
def _(s):
    return unique_max(Counter(c["author"] for c in s["commits"][:10]), "commit author")


@task(G, "gh-merged-prs", GH + "How many pull requests have been merged in total?", "number", "a single integer")
def _(s):
    return sum(1 for p in s["pulls"] if p["merged_at"])


@task(G, "gh-pr-files", None, "set", "JSON array of file paths")
def _(s):
    return sorted(s["pr_files"][chosen_pr(s)])


@task(G, "gh-enhancement-ux", GH + "How many open issues (not pull requests) have both the enhancement and the ux labels?", "number", "a single integer")
def _(s):
    return sum(1 for i in s["issues"] if not i["is_pr"] and i["state"] == "open" and {"enhancement", "ux"} <= set(i["labels"]))


@task(G, "gh-top-opener-2017", GH + "Which user opened the most issues (not pull requests) during 2017? Return the login.", "string", "a GitHub login")
def _(s):
    return unique_max(Counter(i["user"] for i in s["issues"] if not i["is_pr"] and i["created_at"].startswith("2017")), "2017 opener")


@task(G, "gh-largest-changed-files", GH + "Across the 10 most recent commits on the default branch, find the three files with the largest total changes (additions + deletions summed over those commits). Largest first.", "list", "JSON array of three file paths")
def _(s):
    c = Counter()
    for cm in s["commits"][:10]:
        for f in cm["files"]:
            c[f["filename"]] += f["additions"] + f["deletions"]
    top = c.most_common(4)
    assert len(top) < 4 or top[2][1] != top[3][1], f"tie {top}"
    return [f for f, _ in top[:3]]


def chosen_pr(s) -> str:
    """The most recent merged PR (among those snapshotted) that touched 4-30 files."""
    return max((n for n, fs in s["pr_files"].items() if 4 <= len(fs) <= 30), key=int)


def main() -> None:
    sys.path.insert(0, str(DATA))
    from make_fs import build as build_fs  # noqa: E402
    from make_sqlite import build as build_db  # noqa: E402

    inputs = {
        M: mock_data(),
        F: build_fs(),
        S: sqlite3.connect(build_db()),
        G: json.loads((DATA / "github-teletype.json").read_text()),
    }
    snap = inputs[G]
    pr = chosen_pr(snap)
    for t in TASKS[G]:
        if t["id"] == "gh-pr-files":
            t["prompt"] = GH + f"Which files did pull request #{pr} change? Return their paths."
    total = 0
    for server, tasks in TASKS.items():
        rows = []
        for t in tasks:
            expected = t.pop("_fn")(inputs[server])
            rows.append({**t, "expected": expected})
        (BENCH / "tasks" / f"{server}.yaml").write_text(yaml.safe_dump(rows, sort_keys=False, allow_unicode=True, width=120))
        total += len(rows)
        print(f"{server}: {len(rows)} tasks")
    print(f"total {total}")


if __name__ == "__main__":
    main()
