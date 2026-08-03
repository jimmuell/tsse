import { z } from "zod";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import type { SourceMetadata } from "./source-metadata.server";


function parseLooseJson(text: string | undefined): unknown {
  if (!text) return undefined;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

import {
  AMBIGUITY_STATUSES,
  SPEC_SECTIONS,
  normalizeDefinition,
  type StrategyDefinition,
} from "./strategy-schema";

const sectionsShape = Object.fromEntries(
  SPEC_SECTIONS.map((section) => [
    section.key,
    z.object(
      Object.fromEntries(section.fields.map((f) => [f.key, z.string()])) as Record<
        string,
        z.ZodString
      >,
    ),
  ]),
);

const ExtractionSchema = z.object({
  sections: z.object(sectionsShape as Record<string, z.ZodTypeAny>),
  assumptions: z.array(
    z.object({
      term: z.string(),
      interpretation: z.string(),
      confidence: z.number(),
    }),
  ),
  ambiguities: z.array(
    z.object({
      item: z.string(),
      status: z.enum(AMBIGUITY_STATUSES),
      note: z.string(),
    }),
  ),
  confidence: z.array(z.object({ section: z.string(), value: z.number() })),
  warnings: z.array(z.string()),
  questions: z.array(
    z.object({
      section: z.string(),
      question: z.string(),
      explanation: z.string(),
      options: z.array(z.object({ label: z.string(), answer: z.string() })),
    }),
  ),
});

function schemaDoc(): string {
  return SPEC_SECTIONS.map((section) => {
    const fields = section.fields
      .map(
        (f) =>
          `    - ${f.key} (${f.label})${f.required ? " [required]" : ""}${
            f.rule ? " [must be a Boolean/arithmetic expression]" : ""
          }${f.hint ? ` — ${f.hint}` : ""}`,
      )
      .join("\n");
    return `  ${section.key} — ${section.title}: ${section.description}\n${fields}`;
  }).join("\n");
}

const SYSTEM_PROMPT = `You are the Trading Strategy Specification Engine.

Your job is to convert a natural-language or code description of a trading strategy into a deterministic, machine-readable Strategy Definition.

Hard rules:
- NEVER silently invent a rule. If the source does not state something, either leave the field empty and raise an ambiguity, or fill it and record an explicit assumption.
- Every field marked as an expression must be written as a machine-evaluable Boolean or arithmetic expression using operators (>, <, >=, <=, ==, AND, OR, NOT, crosses_above, crosses_below) and named indicators such as close, high, low, volume, EMA(20), ATR(14), RSI(14), VWAP, VAH, prev_high.
- Remove all subjective language. Words like "strong", "confirmation", "weakens", "significant", "clean" must be translated into a concrete expression and logged as an assumption.
- Assumption format: term = the vague phrase from the source; interpretation = the exact expression you substituted; confidence = 0-100.
- Ambiguity statuses: resolved, needs_user_input, unknown, cannot_determine.
- confidence is a list of { section, value } pairs, one per section key you populated, value 0-100.
- questions are short clarifying questions the user must answer to remove remaining ambiguity. Coverage is mandatory: EVERY ambiguity whose status is needs_user_input, unknown or cannot_determine MUST have exactly one matching question, in the same order as the ambiguity list. Also ask a question for any required field you left empty and for any assumption with confidence below 80. Ask at most 8. Never drop a question to save space — the explanation and options must never reduce how many questions you ask. Each question MUST include:
  - explanation: 1-3 plain-English sentences saying what the source does and does not state, and why the answer changes execution. Written for a trader, not an engineer.
  - options: 2-3 concrete, ready-to-use candidate answers. label is a short name (e.g. "Standard 1% risk", "Mirror the video literally", "Confirm the symmetric rule"); answer is the exact text that could be pasted as the user's answer, written as a machine-evaluable rule with real numbers/expressions. Never write vague options.
- Always return every section key and every field key, using an empty string when unknown.
- Metadata provenance (strategy_name, author, source, version) must come from the provided provenance block or from the source material itself. NEVER write placeholder text such as "Unknown", "N/A", "Manual" or a made-up version number — leave the field empty and raise an ambiguity instead.
- Be reproducible: for the same source material always produce the same wording, the same ordering of assumptions/ambiguities/questions (source order), and the same confidence numbers. Do not paraphrase differently between runs; quote or restate the source as literally as possible. Round every confidence value to the nearest 5.

Section schema:
${schemaDoc()}`;


export type ExtractionResult = {
  definition: StrategyDefinition;
  questions: {
    section: string;
    question: string;
    explanation?: string;
    options?: { label: string; answer: string }[];
  }[];
};

export async function runExtraction(input: {
  name: string;
  sourceType: string;
  sourceContent: string;
  sourceMeta?: SourceMetadata | null;
  existing?: unknown;
  answers?: { question: string; answer: string }[];
}): Promise<ExtractionResult> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const gateway = createLovableAiGatewayProvider(key, { structuredOutputs: true });

  const answerBlock =
    input.answers && input.answers.length > 0
      ? `\n\nThe user has answered these clarifying questions. Treat the answers as authoritative source material and mark the matching ambiguities as resolved:\n${input.answers
          .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
          .join("\n\n")}`
      : "";

  const meta = input.sourceMeta;
  const provenanceBlock = meta
    ? `\n\nAuthoritative provenance for the metadata section (use these values verbatim, do not paraphrase or invent):
- source (URL): ${meta.canonicalUrl ?? meta.url}
- publisher/platform: ${meta.provider}
${meta.title ? `- original title: ${meta.title}\n` : ""}${
        meta.author ? `- author / channel: ${meta.author}\n` : ""
      }Set metadata.source to the URL above and metadata.author to the author/channel when given. Use the original title for metadata.strategy_name only if the user-supplied strategy name is empty or is itself the title. Leave metadata.version empty unless the source states a version.`
    : "\n\nNo source URL was provided. Leave metadata.author and metadata.source empty unless the source material itself names them, and raise ambiguities for the missing provenance.";

  const existingBlock = input.existing
    ? `\n\nExisting partial specification (preserve any user-edited values unless an answer contradicts them):\n${JSON.stringify(
        input.existing,
      ).slice(0, 20000)}`
    : "";

  const userPrompt = `Strategy name: ${input.name}
Source type: ${input.sourceType}${provenanceBlock}

Source material:
"""
${input.sourceContent.slice(0, 60000)}
"""${answerBlock}${existingBlock}`;


  let output: z.infer<typeof ExtractionSchema>;
  try {
    const result = await generateText({
      model: gateway("google/gemini-3.5-flash"),
      output: Output.object({ schema: ExtractionSchema }),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0,
      topP: 1,
      seed: 7,
      maxOutputTokens: 16000,
    });
    output = result.output;
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) throw error;
    const parsed = parseLooseJson(error.text);
    const safe = ExtractionSchema.partial().safeParse(parsed);
    if (!safe.success) {
      throw new Error("The model returned an unusable specification. Please try again.");
    }
    output = {
      sections: safe.data.sections ?? {},
      assumptions: safe.data.assumptions ?? [],
      ambiguities: safe.data.ambiguities ?? [],
      confidence: safe.data.confidence ?? [],
      warnings: safe.data.warnings ?? [],
      questions: safe.data.questions ?? [],
    } as z.infer<typeof ExtractionSchema>;
  }


  const confidence: Record<string, number> = {};
  for (const entry of output.confidence ?? []) {
    confidence[entry.section] = entry.value;
  }

  const definition = normalizeDefinition({
    sections: output.sections,
    assumptions: output.assumptions,
    ambiguities: output.ambiguities,
    confidence,
    warnings: output.warnings,
  });

  const questions = [...(output.questions ?? [])];
  // Safety net: every unresolved ambiguity must surface as a question, but never
  // as a duplicate of one the model already asked. Ambiguity items are usually
  // field paths ("position_sizing.sizing_formula"), so match on section/field
  // tokens rather than raw substrings.
  const OPEN = new Set(["needs_user_input", "unknown", "cannot_determine"]);
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2);
  for (const amb of output.ambiguities ?? []) {
    if (!OPEN.has(amb.status)) continue;
    const [ambSection, ...rest] = amb.item.split(".");
    const fieldTokens = tokenize(rest.join(" ") || amb.item);
    const covered = questions.some((q) => {
      if (q.section && ambSection && q.section.toLowerCase() === ambSection.toLowerCase()) {
        return true;
      }
      const qTokens = new Set(tokenize(`${q.question} ${q.explanation ?? ""}`));
      const hits = fieldTokens.filter((t) => qTokens.has(t)).length;
      return fieldTokens.length > 0 && hits >= Math.min(2, fieldTokens.length);
    });
    if (covered) continue;
    questions.push({
      section: ambSection || "",
      question: `How should "${amb.item}" be defined?`,
      explanation:
        amb.note ||
        "The source material does not state this, so it must be specified before the strategy can be implemented.",
      options: [],
    });
  }

  const seen = new Set<string>();
  const deduped = questions.filter((q) => {
    const key = q.question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { definition, questions: deduped };
}

