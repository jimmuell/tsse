# Restore the app and secure test authentication

## Confirmed diagnosis

- The published app returns HTTP 500 on every route because `src/start.ts` calls `createCsrfMiddleware`, but that function is unavailable in the deployed server bundle. Production logs repeatedly show `TypeError: createCsrfMiddleware is not a function`.
- Local development currently returns HTTP 200, which explains why the failure can appear deployment-wide while the sandbox dev server looks healthy.
- Lovable Cloud is healthy; the database/auth service is not causing the route failures.
- Weak-password/leaked-password protection was switched off to accept `87654321`. That setting is independent of the all-route outage.
- The recently added direct password setter is an unauthenticated server function gated only by a project-wide environment flag. If enabled, anyone who knows an email address could replace that account’s password or create an account. It should not remain as implemented.

## Changes

1. **Restore all routes**
   - Remove the unsupported explicit `createCsrfMiddleware` import and registration from `src/start.ts`.
   - Preserve the existing error middleware and authenticated server-function bearer attachment.
   - Rely on TanStack Start’s built-in CSRF middleware, which the installed framework already adds when no custom CSRF middleware is registered.

2. **Remove the password-reset back door**
   - Remove the direct password-setting mode from the sign-in form.
   - Remove the unauthenticated `setPasswordDirect` server function.
   - Keep normal sign-in/sign-up and the development-only auto-sign-in button.

3. **Restore password security**
   - Re-enable leaked-password protection so breached/common passwords are rejected for future signup and password changes.
   - Existing credentials are not automatically changed by this setting.

4. **Verify the actual failure paths**
   - Confirm `/`, `/auth`, and protected-route redirects render successfully in the preview.
   - Check the production-compatible server path no longer logs the middleware error.
   - Verify normal sign-in and the development-only test auto-sign-in path still behave correctly.

## Technical notes

- No backtest engine seam, callback, database schema, or strategy logic will be changed.
- Fake-email accounts will no longer have a public self-service password override. Test credentials should be managed through a controlled test account rather than an unauthenticated production endpoint.