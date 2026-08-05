import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Regression guard for WIT-SEC-02.
 *
 * Two convenience back doors have now shipped to production in this codebase — a
 * hardcoded test credential (WIT-SEC-01), and an unauthenticated createServerFn
 * (setPasswordDirect, dev-auth.functions.ts) that used the service-role client to
 * set ANY account's password by email alone, gated by nothing but a boolean env
 * flag. Code review caught neither in time. This red test is the control that has
 * actually worked.
 *
 * For every `createServerFn` exported anywhere under src/: if its file touches the
 * service-role / admin Supabase client (`supabaseAdmin`, imported statically or
 * dynamically, or a direct `SUPABASE_SERVICE_ROLE_KEY` reference), that specific
 * function must chain `requireSupabaseAuth` — or be named in
 * AUTH_EXEMPT_SERVER_FUNCTIONS below, with a comment explaining why. That list is
 * empty today, and should stay empty — anything added to it is a claim someone can
 * check, not a way to make this test stop looking.
 */

// Deliberately empty. Do not add an entry without a comment explaining exactly why
// that specific function is safe to call with the service-role client and no auth.
const AUTH_EXEMPT_SERVER_FUNCTIONS: string[] = [];

const SRC_DIR = join(process.cwd(), "src");
const SELF = import.meta.path;
const SCAN_EXTENSIONS = [".ts", ".tsx"];

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, out);
    } else if (
      SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext)) &&
      !entry.endsWith(".test.ts") &&
      full !== SELF
    ) {
      out.push(full);
    }
  }
  return out;
}

const SERVICE_ROLE_PATTERN = /\bsupabaseAdmin\b|\bSUPABASE_SERVICE_ROLE_KEY\b/;
const AUTH_MIDDLEWARE_PATTERN = /\brequireSupabaseAuth\b/;
const SERVER_FN_EXPORT = /export const (\w+)\s*=\s*createServerFn(?:<[^>]*>)?\(/g;

type Finding = { file: string; name: string };

/**
 * Splits a file into one text block per exported createServerFn (from its `export
 * const X = createServerFn(` up to the next such export, or EOF) — this naturally
 * includes each function's own handler body, so a service-role client dynamically
 * imported inside the handler is captured with the function that uses it, not just
 * "somewhere in this file."
 */
function findUnauthenticatedServiceRoleFns(content: string, relPath: string): Finding[] {
  const matches = [...content.matchAll(SERVER_FN_EXPORT)];
  if (matches.length === 0) return [];
  const preamble = content.slice(0, matches[0]!.index!);
  const findings: Finding[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const name = m[1]!;
    const start = m.index!;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : content.length;
    const segment = content.slice(start, end);

    // Static top-of-file service-role imports apply to every function in the file;
    // dynamic imports inside a handler are already part of that function's segment.
    const usesServiceRole =
      SERVICE_ROLE_PATTERN.test(preamble) || SERVICE_ROLE_PATTERN.test(segment);
    // Checked on the function's own segment only (not the preamble) — an import
    // statement for requireSupabaseAuth must not itself count as "this function
    // uses it"; it has to actually be chained here.
    const isAuthenticated = AUTH_MIDDLEWARE_PATTERN.test(segment);

    if (usesServiceRole && !isAuthenticated && !AUTH_EXEMPT_SERVER_FUNCTIONS.includes(name)) {
      findings.push({ file: relPath, name });
    }
  }
  return findings;
}

describe("server functions touching the service-role client must be authenticated", () => {
  test("no unauthenticated createServerFn reaches supabaseAdmin / SUPABASE_SERVICE_ROLE_KEY", () => {
    const files = collectFiles(SRC_DIR);
    const findings = files.flatMap((file) =>
      findUnauthenticatedServiceRoleFns(readFileSync(file, "utf8"), relative(SRC_DIR, file)),
    );

    if (findings.length > 0) {
      const report = findings.map((f) => `  ${f.file} — ${f.name}()`).join("\n");
      throw new Error(
        `Found ${findings.length} createServerFn export(s) that reach the service-role ` +
          `client without requireSupabaseAuth — this is an unauthenticated admin-power ` +
          `endpoint, exactly the shape of the setPasswordDirect back door (WIT-SEC-02). ` +
          `Add .middleware([requireSupabaseAuth]), or add the function name to ` +
          `AUTH_EXEMPT_SERVER_FUNCTIONS with a comment justifying it:\n${report}`,
      );
    }
    expect(findings).toEqual([]);
  });
});
