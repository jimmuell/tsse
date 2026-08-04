-- WIT-SEAM-02: correlate backtest_jobs with the engine's own run id so the callback
-- (and, later, a poll fallback) can look a job up by what the engine sends back.
ALTER TABLE public.backtest_jobs
  ADD COLUMN IF NOT EXISTS engine_run_id text;

CREATE INDEX IF NOT EXISTS backtest_jobs_engine_run_id_idx
  ON public.backtest_jobs (engine_run_id);

-- backtest_jobs.status has no CHECK constraint (free text), so the WIT-vocabulary values
-- written by the callback ("running", "done", "failed") already fit without a widen step.
