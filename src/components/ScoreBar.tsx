export function ScoreBar({ label, value }: { label: string; value: number }) {
  const toneClass =
    value >= 80
      ? "bg-success"
      : value >= 50
        ? "bg-warning"
        : value > 0
          ? "bg-destructive"
          : "bg-muted-foreground/40";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="font-mono text-xs font-semibold tabular-nums">{value}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all ${toneClass}`}
          style={{ width: `${Math.max(2, value)}%` }}
        />
      </div>
    </div>
  );
}
