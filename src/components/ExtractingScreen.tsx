import { useEffect, useState } from "react";
import { Check, Loader2, Sparkle } from "lucide-react";

const STEPS = [
  "Reading source material",
  "Identifying strategy structure",
  "Drafting the 17 specification sections",
  "Scoring determinism and ambiguity",
  "Preparing clarifying questions",
];

export function ExtractingScreen({ name }: { name?: string | null }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
    }, 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="relative flex size-16 items-center justify-center rounded-full bg-primary/10">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
        <Sparkle className="size-7 animate-pulse text-primary" />
      </span>

      <h1 className="mt-6 text-xl font-semibold tracking-tight">Extracting specification</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {name ? `Analysing “${name}”. ` : ""}This usually takes under a minute.
      </p>

      <ul className="mt-8 w-full space-y-3 text-left">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-3 text-sm transition-opacity ${
              i <= step ? "opacity-100" : "opacity-40"
            }`}
          >
            {i < step ? (
              <Check className="size-4 shrink-0 text-primary" />
            ) : i === step ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
            ) : (
              <span className="size-4 shrink-0 rounded-full border border-border" />
            )}
            <span className={i === step ? "font-medium" : "text-muted-foreground"}>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
