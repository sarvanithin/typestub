"""Shared config loading for the benchmark scripts."""
import os
import subprocess
from pathlib import Path

import yaml

BENCH = Path(__file__).resolve().parent.parent
REPO = BENCH.parent
STATE = BENCH / ".typestub"
WORK = BENCH / ".work"


def expand(v: str) -> str:
    return v.replace("{bench}", str(BENCH)).replace("{home}", str(Path.home()))


def servers() -> dict:
    return yaml.safe_load((BENCH / "servers" / "servers.yaml").read_text())


def server_env(cfg: dict) -> dict:
    """Environment for a server process; secrets are fetched at runtime, never stored."""
    env = dict(os.environ)
    for k, cmd in (cfg.get("env_cmd") or {}).items():
        env[k] = subprocess.run(cmd, check=True, capture_output=True, text=True).stdout.strip()
    return env


def launch(cfg: dict, probe: bool = False) -> list[str]:
    args = cfg.get("probe_args") if probe and cfg.get("probe_args") else cfg["args"]
    return [expand(cfg["command"]), *[expand(a) for a in args]]


def load_tasks(server: str | None = None) -> list[dict]:
    out = []
    for f in sorted((BENCH / "tasks").glob("*.yaml")):
        for t in yaml.safe_load(f.read_text()):
            if server is None or t["server"] == server:
                out.append(t)
    return out
