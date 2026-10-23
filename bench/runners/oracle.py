"""Run the reference solutions in tasks/solutions/ through the bridge and check them.

Proves every task is solvable through the MCP server and that ground truth matches what the
live server returns. Usage: python runners/oracle.py [server ...]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "checkers"))
from check import check  # noqa: E402
from common import BENCH, load_tasks  # noqa: E402
from harness import Bridge  # noqa: E402


def main(names: list[str]) -> int:
    tasks = [t for t in load_tasks() if not names or t["server"] in names]
    bridges: dict[str, Bridge] = {}
    failed = 0
    for t in tasks:
        sol = BENCH / "tasks" / "solutions" / f"{t['id']}.ts"
        if not sol.exists():
            print(f"MISSING {t['id']}")
            failed += 1
            continue
        b = bridges.get(t["server"]) or bridges.setdefault(t["server"], Bridge(t["server"]))
        r = b.request("exec", code=sol.read_text(), timeoutMs=180000)
        ok = r["submitted"] and check(t["check"], t["expected"], r.get("answer"))[0]
        failed += 0 if ok else 1
        detail = "" if ok else f" got={r.get('answer')!r} expected={t['expected']!r} err={r['error']} out={r['stdout'][:300]!r}"
        print(f"{'ok  ' if ok else 'FAIL'} {t['id']} calls={r['toolCalls']} {r['ms']}ms{detail}")
    for b in bridges.values():
        b.close()
    print(f"{len(tasks) - failed}/{len(tasks)} reference solutions pass")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
