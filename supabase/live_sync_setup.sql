-- ==============================================================================
-- JUMBLE SALE — LIVE DATABASE SYNC SCRIPT (LIKES, REVIEWS & DEALS)
-- Safe, Idempotent, Never Drops Any Table, Never Deletes Any User Data
-- ==============================================================================

-- 1. CREATE COMMENTS / REVIEWS TABLE (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL,
  user_id uuid,
  user_name text NOT NULL DEFAULT 'Shopper',
  user_avatar text,
  text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. OPEN PERMISSIVE RLS POLICIES FOR LIVE MOBILE & WEB SYNC

-- (A) Comments / Customer Reviews
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read comments" ON public.comments;
CREATE POLICY "Public read comments" ON public.comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert comments" ON public.comments;
CREATE POLICY "Public insert comments" ON public.comments FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public delete comments" ON public.comments;
CREATE POLICY "Public delete comments" ON public.comments FOR DELETE USING (true);

-- (B) Likes
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read likes" ON public.likes;
CREATE POLICY "Public read likes" ON public.likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert likes" ON public.likes;
CREATE POLICY "Public insert likes" ON public.likes FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public delete likes" ON public.likes;
CREATE POLICY "Public delete likes" ON public.likes FOR DELETE USING (true);

-- (C) Interactions
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read interactions" ON public.interactions;
CREATE POLICY "Public read interactions" ON public.interactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert interactions" ON public.interactions;
CREATE POLICY "Public insert interactions" ON public.interactions FOR INSERT WITH CHECK (true);

-- (D) Follows
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read follows" ON public.follows;
CREATE POLICY "Public read follows" ON public.follows FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert follows" ON public.follows;
CREATE POLICY "Public insert follows" ON public.follows FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public delete follows" ON public.follows;
CREATE POLICY "Public delete follows" ON public.follows FOR DELETE USING (true);

-- (E) Deals & Brands
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active deals" ON public.deals;
CREATE POLICY "Public read active deals" ON public.deals FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can insert deals" ON public.deals;
CREATE POLICY "Anyone can insert deals" ON public.deals FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update deals" ON public.deals;
CREATE POLICY "Anyone can update deals" ON public.deals FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Anyone can delete deals" ON public.deals;
CREATE POLICY "Anyone can delete deals" ON public.deals FOR DELETE USING (true);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read brands" ON public.brands;
CREATE POLICY "Public read brands" ON public.brands FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anyone can insert brands" ON public.brands;
CREATE POLICY "Anyone can insert brands" ON public.brands FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update brands" ON public.brands;
CREATE POLICY "Anyone can update brands" ON public.brands FOR UPDATE USING (true);

-- 3. SEED 9 PAKISTANI BRANDS (SAFE IDEMPOTENT INSERT)
INSERT INTO public.brands (id, name, business_email, contact_number, category, status, is_verified, logo_url) VALUES
  ('b1111111-1111-1111-1111-111111111111', 'Khaadi', 'contact@khaadi.com', '+92 42 111 542 234', 'Fashion & Apparel', 'active', true, 'https://images.unsplash.com/photo-1544441893-675973e31985'),
  ('b2222222-2222-2222-2222-222222222222', 'Outfitters', 'info@outfitters.com.pk', '+92 42 111 688 348', 'Fashion & Apparel', 'active', true, 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518'),
  ('b3333333-3333-3333-3333-333333333333', 'Gul Ahmed', 'customercare@gulahmed.com', '+92 21 111 485 485', 'Fashion & Apparel', 'active', true, 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d'),
  ('b4444444-4444-4444-4444-444444444444', 'Bata Pakistan', 'care@bata.com.pk', '+92 42 111 228 228', 'Footwear & Accessories', 'active', true, 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&q=80'),
  ('b5555555-5555-5555-5555-555555555555', 'PriceOye', 'support@priceoye.pk', '+92 51 111 693 693', 'Electronics & Mobiles', 'active', true, 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&q=80'),
  ('b6666666-6666-6666-6666-666666666666', 'Cheezious', 'hello@cheezious.com', '+92 51 111 446 699', 'Food & Dining', 'active', true, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=80'),
  ('b7777777-7777-7777-7777-777777777777', 'Saeed Ghani', 'support@saeedghani.pk', '+92 21 111 723 334', 'Beauty & Cosmetics', 'active', true, 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600&q=80'),
  ('b8888888-8888-8888-8888-888888888888', 'Imtiaz Super Market', 'customercare@imtiaz.com.pk', '+92 21 111 468 429', 'Grocery & Supermarket', 'active', true, 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80'),
  ('b9999999-9999-9999-9999-999999999999', 'Habitt', 'info@habitt.com', '+92 21 111 422 488', 'Home & Living', 'active', true, 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&q=80')
ON CONFLICT (id) DO UPDATE SET
  status = 'active',
  is_verified = true,
  logo_url = EXCLUDED.logo_url;

-- 4. SEED CORE DEALS (SAFE IDEMPOTENT INSERT)
INSERT INTO public.deals (
  id, brand_id, category_id, title, description, discount_pct,
  original_price, discount_price, start_date, end_date, deal_type, city, status, terms, buy_url, website_url, image_urls
) VALUES
  (
    'd1111111-1111-1111-1111-111111111111',
    'b1111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'Flat 50% Off Summer Lawn Sale',
    'Enjoy 50% discount across all unstitched 3-piece embroidered lawn suits online and in stores.',
    50.00, 9990.00, 4995.00,
    NOW() - INTERVAL '2 days', NOW() + INTERVAL '15 days',
    'online', 'Lahore', 'active', 'Valid until stock lasts.',
    'https://pk.khaadi.com/sale', 'https://pk.khaadi.com/sale',
    ARRAY['https://images.unsplash.com/photo-1544441893-675973e31985']
  ),
  (
    'd1111111-1111-1111-1111-222222222222',
    'b1111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'Buy 1 Get 1 Free Ready-to-Wear Kurtis',
    'Special weekend offer on pret wear. Applicable across Lahore, Karachi & Islamabad outlets.',
    50.00, 6500.00, 3250.00,
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days',
    'in_store', 'Karachi', 'active', 'In-store only.',
    'https://pk.khaadi.com/ready-to-wear', 'https://pk.khaadi.com/ready-to-wear',
    ARRAY['https://images.unsplash.com/photo-1594938298603-c8148c4dae35']
  ),
  (
    'd2222222-2222-2222-2222-111111111111',
    'b2222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Flat 40% Off Denim Jackets & Hoodies',
    'Winter clearance flash sale on all men and women casual streetwear.',
    40.00, 8500.00, 5100.00,
    NOW() - INTERVAL '3 days', NOW() + INTERVAL '10 days',
    'online', 'Lahore', 'active', 'Discount applied automatically at checkout.',
    'https://outfitters.com.pk/collections/men-jackets', 'https://outfitters.com.pk/collections/men-jackets',
    ARRAY['https://images.unsplash.com/photo-1521572267360-ee0c2909d518']
  ),
  (
    'd2222222-2222-2222-2222-222222222222',
    'b2222222-2222-2222-2222-222222222222',
    '77777777-7777-7777-7777-777777777777',
    'Flat 25% Off Sneakers & Casual Footwear',
    'Trendy streetwear sneakers for youth now available at discounted rates.',
    25.00, 5990.00, 4492.00,
    NOW() - INTERVAL '2 days', NOW() + INTERVAL '12 days',
    'in_store', 'Islamabad', 'active', 'Valid at all flagship stores.',
    'https://outfitters.com.pk/collections/shoes', 'https://outfitters.com.pk/collections/shoes',
    ARRAY['https://images.unsplash.com/photo-1552374196-1ab2a1c593e8']
  ),
  (
    'd3333333-3333-3333-3333-111111111111',
    'b3333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'Flat 30% Off Ideas Festive Unstitched Collection',
    'Luxury chiffon and lawn suits at special promotional discounts.',
    30.00, 11500.00, 8050.00,
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '14 days',
    'online', 'Karachi', 'active', 'Nationwide delivery available.',
    'https://www.gulahmedshop.com/sale', 'https://www.gulahmedshop.com/sale',
    ARRAY['https://images.unsplash.com/photo-1490481651871-ab68de25d43d']
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  discount_pct = EXCLUDED.discount_pct,
  buy_url = EXCLUDED.buy_url,
  website_url = EXCLUDED.website_url,
  status = 'active';
