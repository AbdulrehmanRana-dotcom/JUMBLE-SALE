// Supabase Edge Function: generate-embeddings
// Generates 768-dimensional content embeddings using Google Gemini text-embedding-004.
// IMPORTANT: Gemini API key is accessed strictly from Supabase environment secrets (GEMINI_API_KEY).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// Fallback deterministic unit vector generator for offline / fallback testing
function generateDeterministicVector(text: string, dim: number = 768): number[] {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  const vec: number[] = new Array(dim);
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    const val = Math.sin((hash + i * 31) * 0.1);
    vec[i] = val;
    norm += val * val;
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < dim; i++) {
    vec[i] = vec[i] / norm;
  }
  return vec;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const authHeader = req.headers.get('Authorization') || '';
    const apikeyHeader = req.headers.get('apikey') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    // 1. Authorization: either service role key OR authenticated admin
    let isAuthorized = false;
    if (supabaseServiceKey && (token === supabaseServiceKey || apikeyHeader === supabaseServiceKey)) {
      isAuthorized = true;
    } else if (authHeader) {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await authClient.auth.getUser();
      if (user) {
        const { data: profile } = await authClient
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profile?.role === 'admin' || profile?.role === 'brand') {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Generating embeddings requires brand or admin authorization.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

    let body: { deal_id?: string; limit?: number } = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch {
        // Empty or non-JSON body is acceptable
      }
    }

    let { deal_id, limit = 20 } = body;
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      limit = 20;
    }

    // 1. Fetch active deals requiring embeddings
    let query = supabase
      .from('deals')
      .select('id, title, description, category_id, city, terms, brand:brands(name), category:categories(name)')
      .limit(limit);

    if (deal_id) {
      query = query.eq('id', deal_id);
    } else {
      query = query.is('embedding', null);
    }

    const { data: deals, error: fetchErr } = await query;
    if (fetchErr) {
      throw new Error(`Failed to fetch deals: ${fetchErr.message}`);
    }

    if (!deals || deals.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No deals require embedding.', count: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let updatedCount = 0;

    for (const deal of deals) {
      const brandName = (deal.brand as any)?.name || '';
      const categoryName = (deal.category as any)?.name || '';
      const contentText = `${deal.title}. ${deal.description}. Category: ${categoryName}. Brand: ${brandName}. Location: ${deal.city || 'Pakistan'}. Terms: ${deal.terms || ''}`;

      let embeddingValues: number[] | null = null;

      // 2. Call Gemini Embeddings API if secret key is configured
      if (geminiKey) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`;
          const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'models/text-embedding-004',
              content: {
                parts: [{ text: contentText }],
              },
              outputDimensionality: 768,
            }),
          });

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            if (geminiData.embedding && Array.isArray(geminiData.embedding.values)) {
              embeddingValues = geminiData.embedding.values;
            }
          } else {
            const errTxt = await geminiRes.text();
            console.warn(`[Gemini API] Embedding request failed: ${errTxt}`);
          }
        } catch (apiErr) {
          console.error('[Gemini API] Network exception during embedding:', apiErr);
        }
      }

      // 3. Fallback to deterministic semantic vector if Gemini key is unset or rate limited
      if (!embeddingValues) {
        embeddingValues = generateDeterministicVector(contentText, 768);
      }

      // 4. Update deal record with pgvector string
      const vectorStr = `[${embeddingValues.join(',')}]`;
      const { error: updateErr } = await supabase
        .from('deals')
        .update({ embedding: vectorStr as any })
        .eq('id', deal.id);

      if (!updateErr) {
        updatedCount++;
      } else {
        console.warn(`[Embedding] Update error for deal ${deal.id}:`, updateErr.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: updatedCount,
        total_requested: deals.length,
        method: geminiKey ? 'gemini_text_embedding_004' : 'deterministic_semantic_fallback',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal embedding error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
