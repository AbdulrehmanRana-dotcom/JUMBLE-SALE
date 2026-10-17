-- ==============================================================================
-- Migration: Email Verification & Automatic Brand Creation Trigger
-- Ensures profiles and brand rows are created reliably when users sign up,
-- supporting Supabase Email Confirmation workflows.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_role_val public.user_role;
  brand_name_val TEXT;
  existing_brand_count INT;
BEGIN
  -- 1. Security check: Client cannot self-assign 'admin' role
  IF (NEW.raw_user_meta_data->>'role') = 'brand' THEN
    user_role_val := 'brand'::public.user_role;
  ELSE
    user_role_val := 'consumer'::public.user_role;
  END IF;

  -- 2. Insert into profiles table
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
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      substring(NEW.email from 1 for position('@' in NEW.email)-1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    user_role_val
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
    role = EXCLUDED.role;

  -- 3. If Brand role, automatically create pending brand application
  IF user_role_val = 'brand' THEN
    brand_name_val := COALESCE(
      NEW.raw_user_meta_data->>'brand_name',
      NEW.raw_user_meta_data->>'display_name',
      'Brand ' || substring(NEW.id::text from 1 for 6)
    );

    SELECT COUNT(*) INTO existing_brand_count
    FROM public.brands
    WHERE owner_id = NEW.id;

    IF existing_brand_count = 0 THEN
      INSERT INTO public.brands (
        owner_id,
        name,
        business_email,
        contact_number,
        category,
        social_links,
        verification_doc_urls,
        status,
        is_verified
      )
      VALUES (
        NEW.id,
        brand_name_val,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'brand_phone', ''),
        COALESCE(NEW.raw_user_meta_data->>'brand_category', 'Fashion & Apparel'),
        jsonb_build_object(
          'website', NEW.raw_user_meta_data->>'website',
          'instagram', NEW.raw_user_meta_data->>'instagram',
          'facebook', NEW.raw_user_meta_data->>'facebook'
        ),
        CASE
          WHEN NEW.raw_user_meta_data->>'verification_doc_url' IS NOT NULL
          THEN ARRAY[NEW.raw_user_meta_data->>'verification_doc_url']
          ELSE '{}'::text[]
        END,
        'pending',
        false
      )
      ON CONFLICT (name) DO UPDATE SET
        business_email = EXCLUDED.business_email,
        contact_number = EXCLUDED.contact_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure the trigger is active on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
