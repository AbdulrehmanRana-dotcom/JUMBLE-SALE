-- ====================================================================
-- JUMBLE SALE: MANUAL PG_CRON & ANALYTICS TESTING SCRIPT
-- ====================================================================
-- You can run these commands directly in the Supabase SQL Editor
-- to test and verify all automated cron jobs and aggregation logic.

-- --------------------------------------------------------------------
-- 1. TEST DEAL LIFECYCLE (process_deal_lifecycle)
-- --------------------------------------------------------------------
-- A. Create a dummy active deal that ended 1 hour ago
INSERT INTO public.deals (
  id, brand_id, title, description, category, discount_percent,
  deal_type, terms, images, start_date, end_date, status
)
SELECT
  'ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid,
  (SELECT id FROM public.brands WHERE status = 'active' LIMIT 1),
  'Test Expired Lifecycle Deal',
  'Automated test deal that should be marked expired',
  'Fashion',
  50,
  'online',
  'Test terms',
  ARRAY['https://picsum.photos/400/300'],
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '1 hour',
  'active'
ON CONFLICT (id) DO UPDATE SET
  status = 'active',
  end_date = NOW() - INTERVAL '1 hour';

-- B. Execute the deal lifecycle procedure
SELECT public.process_deal_lifecycle();

-- C. Verify the deal was updated to 'expired'
SELECT id, title, status, end_date
FROM public.deals
WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid;
-- Expected output: status = 'expired'


-- --------------------------------------------------------------------
-- 2. TEST DAILY ANALYTICS AGGREGATION (aggregate_daily_analytics)
-- --------------------------------------------------------------------
-- A. Insert test interactions for today
INSERT INTO public.interactions (user_id, deal_id, type, created_at)
SELECT
  (SELECT id FROM public.profiles WHERE role = 'consumer' LIMIT 1),
  'ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid,
  unnest(ARRAY['view', 'view', 'click', 'save', 'like']),
  NOW();

-- B. Execute the daily aggregation job for CURRENT_DATE
SELECT public.aggregate_daily_analytics(CURRENT_DATE);

-- C. Verify aggregated totals in analytics_daily
SELECT
  date, deal_id, brand_id, views_count, clicks_count, saves_count, likes_count
FROM public.analytics_daily
WHERE deal_id = 'ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid
  AND date = CURRENT_DATE;
-- Expected: views_count >= 2, clicks_count >= 1, saves_count >= 1, likes_count >= 1


-- --------------------------------------------------------------------
-- 3. TEST EXPIRING SAVED DEALS (check_expiring_saved_deals)
-- --------------------------------------------------------------------
-- A. Create an active deal expiring in 12 hours
INSERT INTO public.deals (
  id, brand_id, title, description, category, discount_percent,
  deal_type, terms, images, start_date, end_date, status
)
SELECT
  'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid,
  (SELECT id FROM public.brands WHERE status = 'active' LIMIT 1),
  'Urgent Flash Sale',
  'Deal expiring soon test',
  'Electronics',
  40,
  'online',
  'Valid today only',
  ARRAY['https://picsum.photos/400/300'],
  NOW() - INTERVAL '1 day',
  NOW() + INTERVAL '12 hours',
  'active'
ON CONFLICT (id) DO UPDATE SET
  status = 'active',
  end_date = NOW() + INTERVAL '12 hours';

-- B. Save this deal for a consumer user with notifications_enabled = true
INSERT INTO public.saved_deals (user_id, deal_id)
SELECT
  p.id,
  'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid
FROM public.profiles p
WHERE p.role = 'consumer' AND p.notifications_enabled = true
LIMIT 1
ON CONFLICT DO NOTHING;

-- C. Execute expiring deals check
SELECT public.check_expiring_saved_deals();

-- D. Verify notification was dispatched
SELECT n.id, n.title, n.body, n.deal_id, n.created_at
FROM public.notifications n
WHERE n.deal_id = 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid
ORDER BY n.created_at DESC
LIMIT 1;
-- Expected: Title like 'Deal Expiring Soon! ⏰'


-- --------------------------------------------------------------------
-- 4. CLEANUP TEST DATA (Optional)
-- --------------------------------------------------------------------
DELETE FROM public.interactions WHERE deal_id IN ('ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid);
DELETE FROM public.analytics_daily WHERE deal_id IN ('ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid);
DELETE FROM public.saved_deals WHERE deal_id = 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid;
DELETE FROM public.notifications WHERE deal_id IN ('ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid);
DELETE FROM public.deals WHERE id IN ('ffffffff-ffff-ffff-ffff-ffffffff0001'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffff0002'::uuid);
