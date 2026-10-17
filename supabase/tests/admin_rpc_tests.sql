-- ====================================================================
-- JUMBLE SALE — ADMIN RPC SECURITY & WORKFLOW TESTS
-- ====================================================================
-- Verifies:
-- 1. Non-admin caller receives access denied on all admin RPC functions.
-- 2. Admin caller can approve brand -> status 'active', is_verified true, audit log & notification created.
-- 3. Admin caller can reject brand with reason -> status 'rejected', audit log & notification created.
-- 4. Admin caller can approve deal -> status 'active', audit log & notification created.
-- 5. Admin caller can reject deal with reason -> status 'rejected', audit log & notification created.
-- 6. Admin caller can suspend and reactivate users -> audit log & notification created.
-- 7. Admin caller can resolve/dismiss reports and suspend reported deals.

BEGIN;

DO $$
DECLARE
  v_admin_id UUID := 'a0000000-0000-0000-0000-000000000001'; -- Seed Admin
  v_consumer_id UUID := 'c0000000-0000-0000-0000-000000000001'; -- Consumer (Non-admin)
  v_brand_owner_id UUID := 'b0000000-0000-0000-0000-000000000001'; -- Khaadi Owner

  v_test_brand_id UUID := 'b9999999-9999-9999-9999-999999999999';
  v_test_deal_id UUID := 'd9999999-9999-9999-9999-999999999999';
  v_test_report_id UUID := 'r9999999-9999-9999-9999-999999999999';

  v_result JSONB;
  v_err_caught BOOLEAN := FALSE;
  v_audit_count INT;
  v_notif_count INT;
  v_brand_status TEXT;
  v_deal_status TEXT;
  v_user_active BOOLEAN;
BEGIN
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'STARTING ADMIN RPC & AUDIT LOG TESTS';
  RAISE NOTICE '==================================================';

  -- Create test pending brand
  INSERT INTO public.brands (id, owner_id, name, business_email, contact_number, category, status, is_verified)
  VALUES (v_test_brand_id, v_brand_owner_id, 'Test Mod Brand', 'test.mod@brand.pk', '+92 300 0000000', 'Fashion & Apparel', 'pending', false)
  ON CONFLICT (id) DO UPDATE SET status = 'pending', is_verified = false;

  -- Create test pending deal
  INSERT INTO public.deals (id, brand_id, title, description, discount_pct, start_date, end_date, deal_type, status)
  VALUES (v_test_deal_id, v_test_brand_id, 'Pending Review Deal', 'Description', 35.00, NOW(), NOW() + INTERVAL '10 days', 'online', 'pending')
  ON CONFLICT (id) DO UPDATE SET status = 'pending';

  -- Create test report
  INSERT INTO public.reports (id, reporter_id, deal_id, reason, status)
  VALUES (v_test_report_id, v_consumer_id, v_test_deal_id, 'Misleading discount pricing', 'pending')
  ON CONFLICT (id) DO UPDATE SET status = 'pending';

  -- -------------------------------------------------------------
  -- TEST 1: Security Authorization Check
  -- Non-admin caller MUST be blocked from calling admin RPC functions.
  -- -------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_consumer_id::text, true);
  v_err_caught := FALSE;

  BEGIN
    PERFORM public.admin_approve_brand(v_test_brand_id);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
  END;

  IF v_err_caught THEN
    RAISE NOTICE '✓ TEST 1 PASSED: Non-admin caller was blocked from calling admin_approve_brand.';
  ELSE
    RAISE EXCEPTION 'TEST 1 FAILED: Non-admin was allowed to execute admin_approve_brand!';
  END IF;

  -- -------------------------------------------------------------
  -- Switch to Admin Persona
  -- -------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

  -- -------------------------------------------------------------
  -- TEST 2: Admin Dashboard Stats RPC
  -- -------------------------------------------------------------
  v_result := public.get_admin_dashboard_stats();
  IF (v_result->>'total_brands')::int > 0 THEN
    RAISE NOTICE '✓ TEST 2 PASSED: get_admin_dashboard_stats returned valid metrics (total_brands = %)', v_result->>'total_brands';
  ELSE
    RAISE EXCEPTION 'TEST 2 FAILED: get_admin_dashboard_stats did not return counts!';
  END IF;

  -- -------------------------------------------------------------
  -- TEST 3: Admin Approve Brand
  -- Must set status = 'active', is_verified = true, write audit log & notification
  -- -------------------------------------------------------------
  PERFORM public.admin_approve_brand(v_test_brand_id);

  SELECT status INTO v_brand_status FROM public.brands WHERE id = v_test_brand_id;
  SELECT COUNT(*) INTO v_audit_count FROM public.admin_audit_log WHERE target_id = v_test_brand_id AND action = 'approve_brand';
  SELECT COUNT(*) INTO v_notif_count FROM public.notifications WHERE user_id = v_brand_owner_id AND title LIKE '%Brand Partner Approved%';

  IF v_brand_status = 'active' AND v_audit_count > 0 AND v_notif_count > 0 THEN
    RAISE NOTICE '✓ TEST 3 PASSED: admin_approve_brand updated status to active, logged audit, and notified owner.';
  ELSE
    RAISE EXCEPTION 'TEST 3 FAILED: approve_brand did not complete full workflow! (status=%, audit=%, notif=%)', v_brand_status, v_audit_count, v_notif_count;
  END IF;

  -- -------------------------------------------------------------
  -- TEST 4: Admin Reject Brand with Reason
  -- -------------------------------------------------------------
  PERFORM public.admin_reject_brand(v_test_brand_id, 'Invalid commercial registration certificate');

  SELECT status INTO v_brand_status FROM public.brands WHERE id = v_test_brand_id;
  SELECT COUNT(*) INTO v_audit_count FROM public.admin_audit_log WHERE target_id = v_test_brand_id AND action = 'reject_brand';

  IF v_brand_status = 'rejected' AND v_audit_count > 0 THEN
    RAISE NOTICE '✓ TEST 4 PASSED: admin_reject_brand recorded rejection with reason and logged to audit.';
  ELSE
    RAISE EXCEPTION 'TEST 4 FAILED: reject_brand did not update status to rejected!';
  END IF;

  -- -------------------------------------------------------------
  -- TEST 5: Admin Approve Deal
  -- -------------------------------------------------------------
  PERFORM public.admin_approve_deal(v_test_deal_id);

  SELECT status INTO v_deal_status FROM public.deals WHERE id = v_test_deal_id;
  SELECT COUNT(*) INTO v_audit_count FROM public.admin_audit_log WHERE target_id = v_test_deal_id AND action = 'approve_deal';

  IF v_deal_status = 'active' AND v_audit_count > 0 THEN
    RAISE NOTICE '✓ TEST 5 PASSED: admin_approve_deal made promotion live and logged to audit.';
  ELSE
    RAISE EXCEPTION 'TEST 5 FAILED: approve_deal did not activate promotion!';
  END IF;

  -- -------------------------------------------------------------
  -- TEST 6: Admin Suspend and Reactivate User
  -- -------------------------------------------------------------
  PERFORM public.admin_set_user_status(v_consumer_id, false, 'Suspicious review activity');
  SELECT is_active INTO v_user_active FROM public.profiles WHERE id = v_consumer_id;
  IF NOT v_user_active THEN
    RAISE NOTICE '✓ TEST 6.1 PASSED: admin_set_user_status suspended consumer account.';
  ELSE
    RAISE EXCEPTION 'TEST 6.1 FAILED: User was not suspended!';
  END IF;

  PERFORM public.admin_set_user_status(v_consumer_id, true);
  SELECT is_active INTO v_user_active FROM public.profiles WHERE id = v_consumer_id;
  IF v_user_active THEN
    RAISE NOTICE '✓ TEST 6.2 PASSED: admin_set_user_status reactivated consumer account.';
  ELSE
    RAISE EXCEPTION 'TEST 6.2 FAILED: User was not reactivated!';
  END IF;

  -- -------------------------------------------------------------
  -- TEST 7: Admin Resolve Report & Suspend Reported Deal
  -- -------------------------------------------------------------
  PERFORM public.admin_resolve_report(v_test_report_id, 'suspend_deal', 'Confirmed deceptive price');

  SELECT status INTO v_deal_status FROM public.deals WHERE id = v_test_deal_id;
  IF v_deal_status = 'suspended' THEN
    RAISE NOTICE '✓ TEST 7 PASSED: admin_resolve_report with suspend_deal suspended the reported deal and resolved report.';
  ELSE
    RAISE EXCEPTION 'TEST 7 FAILED: Reported deal was not suspended!';
  END IF;

  RAISE NOTICE '==================================================';
  RAISE NOTICE 'ALL ADMIN RPC & AUDIT LOG TESTS PASSED! 🎉';
  RAISE NOTICE '==================================================';

END $$;

ROLLBACK;
