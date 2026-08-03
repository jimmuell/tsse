CREATE TABLE public.dataset_bars (
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  t bigint NOT NULL,
  o double precision NOT NULL,
  h double precision NOT NULL,
  l double precision NOT NULL,
  c double precision NOT NULL,
  v double precision NOT NULL DEFAULT 0,
  PRIMARY KEY (dataset_id, t)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dataset_bars TO authenticated;
GRANT ALL ON public.dataset_bars TO service_role;

ALTER TABLE public.dataset_bars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage bars of their own datasets"
ON public.dataset_bars
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = dataset_id AND d.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = dataset_id AND d.user_id = auth.uid()));

ALTER TABLE public.datasets ADD COLUMN storage text NOT NULL DEFAULT 'inline';