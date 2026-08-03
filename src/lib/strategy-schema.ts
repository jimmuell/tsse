export type SpecField = {
  key: string;
  label: string;
  required?: boolean;
  /** Field holds an executable rule expression and is graded for determinism. */
  rule?: boolean;
  multiline?: boolean;
  hint?: string;
};

export type SpecSection = {
  key: string;
  index: number;
  title: string;
  description: string;
  fields: SpecField[];
};

export const AMBIGUITY_STATUSES = [
  "resolved",
  "needs_user_input",
  "unknown",
  "cannot_determine",
] as const;
export type AmbiguityStatus = (typeof AMBIGUITY_STATUSES)[number];

export const AMBIGUITY_STATUS_LABELS: Record<AmbiguityStatus, string> = {
  resolved: "Resolved",
  needs_user_input: "Needs user input",
  unknown: "Unknown",
  cannot_determine: "Cannot determine",
};

export type Assumption = {
  term: string;
  interpretation: string;
  confidence: number;
};

export type Ambiguity = {
  item: string;
  status: AmbiguityStatus;
  note: string;
};

export type StrategyDefinition = {
  sections: Record<string, Record<string, string>>;
  assumptions: Assumption[];
  ambiguities: Ambiguity[];
  confidence: Record<string, number>;
  warnings: string[];
};

export const SOURCE_TYPES = [
  { value: "manual", label: "Manual description" },
  { value: "transcript", label: "Pasted transcript" },
  { value: "article", label: "Pasted article / blog text" },
  { value: "pine", label: "Pine Script" },
  { value: "easylanguage", label: "EasyLanguage" },
  { value: "python", label: "Python" },
  { value: "ninjascript", label: "NinjaScript" },
] as const;

export const SPEC_SECTIONS: SpecSection[] = [
  {
    key: "metadata",
    index: 1,
    title: "Metadata",
    description: "Identity and provenance of the strategy.",
    fields: [
      { key: "strategy_name", label: "Strategy name", required: true },
      { key: "author", label: "Author" },
      { key: "source", label: "Source" },
      { key: "version", label: "Version" },
      { key: "description", label: "Description", multiline: true, required: true },
      { key: "confidence", label: "Confidence", hint: "0-100" },
    ],
  },
  {
    key: "market",
    index: 2,
    title: "Market",
    description: "Where the strategy is traded.",
    fields: [
      { key: "markets", label: "Markets", required: true },
      { key: "exchange", label: "Exchange" },
      { key: "symbols", label: "Symbols" },
      { key: "asset_class", label: "Asset class" },
    ],
  },
  {
    key: "chart",
    index: 3,
    title: "Chart",
    description: "Data resolution and session context.",
    fields: [
      { key: "timeframe", label: "Timeframe", required: true },
      { key: "session", label: "Session" },
      { key: "timezone", label: "Timezone" },
      { key: "data_requirements", label: "Data requirements", multiline: true },
    ],
  },
  {
    key: "setup",
    index: 4,
    title: "Setup",
    description: "Conditions that create a potential trade.",
    fields: [
      { key: "setup_type", label: "Setup type", required: true },
      { key: "setup_conditions", label: "Setup conditions", rule: true, multiline: true, required: true },
    ],
  },
  {
    key: "bias",
    index: 5,
    title: "Market bias",
    description: "How long versus short is determined.",
    fields: [
      { key: "bias_method", label: "Bias method", required: true },
      { key: "long_condition", label: "Long condition", rule: true, multiline: true },
      { key: "short_condition", label: "Short condition", rule: true, multiline: true },
    ],
  },
  {
    key: "entry",
    index: 6,
    title: "Entry rules",
    description: "Exact Boolean trigger for entering a position.",
    fields: [
      { key: "long_entry", label: "Long entry expression", rule: true, multiline: true, required: true },
      { key: "short_entry", label: "Short entry expression", rule: true, multiline: true },
      { key: "entry_notes", label: "Notes", multiline: true },
    ],
  },
  {
    key: "execution",
    index: 7,
    title: "Order execution",
    description: "Order type and placement mechanics.",
    fields: [
      { key: "order_type", label: "Order type", required: true, hint: "Market / Limit / Stop / Stop limit" },
      { key: "order_placement", label: "Placement detail", multiline: true },
      { key: "slippage_assumption", label: "Slippage assumption" },
    ],
  },
  {
    key: "stop_loss",
    index: 8,
    title: "Stop loss",
    description: "Where the initial risk is defined.",
    fields: [
      { key: "stop_method", label: "Stop method", required: true, hint: "ATR / Ticks / Swing / Indicator / Percentage / Custom" },
      { key: "stop_formula", label: "Stop formula", rule: true, multiline: true, required: true },
    ],
  },
  {
    key: "profit_target",
    index: 9,
    title: "Profit target",
    description: "Where profit is taken.",
    fields: [
      { key: "target_method", label: "Target method", required: true },
      { key: "target_formula", label: "Target formula", rule: true, multiline: true, required: true },
    ],
  },
  {
    key: "position_sizing",
    index: 10,
    title: "Position sizing",
    description: "How quantity is determined.",
    fields: [
      { key: "sizing_method", label: "Sizing method", required: true },
      { key: "sizing_formula", label: "Sizing formula", rule: true, multiline: true, required: true },
      { key: "max_position", label: "Maximum position size" },
    ],
  },
  {
    key: "trade_management",
    index: 11,
    title: "Trade management",
    description: "Adjustments made while a trade is open.",
    fields: [
      { key: "break_even", label: "Break-even rule", rule: true, multiline: true },
      { key: "trailing_stop", label: "Trailing stop rule", rule: true, multiline: true },
      { key: "scaling", label: "Scale in / scale out rules", rule: true, multiline: true },
    ],
  },
  {
    key: "exit",
    index: 12,
    title: "Exit rules",
    description: "Every way a position can be closed.",
    fields: [
      { key: "exit_conditions", label: "Exit conditions", rule: true, multiline: true, required: true },
      { key: "time_exit", label: "Time-based exit", rule: true },
      { key: "manual_exit", label: "Discretionary exit handling", multiline: true },
    ],
  },
  {
    key: "filters",
    index: 13,
    title: "Filters",
    description: "Conditions that block otherwise valid trades.",
    fields: [
      { key: "volatility_filter", label: "Volatility / ATR filter", rule: true, multiline: true },
      { key: "volume_filter", label: "Volume filter", rule: true },
      { key: "news_filter", label: "News / economic event filter", multiline: true },
      { key: "calendar_filter", label: "Day of week / holiday filter" },
      { key: "regime_filter", label: "Market regime filter", rule: true, multiline: true },
    ],
  },
  {
    key: "constraints",
    index: 14,
    title: "Trade constraints",
    description: "Hard operational limits.",
    fields: [
      { key: "max_trades", label: "Maximum trades" },
      { key: "daily_loss_limit", label: "Daily loss limit" },
      { key: "daily_profit_limit", label: "Daily profit limit" },
      { key: "trading_hours", label: "Trading hours", required: true },
      { key: "overnight", label: "Overnight positions allowed" },
      { key: "cooldown", label: "Cooldown period" },
    ],
  },
];

export const SECTION_BY_KEY = new Map(SPEC_SECTIONS.map((s) => [s.key, s]));

export const REQUIRED_FIELDS = SPEC_SECTIONS.flatMap((section) =>
  section.fields.filter((f) => f.required).map((f) => ({ section, field: f })),
);

export const RULE_FIELDS = SPEC_SECTIONS.flatMap((section) =>
  section.fields.filter((f) => f.rule).map((f) => ({ section, field: f })),
);

export function emptyDefinition(): StrategyDefinition {
  const sections: Record<string, Record<string, string>> = {};
  for (const section of SPEC_SECTIONS) {
    const bucket: Record<string, string> = {};
    for (const field of section.fields) bucket[field.key] = "";
    sections[section.key] = bucket;
  }
  return { sections, assumptions: [], ambiguities: [], confidence: {}, warnings: [] };
}

export function normalizeDefinition(raw: unknown): StrategyDefinition {
  const base = emptyDefinition();
  if (!raw || typeof raw !== "object") return base;
  const input = raw as Partial<StrategyDefinition>;
  if (input.sections && typeof input.sections === "object") {
    for (const section of SPEC_SECTIONS) {
      const incoming = (input.sections as Record<string, unknown>)[section.key];
      if (!incoming || typeof incoming !== "object") continue;
      const bucket = base.sections[section.key];
      if (!bucket) continue;
      for (const field of section.fields) {
        const value = (incoming as Record<string, unknown>)[field.key];
        if (typeof value === "string") bucket[field.key] = value;
      }
    }
  }
  base.assumptions = Array.isArray(input.assumptions)
    ? input.assumptions
        .filter((a) => a && typeof a === "object")
        .map((a) => ({
          term: String(a.term ?? ""),
          interpretation: String(a.interpretation ?? ""),
          confidence: Number(a.confidence ?? 0) || 0,
        }))
    : [];
  base.ambiguities = Array.isArray(input.ambiguities)
    ? input.ambiguities
        .filter((a) => a && typeof a === "object")
        .map((a) => ({
          item: String(a.item ?? ""),
          status: (AMBIGUITY_STATUSES as readonly string[]).includes(String(a.status))
            ? (a.status as AmbiguityStatus)
            : "unknown",
          note: String(a.note ?? ""),
        }))
    : [];
  base.confidence =
    input.confidence && typeof input.confidence === "object"
      ? Object.fromEntries(
          Object.entries(input.confidence as Record<string, unknown>).map(([k, v]) => [
            k,
            Number(v) || 0,
          ]),
        )
      : {};
  base.warnings = Array.isArray(input.warnings) ? input.warnings.map(String) : [];
  return base;
}
