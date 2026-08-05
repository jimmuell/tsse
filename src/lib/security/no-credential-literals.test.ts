import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Regression guard for WIT-SEC-01. A hardcoded test-account credential in
 * src/routes/auth.tsx has been silently reintroduced once already: WIT-FRONTEND-05
 * removed it, and Lovable's next commits brought a rotated password back as a
 * `?? "<literal>"` fallback. This scans every .ts/.tsx file under src/ (excluding
 * this file itself) for the shapes that bug has actually taken:
 *
 *   A) an identifier containing "password"/"email", followed later in the same
 *      statement by `?? "<literal>"` — the exact fallback shape of the real bug.
 *   B) `password: "<literal>"` / `email: "<literal>"` — direct object-key hardcoding.
 *   C) any quoted string literal shaped like an actual email address, anywhere.
 *
 * It deliberately does NOT flag (verified empirically against the current tree,
 * not just reasoned about): env-var key lookups like
 * `import.meta.env["VITE_TEST_PASSWORD"]` (a key NAME, not a credential value —
 * there's no `??`/`:` immediately pairing that key string with a quote), JSX
 * attributes like `id="password"` or `type="email"` (no colon-before-quote or
 * ??-before-quote shape — those are exclusively JS/TS object-literal/assignment
 * syntax), TypeScript type annotations like `password: string` (no quote follows
 * the colon), destructuring (`{ email, password }`, no colon at all), and empty
 * fallbacks like `email ?? ""` or `email ?? null` (empty/non-string, not a
 * credential — the literal must have real content).
 */

const SRC_DIR = join(process.cwd(), "src");
const SELF = import.meta.path;
const SCAN_EXTENSIONS = [".ts", ".tsx"];

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, out);
    } else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext)) && full !== SELF) {
      out.push(full);
    }
  }
  return out;
}

// A) identifier ... ?? "literal" — the exact shape of the real, historical bug.
const FALLBACK_LITERAL =
  /\w*(?:password|email)\w*[^;\n]{0,160}?\?\?=?\s*["'`]([^"'`]{1,300})["'`]/gi;
// B) password: "literal" / email: "literal" — direct object-key hardcoding.
const KEY_LITERAL = /\b(?:password|email)\s*:\s*["'`]([^"'`]{1,300})["'`]/gi;
// C) any literal shaped like an actual email address, anywhere.
const EMAIL_SHAPED = /["'`]([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})["'`]/g;

type Finding = { file: string; line: number; snippet: string };

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function scan(content: string, file: string): Finding[] {
  const findings: Finding[] = [];
  for (const pattern of [FALLBACK_LITERAL, KEY_LITERAL, EMAIL_SHAPED]) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
      findings.push({
        file,
        line: lineNumberAt(content, m.index),
        snippet: m[0].trim().slice(0, 140),
      });
    }
  }
  return findings;
}

describe("no credential literals", () => {
  test("no email or password literal appears anywhere in src/", () => {
    const files = collectFiles(SRC_DIR);
    const findings = files.flatMap((file) =>
      scan(readFileSync(file, "utf8"), relative(SRC_DIR, file)),
    );

    if (findings.length > 0) {
      const report = findings.map((f) => `  ${f.file}:${f.line} — ${f.snippet}`).join("\n");
      throw new Error(
        `Found ${findings.length} possible credential literal(s) in src/ — a hardcoded ` +
          `test email or password must never ship in source. Move it to an env var ` +
          `(VITE_TEST_EMAIL / VITE_TEST_PASSWORD in .env.local) instead:\n${report}`,
      );
    }
    expect(findings).toEqual([]);
  });
});
