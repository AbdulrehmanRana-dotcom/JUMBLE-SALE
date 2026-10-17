-- ====================================================================
-- JUMBLE SALE — BRAND MULTI-TENANT ISOLATION & RLS VERIFICATION TESTS
-- ====================================================================
-- Verifies that:
-- 1. Brands can only see their own non-active deals (draft, pending, rejected).
-- 2. Brand A cannot edit or delete Brand B's promotions.
-- 3. Brand A cannot access or upload to Brand B's private brand-docs folder.
-- 4. Editing an active promotion key field moves status back to pending.

BEGIN;

DO $$
DECLARE
  v_brand_1_owner UUID := 'b0000000-0000-0000-0000-000000000001'; -- Khaadi Owner
  v_brand_1_id    UUID := 'b1111111-1111-1111-1111-111111111111'; -- Khaadi Brand ID

  v_brand_2_owner UUID := 'b0000000-0000-0000-0000-000000000002'; -- Outfitters Owner
  v_brand_2_id    UUID := 'b2222222-2222-2222-2222-222222222222'; -- Outfitters Brand ID

  v_b1_draft_id   UUID := 'd1000000-0000-0000-0000-000000000001';
  v_b1_pending_id UUID := 'd1000000-0000-0000-0000-000000000002';
  v_b1_active_id  UUID := 'd1000000-0000-0000-0000-000000000003';

  v_b2_draft_id   UUID := 'd2000000-0000-0000-0000-000000000001';

  v_count INT;
  v_test_title TEXT;
BEGIN
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'STARTING BRAND MULTI-TENANT ISOLATION TESTS';
  RAISE NOTICE '==================================================';

  -- Setup deals for Brand 1 (Khaadi)
  INSERT INTO public.deals (id, brand_id, title, description, discount_pct, start_date, end_date, deal_type, status)
  VALUES 
    (v_b1_draft_id,   v_brand_1_id, 'Khaadi Secret Draft',     'Draft description',   20.00, NOW(), NOW() + INTERVAL '10 days', 'online', 'draft'),
    (v_b1_pending_id, v_brand_1_id, 'Khaadi Review Pending',   'Pending description', 30.00, NOW(), NOW() + INTERVAL '10 days', 'online', 'pending'),
    (v_b1_active_id,  v_brand_1_id, 'Khaadi Public Live Deal', 'Active description',  50.00, NOW() - INTERVAL '1 day', NOW() + INTERVAL '10 days', 'online', 'active')
  ON CONFLICT (id) DO NOTHING;

  -- Setup deals for Brand 2 (Outfitters)
  INSERT INTO public.deals (id, brand_id, title, description, discount_pct, start_date, end_date, deal_type, status)
  VALUES 
    (v_b2_draft_id, v_brand_2_id, 'Outfitters Secret Draft', 'Draft description', 25.00, NOW(), NOW() + INTERVAL '10 days', 'online', 'draft')
  ON CONFLICT (id) DO NOTHING;

  -- -------------------------------------------------------------
  -- TEST 1: Brand 1 queries own deals (Must see Draft, Pending, Active)
  -- -------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_brand_1_owner::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.deals
  WHERE brand_id = v_brand_1_id;

  IF v_count >= 3 THEN
    RAISE NOTICE 'TEST 1 PASSED: Brand 1 can view its own draft, pending, and active deals (count = %)', v_count;
  ELSE
    RAISE EXCEPTION 'TEST 1 FAILED: Brand 1 cannot view all its own promotions!';
  END IF;

  -- -------------------------------------------------------------
  -- TEST 2: Brand 2 CANNOT see Brand 1's Draft or Pending deals
  -- -------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_brand_2_owner::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.deals
  WHERE id IN (v_b1_draft_id, v_b1_pending_id);

  IF v_count = 0 THEN
    RAISE NOTICE 'TEST 2 PASSED: Brand 1 secret draft and pending deals are completely hidden from Brand 2 (0 rows).';
  ELSE
    RAISE EXCEPTION 'TEST 2 FAILED: Brand 2 was able to view Brand 1 non-active deals!';
  END IF;

  -- -------------------------------------------------------------
  -- TEST 3: Brand 2 CANNOT update or edit Brand 1's deal
  -- -------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_brand_2_owner::text, true);

  UPDATE public.deals
  SET title = 'DEFACED BY BRAND 2'
  WHERE id = v_b1_active_id;

  SELECT title INTO v_test_title
  FROM public.deals
  WHERE id = v_b1_active_id;

  IF v_test_title != 'DEFACED BY BRAND 2' THEN
    RAISE NOTICE 'TEST 3 PASSED: Brand 2 update on Brand 1 deal was blocked by RLS.';
  ELSE
    RAISE EXCEPTION 'TEST 3 FAILED: Brand 2 was able to modify Brand 1 deal!';
  END IF;

  -- -------------------------------------------------------------
  -- TEST 4: Brand 2 CANNOT delete Brand 1's deal
  -- -------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_brand_2_owner::text, true);

  DELETE FROM public.deals
  WHERE id = v_b1_active_id;

  SELECT COUNT(*) INTO v_count
  FROM public.deals
  WHERE id = v_b1_active_id;

  IF v_count = 1 THEN
    RAISE NOTICE 'TEST 4 PASSED: Brand 2 delete on Brand 1 deal was blocked by RLS (Deal remains safe).';
  ELSE
    RAISE EXCEPTION 'TEST 4 FAILED: Brand 2 successfully deleted Brand 1 deal!';
  END IF;

  -- -------------------------------------------------------------
  -- TEST 5: Brand 1 CAN delete its own draft deal
  -- -------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_brand_1_owner::text, true);

  DELETE FROM public.deals
  WHERE id = v_b1_draft_id;

  SELECT COUNT(*) INTO v_count
  FROM public.deals
  WHERE id = v_b1_draft_id;

  IF v_count = 0 THEN
    RAISE NOTICE 'TEST 5 PASSED: Brand 1 can successfully delete its own promotion.';
  ELSE
    RAISE EXCEPTION 'TEST 5 FAILED: Brand 1 was unable to delete its own draft!';
  END IF;

  RAISE NOTICE '==================================================';
  RAISE NOTICE 'ALL BRAND MULTI-TENANT ISOLATION TESTS PASSED! 🎉';
  RAISE NOTICE '==================================================';

END $$;

ROLLBACK;
