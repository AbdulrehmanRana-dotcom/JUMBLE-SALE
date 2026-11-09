-- ==============================================================================
-- JUMBLE SALE — SYNC USERS & PROFILES TABLE (Supabase Cross-Device Sync)
-- ==============================================================================

-- 1. ENABLE RLS AND PERMISSIVE POLICIES ON PUBLIC.PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles read" ON public.profiles;
CREATE POLICY "Public profiles read" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public profiles insert" ON public.profiles;
CREATE POLICY "Public profiles insert" ON public.profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public profiles update" ON public.profiles;
CREATE POLICY "Public profiles update" ON public.profiles FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public profiles delete" ON public.profiles;
CREATE POLICY "Public profiles delete" ON public.profiles FOR DELETE USING (true);

-- 2. COPY ALL EXISTING USERS FROM AUTH.USERS INTO PUBLIC.PROFILES IF MISSING
INSERT INTO public.profiles (id, email, display_name, role, is_active, created_at)
SELECT 
  id,
  email,
  COALESCE(
    raw_user_meta_data->>'display_name',
    raw_user_meta_data->>'full_name',
    substring(email from 1 for position('@' in email)-1)
  ),
  COALESCE((raw_user_meta_data->>'role')::public.user_role, 'consumer'::public.user_role),
  true,
  COALESCE(created_at, NOW())
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name);

-- 3. ENSURE REALTIME & FUTURE SIGNUPS AUTO-INSERT INTO PUBLIC.PROFILES
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role, is_active, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      substring(NEW.email from 1 for position('@' in NEW.email)-1)
    ),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'consumer'::public.user_role),
    true,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
