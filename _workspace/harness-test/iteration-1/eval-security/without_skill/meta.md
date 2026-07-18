# Meta — baseline security review (without skill)

| Field | Value |
| ----- | ----- |
| Mode | Baseline: general security knowledge only |
| Skill used | **None** (explicitly did not read `flowdesk-security-review` or `fd-security`) |
| Scope | `apps/api/src/modules/chat/*` + necessary collab socket path for typing |
| Product source modified | No |
| Output | Free-form markdown review |

## Finding count

| Metric | Value |
| ------ | ----- |
| Total findings labeled F1–F10 | **10** |
| High | **1** (F1 `isPrivate` not enforced) |
| Medium / Medium–High | **4** (F2 role, F3 taskId bind, F4 getOrCreateTaskChannel authz, F6 typing/join lag) |
| Low / Low–Medium | **4** (F5 soft-delete gap, F7 markRead, F9 email, F10 clientMessageId scope) |
| Informational / positive | **1** (F8 cross-tenant IDOR largely mitigated) |
| Actionable High+Medium | **6** |

Primary count for harness scoring: **10 findings** (or **6** if only High/Medium counted).

## Format notes

- Free-form narrative review (not a fixed schema checklist).
- Structure used ad hoc:
  1. Executive summary
  2. Trust model table
  3. Numbered findings F1…Fn with Severity / Category / Locations / Issue / Impact / Recommendation
  4. Attack matrix
  5. Typing-specific conclusions
  6. Strengths
  7. Priority order
  8. Files reviewed
  9. Count table
- No required fields from a skill template (no CVE IDs, no CWE mapping, no risk IDs from `RISKS.md` required).
- Related code outside `modules/chat/` was cited when needed for typing (socket) and task-channel entrypoint; findings still center on chat multi-tenant authz.
- Severity is qualitative (High/Medium/Low), not CVSS.
- Positive controls documented alongside defects (may increase token length vs “findings-only” format).
- Did not run dynamic exploit or integration suite as part of this baseline; referenced existing IDOR test intent from repo only via static reading of service patterns.

## Coverage emphasis (requested)

| Focus | Covered? |
| ----- | -------- |
| Workspace membership | Yes — `assertMembership` vs `findAndValidateChannel`, error codes |
| IDOR | Yes — cross-workspace matrix, message/channel binding, mentions |
| Typing | Yes — join gate, `chatPresenceChannels`, revocation lag, private ACL gap |
