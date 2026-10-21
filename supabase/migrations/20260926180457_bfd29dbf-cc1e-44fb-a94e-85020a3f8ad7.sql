CREATE TABLE public.ui_translations (
  lang text NOT NULL,
  source text NOT NULL,
  translated text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lang, source)
);
GRANT SELECT ON public.ui_translations TO anon, authenticated;
GRANT ALL ON public.ui_translations TO service_role;
ALTER TABLE public.ui_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read interface translations" ON public.ui_translations FOR SELECT TO anon, authenticated USING (true);