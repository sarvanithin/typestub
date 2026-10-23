"""Summarise a benchmark run: per-server metrics with 95% bootstrap CIs, C-vs-B deltas, charts.

Usage: python report/report.py <run-id>
Writes results/<run-id>/report.md, summary.json and charts.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

BENCH = Path(__file__).resolve().parent.parent
RNG = np.random.default_rng(0)
N_BOOT = 2000
COND_NAMES = {"A": "A. direct tool calling", "B": "B. untyped code mode", "C": "C. typed code mode (TypeStub)", "L": "L. typed, loaded on demand"}
CONDS = "ABCL"


def by_task(eps):
    out = defaultdict(list)
    for e in eps:
        out[e["task"]].append(e)
    return out


def metric(eps, name):
    """Metrics over a list of episodes. Tokens per completed task = all tokens spent / successes."""
    if not eps:
        return float("nan")
    if name == "success":
        return np.mean([e["success"] for e in eps])
    if name == "first_try":
        xs = [e["first_try_success"] for e in eps if e["first_try_success"] is not None]
        return np.mean(xs) if xs else float("nan")
    if name == "round_trips":
        return np.mean([e["round_trips"] for e in eps])
    if name == "tokens_per_episode":
        return np.mean([e["total_tokens"] for e in eps])
    if name == "tokens_per_completed":
        s = sum(e["success"] for e in eps)
        return sum(e["total_tokens"] for e in eps) / s if s else float("nan")
    if name == "wall_s":
        return np.mean([e["wall_s"] for e in eps])
    if name == "discovery":
        return np.mean([e["discovery_scripts"] for e in eps])
    if name == "script_errors":
        return np.mean([e["script_errors"] for e in eps])
    raise KeyError(name)


def boot(groups: dict, fn) -> tuple[float, float, float]:
    """Point estimate and 95% CI, resampling tasks (each task keeps all its repetitions)."""
    keys = list(groups)
    point = fn([e for k in keys for e in groups[k]])
    vals = []
    for _ in range(N_BOOT):
        pick = RNG.choice(len(keys), len(keys), replace=True)
        v = fn([e for i in pick for e in groups[keys[i]]])
        if not np.isnan(v):
            vals.append(v)
    if not vals:
        return point, float("nan"), float("nan")
    return point, float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def paired(groups_b: dict, groups_c: dict, fn, relative: bool) -> tuple[float, float, float]:
    """C minus B (or C/B - 1 when relative), resampling the shared task set."""
    keys = sorted(set(groups_b) & set(groups_c))

    def stat(ks):
        b = fn([e for k in ks for e in groups_b[k]])
        c = fn([e for k in ks for e in groups_c[k]])
        return (c / b - 1) if relative else (c - b)

    point = stat(keys)
    vals = []
    for _ in range(N_BOOT):
        ks = [keys[i] for i in RNG.choice(len(keys), len(keys), replace=True)]
        v = stat(ks)
        if not np.isnan(v):
            vals.append(v)
    return point, float(np.percentile(vals, 2.5)) if vals else float("nan"), float(np.percentile(vals, 97.5)) if vals else float("nan")


def fmt(t, pct=False, digits=1):
    p, lo, hi = t
    if np.isnan(p):
        return "—"
    if pct:
        return f"{p * 100:.{digits}f}% [{lo * 100:.{digits}f}, {hi * 100:.{digits}f}]"
    if p >= 100:
        return f"{p:,.0f} [{lo:,.0f}, {hi:,.0f}]"
    return f"{p:.2f} [{lo:.2f}, {hi:.2f}]"


def chart(summary, out_dir: Path, model: str):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    servers = [s for s in summary if s != "all"]
    conds = [c for c in CONDS if any(c in summary[s] for s in servers)]
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.2))
    width = 0.8 / len(conds)
    colors = {"A": "#9aa5b1", "B": "#e0a458", "C": "#3d7ea6", "L": "#6fae7a"}
    for j, c in enumerate(conds):
        xs = np.arange(len(servers)) + j * width
        vals = [summary[s].get(c, {}).get("tokens_per_completed", [np.nan] * 3) for s in servers]
        axes[0].bar(xs, [v[0] for v in vals], width, label=COND_NAMES[c], color=colors[c],
                    yerr=[[max(v[0] - v[1], 0) for v in vals], [max(v[2] - v[0], 0) for v in vals]], capsize=3)
        if c != "A":
            ft = [summary[s].get(c, {}).get("first_try", [np.nan] * 3) for s in servers]
            axes[1].bar(xs, [v[0] * 100 for v in ft], width, label=COND_NAMES[c], color=colors[c],
                        yerr=[[max(v[0] - v[1], 0) * 100 for v in ft], [max(v[2] - v[0], 0) * 100 for v in ft]], capsize=3)
    for ax, title in zip(axes, ["Tokens per completed task (lower is better)", "First-try execution success % (higher is better)"]):
        ax.set_xticks(np.arange(len(servers)) + width * (len(conds) - 1) / 2, servers)
        ax.set_title(title, fontsize=10)
        ax.spines[["top", "right"]].set_visible(False)
    axes[0].legend(fontsize=8, frameon=False)
    fig.suptitle(f"TypeStub benchmark · {model}", fontsize=11)
    fig.tight_layout()
    path = out_dir / f"chart-{model}.png"
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return path.name


METRICS = ["success", "first_try", "round_trips", "tokens_per_completed", "tokens_per_episode", "wall_s", "discovery", "script_errors"]


def main(run_id: str) -> None:
    out_dir = BENCH / "results" / run_id
    eps = [json.loads(l) for l in (out_dir / "episodes.jsonl").read_text().splitlines() if l.strip()]
    meta = json.loads((out_dir / "meta.json").read_text()) if (out_dir / "meta.json").exists() else {}
    api_errors = [e for e in eps if (e.get("error") or "").startswith("api:")]
    eps = [e for e in eps if not (e.get("error") or "").startswith("api:")]
    lines = [f"# TypeStub benchmark results: `{run_id}`", ""]
    lines.append(f"{len(eps)} episodes ({len(api_errors)} dropped for API errors). Values are point estimates with 95% bootstrap CIs over tasks.")
    lines.append("Sampling: model defaults (these models do not accept `temperature`), effort " + str(meta.get("effort", "?")) + ".")
    lines.append("")
    summary_all = {}
    for model in sorted({e["model"] for e in eps}):
        me = [e for e in eps if e["model"] == model]
        summary = {}
        for server in sorted({e["server"] for e in me}) + ["all"]:
            se = me if server == "all" else [e for e in me if e["server"] == server]
            summary[server] = {}
            for c in CONDS:
                ce = [e for e in se if e["condition"] == c]
                if ce:
                    g = by_task(ce)
                    summary[server][c] = {m: boot(g, lambda x, m=m: metric(x, m)) for m in METRICS}
            for tc in ("C", "L"):
                if "B" not in summary[server] or tc not in summary[server]:
                    continue
                gb = by_task([e for e in se if e["condition"] == "B"])
                gc = by_task([e for e in se if e["condition"] == tc])
                summary[server][f"{tc}_vs_B"] = {
                    "tokens_per_completed_rel": paired(gb, gc, lambda x: metric(x, "tokens_per_completed"), True),
                    "first_try_pts": paired(gb, gc, lambda x: metric(x, "first_try"), False),
                    "success_pts": paired(gb, gc, lambda x: metric(x, "success"), False),
                    "round_trips_diff": paired(gb, gc, lambda x: metric(x, "round_trips"), False),
                }
        summary_all[model] = summary
        lines += [f"## {model}", ""]
        lines.append("| server | condition | task success | first-try success | round trips | tokens / completed task | tokens / episode | non-submitting scripts | wall s |")
        lines.append("|---|---|---|---|---|---|---|---|---|")
        for server, conds in summary.items():
            for c in CONDS:
                if c in conds:
                    m = conds[c]
                    lines.append(f"| {server} | {c} | {fmt(m['success'], True)} | {fmt(m['first_try'], True)} | {fmt(m['round_trips'])} | "
                                 f"{fmt(m['tokens_per_completed'])} | {fmt(m['tokens_per_episode'])} | {fmt(m['discovery'])} | {fmt(m['wall_s'])} |")
        for tc, label in (("C", "Typed (C)"), ("L", "Typed on demand (L)")):
            if not any(f"{tc}_vs_B" in c for c in summary.values()):
                continue
            lines += ["", f"**{label} vs untyped (B) code mode**", "", "| server | tokens / completed task | first-try success | task success | round trips |", "|---|---|---|---|---|"]
            for server, conds in summary.items():
                d = conds.get(f"{tc}_vs_B")
                if d:
                    lines.append(f"| {server} | {fmt(d['tokens_per_completed_rel'], True)} | {fmt(d['first_try_pts'], True)} pts | "
                                 f"{fmt(d['success_pts'], True)} pts | {fmt(d['round_trips_diff'])} |")
        st = meta.get("stub_tokens", {}).get(model, {})
        if st:
            lines += ["", "**Stub overhead** (system prompt tokens, counted with the token-counting API; L also pays for `types` results inside the episode)", "",
                      "| server | untyped (B) | typed (C) | C overhead | lazy (L) | L overhead |", "|---|---|---|---|---|---|"]
            for s, v in st.items():
                lines.append(f"| {s} | {v['B']:,} | {v['C']:,} | {v['typed_overhead']:,} | {v.get('L', 0):,} | {v.get('lazy_overhead', 0):,} |")
        a = summary.get("all", {})
        if "C_vs_B" in a:
            d, c = a["C_vs_B"], a["C"]
            worst_overhead = max((v["typed_overhead"] for v in st.values()), default=float("nan"))
            crit = [
                ("Cost", "tokens per completed task, C vs B", "≤ -30%", fmt(d["tokens_per_completed_rel"], True), d["tokens_per_completed_rel"][0] <= -0.30),
                ("Reliability", "first-try execution success, C vs B", "≥ +20 pts", fmt(d["first_try_pts"], True), d["first_try_pts"][0] >= 0.20),
                ("Speed", "round trips per task (C)", "≤ 1.5", fmt(c["round_trips"]), c["round_trips"][0] <= 1.5),
                ("Quality", "task success, C vs B", "no drop", fmt(d["success_pts"], True), d["success_pts"][0] >= 0),
                ("Overhead", "typed stub tokens (worst server)", "< 1,500", f"{worst_overhead:,}", worst_overhead < 1500),
            ]
            lines += ["", "**v0 success criteria**", "", "| area | metric | target | measured | met |", "|---|---|---|---|---|"]
            lines += [f"| {a_} | {m} | {t} | {v} | {'yes' if ok else 'no'} |" for a_, m, t, v, ok in crit]
        lines += ["", f"![chart]({chart(summary, out_dir, model)})", ""]
    if api_errors:
        lines += ["## Dropped episodes", ""] + [f"- {e['model']} {e['condition']} {e['task']}: {e['error'][:160]}" for e in api_errors[:30]]
    (out_dir / "report.md").write_text("\n".join(lines) + "\n")
    (out_dir / "summary.json").write_text(json.dumps(summary_all, indent=1, default=float))
    print(out_dir / "report.md")


if __name__ == "__main__":
    main(sys.argv[1])
