-- ====================================================================
-- JUMBLE SALE — COMPLETE PRODUCTION DATABASE SCHEMA (FRESH SETUP)
-- ====================================================================

-- 1. Enable Vector Extension for AI Embeddings
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. CLEANUP PREVIOUS TABLES AND TYPES (CASCADE DROP FOR FRESH START)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP TABLE IF EXISTS public.admin_audit_log CASCADE;
DROP TABLE IF EXISTS public.analytics_daily CASCADE;
DROP TABLE IF EXISTS public.user_preferences CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.reports CASCADE;
DROP TABLE IF EXISTS public.interactions CASCADE;
DROP TABLE IF EXISTS public.likes CASCADE;
DROP TABLE IF EXISTS public.saved_deals CASCADE;
DROP TABLE IF EXISTS public.follows CASCADE;
DROP TABLE IF EXISTS public.brand_followers CASCADE;
DROP TABLE IF EXISTS public.promotions CASCADE;
DROP TABLE IF EXISTS public.deals CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.brands CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP TYPE IF EXISTS public.user_role CASCADE;
DROP TYPE IF EXISTS public.brand_status CASCADE;
DROP TYPE IF EXISTS public.deal_type CASCADE;
DROP TYPE IF EXISTS public.deal_status CASCADE;
DROP TYPE IF EXISTS public.interaction_type CASCADE;
DROP TYPE IF EXISTS public.report_status CASCADE;
DROP TYPE IF EXISTS public.promotion_status CASCADE;

-- 3. ENUM TYPES
CREATE TYPE public.user_role AS ENUM ('consumer', 'brand', 'admin');
CREATE TYPE public.brand_status AS ENUM ('pending', 'active', 'suspended', 'rejected');
CREATE TYPE public.deal_type AS ENUM ('online', 'in_store');
CREATE TYPE public.deal_status AS ENUM ('draft', 'pending', 'active', 'rejected', 'expired', 'suspended');
CREATE TYPE public.interaction_type AS ENUM ('view', 'click', 'save', 'like', 'report');
CREATE TYPE public.report_status AS ENUM ('pending', 'resolved', 'dismissed');

-- 4. TABLES CREATION

-- 4.1 Profiles Table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name VARCHAR(50),
  role public.user_role NOT NULL DEFAULT 'consumer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  avatar_url TEXT,
  push_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.2 Brands Table
CREATE TABLE public.brands (
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

-- 4.3 Categories Table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  icon TEXT
);

-- 4.4 Deals Table
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  discount_pct NUMERIC(5, 2) NOT NULL CHECK (discount_pct >= 0.01 AND discount_pct <= 100.00),
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  CONSTRAINT check_end_after_start CHECK (end_date > start_date),
  deal_type public.deal_type NOT NULL DEFAULT 'online',
  city TEXT,
  image_urls TEXT[] DEFAULT '{}'::text[],
  CONSTRAINT check_max_5_images CHECK (cardinality(image_urls) <= 5),
  terms TEXT,
  status public.deal_status NOT NULL DEFAULT 'draft',
  rejection_reason TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.5 Follows Table
CREATE TABLE public.follows (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, brand_id)
);

-- 4.6 Saved Deals Table
CREATE TABLE public.saved_deals (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, deal_id)
);

-- 4.7 Likes Table
CREATE TABLE public.likes (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, deal_id)
);

-- 4.8 Interactions Table
CREATE TABLE public.interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  type public.interaction_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.9 Reports Table
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status public.report_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.10 Notifications Table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.11 Chat Messages Table
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  deal_context_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.12 User Preferences Table
CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  favorite_categories UUID[] DEFAULT '{}'::uuid[],
  preferred_cities TEXT[] DEFAULT '{}'::text[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.13 Analytics Daily Table
CREATE TABLE public.analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  views_count INT NOT NULL DEFAULT 0,
  clicks_count INT NOT NULL DEFAULT 0,
  saves_count INT NOT NULL DEFAULT 0,
  likes_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (date, deal_id)
);

-- 4.14 Admin Audit Log Table
CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. INDEXES
CREATE INDEX idx_deals_status_end_date ON public.deals (status, end_date);
CREATE INDEX idx_deals_category_id ON public.deals (category_id);
CREATE INDEX idx_deals_brand_id ON public.deals (brand_id);
CREATE INDEX idx_interactions_user_created ON public.interactions (user_id, created_at);
CREATE INDEX idx_deals_fulltext ON public.deals USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- 6. AUTOMATIC PROFILE CREATION TRIGGER & FUNCTION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_role_val public.user_role;
BEGIN
  IF (NEW.raw_user_meta_data->>'role') = 'brand' THEN
    user_role_val := 'brand'::public.user_role;
  ELSE
    user_role_val := 'consumer'::public.user_role;
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    display_name,
    avatar_url,
    role
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', substring(NEW.email from 1 for position('@' in NEW.email)-1)),
    NEW.raw_user_meta_data->>'avatar_url',
    user_role_val
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. RPC FUNCTION: get_active_deals
CREATE OR REPLACE FUNCTION public.get_active_deals(
  p_category_id UUID DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  brand_id UUID,
  title TEXT,
  description TEXT,
  category_id UUID,
  discount_pct NUMERIC,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  deal_type public.deal_type,
  city TEXT,
  image_urls TEXT[],
  terms TEXT,
  status public.deal_status,
  created_at TIMESTAMPTZ,
  brand_name TEXT,
  brand_logo TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.brand_id,
    d.title,
    d.description,
    d.category_id,
    d.discount_pct,
    d.start_date,
    d.end_date,
    d.deal_type,
    d.city,
    d.image_urls,
    d.terms,
    d.status,
    d.created_at,
    b.name AS brand_name,
    b.logo_url AS brand_logo
  FROM public.deals d
  JOIN public.brands b ON b.id = d.brand_id
  WHERE d.status = 'active'
    AND NOW() BETWEEN d.start_date AND d.end_date
    AND b.status = 'active'
    AND (p_category_id IS NULL OR d.category_id = p_category_id)
    AND (p_city IS NULL OR d.city = p_city)
    AND (
      p_search IS NULL OR p_search = '' OR
      to_tsvector('english', d.title || ' ' || COALESCE(d.description, '')) @@ plainto_tsquery('english', p_search)
    )
  ORDER BY d.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 8. HELPER FUNCTIONS FOR RLS
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

CREATE OR REPLACE FUNCTION public.is_active_verified_brand()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.brands
    WHERE owner_id = auth.uid() AND status = 'active' AND is_verified = true
  );
$$;

-- 9. ENABLE RLS ON ALL TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- 10. RLS POLICIES

-- PROFILES
CREATE POLICY "Public profiles read"
  ON public.profiles FOR SELECT
  USING (is_active = true OR id = auth.uid() OR public.is_admin());

CREATE POLICY "Users update own profile (role immutability)"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- BRANDS
CREATE POLICY "Public read active brands"
  ON public.brands FOR SELECT
  USING (status = 'active' OR owner_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users insert pending brand row"
  ON public.brands FOR INSERT
  WITH CHECK (
    owner_id = auth.uid() AND
    status = 'pending' AND
    is_verified = false
  );

CREATE POLICY "Brand owners update own brand info (status & verification immutable)"
  ON public.brands FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid() AND
    status = (SELECT status FROM public.brands WHERE id = brands.id) AND
    is_verified = (SELECT is_verified FROM public.brands WHERE id = brands.id)
  );

CREATE POLICY "Admins update any brand (approve/reject/suspend)"
  ON public.brands FOR UPDATE
  USING (public.is_admin());

-- CATEGORIES
CREATE POLICY "Categories public read"
  ON public.categories FOR SELECT
  USING (true);

CREATE POLICY "Admins manage categories"
  ON public.categories FOR ALL
  USING (public.is_admin());

-- DEALS
CREATE POLICY "Consumers read active valid deals"
  ON public.deals FOR SELECT
  USING (
    (
      status = 'active' AND
      NOW() BETWEEN start_date AND end_date AND
      EXISTS (SELECT 1 FROM public.brands WHERE id = deals.brand_id AND status = 'active')
    )
    OR brand_id = public.get_user_brand_id()
    OR public.is_admin()
  );

CREATE POLICY "Active verified brands insert own deals"
  ON public.deals FOR INSERT
  WITH CHECK (
    brand_id = public.get_user_brand_id() AND
    public.is_active_verified_brand() AND
    status IN ('draft', 'pending')
  );

CREATE POLICY "Brands update own deals (cannot set active directly)"
  ON public.deals FOR UPDATE
  USING (brand_id = public.get_user_brand_id() AND public.is_active_verified_brand())
  WITH CHECK (
    brand_id = public.get_user_brand_id() AND
    status IN ('draft', 'pending')
  );

CREATE POLICY "Admins manage any deal"
  ON public.deals FOR ALL
  USING (public.is_admin());

CREATE POLICY "Brands delete own deals"
  ON public.deals FOR DELETE
  USING (brand_id = public.get_user_brand_id() OR public.is_admin());

-- FOLLOWS
CREATE POLICY "Users read own follows or admins"
  ON public.follows FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users insert own follows"
  ON public.follows FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own follows"
  ON public.follows FOR DELETE
  USING (user_id = auth.uid());

-- SAVED DEALS
CREATE POLICY "Users read own saved deals"
  ON public.saved_deals FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own saved deal"
  ON public.saved_deals FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own saved deal"
  ON public.saved_deals FOR DELETE
  USING (user_id = auth.uid());

-- LIKES
CREATE POLICY "Likes public read"
  ON public.likes FOR SELECT
  USING (true);

CREATE POLICY "Users insert own like"
  ON public.likes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own like"
  ON public.likes FOR DELETE
  USING (user_id = auth.uid());

-- INTERACTIONS
CREATE POLICY "Interactions read own or brand deals or admin"
  ON public.interactions FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.deals WHERE id = interactions.deal_id AND brand_id = public.get_user_brand_id()) OR
    public.is_admin()
  );

CREATE POLICY "Users insert own interactions"
  ON public.interactions FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- REPORTS
CREATE POLICY "Users insert reports"
  ON public.reports FOR INSERT
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Reporters read own reports or admin"
  ON public.reports FOR SELECT
  USING (reporter_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins manage reports"
  ON public.reports FOR UPDATE
  USING (public.is_admin());

-- NOTIFICATIONS
CREATE POLICY "Users manage own notifications"
  ON public.notifications FOR ALL
  USING (user_id = auth.uid());

-- CHAT MESSAGES
CREATE POLICY "Users manage own chat messages"
  ON public.chat_messages FOR ALL
  USING (user_id = auth.uid());

-- USER PREFERENCES
CREATE POLICY "Users manage own preferences"
  ON public.user_preferences FOR ALL
  USING (user_id = auth.uid());

-- ANALYTICS DAILY
CREATE POLICY "Brand owners read own deal analytics or admin"
  ON public.analytics_daily FOR SELECT
  USING (brand_id = public.get_user_brand_id() OR public.is_admin());

-- ADMIN AUDIT LOG
CREATE POLICY "Admins read audit logs"
  ON public.admin_audit_log FOR SELECT
  USING (public.is_admin());

-- 11. STORAGE BUCKETS SETUP & POLICIES
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('deal-images', 'deal-images', true),
  ('brand-docs', 'brand-docs', false),
  ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read deal images" ON storage.objects;
CREATE POLICY "Public read deal images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'deal-images');

DROP POLICY IF EXISTS "Active verified brands insert deal images" ON storage.objects;
CREATE POLICY "Active verified brands insert deal images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'deal-images' AND
    (public.is_active_verified_brand() OR public.is_admin())
  );

DROP POLICY IF EXISTS "Brand owner or admin read brand docs" ON storage.objects;
CREATE POLICY "Brand owner or admin read brand docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'brand-docs' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text OR
      public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Brand owner or admin insert brand docs" ON storage.objects;
CREATE POLICY "Brand owner or admin insert brand docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'brand-docs' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text OR
      public.is_admin()
    )
  );

DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text OR
      auth.uid() IS NOT NULL
    )
  );
