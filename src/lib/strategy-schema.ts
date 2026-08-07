export type RuleKind = "condition" | "quantity";

export type SpecField = {
  key: string;
  label: string;
  required?: boolean;
  /** Field holds an executable rule expression and is graded for determinism.
   *  "condition" — a Boolean test, graded on comparison/Boolean operators.
   *  "quantity"  — a number, multiple or clock time, graded as a definite quantity.
   *  Truthy either way, so every existing `field.rule` consumer keeps working. */
  rule?: RuleKind;
  multiline?: boolean;
  /** Human-facing help text shown in the form. NEVER sent to the extraction model. */
  hint?: string;
  /** Optional guidance sent to the extraction model only. Omit unless it genuinely
   *  helps a model read the source material. */
  extractionHint?: string;
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
  { value: "video", label: "Video link (YouTube)" },
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
      { key: "strategy_name", label: "Strategy name", required: true, hint: "A short name you will recognise later. Not read by the audit." },
      { key: "author", label: "Author", hint: "Who wrote the strategy. Free text; not read by the audit." },
      { key: "source", label: "Source", hint: "Where it came from — video link, book, forum. Free text." },
      { key: "version", label: "Version", hint: "Your own label, e.g. v1.2. Free text; not read by the audit." },
      { key: "description", label: "Description", multiline: true, required: true, hint: "Plain-English summary of the idea. Free text; not read by the audit." },
      { key: "confidence", label: "Confidence", hint: "0-100", extractionHint: "0-100" },
    ],
  },
  {
    key: "market",
    index: 2,
    title: "Market",
    description: "Where the strategy is traded.",
    fields: [
      { key: "markets", label: "Markets", required: true, hint: "e.g. US equity index futures. Audit always runs the chosen data set." },
      { key: "exchange", label: "Exchange", hint: "e.g. CME. Free text; not read by the audit." },
      { key: "symbols", label: "Symbols", hint: "e.g. ES, MES. Audit uses the data set you pick on the run screen." },
      { key: "asset_class", label: "Asset class", hint: "e.g. Futures / Equities / FX. Free text." },
    ],
  },
  {
    key: "chart",
    index: 3,
    title: "Chart",
    description: "Data resolution and session context.",
    fields: [
      { key: "timeframe", label: "Timeframe", required: true, hint: "Must be 1m or 5m — anything else blocks the run." },
      { key: "session", label: "Session", hint: "e.g. Regular hours 09:30-16:00. Audit bakes the RTH session." },
      { key: "timezone", label: "Timezone", hint: "e.g. America/New_York. Audit always runs New York time." },
      { key: "data_requirements", label: "Data requirements", multiline: true, hint: "Any extra history or feeds needed. Free text." },
    ],
  },
  {
    key: "setup",
    index: 4,
    title: "Setup",
    description: "Conditions that create a potential trade.",
    fields: [
      { key: "setup_type", label: "Setup type", required: true, hint: "e.g. Opening-range break of the value area." },
      { key: "setup_conditions", label: "Setup conditions", rule: "condition", multiline: true, required: true, hint: "One condition per line, e.g. close > vah. Lines are ANDed." },
      {
        key: "value_area_pct",
        label: "Value area %",
        hint: "e.g. 70 — the % of volume the value area covers",
        extractionHint: "e.g. 70 — the % of volume the value area covers",
      },
    ],
  },
  {
    key: "bias",
    index: 5,
    title: "Market bias",
    description: "How long versus short is determined.",
    fields: [
      { key: "bias_method", label: "Bias method", required: true, hint: "e.g. Break above VAH is long, below VAL is short." },
      { key: "long_condition", label: "Long condition", rule: "condition", multiline: true, hint: "Comparison expression, e.g. close > vah. One per line." },
      { key: "short_condition", label: "Short condition", rule: "condition", multiline: true, hint: "Comparison expression, e.g. close < val. One per line." },
    ],
  },
  {
    key: "entry",
    index: 6,
    title: "Entry rules",
    description: "Exact Boolean trigger for entering a position.",
    fields: [
      { key: "long_entry", label: "Long entry expression", rule: "condition", multiline: true, required: true, hint: "Must compare bar close to a level, e.g. close > vah." },
      { key: "short_entry", label: "Short entry expression", rule: "condition", multiline: true, hint: "Mirror of the long, e.g. close < val." },
      { key: "entry_notes", label: "Notes", multiline: true, hint: "Anything the expression cannot say. Free text; not run." },
    ],
  },
  {
    key: "execution",
    index: 7,
    title: "Order execution",
    description: "Order type and placement mechanics.",
    fields: [
      { key: "order_type", label: "Order type", required: true, hint: "Market / Limit / Stop / Stop limit", extractionHint: "Market / Limit / Stop / Stop limit" },
      { key: "order_placement", label: "Placement detail", multiline: true, hint: "How the order is worked. Free text; audit fills on bar close." },
      { key: "slippage_assumption", label: "Slippage assumption", hint: "Note your assumption; the run screen sets the real slippage." },
    ],
  },
  {
    key: "stop_loss",
    index: 8,
    title: "Stop loss",
    description: "Where the initial risk is defined.",
    fields: [
      { key: "stop_method", label: "Stop method", required: true, hint: "ATR / Ticks / Swing / Indicator / Percentage / Custom", extractionHint: "ATR / Ticks / Swing / Indicator / Percentage / Custom" },
      { key: "stop_formula", label: "Stop formula", rule: "quantity", multiline: true, required: true, hint: "A whole number of ticks, e.g. 8. Indicator formulas block the run." },
    ],
  },
  {
    key: "profit_target",
    index: 9,
    title: "Profit target",
    description: "Where profit is taken.",
    fields: [
      { key: "target_method", label: "Target method", required: true, hint: "R-multiple / Fixed ticks / Level / Trailing." },
      { key: "target_formula", label: "Target formula", rule: "quantity", multiline: true, required: true, hint: "A risk multiple like 2 * risk, or a plain number of ticks." },
    ],
  },
  {
    key: "position_sizing",
    index: 10,
    title: "Position sizing",
    description: "How quantity is determined.",
    fields: [
      // Not required: the audit engine sizes every trade at a fixed 1 contract and never
      // reads this field, so an empty method cannot change a result.
      { key: "sizing_method", label: "Sizing method", hint: "Audit always uses a fixed 1 contract, so this changes nothing." },
      // Not required: the audit engine sizes every trade at a fixed 1 contract and never
      // reads this field, so an empty formula cannot change a result.
      { key: "sizing_formula", label: "Sizing formula", rule: "quantity", multiline: true, hint: "Audit always uses a fixed 1 contract, so this changes nothing." },
      { key: "max_position", label: "Maximum position size", hint: "Your own cap; the audit never holds more than 1 contract." },
    ],
  },
  {
    key: "trade_management",
    index: 11,
    title: "Trade management",
    description: "Adjustments made while a trade is open.",
    fields: [
      { key: "break_even", label: "Break-even rule", rule: "condition", multiline: true, hint: "e.g. move stop to entry after 1 * risk. Not applied by the audit." },
      { key: "trailing_stop", label: "Trailing stop rule", rule: "condition", multiline: true, hint: "e.g. trail 8 ticks behind close. Not applied by the audit." },
      { key: "scaling", label: "Scale in / scale out rules", rule: "condition", multiline: true, hint: "e.g. exit half at 1R. Not applied — the audit trades 1 contract." },
    ],
  },
  {
    key: "exit",
    index: 12,
    title: "Exit rules",
    description: "Every way a position can be closed.",
    fields: [
      { key: "exit_conditions", label: "Exit conditions", rule: "condition", multiline: true, required: true, hint: "Every way the trade closes: stop, target, time. One per line." },
      { key: "time_exit", label: "Time-based exit", rule: "quantity", hint: "A clock time, e.g. 15:55 — the audit flattens at the last session bar." },
      { key: "manual_exit", label: "Discretionary exit handling", multiline: true, hint: "How you would handle judgement exits. Free text; not run." },
    ],
  },

  {
    key: "filters",
    index: 13,
    title: "Filters",
    description: "Conditions that block otherwise valid trades.",
    fields: [
      { key: "volatility_filter", label: "Volatility / ATR filter", rule: "condition", multiline: true, hint: "e.g. atr(14) > 4. Not applied by the audit engine." },
      { key: "volume_filter", label: "Volume filter", rule: "condition", hint: "e.g. volume > 1000. Not applied by the audit engine." },
      { key: "news_filter", label: "News / economic event filter", multiline: true, hint: "Events you would stand aside for. Free text; not run." },
      { key: "calendar_filter", label: "Day of week / holiday filter", hint: "e.g. skip Mondays and half-days. Free text; not run." },
      { key: "regime_filter", label: "Market regime filter", rule: "condition", multiline: true, hint: "e.g. close > sma(close, 200). Not applied by the audit engine." },
    ],
  },
  {
    key: "constraints",
    index: 14,
    title: "Trade constraints",
    description: "Hard operational limits.",
    fields: [
      { key: "max_trades", label: "Maximum trades", hint: "Per day, e.g. 1. The audit takes at most one trade a day." },
      { key: "daily_loss_limit", label: "Daily loss limit", hint: "Dollar stop for the day, e.g. 500. Not applied by the audit." },
      { key: "daily_profit_limit", label: "Daily profit limit", hint: "Dollar goal for the day, e.g. 1000. Not applied by the audit." },
      { key: "trading_hours", label: "Trading hours", required: true, hint: "e.g. 09:45-10:55 ET. The audit bakes its own entry window." },
      { key: "overnight", label: "Overnight positions allowed", hint: "Yes or No. The audit always flattens before the close." },
      { key: "cooldown", label: "Cooldown period", hint: "Wait after a trade, e.g. 30 minutes. Not applied by the audit." },
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
