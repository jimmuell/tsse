import { CheckCircle2, ShieldAlert } from "lucide-react";
import { checkAuditability } from "@/lib/wit/auditability";
import type { StrategyDefinition } from "@/lib/strategy-schema";

export function AuditabilityPanel({ definition }: { definition: StrategyDefinition }) {
  const result = checkAuditability(definition);

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold">Can this be audited?</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Whether the engine can compile the specification as saved. Separate from the scores
          above, which measure how well the source was specified.
        </p>
      </div>

      {result.auditable ? (
        <p className="flex gap-2 text-xs leading-relaxed">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>This specification can be audited as written.</span>
        </p>
      ) : (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What stands in the way ({result.issues.length})
          </h3>
          <ul className="mt-2 space-y-2">
            {result.issues.map((issue) => (
              <li key={issue.field} className="flex gap-2 text-xs leading-relaxed">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <span>
                  <span className="font-medium">
                    {issue.sectionLabel} → {issue.fieldLabel}:{" "}
                  </span>
                  {issue.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        The run screen lets you override rules at run time, so a specification that does not
        compile as saved may still run with an override — this is not a prediction that a run
        will fail.
      </p>
    </div>
  );
}
