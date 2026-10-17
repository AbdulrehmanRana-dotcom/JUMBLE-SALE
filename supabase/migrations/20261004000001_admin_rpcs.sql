-- ====================================================================
-- JUMBLE SALE — ADMIN SECURE RPC FUNCTIONS & AUDIT LOGGING
-- ====================================================================

-- 1. Additional Policies for Admins
DROP POLICY IF EXISTS "Admins insert audit logs" ON public.admin_audit_log;
CREATE POLICY "Admins insert audit logs"
  ON public.admin_audit_log FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins insert notifications" ON public.notifications;
CREATE POLICY "Admins insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete brands" ON public.brands;
CREATE POLICY "Admins delete brands"
  ON public.brands FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins delete profiles" ON public.profiles;
CREATE POLICY "Admins delete profiles"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins read all reports" ON public.reports;
CREATE POLICY "Admins read all reports"
  ON public.reports FOR SELECT
  USING (public.is_admin());


-- 2. RPC: get_admin_dashboard_stats
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_users_count INT;
  v_brands_count INT;
  v_pending_brands_count INT;
  v_deals_count INT;
  v_pending_deals_count INT;
  v_active_deals_count INT;
  v_pending_reports_count INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an authorized administrator.';
  END IF;

  SELECT COUNT(*) INTO v_users_count FROM public.profiles WHERE role = 'consumer';
  SELECT COUNT(*) INTO v_brands_count FROM public.brands;
  SELECT COUNT(*) INTO v_pending_brands_count FROM public.brands WHERE status = 'pending';
  SELECT COUNT(*) INTO v_deals_count FROM public.deals;
  SELECT COUNT(*) INTO v_pending_deals_count FROM public.deals WHERE status = 'pending';
  SELECT COUNT(*) INTO v_active_deals_count FROM public.deals WHERE status = 'active';
  SELECT COUNT(*) INTO v_pending_reports_count FROM public.reports WHERE status = 'pending';

  RETURN jsonb_build_object(
    'total_users', v_users_count,
    'total_brands', v_brands_count,
    'pending_brands', v_pending_brands_count,
    'total_deals', v_deals_count,
    'pending_deals', v_pending_deals_count,
    'active_deals', v_active_deals_count,
    'pending_reports', v_pending_reports_count
  );
END;
$$;


-- 3. RPC: admin_approve_brand
CREATE OR REPLACE FUNCTION public.admin_approve_brand(p_brand_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_brand_name TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an authorized administrator.';
  END IF;

  UPDATE public.brands
  SET status = 'active',
      is_verified = true,
      rejection_reason = NULL
  WHERE id = p_brand_id
  RETURNING owner_id, name INTO v_owner_id, v_brand_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brand not found with ID %', p_brand_id;
  END IF;

  -- Update profiles table if brand_status column exists
  UPDATE public.profiles
  SET is_active = true
  WHERE id = v_owner_id;

  -- Write to admin audit log
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'approve_brand',
    'brand',
    p_brand_id,
    jsonb_build_object('brand_name', v_brand_name)
  );

  -- Notify brand owner
  INSERT INTO public.notifications (user_id, title, body)
  VALUES (
    v_owner_id,
    'Brand Partner Approved! 🎉',
    'Congratulations! Your brand "' || v_brand_name || '" has been verified and approved. You can now post promotions and view analytics.'
  );

  RETURN jsonb_build_object('success', true, 'brand_id', p_brand_id, 'status', 'active');
END;
$$;


-- 4. RPC: admin_reject_brand
CREATE OR REPLACE FUNCTION public.admin_reject_brand(p_brand_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_brand_name TEXT;
  v_clean_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Application does not meet platform verification criteria.');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an authorized administrator.';
  END IF;

  UPDATE public.brands
  SET status = 'rejected',
      is_verified = false,
      rejection_reason = v_clean_reason
  WHERE id = p_brand_id
  RETURNING owner_id, name INTO v_owner_id, v_brand_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brand not found with ID %', p_brand_id;
  END IF;

  -- Write to admin audit log
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'reject_brand',
    'brand',
    p_brand_id,
    jsonb_build_object('brand_name', v_brand_name, 'reason', v_clean_reason)
  );

  -- Notify brand owner
  INSERT INTO public.notifications (user_id, title, body)
  VALUES (
    v_owner_id,
    'Brand Partner Application Update',
    'Your partner application for "' || v_brand_name || '" was reviewed and could not be approved. Reason: ' || v_clean_reason
  );

  RETURN jsonb_build_object('success', true, 'brand_id', p_brand_id, 'status', 'rejected');
END;
$$;


-- 5. RPC: admin_suspend_brand
CREATE OR REPLACE FUNCTION public.admin_suspend_brand(p_brand_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_brand_name TEXT;
  v_clean_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Account suspended by platform administration.');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an authorized administrator.';
  END IF;

  UPDATE public.brands
  SET status = 'suspended',
      rejection_reason = v_clean_reason
  WHERE id = p_brand_id
  RETURNING owner_id, name INTO v_owner_id, v_brand_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brand not found with ID %', p_brand_id;
  END IF;

  -- Also suspend active deals
  UPDATE public.deals
  SET status = 'suspended'
  WHERE brand_id = p_brand_id AND status = 'active';

  -- Write to admin audit log
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'suspend_brand',
    'brand',
    p_brand_id,
    jsonb_build_object('brand_name', v_brand_name, 'reason', v_clean_reason)
  );

  -- Notify brand owner
  INSERT INTO public.notifications (user_id, title, body)
  VALUES (
    v_owner_id,
    'Brand Account Suspended',
    'Your brand account "' || v_brand_name || '" has been suspended. Reason: ' || v_clean_reason
  );

  RETURN jsonb_build_object('success', true, 'brand_id', p_brand_id, 'status', 'suspended');
END;
$$;


-- 6. RPC: admin_reactivate_brand
CREATE OR REPLACE FUNCTION public.admin_reactivate_brand(p_brand_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_brand_name TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an authorized administrator.';
  END IF;

  UPDATE public.brands
  SET status = 'active',
      is_verified = true,
      rejection_reason = NULL
  WHERE id = p_brand_id
  RETURNING owner_id, name INTO v_owner_id, v_brand_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brand not found with ID %', p_brand_id;
  END IF;

  -- Write to admin audit log
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'reactivate_brand',
    'brand',
    p_brand_id,
    jsonb_build_object('brand_name', v_brand_name)
  );

  -- Notify brand owner
  INSERT INTO public.notifications (user_id, title, body)
  VALUES (
    v_owner_id,
    'Brand Account Reactivated! 🎉',
    'Your brand account "' || v_brand_name || '" has been reactivated. You can now publish promotions.'
  );

  RETURN jsonb_build_object('success', true, 'brand_id', p_brand_id, 'status', 'active');
END;
$$;


-- 7. RPC: admin_delete_brand
CREATE OR REPLACE FUNCTION public.admin_delete_brand(p_brand_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_brand_name TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an authorized administrator.';
  END IF;

  SELECT owner_id, name INTO v_owner_id, v_brand_name
  FROM public.brands
  WHERE id = p_brand_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brand not found with ID %', p_brand_id;
  END IF;

  DELETE FROM public.brands WHERE id = p_brand_id;

  -- Write to admin audit log
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'delete_brand',
    'brand',
    p_brand_id,
    jsonb_build_object('brand_name', v_brand_name)
  );

  -- Notify user
  INSERT INTO public.notifications (user_id, title, body)
  VALUES (
    v_owner_id,
    'Brand Profile Removed',
    'Your brand profile "' || v_brand_name || '" has been removed by platform administration.'
  );

  RETURN jsonb_build_object('success', true, 'brand_id', p_brand_id);
END;
$$;


-- 8. RPC: admin_approve_deal
CREATE OR REPLACE FUNCTION public.admin_approve_deal(p_deal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_brand_id UUID;
  v_title TEXT;
  v_owner_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an authorized administrator.';
  END IF;

  UPDATE public.deals
  SET status = 'active',
      rejection_reason = NULL,
      updated_at = NOW()
  WHERE id = p_deal_id
  RETURNING brand_id, title INTO v_brand_id, v_title;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found with ID %', p_deal_id;
  END IF;

  SELECT owner_id INTO v_owner_id FROM public.brands WHERE id = v_brand_id;

  -- Write to admin audit log
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'approve_deal',
    'deal',
    p_deal_id,
    jsonb_build_object('title', v_title, 'brand_id', v_brand_id)
  );

  -- Notify brand owner
  IF v_owner_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, deal_id)
    VALUES (
      v_owner_id,
      'Promotion Approved! 🚀',
      'Your promotion "' || v_title || '" has been approved and is now live on the marketplace.',
      p_deal_id
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'deal_id', p_deal_id, 'status', 'active');
END;
$$;


-- 9. RPC: admin_reject_deal
CREATE OR REPLACE FUNCTION public.admin_reject_deal(p_deal_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_brand_id UUID;
  v_title TEXT;
  v_owner_id UUID;
  v_clean_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Promotion does not comply with community or pricing guidelines.');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an authorized administrator.';
  END IF;

  UPDATE public.deals
  SET status = 'rejected',
      rejection_reason = v_clean_reason,
      updated_at = NOW()
  WHERE id = p_deal_id
  RETURNING brand_id, title INTO v_brand_id, v_title;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found with ID %', p_deal_id;
  END IF;

  SELECT owner_id INTO v_owner_id FROM public.brands WHERE id = v_brand_id;

  -- Write to admin audit log
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'reject_deal',
    'deal',
    p_deal_id,
    jsonb_build_object('title', v_title, 'reason', v_clean_reason)
  );

  -- Notify brand owner
  IF v_owner_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, deal_id)
    VALUES (
      v_owner_id,
      'Promotion Not Approved',
      'Your promotion "' || v_title || '" was rejected. Reason: ' || v_clean_reason,
      p_deal_id
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'deal_id', p_deal_id, 'status', 'rejected');
END;
$$;


-- 10. RPC: admin_suspend_deal
CREATE OR REPLACE FUNCTION public.admin_suspend_deal(p_deal_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_brand_id UUID;
  v_title TEXT;
  v_owner_id UUID;
  v_clean_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Promotion suspended by platform moderation.');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an authorized administrator.';
  END IF;

  UPDATE public.deals
  SET status = 'suspended',
      rejection_reason = v_clean_reason,
      updated_at = NOW()
  WHERE id = p_deal_id
  RETURNING brand_id, title INTO v_brand_id, v_title;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found with ID %', p_deal_id;
  END IF;

  SELECT owner_id INTO v_owner_id FROM public.brands WHERE id = v_brand_id;

  -- Write to admin audit log
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'suspend_deal',
    'deal',
    p_deal_id,
    jsonb_build_object('title', v_title, 'reason', v_clean_reason)
  );

  -- Notify brand owner
  IF v_owner_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, deal_id)
    VALUES (
      v_owner_id,
      'Promotion Suspended',
      'Your promotion "' || v_title || '" has been suspended. Reason: ' || v_clean_reason,
      p_deal_id
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'deal_id', p_deal_id, 'status', 'suspended');
END;
$$;


-- 11. RPC: admin_set_user_status (Suspend / Reactivate consumer or brand user)
CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_user_id UUID, p_is_active BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_display_name TEXT;
  v_clean_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), CASE WHEN p_is_active THEN 'Account reactivated by admin.' ELSE 'Account suspended by admin.' END);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an authorized administrator.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Security error: You cannot suspend your own admin account.';
  END IF;

  UPDATE public.profiles
  SET is_active = p_is_active
  WHERE id = p_user_id
  RETURNING email, display_name INTO v_email, v_display_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found with ID %', p_user_id;
  END IF;

  -- Write to admin audit log
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN p_is_active THEN 'reactivate_user' ELSE 'suspend_user' END,
    'user',
    p_user_id,
    jsonb_build_object('email', v_email, 'name', v_display_name, 'reason', v_clean_reason)
  );

  -- Notify user
  INSERT INTO public.notifications (user_id, title, body)
  VALUES (
    p_user_id,
    CASE WHEN p_is_active THEN 'Account Reactivated! 🎉' ELSE 'Account Suspended' END,
    CASE WHEN p_is_active THEN 'Your account has been reactivated. You can now log in and browse deals.' ELSE 'Your account has been suspended by an administrator. Reason: ' || v_clean_reason END
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'is_active', p_is_active);
END;
$$;


-- 12. RPC: admin_delete_user
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an authorized administrator.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Security error: You cannot delete your own admin account.';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found with ID %', p_user_id;
  END IF;

  DELETE FROM public.profiles WHERE id = p_user_id;

  -- Write to admin audit log
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'delete_user',
    'user',
    p_user_id,
    jsonb_build_object('email', v_email)
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id);
END;
$$;


-- 13. RPC: admin_resolve_report
CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  p_report_id UUID,
  p_action TEXT, -- 'dismiss', 'resolve', 'suspend_deal'
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_reporter_id UUID;
  v_deal_id UUID;
  v_deal_title TEXT;
  v_brand_id UUID;
  v_brand_owner_id UUID;
  v_clean_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Action taken by platform moderation.');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: Caller is not an authorized administrator.';
  END IF;

  SELECT reporter_id, deal_id
  INTO v_reporter_id, v_deal_id
  FROM public.reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found with ID %', p_report_id;
  END IF;

  SELECT title, brand_id INTO v_deal_title, v_brand_id
  FROM public.deals
  WHERE id = v_deal_id;

  IF v_brand_id IS NOT NULL THEN
    SELECT owner_id INTO v_brand_owner_id FROM public.brands WHERE id = v_brand_id;
  END IF;

  IF p_action = 'dismiss' THEN
    UPDATE public.reports SET status = 'dismissed' WHERE id = p_report_id;

    -- Notify reporter
    IF v_reporter_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, deal_id)
      VALUES (
        v_reporter_id,
        'Report Reviewed',
        'Thank you for reporting "' || COALESCE(v_deal_title, 'deal') || '". After review, no violation was found and the report was dismissed.',
        v_deal_id
      );
    END IF;

  ELSIF p_action = 'resolve' THEN
    UPDATE public.reports SET status = 'resolved' WHERE id = p_report_id;

    -- Notify reporter
    IF v_reporter_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, deal_id)
      VALUES (
        v_reporter_id,
        'Report Resolved',
        'Thank you! Action has been taken regarding "' || COALESCE(v_deal_title, 'deal') || '".',
        v_deal_id
      );
    END IF;

  ELSIF p_action = 'suspend_deal' THEN
    UPDATE public.reports SET status = 'resolved' WHERE id = p_report_id;

    -- Suspend the reported deal
    UPDATE public.deals
    SET status = 'suspended',
        rejection_reason = 'Suspended due to report: ' || v_clean_reason
    WHERE id = v_deal_id;

    -- Notify brand owner
    IF v_brand_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, deal_id)
      VALUES (
        v_brand_owner_id,
        'Promotion Suspended Due to User Report',
        'Your promotion "' || COALESCE(v_deal_title, 'deal') || '" was suspended following a user report. Reason: ' || v_clean_reason,
        v_deal_id
      );
    END IF;

    -- Notify reporter
    IF v_reporter_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, deal_id)
      VALUES (
        v_reporter_id,
        'Deal Suspended from Platform',
        'Thank you for helping keep Jumble Sale trustworthy. The reported promotion has been suspended.',
        v_deal_id
      );
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid action: %. Must be dismiss, resolve, or suspend_deal.', p_action;
  END IF;

  -- Write to admin audit log
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'report_' || p_action,
    'report',
    p_report_id,
    jsonb_build_object('deal_id', v_deal_id, 'action', p_action, 'reason', v_clean_reason)
  );

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'action', p_action);
END;
$$;
