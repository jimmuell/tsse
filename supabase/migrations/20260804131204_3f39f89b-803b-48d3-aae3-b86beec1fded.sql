CREATE TABLE public.backtest_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_id uuid NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'engine',
  symbol text NOT NULL DEFAULT '',
  timeframe text NOT NULL DEFAULT '',
  range_from timestamptz,
  range_to timestamptz,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  engine_version text,
  spec_version text,
  error text,
  run_id uuid REFERENCES public.backtest_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backtest_jobs TO authenticated;
GRANT ALL ON public.backtest_jobs TO service_role;

ALTER TABLE public.backtest_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own backtest jobs"
ON public.backtest_jobs FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX backtest_jobs_user_created_idx ON public.backtest_jobs (user_id, created_at DESC);
CREATE INDEX backtest_jobs_strategy_idx ON public.backtest_jobs (strategy_id, created_at DESC);

CREATE TRIGGER backtest_jobs_touch
BEFORE UPDATE ON public.backtest_jobs
FOR EACH ROW EXECUTE FUNCTION public.tsse_touch_updated_at();

ALTER TABLE public.backtest_jobs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.backtest_jobs;