import { createMiddleware } from "@tanstack/react-start";

/**
 * Same-origin guard for server-function requests.
 *
 * We implement this locally instead of using `createCsrfMiddleware` from
 * @tanstack/react-start: that export is built with `createIsomorphicFn()` and
 * resolves to `undefined` in some bundled builds, which previously crashed the
 * published app with "createCsrfMiddleware is not a function".
 *
 * The logic mirrors the framework's: prefer `Sec-Fetch-Site`, then `Origin`,
 * then `Referer`. Requests carrying none of those headers (non-browser clients)
 * are allowed through, same as the framework default.
 */
function isSameOrigin(request: Request): boolean {
  const secFetchSite = request.headers.get("Sec-Fetch-Site");
  if (secFetchSite !== null) {
    return secFetchSite === "same-origin";
  }

  const requestOrigin = new URL(request.url).origin;

  const origin = request.headers.get("Origin");
  if (origin !== null) {
    return origin === requestOrigin;
  }

  const referer = request.headers.get("Referer");
  if (referer === null) {
    // No browser-provided origin signal at all: allow (non-browser client).
    return true;
  }
  try {
    return new URL(referer).origin === requestOrigin;
  } catch {
    return false;
  }
}

export const csrfMiddleware = createMiddleware().server(async (ctx) => {
  const { handlerType } = ctx as unknown as { handlerType?: string };
  if (handlerType !== "serverFn") {
    return ctx.next();
  }
  if (isSameOrigin(ctx.request)) {
    return ctx.next();
  }
  return new Response("Forbidden", { status: 403 });
});
