# Email-based password reset, with backdoors removed

## What I verified first

- There is no `setPasswordDirect` server function and no `src/lib/dev-auth.functions.ts` left in the codebase — the direct password-set backdoor was already deleted in the previous turn.
- The only server route under `src/routes/api/` is the backtest callback; no password endpoints exist there.
- `/reset-password` already exists and correctly updates the password from a recovery session.
- What is actually missing: the sign-in page has **no "Forgot password?" entry point**, so nothing ever sends a reset email.
- Two leftovers still need cleaning: the dev-only "Auto sign in (test user)" button on the sign-in page (ships hardcoded test credentials in source), and the now-unused `ALLOW_TEST_PASSWORD_RESET` backend secret.
- No email sending domain is configured for this project. Reset emails will go out through the default Lovable sender, which works but is unbranded.

## What I'll build

**1. "Forgot password?" on the sign-in page**

A third mode on `/auth` (`signin` / `signup` / `reset`). In reset mode the form shows only the email field and a "Send reset link" button, plus a "Back to sign in" link. Submitting sends the recovery email pointing at `/reset-password`.

The response is always the same neutral message — "If an account exists for that email, a reset link is on the way" — whether or not the address is registered, so the form can't be used to discover which emails have accounts.

**2. Rate limiting**

Two layers, because the backend has no general-purpose rate-limiting primitive:

- *Server-side (the real limit):* set the project's hourly auth-email cap so a flood of reset requests is rejected by the auth service itself. Note: raising this cap requires active email sending, so I'll set it to a sane value and report back if the platform refuses until an email domain is verified.
- *Client-side (usability):* a 60-second cooldown after a send, with the button disabled and a countdown, so an ordinary user can't hammer the endpoint by accident. Handle the `over_email_send_rate_limit` error explicitly with a "too many attempts, try again shortly" message instead of a raw error string.

**3. Remove the remaining backdoors**

- Delete the "Auto sign in (test user)" button and its hardcoded `test@tsse.com` / `87654321` credentials from `src/routes/auth.tsx`.
- Delete the unused `ALLOW_TEST_PASSWORD_RESET` secret from the backend.

**4. Reset page hardening**

`/reset-password` currently accepts any signed-in session, so a signed-in user landing there sees the form. I'll keep it usable from a recovery link but show a clear "This link is invalid or expired — request a new one" state with a link back to `/auth` when no recovery session is present.

## Technical notes

- `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/reset-password\` })` from the client; no server function needed, so no new public endpoint is introduced.
- Errors from `resetPasswordForEmail` are swallowed into the neutral message, except rate-limit errors which surface as a distinct toast.
- Auth-email cap set via the backend auth configuration (`rate_limit_email_sent`).
- Cooldown state is component-local (`useState` + interval), reset on unmount.
- No database changes, no migrations, no new routes.

## Out of scope

- Branded reset emails. That needs a sending domain you own; I can set that up in a follow-up if you want the emails to come from your own address instead of the default sender.
