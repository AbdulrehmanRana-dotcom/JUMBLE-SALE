-- Enable vector extension for AI embeddings
CREATE EXTENSION IF NOT EXISTS "vector";

-- Enum Types
CREATE TYPE public.user_role AS ENUM ('consumer', 'brand', 'admin');
CREATE TYPE public.brand_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.promotion_status AS ENUM ('pending', 'approved', 'rejected', 'expired');
CREATE TYPE public.report_status AS ENUM ('pending', 'resolved', 'dismissed');

-- 1. Profiles Table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role public.user_role NOT NULL DEFAULT 'consumer',
  brand_name TEXT,
  brand_logo TEXT,
  brand_bio TEXT,
  brand_phone TEXT,
  brand_website TEXT,
  brand_status public.brand_status DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Categories Table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Promotions / Deals Table
CREATE TABLE public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  original_price NUMERIC(10, 2),
  discount_price NUMERIC(10, 2),
  discount_percentage NUMERIC(5, 2),
  promo_code TEXT,
  banner_url TEXT,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  status public.promotion_status NOT NULL DEFAULT 'pending',
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Saved Deals / Likes
CREATE TABLE public.saved_deals (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, promotion_id)
);

-- 5. Brand Followers
CREATE TABLE public.brand_followers (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, brand_id)
);

-- 6. Reports Table
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status public.report_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger Function: Automatic Profile Creation on Sign-Up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_role_val public.user_role;
  brand_status_val public.brand_status;
BEGIN
  -- Determine role from metadata, default to consumer
  IF (NEW.raw_user_meta_data->>'role') = 'brand' THEN
    user_role_val := 'brand'::public.user_role;
    brand_status_val := 'pending'::public.brand_status;
  ELSIF (NEW.raw_user_meta_data->>'role') = 'admin' THEN
    user_role_val := 'admin'::public.user_role;
    brand_status_val := 'approved'::public.brand_status;
  ELSE
    user_role_val := 'consumer'::public.user_role;
    brand_status_val := 'approved'::public.brand_status;
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    role,
    brand_name,
    brand_phone,
    brand_website,
    brand_status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    user_role_val,
    NEW.raw_user_meta_data->>'brand_name',
    NEW.raw_user_meta_data->>'brand_phone',
    NEW.raw_user_meta_data->>'brand_website',
    brand_status_val
  );

  RETURN NEW;
END;
$$;

-- Create Trigger on auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Helper function to check if caller is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- RLS POLICIES

-- PROFILES
CREATE POLICY "Public profiles are viewable by everyone."
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile."
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can update any profile."
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- CATEGORIES
CREATE POLICY "Categories are viewable by everyone."
  ON public.categories FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert categories."
  ON public.categories FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update categories."
  ON public.categories FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete categories."
  ON public.categories FOR DELETE
  USING (public.is_admin());

-- PROMOTIONS
CREATE POLICY "Approved promotions are viewable by everyone."
  ON public.promotions FOR SELECT
  USING (status = 'approved' OR brand_id = auth.uid() OR public.is_admin());

CREATE POLICY "Approved brands can insert promotions."
  ON public.promotions FOR INSERT
  WITH CHECK (
    brand_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'brand' AND brand_status = 'approved'
    )
  );

CREATE POLICY "Brands can update own promotions or Admins can update any."
  ON public.promotions FOR UPDATE
  USING (
    brand_id = auth.uid() OR public.is_admin()
  );

CREATE POLICY "Brands can delete own promotions or Admins can delete any."
  ON public.promotions FOR DELETE
  USING (
    brand_id = auth.uid() OR public.is_admin()
  );

-- SAVED DEALS
CREATE POLICY "Users can view own saved deals."
  ON public.saved_deals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved deals."
  ON public.saved_deals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved deals."
  ON public.saved_deals FOR DELETE
  USING (auth.uid() = user_id);

-- BRAND FOLLOWERS
CREATE POLICY "Users can view brand followers."
  ON public.brand_followers FOR SELECT
  USING (true);

CREATE POLICY "Users can follow brands."
  ON public.brand_followers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unfollow brands."
  ON public.brand_followers FOR DELETE
  USING (auth.uid() = user_id);

-- REPORTS
CREATE POLICY "Users can create reports."
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Admins can view all reports."
  ON public.reports FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update reports."
  ON public.reports FOR UPDATE
  USING (public.is_admin());
