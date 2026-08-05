import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Download,
  Link as LinkIcon,
  Loader2,
  Save,
  Sparkle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ExtractingScreen } from "@/components/ExtractingScreen";
import { SectionCard } from "@/components/SectionCard";
import { BacktestPanel } from "@/components/BacktestPanel";
import { ValidationPanel } from "@/components/ValidationPanel";
import { AiReviewPanel } from "@/components/AiReviewPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { extractStrategy } from "@/lib/strategy.functions";
import { SPEC_SECTIONS, normalizeDefinition, type StrategyDefinition } from "@/lib/strategy-schema";
import { validateDefinition } from "@/lib/validation";
import { toMarkdown } from "@/lib/markdown";

export const Route = createFileRoute("/strategies/$id")({
  validateSearch: (search: Record<string, unknown>): { extract?: true } =>
    search['extract'] === true || search['extract'] === "true" ? { extract: true } : {},
  head: () => ({
    meta: [
      { title: "Strategy specification — TSSE" },
      {
        name: "description",
        content:
          "Review, refine and export a deterministic 17-section trading strategy specification with completeness and ambiguity scoring.",
      },
      { property: "og:title", content: "Strategy specification — TSSE" },
      {
        property: "og:description",
        content: "Resolve ambiguities and export a machine-readable trading strategy spec.",
      },
    ],
  }),
  component: StrategyDetail,
});

function StrategyDetail() {
  const { id } = Route.useParams();
  const { extract } = Route.useSearch();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runExtract = useServerFn(extractStrategy);

  const [definition, setDefinition] = useState<StrategyDefinition | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [firstExtract, setFirstExtract] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const strategyQuery = useQuery({
    queryKey: ["strategy", id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strategies")
        .select(
          "id, name, source_type, source_url, source_content, definition, status, updated_at",
        )

        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const questionsQuery = useQuery({
    queryKey: ["strategy-questions", id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strategy_questions")
        .select("id, section, question, answer, explanation, options")
        .eq("strategy_id", id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const strategy = strategyQuery.data;

  useEffect(() => {
    if (strategy && !dirty) {
      setDefinition(normalizeDefinition(strategy.definition));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy?.updated_at, strategy?.id]);

  const doExtract = useCallback(
    async (includeAnswers: boolean) => {
      setExtracting(true);
      try {
        await runExtract({ data: { strategyId: id, includeAnswers } });
        setDirty(false);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["strategy", id] }),
          queryClient.invalidateQueries({ queryKey: ["strategy-questions", id] }),
        ]);
        toast.success(includeAnswers ? "Specification refined" : "Specification drafted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Extraction failed");
      } finally {
        setExtracting(false);
        setFirstExtract(false);
      }
    },
    [id, queryClient, runExtract],
  );

  const autoAttempted = useRef(false);

  useEffect(() => {
    if (!strategy || extracting || autoAttempted.current) return;
    const pending = strategy.status === "extracting" || strategy.status === "failed";
    if (!pending || !strategy.source_content?.trim()) return;
    autoAttempted.current = true;
    if (extract) {
      navigate({ to: "/strategies/$id", params: { id }, search: {}, replace: true });
    }
    setFirstExtract(true);
    void doExtract(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extract, strategy?.status, strategy?.id]);


  const validation = useMemo(
    () => (definition ? validateDefinition(definition) : null),
    [definition],
  );

  function updateField(sectionKey: string, fieldKey: string, value: string) {
    setDefinition((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: {
          ...prev.sections,
          [sectionKey]: { ...(prev.sections[sectionKey] ?? {}), [fieldKey]: value },
        },
      };
    });
    setDirty(true);
  }

  async function save() {
    if (!definition || !validation) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("strategies")
        .update({
          definition: definition as never,
          scores: {
            completeness: validation.completeness,
            determinism: validation.determinism,
            ambiguity: validation.ambiguity,
            executionConfidence: validation.executionConfidence,
          } as never,
          status: validation.completeness === 100 && validation.determinism >= 90 ? "complete" : "draft",
        })
        .eq("id", id);
      if (error) throw error;
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["strategy", id] });
      toast.success("Specification saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function submitAnswers() {
    const all = questionsQuery.data ?? [];
    const changed = all
      .map((q) => ({ id: q.id, value: (answers[q.id] ?? q.answer ?? "").trim(), prev: q.answer ?? "" }))
      .filter((q) => q.value && q.value !== q.prev);
    if (changed.length === 0) {
      toast.error("Answer or change at least one question first.");
      return;
    }
    for (const { id: questionId, value } of changed) {
      await supabase.from("strategy_questions").update({ answer: value }).eq("id", questionId);
    }
    setAnswers({});
    await doExtract(true);
  }

  function exportMarkdown() {
    if (!definition || !strategy) return;
    const md = toMarkdown(definition, {
      name: strategy.name,
      sourceType: strategy.source_type,
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${strategy.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-spec.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove() {
    if (!confirm("Delete this strategy specification?")) return;
    await supabase.from("strategies").delete().eq("id", id);
    navigate({ to: "/" });
  }

  if (strategyQuery.isLoading || !definition || !validation) {
    return (
      <AppShell email={user?.email ?? null}>
        <Skeleton className="h-96 rounded-md" />
      </AppShell>
    );
  }

  const showExtracting =
    firstExtract ||
    (strategy?.status === "extracting" && !!strategy?.source_content?.trim() && !dirty);

  if (showExtracting) {
    return (
      <AppShell email={user?.email ?? null}>
        <ExtractingScreen name={strategy?.name ?? null} />
      </AppShell>
    );
  }

  const allQuestions = questionsQuery.data ?? [];
  const openQuestions = allQuestions.filter((q) => !q.answer);

  return (
    <AppShell email={user?.email ?? null}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{strategy?.name}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {strategy?.source_type} · {strategy?.status}
            {dirty ? " · unsaved changes" : ""}
          </p>
          {strategy?.source_url ? (
            <a
              href={strategy.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-primary underline-offset-4 hover:underline"
            >
              <LinkIcon className="size-3 shrink-0" />
              <span className="truncate">{strategy.source_url}</span>
            </a>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={extracting || !strategy?.source_content?.trim()}
            onClick={() => doExtract(false)}
          >
            {extracting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkle className="size-4" />
            )}
            Re-extract
          </Button>
          <Button size="sm" className="gap-1.5" disabled={saving || !dirty} onClick={save}>
            <Save className="size-4" />
            Save
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportMarkdown}>
            <Download className="size-4" />
            Markdown
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete strategy" onClick={remove}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {strategy?.status === "failed" && !extracting ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="size-4 text-destructive" />
          <p className="min-w-0 flex-1 text-sm">
            The last extraction failed, so this specification is still empty.
          </p>
          <Button size="sm" variant="outline" onClick={() => doExtract(false)}>
            Retry extraction
          </Button>
        </div>
      ) : null}



      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Tabs defaultValue="spec">
            <TabsList>
              <TabsTrigger value="spec">Specification</TabsTrigger>
              <TabsTrigger value="questions">
                Questions{openQuestions.length ? ` (${openQuestions.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="backtest">Backtest</TabsTrigger>
              <TabsTrigger value="source">Source</TabsTrigger>
            </TabsList>

            <TabsContent value="backtest" className="mt-4">
              {definition && user ? (
                <BacktestPanel strategyId={id} userId={user.id} definition={definition} />
              ) : null}
            </TabsContent>


            <TabsContent value="spec" className="mt-4 space-y-2">
              {SPEC_SECTIONS.map((section, i) => (
                <SectionCard
                  key={section.key}
                  section={section}
                  definition={definition}
                  onChange={updateField}
                  defaultOpen={i === 0}
                />
              ))}
            </TabsContent>

            <TabsContent value="questions" className="mt-4">
              {extracting ? (
                <p className="text-sm text-muted-foreground">Working…</p>
              ) : allQuestions.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-card p-8 text-center">
                  <p className="text-sm font-medium">No open questions</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The engine has nothing further to clarify. Review the validation panel for
                    remaining gaps.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {allQuestions.map((q) => {
                    const options = Array.isArray(q.options)
                      ? (q.options as { label?: string; answer?: string }[]).filter(
                          (o) => o && typeof o.answer === "string" && o.answer.trim(),
                        )
                      : [];
                    const value = answers[q.id] ?? q.answer ?? "";
                    const edited = !!q.answer && value.trim() !== q.answer;
                    return (
                      <div key={q.id} className="rounded-md border border-border bg-card p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                            {q.section}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                              edited
                                ? "bg-primary/10 text-primary"
                                : q.answer
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-destructive/10 text-destructive"
                            }`}
                          >
                            {edited ? "edited" : q.answer ? "answered" : "open"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium">{q.question}</p>
                        {q.explanation ? (
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            {q.explanation}
                          </p>
                        ) : null}
                        {options.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Suggested answers
                            </p>
                            {options.map((o, idx) => {
                              const selected = value.trim() === (o.answer ?? "").trim();
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() =>
                                    setAnswers((prev) => ({ ...prev, [q.id]: o.answer as string }))
                                  }
                                  className={`block w-full rounded-md border-2 p-3 text-left transition-colors ${
                                    selected
                                      ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                                      : "border-border bg-muted/40 hover:border-primary/60 hover:bg-primary/5"
                                  }`}
                                >
                                  {o.label ? (
                                    <span className="block text-xs font-semibold">{o.label}</span>
                                  ) : null}
                                  <span
                                    className={`mt-1 block font-mono text-[11px] leading-relaxed ${
                                      selected ? "text-foreground" : "text-muted-foreground"
                                    }`}
                                  >
                                    {o.answer}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                        <Textarea
                          rows={3}
                          className="mt-3"
                          placeholder="Answer precisely — numbers, operators, timeframes."
                          value={value}
                          onChange={(e) =>
                            setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                        />
                        {q.answer ? (
                          <div className="mt-2 flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!edited}
                              onClick={() =>
                                setAnswers((prev) => {
                                  const next = { ...prev };
                                  delete next[q.id];
                                  return next;
                                })
                              }
                            >
                              Revert
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  <Button onClick={submitAnswers} disabled={extracting} className="gap-1.5">
                    {extracting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkle className="size-4" />
                    )}
                    Apply answers and re-run
                  </Button>
                </div>
              )}
            </TabsContent>


            <TabsContent value="source" className="mt-4">
              <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card p-4 font-mono text-xs leading-relaxed">
                {strategy?.source_content?.trim() || "No source material provided."}
              </pre>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <ValidationPanel result={validation} />
          <AiReviewPanel definition={definition} />
        </aside>
      </div>
    </AppShell>
  );
}
