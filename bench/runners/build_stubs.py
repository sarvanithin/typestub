"""Record each server from its probe pool and infer schemas with the TypeStub CLI.

Usage: python runners/build_stubs.py [server ...]
"""
import subprocess
import sys
import time

from common import BENCH, REPO, STATE, WORK, expand, launch, server_env, servers


def main(names: list[str]) -> None:
    cfgs = servers()
    WORK.mkdir(exist_ok=True)
    for name in names or list(cfgs):
        cfg = cfgs[name]
        cmd = ["node", str(REPO / "packages/cli/dist/bin.js"), "--root", str(STATE), "init", name, "--out", str(WORK / "stubs")]
        if cfg.get("probe_config"):
            rendered = WORK / f"{name}.probe.yaml"
            rendered.write_text(expand((BENCH / "servers" / cfg["probe_config"]).read_text()))
            cmd += ["--config", str(rendered)]
        cmd += ["--", *launch(cfg, probe=True)]
        started = time.time()
        subprocess.run(cmd, check=True, env=server_env(cfg))
        print(f"{name}: stubs built in {time.time() - started:.1f}s", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:])
