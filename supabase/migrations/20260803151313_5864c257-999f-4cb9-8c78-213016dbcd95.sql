ALTER TABLE public.strategy_questions
  ADD COLUMN IF NOT EXISTS explanation text,
  ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '[]'::jsonb;