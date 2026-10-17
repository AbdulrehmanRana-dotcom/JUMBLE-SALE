-- ========================================================
-- JUMBLE SALE — STEP 1 SEED DATA ALIGNMENT
-- Master Admin, 3 Verified Brands (Khaadi, Outfitters, Gul Ahmed),
-- 8 Core Categories, and Active Deals with Real Buy Links.
-- ========================================================

-- 1. CATEGORIES (8 Categories with fixed UUIDs)
INSERT INTO public.categories (id, name, icon) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Fashion & Apparel', 'shirt-outline'),
  ('22222222-2222-2222-2222-222222222222', 'Electronics & Mobiles', 'phone-portrait-outline'),
  ('33333333-3333-3333-3333-333333333333', 'Food & Dining', 'fast-food-outline'),
  ('44444444-4444-4444-4444-444444444444', 'Grocery & Supermarket', 'cart-outline'),
  ('55555555-5555-5555-5555-555555555555', 'Beauty & Cosmetics', 'sparkles-outline'),
  ('66666666-6666-6666-6666-666666666666', 'Home & Living', 'home-outline'),
  ('77777777-7777-7777-7777-777777777777', 'Footwear & Accessories', 'footsteps-outline'),
  ('88888888-8888-8888-8888-888888888888', 'Travel & Experiences', 'airplane-outline')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon;

-- 2. MASTER ADMIN & BRAND PROFILES
INSERT INTO public.profiles (id, email, display_name, role, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@jumblesale.com', 'System Admin', 'admin', true),
  ('b0000000-0000-0000-0000-000000000001', 'contact@khaadi.com', 'Khaadi Official', 'brand', true),
  ('b0000000-0000-0000-0000-000000000002', 'info@outfitters.com.pk', 'Outfitters PK', 'brand', true),
  ('b0000000-0000-0000-0000-000000000003', 'customercare@gulahmed.com', 'Gul Ahmed Ideas', 'brand', true)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role,
  is_active = true;

-- 3. VERIFIED BRANDS (3 Main Brands)
INSERT INTO public.brands (id, owner_id, name, business_email, contact_number, category, status, is_verified, logo_url) VALUES
  ('b1111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000001', 'Khaadi', 'contact@khaadi.com', '+92 42 111 542 234', 'Fashion & Apparel', 'active', true, 'https://images.unsplash.com/photo-1544441893-675973e31985'),
  ('b2222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000002', 'Outfitters', 'info@outfitters.com.pk', '+92 42 111 688 348', 'Fashion & Apparel', 'active', true, 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518'),
  ('b3333333-3333-3333-3333-333333333333', 'b0000000-0000-0000-0000-000000000003', 'Gul Ahmed', 'customercare@gulahmed.com', '+92 21 111 485 485', 'Fashion & Apparel', 'active', true, 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d')
ON CONFLICT (id) DO UPDATE SET
  owner_id = EXCLUDED.owner_id,
  status = 'active',
  is_verified = true,
  logo_url = EXCLUDED.logo_url;

-- 4. ACTIVE DEALS WITH BUY LINKS
INSERT INTO public.deals (
  id,
  brand_id,
  category_id,
  title,
  description,
  discount_pct,
  original_price,
  discount_price,
  start_date,
  end_date,
  deal_type,
  city,
  status,
  terms,
  buy_url,
  website_url,
  image_urls
) VALUES
  (
    'd1111111-1111-1111-1111-111111111111',
    'b1111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'Flat 50% Off Summer Lawn Sale',
    'Enjoy 50% discount across all unstitched 3-piece embroidered lawn suits online and in stores.',
    50.00,
    9990.00,
    4995.00,
    NOW() - INTERVAL '2 days',
    NOW() + INTERVAL '15 days',
    'online',
    'Lahore',
    'active',
    'Valid until stock lasts.',
    'https://pk.khaadi.com/sale',
    'https://pk.khaadi.com/sale',
    ARRAY['https://images.unsplash.com/photo-1544441893-675973e31985']
  ),
  (
    'd1111111-1111-1111-1111-222222222222',
    'b1111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'Buy 1 Get 1 Free Ready-to-Wear Kurtis',
    'Special weekend offer on pret wear. Applicable across Lahore, Karachi & Islamabad outlets.',
    50.00,
    6500.00,
    3250.00,
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '7 days',
    'in_store',
    'Karachi',
    'active',
    'In-store only.',
    'https://pk.khaadi.com/ready-to-wear',
    'https://pk.khaadi.com/ready-to-wear',
    ARRAY['https://images.unsplash.com/photo-1594938298603-c8148c4dae35']
  ),
  (
    'd2222222-2222-2222-2222-111111111111',
    'b2222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Flat 40% Off Denim Jackets & Hoodies',
    'Winter clearance flash sale on all men and women casual streetwear.',
    40.00,
    8500.00,
    5100.00,
    NOW() - INTERVAL '3 days',
    NOW() + INTERVAL '10 days',
    'online',
    'Lahore',
    'active',
    'Discount applied automatically at checkout.',
    'https://outfitters.com.pk/collections/men-jackets',
    'https://outfitters.com.pk/collections/men-jackets',
    ARRAY['https://images.unsplash.com/photo-1521572267360-ee0c2909d518']
  ),
  (
    'd2222222-2222-2222-2222-222222222222',
    'b2222222-2222-2222-2222-222222222222',
    '77777777-7777-7777-7777-777777777777',
    'Flat 25% Off Sneakers & Casual Footwear',
    'Trendy streetwear sneakers for youth now available at discounted rates.',
    25.00,
    5990.00,
    4492.00,
    NOW() - INTERVAL '2 days',
    NOW() + INTERVAL '12 days',
    'in_store',
    'Islamabad',
    'active',
    'Valid at all flagship stores.',
    'https://outfitters.com.pk/collections/shoes',
    'https://outfitters.com.pk/collections/shoes',
    ARRAY['https://images.unsplash.com/photo-1552374196-1ab2a1c593e8']
  ),
  (
    'd3333333-3333-3333-3333-111111111111',
    'b3333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'Flat 30% Off Ideas Festive Unstitched Collection',
    'Luxury chiffon and lawn suits at special promotional discounts.',
    30.00,
    11500.00,
    8050.00,
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '14 days',
    'online',
    'Karachi',
    'active',
    'Nationwide delivery available.',
    'https://www.gulahmedshop.com/sale',
    'https://www.gulahmedshop.com/sale',
    ARRAY['https://images.unsplash.com/photo-1490481651871-ab68de25d43d']
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  discount_pct = EXCLUDED.discount_pct,
  buy_url = EXCLUDED.buy_url,
  website_url = EXCLUDED.website_url,
  status = 'active';

-- 5. REAL COMMENTS
INSERT INTO public.comments (deal_id, user_name, text, created_at) VALUES
  ('d1111111-1111-1111-1111-111111111111', 'Ayesha Khan', 'Is this discount available on unstitched items in Gulberg branch?', NOW() - INTERVAL '1 hour'),
  ('d2222222-2222-2222-2222-111111111111', 'Hamza Malik', 'Just ordered denim jacket online, quality is amazing! Recommended.', NOW() - INTERVAL '2 hours')
ON CONFLICT DO NOTHING;
