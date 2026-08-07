import { describe, expect, it } from "bun:test";
import { SYSTEM_PROMPT } from "./extraction.server";
import { SPEC_SECTIONS } from "./strategy-schema";

describe("extraction system prompt", () => {
  it("never leaks human-only field hints to the model", () => {
    for (const phrase of [
      "Not applied by the audit",
      "not read by the audit",
      "Free text",
      "blocks the run",
    ]) {
      expect(SYSTEM_PROMPT).not.toContain(phrase);
    }
  });

  it("still carries the four model-facing extraction hints", () => {
    expect(SYSTEM_PROMPT).toContain("Market / Limit / Stop / Stop limit");
    expect(SYSTEM_PROMPT).toContain("ATR / Ticks / Swing / Indicator / Percentage / Custom");
    expect(SYSTEM_PROMPT).toContain("the % of volume the value area covers");
  });

  it("documents every section", () => {
    for (const s of SPEC_SECTIONS) expect(SYSTEM_PROMPT).toContain(`${s.key} — ${s.title}`);
  });
});
