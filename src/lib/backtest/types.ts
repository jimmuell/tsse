export type Bar = {
  /** epoch ms */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type BacktestConfig = {
  capital: number;
  /** currency per unit traded, charged on entry and on exit */
  commission: number;
  /** price units added against you on every fill */
  slippage: number;
  /** fallback quantity when the sizing formula cannot be compiled */
  defaultQuantity: number;
  allowLong: boolean;
  allowShort: boolean;
};

export const DEFAULT_CONFIG: BacktestConfig = {
  capital: 100_000,
  commission: 0,
  slippage: 0,
  defaultQuantity: 1,
  allowLong: true,
  allowShort: true,
};

export type CompileIssue = {
  level: "blocker" | "warning";
  section: string;
  field: string;
  message: string;
};

export type TradeSide = "long" | "short";

export type Trade = {
  index: number;
  side: TradeSide;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  quantity: number;
  stopPrice: number | null;
  targetPrice: number | null;
  reason: "stop" | "target" | "rule" | "time" | "end of data";
  grossPnl: number;
  commission: number;
  pnl: number;
  barsHeld: number;
};

export type EquityPoint = { t: number; equity: number };

export type BacktestStats = {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  returnPct: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  longTrades: number;
  shortTrades: number;
  startAt: number | null;
  endAt: number | null;
};

export type BacktestResult = {
  trades: Trade[];
  equity: EquityPoint[];
  stats: BacktestStats;
};

/** Result of a run executed on the server against row-stored bars. */
export type ServerRunResult = BacktestResult & {
  datasetName: string;
  barsUsed: number;
  /** true when the requested range exceeded the per-run bar cap */
  barsTruncated: boolean;
  /** true when only the first slice of trades is returned */
  tradesTruncated: boolean;
  totalTrades: number;
  issues: CompileIssue[];
  rangeStart: number | null;
  rangeEnd: number | null;
};
