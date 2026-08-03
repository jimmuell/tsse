import { AlertTriangle, CircleAlert, Lightbulb } from "lucide-react";
import { ScoreBar } from "@/components/ScoreBar";
import type { ValidationResult } from "@/lib/validation";

export function ValidationPanel({ result }: { result: ValidationResult }) {
  const errors = result.issues.filter((i) => i.level === "error");
  const warnings = result.issues.filter((i) => i.level === "warning");
  const suggestions = result.issues.filter((i) => i.level === "suggestion");

  return (
    <div className="space-y-5 rounded-md border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold">Validation</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Scores are computed from the specification, not from the model.
        </p>
      </div>

      <div className="space-y-3">
        <ScoreBar label="Completeness" value={result.completeness} />
        <ScoreBar label="Determinism" value={result.determinism} />
        <ScoreBar label="Ambiguity resolution" value={result.ambiguity} />
        <ScoreBar label="Execution confidence" value={result.executionConfidence} />
      </div>

      {result.missing.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Missing required fields
          </h3>
          <ul className="mt-2 space-y-1 text-xs">
            {result.missing.map((m) => (
              <li key={`${m.section}-${m.field}`} className="font-mono text-muted-foreground">
                {m.section} → {m.field}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <IssueGroup
        title="Errors"
        icon={<CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />}
        issues={errors}
      />
      <IssueGroup
        title="Warnings"
        icon={<AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />}
        issues={warnings}
      />
      <IssueGroup
        title="Suggestions"
        icon={<Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" />}
        issues={suggestions}
      />
    </div>
  );
}

function IssueGroup({
  title,
  icon,
  issues,
}: {
  title: string;
  icon: React.ReactNode;
  issues: ValidationResult["issues"];
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({issues.length})
      </h3>
      {issues.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">None.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {issues.map((issue, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed">
              {icon}
              <span>
                <span className="font-medium">{issue.section}: </span>
                {issue.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
