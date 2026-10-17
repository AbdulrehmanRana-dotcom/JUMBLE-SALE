// Supabase Edge Function: chat-assistant
// AI Shopping Deals Chatbot powered by Gemini text model with real database query execution.
// Supports English and Roman Urdu, intent extraction, rate limiting, and prompt injection defense.
// IMPORTANT: Gemini key is stored strictly in Supabase secrets (GEMINI_API_KEY).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// Known Pakistani retail categories
const SYSTEM_CATEGORIES = [
  'Fashion & Apparel',
  'Electronics & Mobiles',
  'Food & Dining',
  'Grocery & Supermarket',
  'Beauty & Cosmetics',
  'Home & Living',
  'Footwear & Accessories',
  'Travel & Experiences',
];

// Heuristic regex extractor for offline testing / fallback
function extractIntentHeuristic(text: string) {
  const lower = text.toLowerCase();

  // Detect language: check for Roman Urdu markers
  const urduMarkers = [
    'pe', 'par', 'sasti', 'sasta', 'dikhao', 'batao', 'chahye', 'hai', 'hain',
    'wali', 'walay', 'mein', 'khatam', 'kapron', 'jootay', 'khana', 'mujhe',
    'karo', 'kaise', 'aur', 'kitna', 'bohat', 'acha', 'koi', 'kuch'
  ];
  const isRomanUrdu = urduMarkers.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower));
  const language = isRomanUrdu ? 'roman_urdu' : 'english';

  // Check prompt injection attempts
  const injectionPatterns = [
    'ignore previous',
    'ignore all instructions',
    'system prompt',
    'drop table',
    'delete from',
    'update users',
    'select * from auth',
    'secret key',
    'reveal instructions',
  ];
  const isInjection = injectionPatterns.some((p) => lower.includes(p));

  // Check off-topic
  const offTopicKeywords = [
    'cricket history',
    'write an essay',
    'computer kharab',
    'weather in london',
    'solve math',
    'quantum physics',
    'who is prime minister',
  ];
  const isOffTopic = offTopicKeywords.some((k) => lower.includes(k));

  // Check unclear
  const trimmed = text.trim();
  const isUnclear =
    trimmed.length < 7 ||
    ['sale?', 'sale', 'offers?', 'offers', 'deals', 'deals?', 'discount?', 'sale hai?', 'koi sale?'].includes(lower);

  // Extract category
  let category: string | null = null;
  if (/fashion|apparel|kapr|lawn|kurti|dress|shirt|cloth|streetwear/i.test(lower)) {
    category = 'Fashion & Apparel';
  } else if (/shoe|joot|sneaker|boot|chappal/i.test(lower)) {
    category = 'Footwear & Accessories';
  } else if (/food|khana|biryani|burger|pizza|restaur/i.test(lower)) {
    category = 'Food & Dining';
  } else if (/mobile|phone|iphone|samsung|laptop|smartwatch|air conditioner|ac\b|tv\b/i.test(lower)) {
    category = 'Electronics & Mobiles';
  } else if (/grocery|ration|doodh|fruit|supermarket/i.test(lower)) {
    category = 'Grocery & Supermarket';
  } else if (/beauty|makeup|skin|cream|lotion|cosmetic/i.test(lower)) {
    category = 'Beauty & Cosmetics';
  } else if (/home|bedding|cushion|decor|tapestry/i.test(lower)) {
    category = 'Home & Living';
  }

  // Extract brand
  let brand: string | null = null;
  const knownBrands = ['Khaadi', 'Outfitters', 'Foodpanda', 'Telemart', 'Sapphire', 'Alkaram', 'Gul Ahmed'];
  for (const b of knownBrands) {
    if (lower.includes(b.toLowerCase())) {
      brand = b;
      break;
    }
  }

  // Extract discount
  let minDiscount: number | null = null;
  const discMatch = lower.match(/(\d{1,2})\s*%/);
  if (discMatch) {
    minDiscount = parseInt(discMatch[1], 10);
  } else if (lower.includes('half price') || lower.includes('aadha')) {
    minDiscount = 50;
  }

  // Extract city
  let city: string | null = null;
  const cities = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Sialkot'];
  for (const c of cities) {
    if (lower.includes(c.toLowerCase())) {
      city = c;
      break;
    }
  }

  // Time / ending soon
  const endingSoon = /weekend|today|khatam|soon|jaldi/i.test(lower);

  return {
    language,
    isInjection,
    isOffTopic,
    isUnclear,
    category,
    brand,
    minDiscount,
    city,
    endingSoon,
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || supabaseAnonKey;
    const geminiKey = Deno.env.get('GEMINI_API_KEY');

    const authHeader = req.headers.get('Authorization') || '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Identify user
    let userId: string | null = null;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) userId = user.id;

    const payload = await req.json();
    const message = (payload.message || '').trim();

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message cannot be empty.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (message.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Validation Error: Message exceeds maximum allowed length of 500 characters.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Rate Limiting Check (Max 15 messages / 60 seconds per user)
    if (userId) {
      const { data: rateData } = await adminSupabase.rpc('check_chat_rate_limit', {
        p_user_id: userId,
        p_max_requests: 15,
        p_window_seconds: 60,
      });

      if (rateData && rateData.allowed === false) {
        return new Response(
          JSON.stringify({
            error: 'Rate limit exceeded. Please wait a moment before sending more messages.',
            rate_limited: true,
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 2. Intent & Filter Extraction
    let extracted = extractIntentHeuristic(message);

    // If Gemini key is available, utilize Gemini 1.5 Flash for natural semantic understanding
    if (geminiKey && !extracted.isInjection) {
      try {
        const prompt = `You are the intent extractor for Jumble Sale, a shopping discounts platform in Pakistan.
User message: <user_input>${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</user_input>

Extract the search intent and parameters into a JSON object matching this schema:
{
  "language": "english" | "roman_urdu",
  "is_off_topic": boolean (true if query is unrelated to shopping, sales, or discounts in Pakistan),
  "is_unclear": boolean (true if query is too vague, like "sale?" or "offers"),
  "category": string or null (from: "Fashion & Apparel", "Electronics & Mobiles", "Food & Dining", "Grocery & Supermarket", "Beauty & Cosmetics", "Home & Living", "Footwear & Accessories", "Travel & Experiences"),
  "brand": string or null,
  "min_discount": number or null,
  "city": string or null,
  "ending_soon": boolean
}
Return ONLY JSON without formatting.`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const parsedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (parsedText) {
            const aiParsed = JSON.parse(parsedText);
            extracted = { ...extracted, ...aiParsed };
          }
        }
      } catch (err) {
        console.warn('[Gemini Extraction] Fallback to heuristic parser:', err);
      }
    }

    // 3. Prompt Injection Defense
    if (extracted.isInjection) {
      const reply =
        extracted.language === 'roman_urdu'
          ? 'Maaf kijiye, main sirf Pakistan bhar ki deals aur discounts dhoondnay mein aapki madad kar sakta hoon. Kripya deal ka naam ya category batayein!'
          : 'I can only assist you with finding genuine shopping deals and discounts across Pakistan. Please ask for a category, brand, or discount!';

      return new Response(
        JSON.stringify({ success: true, reply, deals: [], language: extracted.language }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Handle Off-Topic Queries
    if (extracted.isOffTopic) {
      const reply =
        extracted.language === 'roman_urdu'
          ? 'Main Jumble Sale ka shopping assistant hoon! Main sirf Pakistan bhar ke brands par kapray, khana, mobiles aur doosri sales dhoondnay mein madad de sakta hoon. Aaj aap kis cheez ki shopping karna chahtay hain?'
          : "I am Jumble Sale's deals assistant! I specialize in finding real discounts on fashion, food, electronics, and groceries across Pakistan. What offer can I help you find today?";

      return new Response(
        JSON.stringify({ success: true, reply, deals: [], language: extracted.language }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Handle Unclear / Vague Queries (Ask 1 clarifying question)
    if (extracted.isUnclear) {
      const reply =
        extracted.language === 'roman_urdu'
          ? 'Aap kis qisam ki sale dhoond rahay hain? (Jaise kapray, jootay, burger ya electronics)?'
          : 'Which category are you looking for? (e.g. Fashion, Footwear, Dining, or Electronics)?';

      return new Response(
        JSON.stringify({ success: true, reply, deals: [], language: extracted.language }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Query REAL Active Deals from Database (Never invent deals!)
    let dbQuery = adminSupabase
      .from('deals')
      .select('id, title, description, discount_pct, start_date, end_date, deal_type, city, image_urls, brand:brands(id, name, logo_url), category:categories(id, name)')
      .eq('status', 'active')
      .gt('end_date', new Date().toISOString())
      .limit(5);

    if (extracted.category) {
      // Find category ID
      const { data: catRow } = await adminSupabase
        .from('categories')
        .select('id')
        .ilike('name', `%${extracted.category}%`)
        .maybeSingle();

      if (catRow) {
        dbQuery = dbQuery.eq('category_id', catRow.id);
      }
    }

    if (extracted.minDiscount) {
      dbQuery = dbQuery.gte('discount_pct', extracted.minDiscount);
    }

    if (extracted.city) {
      dbQuery = dbQuery.ilike('city', `%${extracted.city}%`);
    }

    if (extracted.endingSoon) {
      dbQuery = dbQuery.order('end_date', { ascending: true });
    } else {
      dbQuery = dbQuery.order('discount_pct', { ascending: false });
    }

    const { data: rawDeals, error: dbErr } = await dbQuery;
    if (dbErr) throw dbErr;

    // Filter by brand name in memory if brand was requested
    let matchedDeals = (rawDeals || []) as any[];
    if (extracted.brand) {
      matchedDeals = matchedDeals.filter((d) =>
        d.brand?.name?.toLowerCase().includes(extracted.brand!.toLowerCase())
      );
    }

    // 7. Formulate Reply in User's Language Style
    let reply = '';
    const isUrdu = extracted.language === 'roman_urdu';

    if (matchedDeals.length > 0) {
      const topBrand = matchedDeals[0].brand?.name || 'Top Brands';
      const topDisc = matchedDeals[0].discount_pct;

      if (isUrdu) {
        reply = `Mujhe aap ke liye ${matchedDeals.length} active deals mili hain! ${topBrand} par ${topDisc}% tak ka discount chal raha hai. Neechay diye gaye cards par tap kar ke poori details check karein:`;
      } else {
        reply = `I found ${matchedDeals.length} active promotions matching your request! Top discounts up to ${topDisc}% OFF from ${topBrand}. Tap any card below to view details and terms:`;
      }
    } else {
      // 8. Handle No Results (Suggest Alternatives)
      const { data: fallbackDeals } = await adminSupabase
        .from('deals')
        .select('id, title, description, discount_pct, start_date, end_date, deal_type, city, image_urls, brand:brands(id, name, logo_url), category:categories(id, name)')
        .eq('status', 'active')
        .gt('end_date', new Date().toISOString())
        .order('discount_pct', { ascending: false })
        .limit(3);

      matchedDeals = (fallbackDeals || []) as any[];

      if (isUrdu) {
        reply = `Aap ki exact search par is waqt koi active deal nahi mili, magar aap ke liye Pakistan ki yeh trending sales maujood hain:`;
      } else {
        reply = `I couldn't find an exact active deal for that criteria right now. However, here are the top trending sales available today across Pakistan:`;
      }
    }

    // 9. Persist to chat_messages table if user is logged in
    const dealIds = matchedDeals.map((d) => d.id);
    if (userId) {
      await adminSupabase.from('chat_messages').insert([
        {
          user_id: userId,
          role: 'user',
          content: message,
        },
        {
          user_id: userId,
          role: 'assistant',
          content: reply,
          deal_ids: dealIds,
          metadata: {
            language: extracted.language,
            extracted_filters: extracted,
          },
        },
      ]);
    }

    return new Response(
      JSON.stringify({
        success: true,
        reply,
        deals: matchedDeals,
        language: extracted.language,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal chat assistant error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
