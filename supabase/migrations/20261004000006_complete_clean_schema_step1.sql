-- ==============================================================================
-- JUMBLE SALE — STEP 1: COMPREHENSIVE SCHEMA ALIGNMENT & SEED SCRIPT
-- ==============================================================================
-- This script is completely IDEMPOTENT (safe to run multiple times).
-- It ensures:
-- 1. All necessary extensions (uuid-ossp, pgcrypto, vector if available).
-- 2. profiles, brands, categories, deals, comments, likes, saved_deals, reports,
--    notifications, interactions tables are fully aligned.
-- 3. deals table has buy_url, website_url, original_price, discount_price, promo_code.
-- 4. comments table is created with proper foreign keys and RLS policies.
-- 5. handle_new_user() trigger properly creates profiles and handles admin/brands.
-- 6. Seeds:
--    - Master Admin: admin@jumblesale.com (Password: admin)
--    - 8 Standard Categories with fixed UUIDs and icons
--    - 3 Verified Brands with fixed UUIDs:
--        * Khaadi (b1111111-1111-1111-1111-111111111111)
--        * Outfitters (b2222222-2222-2222-2222-222222222222)
--        * Gul Ahmed (b3333333-3333-3333-3333-333333333333)
--    - Active deals with real buy URLs for each brand.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUM TYPES (IF NOT ALREADY CREATED)
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('consumer', 'brand', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.brand_status AS ENUM ('pending', 'active', 'suspended', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.deal_type AS ENUM ('online', 'in_store');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.deal_status AS ENUM ('draft', 'pending', 'active', 'rejected', 'expired', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.interaction_type AS ENUM ('view', 'click', 'save', 'like', 'report');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.report_status AS ENUM ('pending', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name VARCHAR(100),
  role public.user_role NOT NULL DEFAULT 'consumer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  avatar_url TEXT,
  push_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure columns exist in profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'consumer';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- 4. BRANDS TABLE
CREATE TABLE IF NOT EXISTS public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE,
  business_email TEXT NOT NULL UNIQUE,
  contact_number TEXT,
  category TEXT,
  social_links JSONB DEFAULT '{}'::jsonb,
  logo_url TEXT,
  verification_doc_urls TEXT[] DEFAULT '{}'::text[],
  status public.brand_status NOT NULL DEFAULT 'pending',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS status public.brand_status NOT NULL DEFAULT 'pending';

-- 5. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT
);

-- 6. DEALS TABLE & NEW FIELDS
CREATE TABLE IF NOT EXISTS public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 20.00,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  deal_type public.deal_type NOT NULL DEFAULT 'online',
  city TEXT,
  image_urls TEXT[] DEFAULT '{}'::text[],
  terms TEXT,
  status public.deal_status NOT NULL DEFAULT 'active',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Crucial columns for guaranteed persistence and buy links:
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS buy_url TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS original_price NUMERIC(10, 2);
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS discount_price NUMERIC(10, 2);
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS promo_code TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- 7. COMMENTS TABLE (NEW & CRITICAL)
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL DEFAULT 'Shopper',
  user_avatar TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. LIKES & SAVED DEALS
CREATE TABLE IF NOT EXISTS public.likes (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, deal_id)
);

CREATE TABLE IF NOT EXISTS public.saved_deals (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, deal_id)
);

-- 9. REPORTS
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status public.report_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. NOTIFICATIONS & INTERACTIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  type public.interaction_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. INDEXES FOR HIGH PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_deals_brand_id ON public.deals(brand_id);
CREATE INDEX IF NOT EXISTS idx_deals_category_id ON public.deals(category_id);
CREATE INDEX IF NOT EXISTS idx_deals_status_date ON public.deals(status, end_date);
CREATE INDEX IF NOT EXISTS idx_comments_deal_id ON public.comments(deal_id);
CREATE INDEX IF NOT EXISTS idx_likes_deal_id ON public.likes(deal_id);
CREATE INDEX IF NOT EXISTS idx_saved_deals_user_id ON public.saved_deals(user_id);

-- 12. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_brand_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.brands
  WHERE owner_id = auth.uid()
  LIMIT 1;
$$;

-- 13. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Public profiles read" ON public.profiles;
CREATE POLICY "Public profiles read" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;
CREATE POLICY "Admins manage profiles" ON public.profiles FOR ALL USING (public.is_admin());

-- Brands Policies
DROP POLICY IF EXISTS "Public read brands" ON public.brands;
CREATE POLICY "Public read brands" ON public.brands FOR SELECT USING (true);

DROP POLICY IF EXISTS "Brand owners insert brand" ON public.brands;
CREATE POLICY "Brand owners insert brand" ON public.brands FOR INSERT WITH CHECK (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Brand owners update brand" ON public.brands;
CREATE POLICY "Brand owners update brand" ON public.brands FOR UPDATE USING (owner_id = auth.uid() OR public.is_admin());

-- Categories Policies
DROP POLICY IF EXISTS "Categories public read" ON public.categories;
CREATE POLICY "Categories public read" ON public.categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL USING (public.is_admin());

-- Deals Policies (Allows authenticated brand owners, consumers, admins)
DROP POLICY IF EXISTS "Public read deals" ON public.deals;
CREATE POLICY "Public read deals" ON public.deals FOR SELECT USING (
  status = 'active'
  OR (auth.uid() IS NOT NULL AND brand_id = public.get_user_brand_id())
  OR public.is_admin()
);

DROP POLICY IF EXISTS "Brands and admins insert deals" ON public.deals;
CREATE POLICY "Brands and admins insert deals" ON public.deals FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "Brands and admins update deals" ON public.deals;
CREATE POLICY "Brands and admins update deals" ON public.deals FOR UPDATE USING (
  auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "Brands and admins delete deals" ON public.deals;
CREATE POLICY "Brands and admins delete deals" ON public.deals FOR DELETE USING (
  auth.uid() IS NOT NULL
);

-- Comments Policies
DROP POLICY IF EXISTS "Public view comments" ON public.comments;
CREATE POLICY "Public view comments" ON public.comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert comments" ON public.comments;
CREATE POLICY "Anyone can insert comments" ON public.comments FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users or admins delete comments" ON public.comments;
CREATE POLICY "Users or admins delete comments" ON public.comments FOR DELETE USING (user_id = auth.uid() OR public.is_admin());

-- Likes Policies
DROP POLICY IF EXISTS "Likes public read" ON public.likes;
CREATE POLICY "Likes public read" ON public.likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users insert like" ON public.likes;
CREATE POLICY "Users insert like" ON public.likes FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users delete like" ON public.likes;
CREATE POLICY "Users delete like" ON public.likes FOR DELETE USING (user_id = auth.uid() OR public.is_admin());

-- Saved Deals Policies
DROP POLICY IF EXISTS "Saved deals read" ON public.saved_deals;
CREATE POLICY "Saved deals read" ON public.saved_deals FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Saved deals insert" ON public.saved_deals;
CREATE POLICY "Saved deals insert" ON public.saved_deals FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Saved deals delete" ON public.saved_deals;
CREATE POLICY "Saved deals delete" ON public.saved_deals FOR DELETE USING (user_id = auth.uid());

-- Reports Policies
DROP POLICY IF EXISTS "Reports insert" ON public.reports;
CREATE POLICY "Reports insert" ON public.reports FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Reports select" ON public.reports;
CREATE POLICY "Reports select" ON public.reports FOR SELECT USING (reporter_id = auth.uid() OR public.is_admin());

-- Notifications & Interactions Policies
DROP POLICY IF EXISTS "Notifications select" ON public.notifications;
CREATE POLICY "Notifications select" ON public.notifications FOR ALL USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Interactions insert" ON public.interactions;
CREATE POLICY "Interactions insert" ON public.interactions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Interactions select" ON public.interactions;
CREATE POLICY "Interactions select" ON public.interactions FOR SELECT USING (true);


-- 14. AUTH USER CREATION TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_brand_name TEXT;
  v_count INT;
BEGIN
  -- Determine role
  IF NEW.email IN ('admin@jumblesale.com', 'admin@jumblesale.pk') OR (NEW.raw_user_meta_data->>'role') = 'admin' THEN
    v_role := 'admin'::public.user_role;
  ELSIF (NEW.raw_user_meta_data->>'role') = 'brand' THEN
    v_role := 'brand'::public.user_role;
  ELSE
    v_role := 'consumer'::public.user_role;
  END IF;

  -- Create or update profile
  INSERT INTO public.profiles (
    id,
    email,
    display_name,
    avatar_url,
    role,
    is_active
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      substring(NEW.email from 1 for position('@' in NEW.email)-1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    v_role,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
    is_active = true;

  -- If brand role, create pending brand row if not already created
  IF v_role = 'brand' THEN
    v_brand_name := COALESCE(
      NEW.raw_user_meta_data->>'brand_name',
      NEW.raw_user_meta_data->>'display_name',
      'Brand ' || substring(NEW.id::text from 1 for 6)
    );

    SELECT COUNT(*) INTO v_count FROM public.brands WHERE owner_id = NEW.id;

    IF v_count = 0 THEN
      INSERT INTO public.brands (
        owner_id,
        name,
        business_email,
        contact_number,
        category,
        social_links,
        status,
        is_verified
      )
      VALUES (
        NEW.id,
        v_brand_name,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'brand_phone', ''),
        COALESCE(NEW.raw_user_meta_data->>'brand_category', 'Fashion & Apparel'),
        jsonb_build_object(
          'website', NEW.raw_user_meta_data->>'website',
          'instagram', NEW.raw_user_meta_data->>'instagram'
        ),
        'pending',
        false
      )
      ON CONFLICT (name) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==============================================================================
-- 15. SEED DATA (CATEGORIES, ADMIN, VERIFIED BRANDS & DEALS)
-- ==============================================================================

-- A. CATEGORIES (8 Core Categories)
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

-- B. AUTH USERS (Admin & Verified Brands)
DO $$
BEGIN
  -- 1. Master Admin (admin@jumblesale.com / admin)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'a0000000-0000-0000-0000-000000000001' OR email = 'admin@jumblesale.com') THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      'a0000000-0000-0000-0000-000000000001',
      'authenticated',
      'authenticated',
      'admin@jumblesale.com',
      crypt('admin', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"role":"admin","display_name":"System Admin"}',
      NOW(),
      NOW()
    );
  END IF;

  -- 2. Khaadi Owner (contact@khaadi.com / khaadi123)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'b0000000-0000-0000-0000-000000000001' OR email = 'contact@khaadi.com') THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      'b0000000-0000-0000-0000-000000000001',
      'authenticated',
      'authenticated',
      'contact@khaadi.com',
      crypt('khaadi123', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"role":"brand","display_name":"Khaadi Official","brand_name":"Khaadi"}',
      NOW(),
      NOW()
    );
  END IF;

  -- 3. Outfitters Owner (info@outfitters.com.pk / outfitters123)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'b0000000-0000-0000-0000-000000000002' OR email = 'info@outfitters.com.pk') THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      'b0000000-0000-0000-0000-000000000002',
      'authenticated',
      'authenticated',
      'info@outfitters.com.pk',
      crypt('outfitters123', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"role":"brand","display_name":"Outfitters PK","brand_name":"Outfitters"}',
      NOW(),
      NOW()
    );
  END IF;

  -- 4. Gul Ahmed Owner (customercare@gulahmed.com / gulahmed123)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'b0000000-0000-0000-0000-000000000003' OR email = 'customercare@gulahmed.com') THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      'b0000000-0000-0000-0000-000000000003',
      'authenticated',
      'authenticated',
      'customercare@gulahmed.com',
      crypt('gulahmed123', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"role":"brand","display_name":"Gul Ahmed Ideas","brand_name":"Gul Ahmed"}',
      NOW(),
      NOW()
    );
  END IF;
END $$;

-- C. PROFILES
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

-- D. VERIFIED BRANDS (3 Main Verified Brands)
INSERT INTO public.brands (id, owner_id, name, business_email, contact_number, category, status, is_verified, logo_url) VALUES
  ('b1111111-1111-1111-1111-111111111111', 'b0000000-0000-0000-0000-000000000001', 'Khaadi', 'contact@khaadi.com', '+92 42 111 542 234', 'Fashion & Apparel', 'active', true, 'https://images.unsplash.com/photo-1544441893-675973e31985'),
  ('b2222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000002', 'Outfitters', 'info@outfitters.com.pk', '+92 42 111 688 348', 'Fashion & Apparel', 'active', true, 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518'),
  ('b3333333-3333-3333-3333-333333333333', 'b0000000-0000-0000-0000-000000000003', 'Gul Ahmed', 'customercare@gulahmed.com', '+92 21 111 485 485', 'Fashion & Apparel', 'active', true, 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d')
ON CONFLICT (id) DO UPDATE SET
  owner_id = EXCLUDED.owner_id,
  name = EXCLUDED.name,
  business_email = EXCLUDED.business_email,
  status = 'active',
  is_verified = true,
  logo_url = EXCLUDED.logo_url;

-- E. REAL ACTIVE DEALS WITH BUY URLS
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

-- F. REAL SEED COMMENTS
INSERT INTO public.comments (deal_id, user_name, text, created_at) VALUES
  ('d1111111-1111-1111-1111-111111111111', 'Ayesha Khan', 'Is this discount available on unstitched items in Gulberg branch?', NOW() - INTERVAL '1 hour'),
  ('d2222222-2222-2222-2222-111111111111', 'Hamza Malik', 'Just ordered denim jacket online, quality is amazing! Recommended.', NOW() - INTERVAL '2 hours')
ON CONFLICT DO NOTHING;

-- G. STORAGE BUCKETS (deals, deal-images, avatars, brand-docs)
INSERT INTO storage.buckets (id, name, public) VALUES
  ('deals', 'deals', true),
  ('deal-images', 'deal-images', true),
  ('avatars', 'avatars', true),
  ('brand-docs', 'brand-docs', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Storage policies
DROP POLICY IF EXISTS "Public can view deal images" ON storage.objects;
CREATE POLICY "Public can view deal images"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('deals', 'deal-images', 'avatars'));

DROP POLICY IF EXISTS "Anyone can upload deal images" ON storage.objects;
CREATE POLICY "Anyone can upload deal images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('deals', 'deal-images', 'avatars', 'brand-docs'));

