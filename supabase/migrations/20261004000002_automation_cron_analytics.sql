-- ====================================================================
-- JUMBLE SALE — AUTOMATION, NOTIFICATIONS & ANALYTICS CRON JOBS
-- ====================================================================

-- 1. Profile notifications toggle
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true;

-- 2. Deal Lifecycle Management Function (Runs every 15 minutes)
-- Sets expired deals when end_date < NOW().
-- Activates approved deals when start_date <= NOW() if pending.
CREATE OR REPLACE FUNCTION public.process_deal_lifecycle()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_expired_count INT := 0;
  v_activated_count INT := 0;
BEGIN
  -- A. Expire active deals where end_date has passed
  WITH expired_rows AS (
    UPDATE public.deals
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'active'
      AND end_date < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired_count FROM expired_rows;

  -- B. Auto-activate approved pending deals whose start_date has arrived (and brand is active)
  WITH activated_rows AS (
    UPDATE public.deals
    SET status = 'active',
        updated_at = NOW()
    WHERE status = 'pending'
      AND start_date <= NOW()
      AND end_date > NOW()
      AND EXISTS (
        SELECT 1 FROM public.brands
        WHERE id = deals.brand_id
          AND status = 'active'
          AND is_verified = true
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_activated_count FROM activated_rows;

  RETURN jsonb_build_object(
    'success', true,
    'expired_deals', v_expired_count,
    'activated_deals', v_activated_count,
    'timestamp', NOW()
  );
END;
$$;


-- 3. Daily Analytics Aggregation Function (Runs every hour / end of day)
-- Rolls interactions up into analytics_daily by date and deal_id.
CREATE OR REPLACE FUNCTION public.aggregate_daily_analytics(p_target_date DATE DEFAULT CURRENT_DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rows_processed INT := 0;
  v_target_date DATE := COALESCE(p_target_date, CURRENT_DATE);
BEGIN
  WITH aggregated AS (
    SELECT
      i.created_at::date AS int_date,
      i.deal_id,
      d.brand_id,
      COUNT(*) FILTER (WHERE i.type = 'view') AS views_count,
      COUNT(*) FILTER (WHERE i.type = 'click') AS clicks_count,
      COUNT(*) FILTER (WHERE i.type = 'save') AS saves_count,
      COUNT(*) FILTER (WHERE i.type = 'like') AS likes_count
    FROM public.interactions i
    JOIN public.deals d ON d.id = i.deal_id
    WHERE i.created_at::date = v_target_date
    GROUP BY i.created_at::date, i.deal_id, d.brand_id
  ),
  upserted AS (
    INSERT INTO public.analytics_daily (
      date, deal_id, brand_id, views_count, clicks_count, saves_count, likes_count, created_at
    )
    SELECT
      int_date,
      deal_id,
      brand_id,
      views_count,
      clicks_count,
      saves_count,
      likes_count,
      NOW()
    FROM aggregated
    ON CONFLICT (date, deal_id) DO UPDATE SET
      views_count = EXCLUDED.views_count,
      clicks_count = EXCLUDED.clicks_count,
      saves_count = EXCLUDED.saves_count,
      likes_count = EXCLUDED.likes_count,
      created_at = NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_rows_processed FROM upserted;

  RETURN jsonb_build_object(
    'success', true,
    'date', v_target_date,
    'rows_aggregated', v_rows_processed,
    'timestamp', NOW()
  );
END;
$$;


-- 4. Check Expiring Saved Deals (Runs hourly)
-- Notifies shoppers who saved a deal expiring within 24 hours
CREATE OR REPLACE FUNCTION public.check_expiring_saved_deals()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_notifs_sent INT := 0;
BEGIN
  WITH expiring AS (
    SELECT
      sd.user_id,
      d.id AS deal_id,
      d.title AS deal_title,
      d.end_date
    FROM public.saved_deals sd
    JOIN public.deals d ON d.id = sd.deal_id
    JOIN public.profiles p ON p.id = sd.user_id
    WHERE d.status = 'active'
      AND d.end_date > NOW()
      AND d.end_date <= (NOW() + INTERVAL '24 hours')
      AND p.is_active = true
      AND p.notifications_enabled = true
      -- Ensure not already notified for this deal in the last 24 hours
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = sd.user_id
          AND n.deal_id = d.id
          AND n.title LIKE '%Deal Expiring Soon%'
          AND n.created_at >= (NOW() - INTERVAL '24 hours')
      )
  ),
  inserted_notifs AS (
    INSERT INTO public.notifications (user_id, title, body, deal_id)
    SELECT
      user_id,
      'Deal Expiring Soon! ⏰',
      'Hurry! Your saved deal "' || deal_title || '" expires in less than 24 hours.',
      deal_id
    FROM expiring
    RETURNING id
  )
  SELECT COUNT(*) INTO v_notifs_sent FROM inserted_notifs;

  RETURN jsonb_build_object(
    'success', true,
    'expiring_notifications_sent', v_notifs_sent,
    'timestamp', NOW()
  );
END;
$$;


-- 5. Notify Brand Followers on New Approved Deal Function
CREATE OR REPLACE FUNCTION public.notify_brand_followers_on_deal_approval(p_deal_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_brand_id UUID;
  v_brand_name TEXT;
  v_deal_title TEXT;
  v_notifs_count INT := 0;
BEGIN
  SELECT brand_id, title INTO v_brand_id, v_deal_title
  FROM public.deals
  WHERE id = p_deal_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT name INTO v_brand_name
  FROM public.brands
  WHERE id = v_brand_id;

  WITH followers_notified AS (
    INSERT INTO public.notifications (user_id, title, body, deal_id)
    SELECT
      f.user_id,
      'New Deal from ' || v_brand_name || '! 🔥',
      v_brand_name || ' just posted a new offer: "' || v_deal_title || '". Tap to check it out!',
      p_deal_id
    FROM public.follows f
    JOIN public.profiles p ON p.id = f.user_id
    WHERE f.brand_id = v_brand_id
      AND p.is_active = true
      AND p.notifications_enabled = true
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = f.user_id
          AND n.deal_id = p_deal_id
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_notifs_count FROM followers_notified;

  RETURN v_notifs_count;
END;
$$;

-- Trigger: Whenever deal becomes active, notify followers of that brand
CREATE OR REPLACE FUNCTION public.trigger_deal_approved_notify_followers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') THEN
    PERFORM public.notify_brand_followers_on_deal_approval(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_followers_on_deal_approval ON public.deals;
CREATE TRIGGER trg_notify_followers_on_deal_approval
  AFTER UPDATE OF status ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_deal_approved_notify_followers();


-- 6. Schedule pg_cron jobs if pg_cron is enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- A. Deal lifecycle job every 15 minutes
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deal-lifecycle-job') THEN
      PERFORM cron.unschedule('deal-lifecycle-job');
    END IF;
    PERFORM cron.schedule('deal-lifecycle-job', '*/15 * * * *', 'SELECT public.process_deal_lifecycle()');

    -- B. Analytics daily aggregation every hour
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-analytics-aggregation') THEN
      PERFORM cron.unschedule('daily-analytics-aggregation');
    END IF;
    PERFORM cron.schedule('daily-analytics-aggregation', '0 * * * *', 'SELECT public.aggregate_daily_analytics(CURRENT_DATE)');

    -- C. Expiring saved deals check every hour
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expiring-saved-deals-job') THEN
      PERFORM cron.unschedule('expiring-saved-deals-job');
    END IF;
    PERFORM cron.schedule('expiring-saved-deals-job', '0 * * * *', 'SELECT public.check_expiring_saved_deals()');
  END IF;
END $$;
