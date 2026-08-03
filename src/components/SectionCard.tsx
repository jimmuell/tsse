import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { findSubjectiveTerms } from "@/lib/validation";
import type { SpecSection, StrategyDefinition } from "@/lib/strategy-schema";

export function SectionCard({
  section,
  definition,
  onChange,
  defaultOpen,
}: {
  section: SpecSection;
  definition: StrategyDefinition;
  onChange: (sectionKey: string, fieldKey: string, value: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const values = definition.sections[section.key] ?? {};
  const filled = section.fields.filter((f) => (values[f.key] ?? "").trim()).length;
  const missingRequired = section.fields.some(
    (f) => f.required && !(values[f.key] ?? "").trim(),
  );
  const confidence = definition.confidence[section.key];

  return (
    <section className="rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {String(section.index).padStart(2, "0")}
        </span>
        <span className="font-semibold">{section.title}</span>
        {missingRequired ? (
          <Badge variant="outline" className="border-destructive/40 text-destructive">
            incomplete
          </Badge>
        ) : null}
        {typeof confidence === "number" && confidence > 0 ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            conf {Math.round(confidence)}%
          </span>
        ) : null}
        <span className="flex-1" />
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {filled}/{section.fields.length}
        </span>
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <p className="text-xs text-muted-foreground">{section.description}</p>
          {section.fields.map((field) => {
            const value = values[field.key] ?? "";
            const subjective = field.rule ? findSubjectiveTerms(value) : [];
            return (
              <div key={field.key} className="space-y-1.5">
                <label
                  className="flex items-center gap-2 text-xs font-medium"
                  htmlFor={`${section.key}-${field.key}`}
                >
                  {field.label}
                  {field.required ? <span className="text-destructive">*</span> : null}
                  {field.rule ? (
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      expression
                    </span>
                  ) : null}
                  {field.hint ? (
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {field.hint}
                    </span>
                  ) : null}
                </label>
                {field.multiline ? (
                  <Textarea
                    id={`${section.key}-${field.key}`}
                    value={value}
                    rows={field.rule ? 3 : 2}
                    className={cn(field.rule && "font-mono text-xs")}
                    onChange={(e) => onChange(section.key, field.key, e.target.value)}
                  />
                ) : (
                  <Input
                    id={`${section.key}-${field.key}`}
                    value={value}
                    className={cn(field.rule && "font-mono text-xs")}
                    onChange={(e) => onChange(section.key, field.key, e.target.value)}
                  />
                )}
                {subjective.length > 0 ? (
                  <p className="text-[11px] text-destructive">
                    Subjective language: {subjective.join(", ")} — replace with an expression.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
