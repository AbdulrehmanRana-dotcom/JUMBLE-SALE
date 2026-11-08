-- ==============================================================================
-- ATTRIBUTED ORDERS (SHOPPING TRACKING)
-- Track user purchases made after viewing brand posts/deals in Jumble Sale
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.attributed_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  brand_name VARCHAR(150),
  deal_title VARCHAR(255),
  order_reference VARCHAR(100),
  order_amount NUMERIC(12,2) DEFAULT 0,
  savings_amount NUMERIC(12,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'PKR',
  receipt_image_url TEXT,
  status VARCHAR(30) DEFAULT 'confirmed',
  attribution_method VARCHAR(30) DEFAULT 'in_app_webview',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_attr_orders_user ON public.attributed_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_attr_orders_brand ON public.attributed_orders (brand_id);
CREATE INDEX IF NOT EXISTS idx_attr_orders_deal ON public.attributed_orders (deal_id);

-- RLS
ALTER TABLE public.attributed_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Attributed orders read own or brand" ON public.attributed_orders;
CREATE POLICY "Attributed orders read own or brand" ON public.attributed_orders
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.brands WHERE id = brand_id AND profile_id = auth.uid()) OR
    public.is_admin()
  );

DROP POLICY IF EXISTS "Attributed orders insert authenticated" ON public.attributed_orders;
CREATE POLICY "Attributed orders insert authenticated" ON public.attributed_orders
  FOR INSERT WITH CHECK (true);
