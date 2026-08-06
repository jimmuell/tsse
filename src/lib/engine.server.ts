import type { WireStrategyConfig } from "./wit/wire-config";

export type EngineJobRequest = {
  evaluation_id: string;
  kind: "backtest";
  callback_url: string;
  config: WireStrategyConfig;
  budget: { max_wall_seconds: number };
};

export type EngineSubmitOutcome = {
  runId: string;
  status: string;
};

function requireEngineConfig(): { baseUrl: string; serviceKey: string } {
  const baseUrl = process.env["ENGINE_URL"];
  const serviceKey = process.env["WIT_ENGINE_SERVICE_KEY"];
  if (!baseUrl || !serviceKey) {
    throw new Error(
      "The backtest engine is not configured yet. Add the engine URL and service key in project settings.",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), serviceKey };
}

type WitErrorBody = { error?: { code?: string; message?: string; detail?: unknown } };
type WitAckBody = { run_id?: string; status?: string };

/** Hands a job to the WIT door. The engine acknowledges 202 and calls callback_url when done. */
export async function submitToEngine(request: EngineJobRequest): Promise<EngineSubmitOutcome> {
  const { baseUrl, serviceKey } = requireEngineConfig();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/wit/v1/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(request),
    });
  } catch (error) {
    throw new Error(
      `Could not reach the backtest engine: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();

  if (!response.ok) {
    let parsed: WitErrorBody = {};
    try {
      parsed = text ? (JSON.parse(text) as WitErrorBody) : {};
    } catch {
      /* engine returned a non-JSON error body */
    }
    throw new Error(
      parsed.error?.message ?? `The engine rejected the job (HTTP ${response.status}).`,
    );
  }

  let parsed: WitAckBody = {};
  try {
    parsed = text ? (JSON.parse(text) as WitAckBody) : {};
  } catch {
    throw new Error("The engine accepted the job but returned a non-JSON body.");
  }
  if (!parsed.run_id) {
    throw new Error("The engine accepted the job but did not return a run_id.");
  }

  return { runId: parsed.run_id, status: parsed.status ?? "queued" };
}

export type EngineDataset = {
  id: string;
  label: string;
  description: string;
  symbol: string;
  point_value: number;
  tick_size: number;
  economics_supported: boolean;
  date_range: { start: string; end: string };
};

/** Reads the engine's own dataset catalog. The engine is the single source of truth —
 *  the app never hand-types or caches a dataset list. */
export async function listEngineDatasets(): Promise<EngineDataset[]> {
  const { baseUrl, serviceKey } = requireEngineConfig();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/wit/v1/datasets`, {
      method: "GET",
      headers: { authorization: `Bearer ${serviceKey}` },
    });
  } catch (error) {
    throw new Error(
      `Could not reach the backtest engine: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();

  if (!response.ok) {
    let parsed: WitErrorBody = {};
    try {
      parsed = text ? (JSON.parse(text) as WitErrorBody) : {};
    } catch {
      /* engine returned a non-JSON error body */
    }
    throw new Error(
      parsed.error?.message ?? `The engine could not list data sets (HTTP ${response.status}).`,
    );
  }

  let parsed: { datasets?: EngineDataset[] } = {};
  try {
    parsed = text ? (JSON.parse(text) as { datasets?: EngineDataset[] }) : {};
  } catch {
    throw new Error("The engine returned a non-JSON data set list.");
  }
  return parsed.datasets ?? [];
}
