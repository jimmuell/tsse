import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ExtractInput = z.object({
  strategyId: z.string().uuid(),
  includeAnswers: z.boolean().optional(),
});

export const extractStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExtractInput.parse(input))
  .handler(async ({ data, context }) => {
    const { runExtraction } = await import("./extraction.server");
    const { resolveSourceMetadata } = await import("./source-metadata.server");

    const { data: strategy, error } = await context.supabase
      .from("strategies")
      .select("id, name, source_type, source_content, source_url, definition")
      .eq("id", data.strategyId)
      .single();

    if (error || !strategy) throw new Error("Strategy not found");
    if (!strategy.source_content.trim()) throw new Error("Add source material first");

    let answers: { question: string; answer: string }[] = [];
    if (data.includeAnswers) {
      const { data: rows } = await context.supabase
        .from("strategy_questions")
        .select("question, answer")
        .eq("strategy_id", data.strategyId)
        .not("answer", "is", null);
      answers = (rows ?? [])
        .filter((r) => (r.answer ?? "").trim().length > 0)
        .map((r) => ({ question: r.question, answer: r.answer as string }));
    }

    let result;
    try {
      const sourceMeta = await resolveSourceMetadata(strategy.source_url);
      result = await runExtraction({
        name: strategy.name,
        sourceType: strategy.source_type,
        sourceContent: strategy.source_content,
        sourceMeta,
        existing: data.includeAnswers ? strategy.definition : undefined,
        answers,
      });
    } catch (err) {
      await context.supabase
        .from("strategies")
        .update({ status: "failed" })
        .eq("id", data.strategyId);
      throw err instanceof Error ? err : new Error("Extraction failed");
    }

    const { error: updateError } = await context.supabase
      .from("strategies")
      .update({ definition: result.definition, status: "extracted" })
      .eq("id", data.strategyId);
    if (updateError) throw new Error(updateError.message);


    if (data.includeAnswers) {
      await context.supabase
        .from("strategy_questions")
        .delete()
        .eq("strategy_id", data.strategyId)
        .is("answer", null);
    } else {
      await context.supabase
        .from("strategy_questions")
        .delete()
        .eq("strategy_id", data.strategyId);
    }

    if (result.questions.length > 0) {
      await context.supabase.from("strategy_questions").insert(
        result.questions.slice(0, 8).map((q) => ({
          strategy_id: data.strategyId,
          user_id: context.userId,
          section: q.section || "general",
          question: q.question,
          explanation: q.explanation ?? null,
          options: (q.options ?? []) as never,
        })),
      );
    }

    return { definition: result.definition, questionCount: result.questions.length };
  });
