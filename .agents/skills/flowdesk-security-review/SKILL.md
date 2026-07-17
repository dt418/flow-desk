---
name: flowdesk-security-review
description: >
  Review FlowDesk for multi-tenant IDOR, authz gaps, OAuth/2FA cookie issues,
  Slack HMAC, SSRF/outbound fetch, rate limits, and secret leakage. Use when
  asked for security review, audit, IDOR check, authz review, webhook signing,
  "is this safe to ship", or when fd-security is active. Do not use for general
  product feature planning (plan-feature) or pure style review.
metadata:
  author: flow-desk
  version: '1.0'
---

# FlowDesk security review

Multi-tenant SaaS fails silently: users see 200 with **someone else's data**. Review for that class of bug first.

## Checklist (run in order)

### 1. Resource access

For each new/changed endpoint that takes an id:

1. Load resource by id.
2. Assert caller's workspace membership (or resource ownership) **before** mutation/read of sensitive fields.
3. Prefer 404 over 403 when it avoids id oracle (match existing module convention).

### 2. Authn edge cases

- Cookie flags: httpOnly, secure in prod, sameSite appropriate.
- OAuth callback: state, account linking, 2FA step-up cookies not forgeable cross-user.
- JWT secret only server-side; never log tokens.

### 3. Integrations

- Slack (and similar): verify HMAC/signature with raw body; reject skew.
- Outbound fetch: block private IP, link-local, metadata IPs (SSRF); DNS-pin when required.
- Webhooks: secrets not in query strings logged at info level.

### 4. Abuse

- Rate limit auth strict, API moderate.
- Large export/upload: size caps (413), streaming not full buffer when possible.

### 5. Secrets

- Grep diff for `sk-`, `AKIA`, private keys, `.env` content.
- Frontend must not receive `LLM_API_KEY`, `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`.

## Output format

One finding per line:

```
apps/api/src/modules/chat/chat.service.ts:142: critical: chat load by id without workspace membership. Check membership before return.
```

Close with:

```markdown
## Verdict: PASS | FAIL

## Blocking

- ...

## Residual (non-blocking)

- ...
```

## Deep patterns

Known historical themes (chat IDOR, OAuth 2FA cookie, Slack HMAC, SSRF URL safety) — re-check similar code when those areas touch. See repo `plans/` and past AUD-\* features for regressions.

## What not to do

- Do not fail on style or missing docs alone.
- Do not require perfect coverage of unrelated modules.
- Do not paste real secrets into the report.

---
