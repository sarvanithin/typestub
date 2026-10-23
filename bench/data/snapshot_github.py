"""Freeze the parts of atom/teletype (an archived repo) that benchmark ground truth needs."""
import json
import subprocess
import sys
from pathlib import Path

REPO = "atom/teletype"
OUT = Path(__file__).parent / "github-teletype.json"


def api(path: str, paginate: bool = False):
    args = ["gh", "api", "-H", "Accept: application/vnd.github+json", path]
    if paginate:
        args[2:2] = ["--paginate", "--slurp"]
    out = json.loads(subprocess.run(args, check=True, capture_output=True, text=True).stdout)
    return [x for page in out for x in page] if paginate else out


def main() -> None:
    issues = api(f"repos/{REPO}/issues?state=all&per_page=100", paginate=True)
    pulls = api(f"repos/{REPO}/pulls?state=all&per_page=100", paginate=True)
    releases = api(f"repos/{REPO}/releases?per_page=100", paginate=True)
    commits = api(f"repos/{REPO}/commits?per_page=30")
    detailed = [api(f"repos/{REPO}/commits/{c['sha']}") for c in commits[:10]]
    snap = {
        "repo": REPO,
        "issues": [
            {
                "number": i["number"], "title": i["title"], "state": i["state"], "is_pr": "pull_request" in i,
                "labels": [l["name"] for l in i["labels"]], "assignees": [a["login"] for a in i["assignees"]],
                "comments": i["comments"], "user": i["user"]["login"], "created_at": i["created_at"],
                "closed_at": i["closed_at"], "state_reason": i.get("state_reason"),
            }
            for i in issues
        ],
        "pulls": [
            {"number": p["number"], "state": p["state"], "draft": p.get("draft", False), "merged_at": p["merged_at"],
             "user": p["user"]["login"], "base": p["base"]["ref"], "head": p["head"]["ref"]}
            for p in pulls
        ],
        "releases": [{"tag_name": r["tag_name"], "published_at": r["published_at"], "prerelease": r["prerelease"], "name": r["name"]} for r in releases],
        "commits": [
            {"sha": c["sha"], "author": (c.get("author") or {}).get("login"), "date": c["commit"]["author"]["date"],
             "files": [{"filename": f["filename"], "additions": f["additions"], "deletions": f["deletions"], "changes": f["changes"]} for f in d.get("files", [])] if j < 10 else None}
            for j, (c, d) in enumerate(zip(commits, detailed + [{}] * len(commits)))
        ],
    }
    pr_files = {}
    for n in sorted({p["number"] for p in snap["pulls"] if p["merged_at"]}, reverse=True)[:12]:
        pr_files[str(n)] = [f["filename"] for f in api(f"repos/{REPO}/pulls/{n}/files?per_page=100", paginate=True)]
    snap["pr_files"] = pr_files
    OUT.write_text(json.dumps(snap, indent=1))
    print(OUT, len(snap["issues"]), "issues", len(snap["pulls"]), "pulls", len(snap["releases"]), "releases")


if __name__ == "__main__":
    main() if len(sys.argv) == 1 else None
