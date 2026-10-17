-- ====================================================================
-- JUMBLE SALE — HYBRID AI RECOMMENDATION ENGINE (PGVECTOR & GEMINI)
-- ====================================================================

-- 1. Ensure pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Ensure deals table has 768-dimensional embedding column (Gemini text-embedding-004)
DO $$
BEGIN
  -- If embedding column exists with 1536, alter or recreate for 768
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'deals' 
      AND column_name = 'embedding'
  ) THEN
    ALTER TABLE public.deals ALTER COLUMN embedding TYPE vector(768) USING NULL;
  ELSE
    ALTER TABLE public.deals ADD COLUMN embedding vector(768);
  END IF;
END $$;

-- Create index for fast cosine distance matching
DROP INDEX IF EXISTS idx_deals_embedding_cosine;
CREATE INDEX idx_deals_embedding_cosine ON public.deals USING hnsw (embedding vector_cosine_ops);

-- 3. Update user_preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  favorite_categories UUID[] DEFAULT '{}'::uuid[],
  preferred_cities TEXT[] DEFAULT '{}'::text[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_preferences 
ADD COLUMN IF NOT EXISTS preference_vector vector(768);

-- 4. Helper Function: Calculate Weighted Preference Vector in PL/pgSQL
CREATE OR REPLACE FUNCTION public.calculate_user_preference_vector(p_user_id UUID)
RETURNS vector(768)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_dim CONSTANT INT := 768;
  v_res_arr float8[];
  v_deal_arr float8[];
  v_weight float8;
  v_total_weight float8 := 0;
  v_norm float8 := 0;
  v_rec RECORD;
  i INT;
  v_out_str TEXT;
BEGIN
  -- Initialize zero array of 768 dimensions
  v_res_arr := array_fill(0.0::float8, ARRAY[v_dim]);

  -- Query user's interactions with active deal embeddings
  -- save: 5.0, like: 4.0, click: 2.0, view: 0.5
  -- Recency decay: 1 / (1 + 0.1 * age_in_days)
  FOR v_rec IN
    SELECT
      d.embedding,
      (
        CASE i.type
          WHEN 'save' THEN 5.0
          WHEN 'like' THEN 4.0
          WHEN 'click' THEN 2.0
          WHEN 'view' THEN 0.5
          ELSE 0.1
        END * 
        (1.0 / (1.0 + 0.1 * (EXTRACT(EPOCH FROM (NOW() - i.created_at)) / 86400.0)))
      ) AS computed_weight
    FROM public.interactions i
    JOIN public.deals d ON d.id = i.deal_id
    WHERE i.user_id = p_user_id
      AND d.embedding IS NOT NULL
    ORDER BY i.created_at DESC
    LIMIT 100
  LOOP
    v_weight := v_rec.computed_weight;
    v_total_weight := v_total_weight + v_weight;

    -- Extract vector values as float array
    v_deal_arr := string_to_array(trim(both '[]' from v_rec.embedding::text), ',')::float8[];

    -- Accumulate weighted vector components
    FOR i IN 1..v_dim LOOP
      v_res_arr[i] := v_res_arr[i] + (v_deal_arr[i] * v_weight);
    END LOOP;
  END LOOP;

  -- If no interactions with embeddings, return NULL
  IF v_total_weight = 0 THEN
    RETURN NULL;
  END IF;

  -- Calculate L2 norm for unit normalization
  FOR i IN 1..v_dim LOOP
    v_norm := v_norm + (v_res_arr[i] * v_res_arr[i]);
  END LOOP;
  v_norm := sqrt(v_norm);

  IF v_norm = 0 THEN
    RETURN NULL;
  END IF;

  -- Normalize to unit vector
  FOR i IN 1..v_dim LOOP
    v_res_arr[i] := v_res_arr[i] / v_norm;
  END LOOP;

  -- Format as string to cast to vector
  v_out_str := '[' || array_to_string(v_res_arr, ',') || ']';
  RETURN v_out_str::vector(768);
END;
$$;


-- 5. Stored Procedure: Refresh a specific user's preference vector
CREATE OR REPLACE FUNCTION public.refresh_user_preference_vector(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pref_vector vector(768);
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_id is required');
  END IF;

  v_pref_vector := public.calculate_user_preference_vector(p_user_id);

  INSERT INTO public.user_preferences (user_id, preference_vector, updated_at)
  VALUES (p_user_id, v_pref_vector, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    preference_vector = EXCLUDED.preference_vector,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'has_vector', (v_pref_vector IS NOT NULL),
    'updated_at', NOW()
  );
END;
$$;


-- 6. Stored Procedure: Refresh all active users' preference vectors (Daily pg_cron)
CREATE OR REPLACE FUNCTION public.refresh_all_user_preferences()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_count INT := 0;
BEGIN
  -- Loop through users who had interactions in the last 30 days
  FOR v_user IN
    SELECT DISTINCT user_id
    FROM public.interactions
    WHERE user_id IS NOT NULL
      AND created_at >= (NOW() - INTERVAL '30 days')
  LOOP
    PERFORM public.refresh_user_preference_vector(v_user.user_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'users_refreshed', v_count,
    'timestamp', NOW()
  );
END;
$$;


-- 7. Trigger: Strong signal (save or like) automatically refreshes preference vector
CREATE OR REPLACE FUNCTION public.trigger_refresh_preference_on_strong_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF (TG_TABLE_NAME = 'interactions' AND NEW.type IN ('save', 'like') AND NEW.user_id IS NOT NULL) THEN
      PERFORM public.refresh_user_preference_vector(NEW.user_id);
    ELSIF (TG_TABLE_NAME IN ('saved_deals', 'likes') AND NEW.user_id IS NOT NULL) THEN
      PERFORM public.refresh_user_preference_vector(NEW.user_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_interaction_strong_signal ON public.interactions;
CREATE TRIGGER trg_interaction_strong_signal
  AFTER INSERT ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_refresh_preference_on_strong_signal();

DROP TRIGGER IF EXISTS trg_saved_deals_preference_refresh ON public.saved_deals;
CREATE TRIGGER trg_saved_deals_preference_refresh
  AFTER INSERT ON public.saved_deals
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_refresh_preference_on_strong_signal();

DROP TRIGGER IF EXISTS trg_likes_preference_refresh ON public.likes;
CREATE TRIGGER trg_likes_preference_refresh
  AFTER INSERT ON public.likes
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_refresh_preference_on_strong_signal();


-- 8. Core Hybrid Recommendation Engine RPC: get_recommendations
CREATE OR REPLACE FUNCTION public.get_recommendations(
  p_limit INT DEFAULT 10,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  id UUID,
  brand_id UUID,
  brand_name TEXT,
  brand_logo TEXT,
  category_id UUID,
  category_name TEXT,
  title TEXT,
  description TEXT,
  discount_pct NUMERIC,
  deal_type public.deal_type,
  city TEXT,
  image_urls TEXT[],
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status public.deal_status,
  terms TEXT,
  recommendation_score FLOAT,
  recommendation_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_has_pref_vector BOOLEAN := false;
  v_user_pref_vector vector(768);
  v_fav_categories UUID[] := '{}'::uuid[];
  v_has_collab_data BOOLEAN := false;
BEGIN
  -- 1. Fetch user preference vector and favorite categories if user provided
  IF p_user_id IS NOT NULL THEN
    SELECT 
      (preference_vector IS NOT NULL),
      preference_vector,
      COALESCE(favorite_categories, '{}'::uuid[])
    INTO v_has_pref_vector, v_user_pref_vector, v_fav_categories
    FROM public.user_preferences
    WHERE user_id = p_user_id;

    -- Check if collaborative signal candidates exist
    SELECT EXISTS (
      SELECT 1
      FROM public.interactions i
      WHERE i.user_id = p_user_id
        AND i.type IN ('save', 'like')
    ) INTO v_has_collab_data;
  END IF;

  RETURN QUERY
  WITH 
  -- Collaborative Signal: Users who saved/liked deals target user liked also liked these deals
  user_positives AS (
    SELECT DISTINCT deal_id
    FROM public.interactions
    WHERE p_user_id IS NOT NULL
      AND user_id = p_user_id
      AND type IN ('save', 'like')
  ),
  peer_users AS (
    SELECT i.user_id, COUNT(DISTINCT i.deal_id) AS shared_deals
    FROM public.interactions i
    JOIN user_positives up ON up.deal_id = i.deal_id
    WHERE i.user_id IS NOT NULL
      AND i.user_id != p_user_id
      AND i.type IN ('save', 'like')
    GROUP BY i.user_id
  ),
  collaborative_scores AS (
    SELECT
      i.deal_id,
      SUM(pu.shared_deals * CASE WHEN i.type = 'save' THEN 1.5 ELSE 1.0 END) AS raw_collab
    FROM public.interactions i
    JOIN peer_users pu ON pu.user_id = i.user_id
    WHERE i.type IN ('save', 'like')
      AND i.deal_id NOT IN (SELECT deal_id FROM user_positives)
    GROUP BY i.deal_id
  ),
  max_collab AS (
    SELECT COALESCE(MAX(raw_collab), 1.0) AS max_val FROM collaborative_scores
  ),
  -- Popularity Signal from interactions / analytics
  deal_popularity AS (
    SELECT
      i.deal_id,
      COUNT(*) AS interaction_count
    FROM public.interactions i
    WHERE i.created_at >= (NOW() - INTERVAL '14 days')
    GROUP BY i.deal_id
  ),
  -- Eligible active deals (excluding already saved deals)
  eligible_deals AS (
    SELECT
      d.id,
      d.brand_id,
      b.name AS brand_name,
      b.logo_url AS brand_logo,
      d.category_id,
      c.name AS category_name,
      d.title,
      d.description,
      d.discount_pct,
      d.deal_type,
      d.city,
      d.image_urls,
      d.start_date,
      d.end_date,
      d.status,
      d.terms,
      d.embedding
    FROM public.deals d
    JOIN public.brands b ON b.id = d.brand_id
    LEFT JOIN public.categories c ON c.id = d.category_id
    WHERE d.status = 'active'
      AND d.end_date > NOW()
      AND (
        p_user_id IS NULL OR
        d.id NOT IN (SELECT deal_id FROM public.saved_deals WHERE user_id = p_user_id)
      )
  ),
  -- Scoring stage
  scored_deals AS (
    SELECT
      ed.*,
      -- Content similarity score (0 to 1, default 0 if no vector)
      CASE 
        WHEN v_has_pref_vector AND ed.embedding IS NOT NULL THEN
          GREATEST(0.0, 1.0 - (ed.embedding <=> v_user_pref_vector))
        ELSE 0.0
      END AS content_sim,
      
      -- Collaborative score (0 to 1)
      CASE 
        WHEN v_has_collab_data THEN
          COALESCE(cs.raw_collab / mc.max_val, 0.0)
        ELSE 0.0
      END AS collab_score,
      
      -- Category preference match (0 or 1)
      CASE
        WHEN ed.category_id = ANY(v_fav_categories) THEN 1.0
        ELSE 0.0
      END AS category_match,

      -- Normalized popularity (0 to 0.2)
      LEAST(0.20, COALESCE(dp.interaction_count::FLOAT / 50.0, 0.0)) AS popularity_boost,

      -- Urgency boost (ending in <= 48h)
      CASE
        WHEN ed.end_date <= (NOW() + INTERVAL '48 hours') THEN 0.15
        ELSE 0.0
      END AS urgency_boost
    FROM eligible_deals ed
    LEFT JOIN collaborative_scores cs ON cs.deal_id = ed.id
    CROSS JOIN max_collab mc
    LEFT JOIN deal_popularity dp ON dp.deal_id = ed.id
  ),
  final_ranks AS (
    SELECT
      sd.id,
      sd.brand_id,
      sd.brand_name,
      sd.brand_logo,
      sd.category_id,
      sd.category_name,
      sd.title,
      sd.description,
      sd.discount_pct,
      sd.deal_type,
      sd.city,
      sd.image_urls,
      sd.start_date,
      sd.end_date,
      sd.status,
      sd.terms,
      -- Composite Hybrid Score
      (
        CASE
          -- Case A: Warm/Active user with preference vector and collaborative candidates
          WHEN v_has_pref_vector AND v_has_collab_data THEN
            (0.50 * sd.content_sim) + (0.30 * sd.collab_score) + (0.20 * sd.category_match) + sd.popularity_boost + sd.urgency_boost
          -- Case B: User has preference vector but no collaborative peers
          WHEN v_has_pref_vector THEN
            (0.65 * sd.content_sim) + (0.25 * sd.category_match) + sd.popularity_boost + sd.urgency_boost
          -- Case C: User has collaborative signals but no vector yet
          WHEN v_has_collab_data THEN
            (0.50 * sd.collab_score) + (0.30 * sd.category_match) + sd.popularity_boost + sd.urgency_boost
          -- Case D: Cold-start fallback (onboarding categories + popularity + urgency)
          ELSE
            (0.50 * sd.category_match) + (0.30 * (sd.discount_pct::FLOAT / 100.0)) + sd.popularity_boost + sd.urgency_boost
        END
      )::FLOAT AS final_score,
      -- Transparent recommendation reason
      CASE
        WHEN v_has_collab_data AND sd.collab_score > 0.4 THEN
          'Shoppers who saved your favorite deals also liked this'
        WHEN v_has_pref_vector AND sd.content_sim > 0.7 THEN
          'Matches your shopping interests (' || ROUND((sd.content_sim * 100)::numeric, 0) || '% AI Match)'
        WHEN sd.category_match > 0 THEN
          'Selected for you in ' || COALESCE(sd.category_name, 'your preferred category')
        WHEN sd.urgency_boost > 0 THEN
          'Ending soon — don''t miss this discount!'
        WHEN sd.popularity_boost > 0.1 THEN
          'Trending sale across Pakistan'
        ELSE
          'Popular top-rated offer'
      END AS rec_reason
    FROM scored_deals sd
  )
  SELECT
    fr.id,
    fr.brand_id,
    fr.brand_name,
    fr.brand_logo,
    fr.category_id,
    fr.category_name,
    fr.title,
    fr.description,
    fr.discount_pct,
    fr.deal_type,
    fr.city,
    fr.image_urls,
    fr.start_date,
    fr.end_date,
    fr.status,
    fr.terms,
    fr.final_score AS recommendation_score,
    fr.rec_reason AS recommendation_reason
  FROM final_ranks fr
  ORDER BY fr.final_score DESC, fr.discount_pct DESC
  LIMIT p_limit;
END;
$$;


-- 9. Schedule Daily Preference Refresh with pg_cron (at 03:00 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-refresh-user-preferences') THEN
      PERFORM cron.unschedule('daily-refresh-user-preferences');
    END IF;
    PERFORM cron.schedule(
      'daily-refresh-user-preferences',
      '0 3 * * *',
      'SELECT public.refresh_all_user_preferences()'
    );
  END IF;
END $$;
