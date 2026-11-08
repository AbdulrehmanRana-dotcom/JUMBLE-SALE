-- ==============================================================================
-- UNIQUE OUTBOUND CLICKS PER USER PER DEAL
-- Ensures a user can only have one counted outbound website click interaction per deal
-- ==============================================================================

-- Unique partial index: Only 1 click per authenticated user per deal
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_deal_click 
ON public.interactions (user_id, deal_id) 
WHERE type = 'click' AND user_id IS NOT NULL;
