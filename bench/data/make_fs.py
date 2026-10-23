"""Deterministic file tree served by the filesystem MCP server in the benchmark."""
import json
import random
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent / "fs-fixture"
PROJECTS = ["alpha", "bravo", "charlie", "delta", "echo"]
DEPS = ["lodash", "express", "react", "zod", "chalk", "commander"]


def lines(rng: random.Random, n: int, prefix: str) -> str:
    return "".join(f"{prefix} line {i} {rng.random():.6f}\n" for i in range(n))


def build(root: Path = ROOT, seed: int = 7) -> Path:
    rng = random.Random(seed)
    if root.exists():
        shutil.rmtree(root)
    for i, name in enumerate(PROJECTS):
        p = root / "projects" / name
        (p / "src").mkdir(parents=True)
        (p / "logs").mkdir()
        if name != "delta":
            (p / "README.md").write_text(f"# {name}\n\n" + lines(rng, rng.randint(3, 12), "readme"))
        if i % 2 == 0:
            deps = {d: f"^{rng.randint(1, 9)}.0.0" for d in rng.sample(DEPS, 3)}
            (p / "package.json").write_text(json.dumps({"name": name, "version": f"1.{i}.0", "dependencies": deps}, indent=2))
            for k in range(rng.randint(2, 4)):
                (p / "src" / f"mod{k}.ts").write_text(lines(rng, rng.randint(5, 40), "// ts"))
        else:
            (p / "pyproject.toml").write_text(f'[project]\nname = "{name}"\nversion = "0.{i}.0"\n')
            for k in range(rng.randint(2, 5)):
                (p / "src" / f"mod{k}.py").write_text(lines(rng, rng.randint(5, 40), "# py"))
        for k in range(rng.randint(1, 3)):
            (p / "logs" / f"run-{k}.log").write_text(lines(rng, rng.randint(20, 400), "log"))
    (root / "projects" / "bravo" / "logs" / "archive").mkdir()
    (root / "projects" / "bravo" / "logs" / "archive" / "old.log").write_text(lines(rng, 900, "old"))
    cfg = root / "configs"
    cfg.mkdir()
    for k, env in enumerate(["dev", "staging", "prod", "test", "local"]):
        (cfg / f"{env}.json").write_text(json.dumps({"env": env, "debug": env in ("dev", "local"), "replicas": k + 1}, indent=2))
    data = root / "data"
    data.mkdir()
    for k in range(6):
        rows = "".join(f"{j},{rng.randint(1, 999)},{rng.choice(['a', 'b', 'c'])}\n" for j in range(rng.randint(10, 300)))
        (data / f"table{k}.csv").write_text("id,value,kind\n" + rows)
    (data / "notes.txt").write_text(lines(rng, 15, "note"))
    return root


if __name__ == "__main__":
    print(build(Path(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else build())
