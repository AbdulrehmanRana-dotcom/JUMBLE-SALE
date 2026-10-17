// Supabase Edge Function: recommendations
// Exposes the hybrid recommendation engine over HTTP Edge runtime.
// Calls the public.get_recommendations RPC with the authenticated user context.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const authHeader = req.headers.get('Authorization') || '';

    // Create client using caller's auth header
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // 1. Identify caller user
    let userId: string | null = null;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    }

    // Parse limit parameter from query or body
    let limit = 10;
    const url = new URL(req.url);
    const limitQuery = url.searchParams.get('limit');
    if (limitQuery) {
      const parsed = parseInt(limitQuery, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
        limit = parsed;
      }
    }

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.limit && typeof body.limit === 'number') {
          limit = Math.min(Math.max(body.limit, 1), 50);
        }
        // Security: Never allow an anonymous client to spoof another user's preference vector
        // Only allow body.user_id if the authenticated caller is an admin
        if (body.user_id && userId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single();
          if (profile?.role === 'admin') {
            userId = body.user_id;
          }
        }
      } catch {
        // Ignored
      }
    }

    // 2. Call the hybrid get_recommendations RPC
    const { data: recommendations, error: rpcErr } = await supabase.rpc(
      'get_recommendations',
      {
        p_limit: limit,
        p_user_id: userId,
      }
    );

    if (rpcErr) {
      console.warn('[EdgeFunction recommendations] RPC error:', rpcErr.message);

      // Fallback: active non-expired deals
      const { data: fallbackDeals, error: fbErr } = await supabase
        .from('deals')
        .select('*, brand:brands(*), category:categories(*)')
        .eq('status', 'active')
        .gt('end_date', new Date().toISOString())
        .order('discount_pct', { ascending: false })
        .limit(limit);

      if (fbErr) throw fbErr;

      return new Response(
        JSON.stringify({
          success: true,
          mode: 'fallback_active_deals',
          count: fallbackDeals?.length || 0,
          data: fallbackDeals || [],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: userId ? 'personalized_hybrid' : 'cold_start_popular',
        count: recommendations?.length || 0,
        data: recommendations || [],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal recommendation error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
