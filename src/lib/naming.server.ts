import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { resolveSourceMetadata } from "./source-metadata.server";

function cleanTitle(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`.]+$/g, "")
    .trim()
    .slice(0, 120);
}

/** Derive a human-readable strategy name from a source URL and/or transcript. */
export async function suggestName(input: {
  sourceUrl?: string | null | undefined;
  sourceContent?: string | null | undefined;
}): Promise<{ name: string; from: "url" | "transcript" } | null> {
  const meta = await resolveSourceMetadata(input.sourceUrl);
  if (meta?.title) {
    const title = cleanTitle(meta.title);
    if (title) return { name: title, from: "url" };
  }

  const content = (input.sourceContent ?? "").trim();
  if (content.length < 40) return null;

  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;

  try {
    const gateway = createLovableAiGatewayProvider(key);
    const result = await generateText({
      model: gateway("google/gemini-3.5-flash"),
      system:
        "You name trading strategies. Reply with ONLY a short title, 3-8 words, no quotes, no punctuation at the end. Describe the actual setup (instrument/session/pattern) rather than clickbait phrasing.",
      prompt: `Source material:\n"""\n${content.slice(0, 8000)}\n"""\n\nTitle:`,
    });
    const name = cleanTitle(result.text ?? "");
    return name ? { name, from: "transcript" } : null;
  } catch {
    return null;
  }
}
