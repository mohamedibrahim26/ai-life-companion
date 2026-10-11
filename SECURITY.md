# Security

Vera stores personal conversations, goals and daily mood scores. Mood data is
health-related, so it is treated as sensitive personal data under GDPR. This
document explains what the app protects against and how.

## Reporting a vulnerability

Please do not open a public issue. Contact the maintainer privately through
[LinkedIn](https://www.linkedin.com/in/mohamedibrahim26/) with a description
and steps to reproduce. You will get a reply within 7 days.

## Threat model

| Threat | Example | Protection |
| --- | --- | --- |
| Unauthenticated access | Calling `/api/chat/<id>` with no login | `requireAuth` middleware on every data route returns `401` |
| Cross-user access (IDOR) | User A requests `/api/goals/<user B id>` | `router.param('userId')` check returns `403` unless the ID matches the token |
| Token forgery | Signing a token with a guessed or leaked secret | No default secret; server refuses to start without a 32+ character `JWT_SECRET`; HS256 pinned |
| Stolen token reuse | A token copied from a shared device | Tokens expire after 7 days (configurable) |
| Admin takeover | Opening `/admin` or calling `/api/admin/*` | Server-side check against `ADMIN_EMAILS`; the old client-side password was removed |
| Password guessing | Scripted login attempts | 20 attempts per 15 minutes per IP; same error for unknown email and wrong password |
| Credential leaks | Password hash returned in API responses | `publicUser()` strips `password_hash` from every user response |
| Cost abuse | Spamming LLM or ElevenLabs endpoints | Per-user rate limit (30/min) on chat, insights and TTS; TTS requires login |
| Oversized input | Huge request bodies or profile fields | 100 KB body limit; profile fields capped at 2,000 characters |
| Invite enumeration | Guessing invite codes | 8-character codes from a secure random source; validation does not reveal the creator |
| Vulnerable dependencies | Known CVEs in npm/pip packages | `npm audit` in CI, weekly Dependabot updates, CodeQL scanning |

## Privacy

- **Right of access:** `GET /api/user/:userId/export` returns everything stored about the user as JSON.
- **Right to erasure:** `DELETE /api/user/:userId` permanently deletes the account and all related data in one transaction.
- **Data minimisation:** gender is stored only if the user states it explicitly. It is never inferred from a name, and it does not change how Vera talks to the user.

## Known limitations

These are open and tracked:

- **Admins can read user chat messages** in the admin dashboard. This is useful for debugging but is a privacy risk. A future version should show only aggregate stats by default.
- **Tokens are stored in `localStorage`**, which is readable by any script on the page. Moving to `HttpOnly` cookies would reduce the impact of an XSS bug.
- **No token revocation list.** Logging out clears the token in the browser but a copied token stays valid until it expires. Deleting the account does invalidate it.
- **Prompt injection:** a user can try to make Vera ignore its instructions. Because each user only ever sees their own data, this cannot leak other users' information, but responses are not filtered.
- **SQLite on a single volume** with no encryption at rest beyond what the host provides.

## Running the security tests

```bash
cd backend
npm test
```
