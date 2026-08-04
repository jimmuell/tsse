import { compileStrategy } from "./backtest/compile";
import { applyOverrides, type RuleOverrides } from "./backtest/rules";
import type { BacktestConfig } from "./backtest/types";
import type { StrategyDefinition } from "./strategy-schema";

/** Version of the 17-section spec shape we send to the engine and to the WIT lab. */
export const SPEC_VERSION = "tsse-spec-1";

export type EngineJobRequest = {
  jobId: string;
  callbackUrl: string;
  specVersion: string;
  symbol: string;
  timeframe: string;
  from: string | null;
  to: string | null;
  config: BacktestConfig;
  strategy: {
    id: string;
    name: string;
    /** Executable rules compiled from the spec — the shared definition both sides read. */
    rules: Record<string, string>;
    /** Full 17-section spec, for engines that want more context than the rules. */
    definition: StrategyDefinition;
  };
};

export type EngineSubmitOutcome = {
  accepted: boolean;
  engineVersion: string | null;
  message: string | null;
};

function requireEngineConfig(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env["BACKTEST_ENGINE_URL"];
  const apiKey = process.env["BACKTEST_ENGINE_API_KEY"];
  if (!baseUrl || !apiKey) {
    throw new Error(
      "The backtest engine is not configured yet. Add the engine URL and API key in project settings.",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

/** Rules the engine executes, derived from the spec plus any user overrides. */
export function compiledRules(
  definition: StrategyDefinition,
  overrides: RuleOverrides,
): { rules: Record<string, string>; blockers: string[] } {
  const merged = applyOverrides(definition, overrides);
  const compiled = compileStrategy(merged);
  const rules: Record<string, string> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "string" && value.trim()) rules[key.split(":").pop() as string] = value.trim();
  }
  return {
    rules,
    blockers: compiled.issues
      .filter((i) => i.level === "blocker")
      .map((i) => `${i.field} — ${i.message}`),
  };
}

/** Hands a job to the engine. The engine acknowledges fast and calls us back when done. */
export async function submitToEngine(request: EngineJobRequest): Promise<EngineSubmitOutcome> {
  const { baseUrl, apiKey } = requireEngineConfig();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/backtests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(request),
    });
  } catch (error) {
    throw new Error(
      `Could not reach the backtest engine: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();
  let parsed: { engineVersion?: string; version?: string; message?: string; error?: string } = {};
  try {
    parsed = text ? (JSON.parse(text) as typeof parsed) : {};
  } catch {
    /* engine returned a non-JSON body */
  }

  if (!response.ok) {
    throw new Error(
      parsed.error ?? parsed.message ?? `The engine rejected the job (HTTP ${response.status}).`,
    );
  }

  return {
    accepted: true,
    engineVersion: parsed.engineVersion ?? parsed.version ?? null,
    message: parsed.message ?? null,
  };
}
