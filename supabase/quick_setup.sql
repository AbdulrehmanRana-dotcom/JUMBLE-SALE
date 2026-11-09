-- ==============================================================================
-- JUMBLE SALE — 1-CLICK INSTANT SUPABASE SETUP SCRIPT (Zero Errors Guaranteed)
-- ==============================================================================

-- 1. POPULATE 8 CORE CATEGORIES
INSERT INTO public.categories (id, name, icon) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Fashion & Apparel', 'shirt-outline'),
  ('77777777-7777-7777-7777-777777777777', 'Footwear & Accessories', 'footsteps-outline'),
  ('22222222-2222-2222-2222-222222222222', 'Electronics & Mobiles', 'phone-portrait-outline'),
  ('33333333-3333-3333-3333-333333333333', 'Food & Dining', 'fast-food-outline'),
  ('55555555-5555-5555-5555-555555555555', 'Beauty & Cosmetics', 'sparkles-outline'),
  ('44444444-4444-4444-4444-444444444444', 'Grocery & Supermarket', 'cart-outline'),
  ('66666666-6666-6666-6666-666666666666', 'Home & Living', 'home-outline'),
  ('88888888-8888-8888-8888-888888888888', 'Travel & Experiences', 'airplane-outline')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon;

-- 2. ENSURE ALL BRANDS ARE ACTIVE & VERIFIED SO DEALS SHOW UP
UPDATE public.brands SET status = 'active', is_verified = true;

-- 3. PERMISSIVE POLICIES FOR INSTANT CROSS-DEVICE SYNC
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Categories public read" ON public.categories;
CREATE POLICY "Categories public read" ON public.categories FOR SELECT USING (true);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read brands" ON public.brands;
CREATE POLICY "Public read brands" ON public.brands FOR SELECT USING (true);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active deals" ON public.deals;
CREATE POLICY "Public read active deals" ON public.deals FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert deals" ON public.deals;
CREATE POLICY "Anyone can insert deals" ON public.deals FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update deals" ON public.deals;
CREATE POLICY "Anyone can update deals" ON public.deals FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can delete deals" ON public.deals;
CREATE POLICY "Anyone can delete deals" ON public.deals FOR DELETE USING (true);

-- 4. STORAGE BUCKET FOR DEAL PHOTOS & LOGOS
INSERT INTO storage.buckets (id, name, public) 
VALUES ('deal-images', 'deal-images', true) 
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('deals', 'deals', true) 
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public can view deal images" ON storage.objects;
CREATE POLICY "Public can view deal images" ON storage.objects FOR SELECT 
USING (bucket_id IN ('deals', 'deal-images', 'avatars'));

DROP POLICY IF EXISTS "Anyone can upload deal images" ON storage.objects;
CREATE POLICY "Anyone can upload deal images" ON storage.objects FOR INSERT 
WITH CHECK (bucket_id IN ('deals', 'deal-images', 'avatars', 'brand-docs'));
