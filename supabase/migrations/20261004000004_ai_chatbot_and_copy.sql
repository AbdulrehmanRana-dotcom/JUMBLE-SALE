-- ====================================================================
-- JUMBLE SALE — AI CHATBOT & PROMO COPY GENERATION SCHEMA
-- ====================================================================

-- 1. Enhance chat_messages table with deal_ids and metadata
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS deal_ids UUID[] DEFAULT '{}'::uuid[];

ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Index for speedy chat history retrieval
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_created 
ON public.chat_messages (user_id, created_at ASC);

-- 2. RLS Security on chat_messages (Users can ONLY access their own chat messages)
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own chat messages" ON public.chat_messages;
CREATE POLICY "Users can view own chat messages"
  ON public.chat_messages
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own chat messages" ON public.chat_messages;
CREATE POLICY "Users can insert own chat messages"
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 3. Chat Rate Limiting Function
-- Restricts users to at most 15 chat messages per minute
CREATE OR REPLACE FUNCTION public.check_chat_rate_limit(
  p_user_id UUID,
  p_max_requests INT DEFAULT 15,
  p_window_seconds INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_is_allowed BOOLEAN := true;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'count', 0);
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.chat_messages
  WHERE user_id = p_user_id
    AND role = 'user'
    AND created_at >= (NOW() - (p_window_seconds || ' seconds')::interval);

  IF v_count >= p_max_requests THEN
    v_is_allowed := false;
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_is_allowed,
    'count', v_count,
    'limit', p_max_requests,
    'window_seconds', p_window_seconds
  );
END;
$$;


-- 4. Search Active Deals for AI Chatbot Function
-- Queries strictly REAL active, non-expired promotions in the database
CREATE OR REPLACE FUNCTION public.search_deals_for_chat(
  p_keywords TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_brand TEXT DEFAULT NULL,
  p_min_discount NUMERIC DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_deal_type TEXT DEFAULT NULL,
  p_ending_soon BOOLEAN DEFAULT false,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  discount_pct NUMERIC,
  deal_type public.deal_type,
  city TEXT,
  image_urls TEXT[],
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status public.deal_status,
  brand_id UUID,
  brand_name TEXT,
  brand_logo TEXT,
  category_id UUID,
  category_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.description,
    d.discount_pct,
    d.deal_type,
    d.city,
    d.image_urls,
    d.start_date,
    d.end_date,
    d.status,
    d.brand_id,
    b.name AS brand_name,
    b.logo_url AS brand_logo,
    d.category_id,
    c.name AS category_name
  FROM public.deals d
  JOIN public.brands b ON b.id = d.brand_id
  LEFT JOIN public.categories c ON c.id = d.category_id
  WHERE d.status = 'active'
    AND d.end_date > NOW()
    -- Category filter
    AND (
      p_category IS NULL OR
      c.name ILIKE '%' || p_category || '%' OR
      d.category_id::text = p_category
    )
    -- Brand filter
    AND (
      p_brand IS NULL OR
      b.name ILIKE '%' || p_brand || '%'
    )
    -- Minimum discount filter
    AND (
      p_min_discount IS NULL OR
      d.discount_pct >= p_min_discount
    )
    -- City filter
    AND (
      p_city IS NULL OR
      d.city ILIKE '%' || p_city || '%'
    )
    -- Deal Type filter ('online' or 'in_store')
    AND (
      p_deal_type IS NULL OR
      p_deal_type = 'all' OR
      d.deal_type::text = p_deal_type
    )
    -- Free text search
    AND (
      p_keywords IS NULL OR
      d.title ILIKE '%' || p_keywords || '%' OR
      d.description ILIKE '%' || p_keywords || '%' OR
      b.name ILIKE '%' || p_keywords || '%' OR
      c.name ILIKE '%' || p_keywords || '%'
    )
  ORDER BY
    CASE WHEN p_ending_soon THEN d.end_date END ASC,
    d.discount_pct DESC,
    d.created_at DESC
  LIMIT p_limit;
END;
$$;
