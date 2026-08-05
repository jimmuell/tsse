DROP POLICY IF EXISTS "Users manage their own datasets" ON public.datasets;
DROP POLICY IF EXISTS "Users manage bars of their own datasets" ON public.dataset_bars;

CREATE POLICY "Signed-in users can read the data set catalog"
  ON public.datasets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert data sets"
  ON public.datasets FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update data sets"
  ON public.datasets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete data sets"
  ON public.datasets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Signed-in users can read data set bars"
  ON public.dataset_bars FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert data set bars"
  ON public.dataset_bars FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update data set bars"
  ON public.dataset_bars FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete data set bars"
  ON public.dataset_bars FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.datasets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dataset_bars TO authenticated;
GRANT ALL ON public.datasets TO service_role;
GRANT ALL ON public.dataset_bars TO service_role;