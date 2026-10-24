"""Run benchmark episodes: direct tool calling (A), untyped code mode (B), typed code mode (C).

Usage:
  python runners/harness.py --run-id smoke --models claude-haiku-5-5 --conditions A,B,C --reps 1 --tasks 'mock-*'
"""
import argparse
import fnmatch
import json
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import anthropic

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "checkers"))
from check import check  # noqa: E402
from common import BENCH, STATE, launch, load_tasks, server_env, servers  # noqa: E402
from pricing import episode_cost  # noqa: E402

OUTPUT_CAP = 30000
MAX_TURNS = {"A": 16, "B": 8, "C": 8, "L": 8}

DIRECT_SYSTEM = """You answer questions about data using the provided tools.
When you know the answer, call `submit_answer` with exactly the final answer in the requested format, and nothing
else: the value is graded as-is. The task ends when you do."""

CODE_SYSTEM = """You answer questions about data by writing TypeScript that runs in a sandbox with one API object.
Run code with the `execute` tool. Inside a script:
- `{ident}` is a global object; every method is async and calls the real service.
- End the script with `return answer` (or call `submit(answer)`), where the answer is exactly the final value in the
  requested format and nothing else: it is graded as-is, and the task ends when a script returns a value or submits.
- A script that returns nothing gives you back its console.log output (truncated after {cap} characters) and any error,
  and you can run another script. Use that only when you must look at data before you can compute the answer.
- Top-level await works. No imports, and no network or filesystem access besides `{ident}`.
Prefer one script that fetches, computes and returns the answer. Printing an answer you have already computed and then
returning it in a second script wastes a round trip: return it directly.

API of `{ident}`:
```ts
{stubs}
```"""

SUBMIT_TOOL = {
    "name": "submit_answer",
    "description": "Submit the final answer. The task ends when this is called.",
    "input_schema": {"type": "object", "properties": {"answer": {"description": "The final answer, in the requested format"}}, "required": ["answer"]},
}
TYPES_TOOL = {
    "name": "types",
    "description": "Return the full TypeScript result types (with field docs) for the listed API functions.",
    "input_schema": {"type": "object", "properties": {"functions": {"type": "array", "items": {"type": "string"}, "description": "Function names, e.g. [\"listIssues\"]"}}, "required": ["functions"]},
}
LAZY_NOTE = """
Result types are not shown above. Index of return types:
{index}
Call the `types` tool with the functions you plan to use to get their full result types before writing the script."""
EXECUTE_TOOL = {
    "name": "execute",
    "description": "Run a TypeScript script in the sandbox and return its console output, error, and whether it submitted.",
    "input_schema": {"type": "object", "properties": {"code": {"type": "string", "description": "TypeScript source"}}, "required": ["code"]},
}


class Bridge:
    """A Node bridge process connected to one MCP server."""

    def __init__(self, server: str):
        cfg = servers()[server]
        cmd = launch(cfg)
        self.proc = subprocess.Popen(
            ["node", str(BENCH / "runners" / "bridge.mjs")], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1,
            cwd=BENCH,
        )
        self.next_id = 0
        self.info = self.request(
            "init", identifier=cfg["identifier"], command=cmd[0], args=cmd[1:], tools=cfg.get("tools"), env=_secret_env(cfg),
            schemaPath=str(STATE / server / "schema.json"), outputCap=OUTPUT_CAP, budget=cfg.get("stub_budget"),
        )

    def request(self, op: str, **kw):
        self.next_id += 1
        self.proc.stdin.write(json.dumps({"id": self.next_id, "op": op, **kw}) + "\n")
        self.proc.stdin.flush()
        reply = json.loads(self.proc.stdout.readline())
        if not reply.get("ok"):
            raise RuntimeError(f"bridge {op} failed: {reply.get('error')}")
        return reply

    def close(self):
        try:
            self.request("close")
            self.proc.wait(timeout=10)
        except Exception:
            self.proc.kill()


def _secret_env(cfg: dict) -> dict:
    env = server_env(cfg)
    return {k: env[k] for k in (cfg.get("env_cmd") or {})}


def usage_of(resp) -> dict:
    u = resp.usage
    return {
        "input": u.input_tokens or 0,
        "output": u.output_tokens or 0,
        "cache_read": getattr(u, "cache_read_input_tokens", 0) or 0,
        "cache_write": getattr(u, "cache_creation_input_tokens", 0) or 0,
    }


def format_exec(r: dict) -> str:
    parts = []
    if r.get("stdout"):
        parts.append(f"stdout:\n{r['stdout']}")
    if r.get("error"):
        parts.append(f"error: {r['error']}")
    if not parts:
        parts.append("(no output; the script returned nothing)")
    return "\n".join(parts)


def system_prompt(cond: str, bridge: Bridge, ident: str) -> str:
    if cond == "A":
        return DIRECT_SYSTEM
    stubs = bridge.info["stubs"]["typed" if cond == "C" else "untyped"]
    prompt = CODE_SYSTEM.format(ident=ident, cap=OUTPUT_CAP, stubs=stubs.strip())
    if cond == "L":
        index = "\n".join(l for l in bridge.info["stubs"]["index"].splitlines() if l.startswith("- "))
        prompt += LAZY_NOTE.format(index=index)
    return prompt


def run_episode(client, model: str, effort: str, task: dict, cond: str, bridge: Bridge, ident: str) -> dict:
    system = system_prompt(cond, bridge, ident)
    tools = [*bridge.info["tools"], SUBMIT_TOOL] if cond == "A" else [EXECUTE_TOOL, TYPES_TOOL] if cond == "L" else [EXECUTE_TOOL]
    messages = [{"role": "user", "content": f"{task['prompt']}\n\nAnswer format: {task['answer_format']}."}]
    usage = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0}
    scripts, tool_calls, stops, types_calls = [], 0, [], 0
    answer, submitted, error = None, False, None
    started = time.time()
    turns = 0
    for turns in range(1, MAX_TURNS[cond] + 1):
        try:
            resp = client.messages.create(
                model=model, max_tokens=16000, system=system, tools=tools, messages=messages,
                output_config={"effort": effort}, cache_control={"type": "ephemeral"},
            )
        except anthropic.APIError as e:
            error = f"api: {type(e).__name__}: {e}"
            break
        for k, v in usage_of(resp).items():
            usage[k] += v
        stops.append(resp.stop_reason)
        messages.append({"role": "assistant", "content": resp.content})
        if resp.stop_reason == "refusal":
            error = "refusal"
            break
        uses = [b for b in resp.content if b.type == "tool_use"]
        if not uses:
            messages.append({"role": "user", "content": "Use a tool to finish: " + ("call submit_answer." if cond == "A" else "run a script that returns the answer.")})
            continue
        results = []
        for tu in uses:
            if cond == "A" and tu.name == "submit_answer":
                answer, submitted = tu.input.get("answer"), True
                results.append({"type": "tool_result", "tool_use_id": tu.id, "content": "submitted"})
            elif cond == "A":
                tool_calls += 1
                r = bridge.request("call", name=tu.name, args=tu.input)
                results.append({"type": "tool_result", "tool_use_id": tu.id, "content": r["text"] or "(empty)", **({"is_error": True} if r["isError"] else {})})
            elif cond == "L" and tu.name == "types":
                types_calls += 1
                r = bridge.request("types", functions=tu.input.get("functions", []))
                results.append({"type": "tool_result", "tool_use_id": tu.id, "content": r["text"]})
            elif tu.name == "execute":
                code = tu.input.get("code", "")
                r = bridge.request("exec", code=code, timeoutMs=90000)
                tool_calls += r["toolCalls"]
                scripts.append({"code": code, "error": r["error"], "submitted": r["submitted"], "tool_calls": r["toolCalls"],
                                "stdout_chars": len(r["stdout"]), "ms": r["ms"], "answer": r.get("answer")})
                if r["submitted"]:
                    answer, submitted = r.get("answer"), True
                    results.append({"type": "tool_result", "tool_use_id": tu.id, "content": "submitted"})
                else:
                    results.append({"type": "tool_result", "tool_use_id": tu.id, "content": format_exec(r), **({"is_error": True} if r["error"] else {})})
            else:
                results.append({"type": "tool_result", "tool_use_id": tu.id, "content": f"unknown tool {tu.name}", "is_error": True})
        if submitted:
            break
        messages.append({"role": "user", "content": results})
    passed = False
    if submitted:
        passed, _ = check(task["check"], task["expected"], answer)
    first = scripts[0] if scripts else None
    first_ok = None
    if cond != "A":
        first_ok = bool(first and first["error"] is None and first["submitted"] and check(task["check"], task["expected"], first["answer"])[0])
    return {
        "task": task["id"], "server": task["server"], "condition": cond, "model": model, "effort": effort,
        "success": passed, "submitted": submitted, "answer": answer, "expected": task["expected"],
        "first_try_success": first_ok, "round_trips": turns, "usage": usage,
        "total_tokens": sum(usage.values()), "wall_s": round(time.time() - started, 2), "tool_calls": tool_calls,
        "scripts": scripts, "script_errors": sum(1 for s in scripts if s["error"]),
        "discovery_scripts": sum(1 for s in scripts if not s["error"] and not s["submitted"]),
        "types_calls": types_calls, "stop_reasons": stops, "error": error,
    }


def stub_token_counts(client, model: str, bridges: dict) -> dict:
    out = {}
    for server, b in bridges.items():
        ident = servers()[server]["identifier"]
        counts = {}
        for cond in ("B", "C", "L"):
            r = client.messages.count_tokens(model=model, system=system_prompt(cond, b, ident), messages=[{"role": "user", "content": "x"}])
            counts[cond] = r.input_tokens
        counts["typed_overhead"] = counts["C"] - counts["B"]
        counts["lazy_overhead"] = counts["L"] - counts["B"]
        out[server] = counts
    return out


def load_dotenv() -> None:
    """Read KEY=VALUE lines from bench/.env (gitignored) without overriding the environment."""
    path = BENCH / ".env"
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main() -> None:
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--models", default="claude-haiku-5-5")
    ap.add_argument("--effort", default="medium")
    ap.add_argument("--conditions", default="A,B,C")
    ap.add_argument("--reps", type=int, default=1)
    ap.add_argument("--tasks", default="*", help="comma-separated glob patterns over task ids")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--max-cost", type=float, default=None, help="stop starting episodes once this many USD are spent")
    args = ap.parse_args()
    if args.max_cost is not None and args.max_cost <= 0:
        ap.error("--max-cost must be positive")

    pats = args.tasks.split(",")
    tasks = [t for t in load_tasks() if any(fnmatch.fnmatch(t["id"], p) for p in pats)]
    conds = args.conditions.split(",")
    models = args.models.split(",")
    out_dir = BENCH / "results" / args.run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "episodes.jsonl"
    done = set()
    if out_file.exists():
        for line in out_file.read_text().splitlines():
            e = json.loads(line)
            if not (e.get("error") or "").startswith("api:"):
                done.add((e["model"], e["task"], e["condition"], e["rep"]))
    # Rep-major order: a run stopped by --max-cost still covers every task and condition evenly.
    jobs = [(m, t, c, r) for r in range(args.reps) for m in models for t in tasks for c in conds if (m, t["id"], c, r) not in done]
    print(f"{len(jobs)} episodes to run ({len(done)} already done) -> {out_file}", file=sys.stderr)

    client = anthropic.Anthropic(max_retries=6)
    local = threading.local()
    lock = threading.Lock()
    all_bridges: list[Bridge] = []

    def bridge_for(server: str) -> Bridge:
        cache = getattr(local, "bridges", None)
        if cache is None:
            cache = local.bridges = {}
        if server not in cache:
            cache[server] = Bridge(server)
            with lock:
                all_bridges.append(cache[server])
        return cache[server]

    meta_path = out_dir / "meta.json"
    if not meta_path.exists():
        used = sorted({t["server"] for t in tasks})
        probe = {s: Bridge(s) for s in used}
        meta = {"models": models, "effort": args.effort, "conditions": conds, "reps": args.reps, "tasks": [t["id"] for t in tasks],
                "schema_hashes": {s: b.info["schemaHash"] for s, b in probe.items()},
                "stub_tokens": {m: stub_token_counts(client, m, probe) for m in models},
                "notes": "Sampling uses model defaults: temperature is not accepted by these models."}
        for b in probe.values():
            b.close()
        meta_path.write_text(json.dumps(meta, indent=2))

    spend = {"usd": 0.0, "max_ep": 0.0}

    def work(job):
        model, task, cond, rep = job
        if args.max_cost is not None:
            with lock:
                # Leave room for the episodes already in flight.
                if spend["usd"] + spend["max_ep"] * args.workers >= args.max_cost:
                    return None
        b = bridge_for(task["server"])
        ep = run_episode(client, model, args.effort, task, cond, b, servers()[task["server"]]["identifier"])
        ep["rep"] = rep
        with lock:
            cost = episode_cost(model, ep["usage"])
            spend["usd"] += cost
            spend["max_ep"] = max(spend["max_ep"], cost)
            with out_file.open("a") as f:
                f.write(json.dumps(ep, default=str) + "\n")
        return ep

    n = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for fut in as_completed([pool.submit(work, j) for j in jobs]):
            ep = fut.result()
            if ep is None:
                continue
            n += 1
            mark = "ok " if ep["success"] else "BAD"
            print(f"[{n}/{len(jobs)}] {mark} {ep['model']} {ep['condition']} {ep['task']} rt={ep['round_trips']} tok={ep['total_tokens']}"
                  f"{' err=' + ep['error'] if ep['error'] else ''}", file=sys.stderr)
    print(f"spent ${spend['usd']:.2f} on {n} episodes", file=sys.stderr)
    for b in all_bridges:
        b.close()


if __name__ == "__main__":
    main()
