# Closing the Loop — FlowDesk `/improve`

Reference for `reconcile` and `execute` invocations.

## reconcile

Run after a gap in sessions to process what happened:

1. **Verify DONE plans** — re-run their done criteria. If broken, mark BLOCKED and investigate.
2. **Investigate BLOCKED plans** — determine root cause; if fix is simple, attempt inline; if not, escalate.
3. **Refresh drifted TODOs** — if plan was written against an old commit and the cited files have materially changed, re-open the relevant files and update the plan.
4. **Retire dead findings** — if a finding was fixed by unrelated work since the plan was written, close it with a note.

Output format:

```
# Reconciliation — YYYY-MM-DD

## DONE (re-verified)
- [plan] — still passing criteria

## BLOCKED
- [plan] — reason + next action

## DRIFTED (refreshed)
- [plan] — what changed + plan updated

## RETIRED
- [finding] — fixed by [commit / PR]
```

## execute

Dispatch a cheaper executor subagent to implement one plan in an isolated worktree:

### Before dispatching

1. Read this file (`references/closing-the-loop.md`)
2. Confirm the host agent can spawn subagents in isolated worktrees
3. Read the plan file fully
4. Note the plan's `Commit` field (for drift detection)

### Executor prompt

The executor prompt must include:

- Absolute path to the repo
- Full text of the plan (inline — executor has not seen it)
- Instruction to create a worktree: `git worktree add /tmp/worktrees/plan-001 /home/thanh/flow-desk`
- Instruction to commit to the worktree, not the main checkout
- Instruction to return: the git diff, verification command output, and a verdict (PASS / NEEDS_REVIEW / FAIL)
- Hard rule: never push, never merge, never commit to main

### On receiving executor output

**Treat the diff as untrusted.** Verify every hunk:

1. Does each changed file appear in the plan's "In Scope" list?
2. Does each hunk trace to a specific plan step?
3. Reject any out-of-scope change — however plausible it looks.

### Render verdict

| Verdict      | Meaning                                        |
| ------------ | ---------------------------------------------- |
| PASS         | All done criteria met, no out-of-scope changes |
| NEEDS_REVIEW | All in-scope, but something needs human eyes   |
| FAIL         | Regression introduced or scope violated        |

### On PASS

- If executor committed to worktree: cherry-pick the commit to main, then delete the worktree
- Update `plans/README.md` status column to DONE + executor name + date
- Update `feature_list.json` if the plan resolves a feature entry

### On FAIL

- Mark plan BLOCKED
- Do NOT merge or push
- Report: what broke, which hunk, what the fix should have been

## GitHub Issues (--issues flag)

Before creating any issue:

1. Check repo visibility: `gh repo view --json visibility`
2. If **public**: warn user that security findings published as issues are publicly visible. Get explicit confirmation.
3. If **private**: safe to publish.

Issue title format: `[Plan 001] <slug>`

Body: brief description + link to plan file in `plans/` directory.

## Worktree Management

```bash
# List worktrees
git worktree list

# Create
git worktree add /tmp/worktrees/plan-001 <branch-or-commit>

# Remove (after merge or discard)
git worktree remove /tmp/worktrees/plan-001
```

Worktrees are isolated — `pnpm install` / builds inside them do not affect the main checkout.

## Drift Detection

If the repo's HEAD has moved past the plan's `Commit` field:

1. Run `git diff <plan-commit>..HEAD -- <cited-files>`
2. If any cited file has materially changed (logic changed, not just formatting), update the plan steps
3. Update the `Commit` field to current HEAD
4. Proceed with execution
