# Meta — flowdesk-security-review (with skill)

| Field | Value |
| ----- | ----- |
| Skill | `flowdesk-security-review` v1.0 |
| Agent | `fd-security` |
| Scope | `apps/api/src/modules/chat/*` (+ socket typing/join/send for chat) |
| Focus | Multi-tenant authz: membership on load/send; IDOR; typing gates |
| Review path | `_workspace/harness-test/iteration-1/eval-security/with_skill/03_security_review.md` |

## Checklist items covered

| # | Checklist item | Covered | Notes |
| - | -------------- | ------- | ----- |
| 1 | Resource access (id load → membership before read/mutate) | Yes | `findAndValidateChannel`, `assertMembership` on all channel/message ops |
| 2 | Authn edge cases (cookies/JWT/OAuth) | Partial | Chat routes use `requireAuth`; socket JWT/cookie on `/collab`; OAuth/2FA out of chat module scope |
| 3 | Integrations (Slack HMAC, SSRF, webhooks) | N/A | No chat integration surface in scope |
| 4 | Abuse (rate limits, size caps) | Partial | Socket RL on join/send/read; message content max 4000 on socket schema; REST write RL app-wide |
| 5 | Secrets | Yes | No secrets in chat module; no client key leakage in reviewed files |

## Verdict line present

**Yes** — `## Verdict: PASS`

## Finding count

| Severity | Count |
| -------- | ----- |
| critical | 0 |
| high | 0 |
| medium | 1 |
| low | 4 |
| **Total finding lines** | **5** |
| Blocking | 0 |
