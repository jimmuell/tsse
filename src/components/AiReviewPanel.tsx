import { Badge } from "@/components/ui/badge";
import { AMBIGUITY_STATUS_LABELS, SPEC_SECTIONS, type StrategyDefinition } from "@/lib/strategy-schema";

const statusTone: Record<string, string> = {
  resolved: "border-success/40 text-success",
  needs_user_input: "border-warning/50 text-warning",
  unknown: "border-border text-muted-foreground",
  cannot_determine: "border-destructive/40 text-destructive",
};

export function AiReviewPanel({ definition }: { definition: StrategyDefinition }) {
  const sectionsWithConfidence = SPEC_SECTIONS.filter(
    (s) => typeof definition.confidence[s.key] === "number",
  );

  return (
    <div className="space-y-5 rounded-md border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold">AI review</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Interpretations the engine made, and what it could not determine.
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Assumptions ({definition.assumptions.length})
        </h3>
        {definition.assumptions.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">None recorded.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {definition.assumptions.map((a, i) => (
              <li key={i} className="rounded border border-border bg-secondary/50 p-2 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">"{a.term}"</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {Math.round(a.confidence)}%
                  </span>
                </div>
                <code className="mt-1 block break-words font-mono text-[11px] text-primary">
                  {a.interpretation}
                </code>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ambiguities ({definition.ambiguities.length})
        </h3>
        {definition.ambiguities.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">None recorded.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {definition.ambiguities.map((a, i) => (
              <li key={i} className="space-y-1 text-xs">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className={statusTone[a.status]}>
                    {AMBIGUITY_STATUS_LABELS[a.status]}
                  </Badge>
                  <span className="flex-1">{a.item}</span>
                </div>
                {a.note ? <p className="pl-1 text-muted-foreground">{a.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {sectionsWithConfidence.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Section confidence
          </h3>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {sectionsWithConfidence.map((s) => (
              <li key={s.key} className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">{s.title}</span>
                <span className="font-mono tabular-nums">
                  {Math.round(definition.confidence[s.key] ?? 0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
