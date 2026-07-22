#!/usr/bin/env bash
# Structural harness checks (agents, skills, symlinks). Exit 1 on failure.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
bash scripts/sync-agent-adapters.sh >/dev/null
python3 - <<'PY'
from pathlib import Path
import re, sys
root = Path(".")
fail = 0
def ok(cond, msg):
    global fail
    print(("PASS" if cond else "FAIL"), msg)
    if not cond: fail += 1
for a in ["fd-explorer","fd-implementer","fd-security","fd-qa","fd-docs"]:
    ok((root/f".claude/agents/{a}.md").is_file(), f"agent {a}")
for s in ["plan-feature","flowdesk-team","flowdesk-implement","flowdesk-security-review","flowdesk-qa","harness"]:
    p = root/f".agents/skills/{s}/SKILL.md"
    ok(p.is_file(), f"skill {s}")
    if p.is_file():
        t = p.read_text()
        ok(re.search(rf"^name:\s*{re.escape(s)}\s*$", t, re.M) is not None, f"name {s}")
        ok(len(t.splitlines()) < 500, f"lines {s}")
    for host in [".claude/skills",".grok/skills"]:
        ok((root/host/s/"SKILL.md").resolve() == p.resolve(), f"link {host}/{s}")
orch = (root/".agents/skills/flowdesk-team/SKILL.md").read_text()
for a in ["fd-explorer","fd-implementer","fd-security","fd-qa","fd-docs"]:
    ok(a in orch, f"orch mentions {a}")
agents_md = (root/"AGENTS.md").read_text()
ok("flowdesk-team" in agents_md, "AGENTS pointer")
harness = (root/".agents/skills/harness/SKILL.md").read_text().lower()
ok("do not" in harness or "do not use" in harness, "harness exclusions")
sys.exit(1 if fail else 0)
PY
