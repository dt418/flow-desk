# ADR-003: Authentication — JWT in httpOnly Cookie

## Context

FlowDesk needs authentication for email/password and Google OAuth. We need to choose a token storage strategy that balances security and usability.

## Decision

**JWT in httpOnly, Secure, SameSite=Lax cookie**. Short-lived access token (15 min) + long-lived refresh token (7 days).

### Token Pair Strategy

```
Access Token (15 min):
  - Stored in memory (frontend) AND httpOnly cookie
  - Used for API requests via Authorization header OR cookie
  - Contains: { userId, workspaceId? }

Refresh Token (7 days):
  - httpOnly cookie only (never accessible to JS)
  - Rotated on every refresh
  - Stored in DB (refresh_tokens table) for revocation
```

### Cookie Configuration

```typescript
{
  httpOnly: true,      // Not accessible to JS (XSS-safe)
  secure: true,        // HTTPS only in production
  sameSite: 'lax',     // CSRF protection, allows top-level navigations
  path: '/',           // Sent to all routes
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
}
```

## Rationale

- **httpOnly** — XSS cannot steal the token (even if attacker injects script)
- **SameSite=Lax** — CSRF protection; cookies not sent on cross-site POST
- **Refresh token rotation** — If refresh token is stolen, attacker can only use it once before legitimate user gets a new one
- **Server-side revocation** — Storing refresh tokens in DB allows logout-everywhere

## Alternatives Rejected

| Alternative                                | Why Rejected                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **localStorage**                           | Vulnerable to XSS; any injected script can steal tokens                                                    |
| **sessionStorage**                         | Same XSS risk; also lost on tab close                                                                      |
| **Cookie without httpOnly**                | XSS can read document.cookie and steal token                                                               |
| **Cookie with SameSite=None**              | CSRF vulnerability; requires careful origin validation                                                     |
| **Long-lived JWT only (no refresh)**       | Cannot revoke tokens; security risk                                                                        |
| **Session cookies with server-side store** | Requires sticky sessions or Redis lookup per request; doesn't scale to multi-instance without shared store |

## Consequences

- **Positive**: XSS-safe, CSRF-protected, revocable
- **Negative**: Requires CORS with `credentials: 'include'`; cookie clearing on logout requires server endpoint; same-domain or properly configured cross-domain cookies

## Implementation Notes

1. Frontend `fetch` calls must include `credentials: 'include'`
2. CORS must allow `Access-Control-Allow-Credentials: true`
3. Refresh token endpoint must be called proactively when access token is about to expire
4. Logout endpoint must clear BOTH cookies AND revoke refresh token in DB
