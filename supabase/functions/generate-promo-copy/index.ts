// Supabase Edge Function: generate-promo-copy
// AI Promotional Copy Generator for Brands.
// Takes product/category, discount %, dates, tone, and language.
// Outputs 3 high-converting title options and 2 description options.
// Brands can review and edit before submitting; never auto-publishes.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface CopyRequest {
  product_or_category: string;
  brand_name?: string;
  discount_pct?: number | string;
  start_date?: string;
  end_date?: string;
  tone?: 'exciting' | 'luxury' | 'urgent' | 'casual';
  language?: 'english' | 'roman_urdu' | 'urdu';
}

function generateDeterministicCopy(payload: CopyRequest) {
  const item = payload.product_or_category || 'Collection';
  const brand = payload.brand_name || 'Our Brand';
  const disc = payload.discount_pct ? `${payload.discount_pct}%` : 'Special';
  const tone = payload.tone || 'exciting';
  const isRomanUrdu = payload.language === 'roman_urdu';

  if (isRomanUrdu) {
    if (tone === 'urgent') {
      return {
        titles: [
          `Aakhri Mauqa: ${item} par Flat ${disc} Off!`,
          `Flash Sale! ${brand} ki ${item} par Badi Bachat`,
          `Mehdood Muddat: ${disc} Discount ${item} par`,
        ],
        descriptions: [
          `Waqt bohat kam hai! ${brand} par ${item} ki tamam variety par flat ${disc} discount haasil karein. Yeh zabardast offer mehdood stock tak valid hai. Abhi order karein aur outlet ya online shopping ka lutf uthayein!`,
          `Khatam honay se pehlay faida uthayein! ${brand} ki taraf se ${item} par ${disc} off flash deal. Poore Pakistan mein delivery ki suhoolat dastiyab hai. Jaldi karein aur apni pasandeeda items book karein.`,
        ],
      };
    }
    if (tone === 'luxury') {
      return {
        titles: [
          `Premium ${item} — Exclusive ${disc} Off`,
          `${brand} ki Shandar ${item} par Khususi Discount`,
          `Luxury Style: Flat ${disc} Off On ${item}`,
        ],
        descriptions: [
          `${brand} ke sath apnay style ko nayi pehchan dein! Hamari premium ${item} ab ${disc} discount ke sath dastiyab hai. Behtareen fabric aur designing jo aapko sab se munfarid banaye.`,
          `Khas shopping festival! ${brand} ki exclusive ${item} par flat ${disc} off. Shandar quality aur lajawab tasarruf ka lutf uthayein. Online ya kisi bhi qareebi outlet se shopping karein.`,
        ],
      };
    }
    return {
      titles: [
        `Dhamaka Sale: ${item} par Flat ${disc} Off!`,
        `${brand} Grand Sale: ${item} ab Aadhi Qimat par`,
        `Khas Bachat Offer: ${disc} Discount ${item} par`,
      ],
      descriptions: [
        `${brand} le kar aaya hai aap ke liye behtareen bachat! Abhi shopping karein aur ${item} par flat ${disc} discount payein. Tamam online orders aur outlets par laagu. Stock khatam honay se pehlay faida uthayein!`,
        `Shopping ka zabardast mauqa! ${brand} par ${item} par barri chhoot. Apnay liye aur apnay ghar walon ke liye shopping karein aur ${disc} tak bachayein. Tamam Pakistan mein fast delivery.`,
      ],
    };
  }

  // English Copy Templates
  if (tone === 'urgent') {
    return {
      titles: [
        `Ending Soon: Flat ${disc} Off ${item}!`,
        `Last Chance Flash Sale: ${disc} Off ${brand} ${item}`,
        `Don't Miss Out! Up to ${disc} Off ${item}`,
      ],
      descriptions: [
        `Time is ticking! Enjoy flat ${disc} off across our best-selling ${item} collection. Available online and at all flagship outlets nationwide. Valid while stock lasts — grab your favorites before they sell out!`,
        `Final clearance countdown! Take advantage of ${disc} off on ${item} from ${brand}. Seamless checkout with express nationwide delivery across Pakistan. Shop before midnight!`,
      ],
    };
  }

  if (tone === 'luxury') {
    return {
      titles: [
        `The Premium Sale: ${disc} Off Signature ${item}`,
        `Elegance Redefined: Exclusive ${disc} Off at ${brand}`,
        `Curated Luxury: ${disc} Off ${item}`,
      ],
      descriptions: [
        `Elevate your lifestyle with ${brand}'s signature ${item}, now offered at an exclusive ${disc} promotional discount. Crafted with unmatched attention to detail and premium materials. Experience effortless sophistication today.`,
        `Indulge in refined style for less. Save ${disc} on luxury ${item} by ${brand}. Available for online orders with complimentary gift packaging and doorstep delivery across Pakistan.`,
      ],
    };
  }

  // Default Exciting / Casual
  return {
    titles: [
      `Grand Sale: Flat ${disc} Off ${item}!`,
      `Save Big! Up to ${disc} Off ${brand} ${item}`,
      `Unbeatable Offer: ${disc} Off Entire ${item} Range`,
    ],
    descriptions: [
      `Upgrade your wardrobe and lifestyle with flat ${disc} off on all ${item} from ${brand}! Shop the latest trends and everyday essentials at unbeatable promotional prices. Valid online and at participating retail outlets across Pakistan.`,
      `The mega savings festival is here! Enjoy up to ${disc} discount on your favorite ${item}. Limited time offer with nationwide cash on delivery. Hurry and shop your picks while supplies last!`,
    ],
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const authHeader = req.headers.get('Authorization') || '';

    // 1. Authenticate caller
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Authentication required to generate promotional copy.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Authorize caller role (must be brand or admin)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'brand' && profile.role !== 'admin')) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Only verified brands and admins can generate promotional copy.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const payload: CopyRequest = await req.json();

    // 3. Input validation
    if (!payload.product_or_category || typeof payload.product_or_category !== 'string' || payload.product_or_category.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Validation Error: product_or_category must be a valid string of at least 2 characters.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (payload.product_or_category.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Validation Error: product_or_category exceeds maximum length of 100 characters.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (payload.discount_pct !== undefined && payload.discount_pct !== null) {
      const discNum = Number(payload.discount_pct);
      if (isNaN(discNum) || discNum < 1 || discNum > 100) {
        return new Response(
          JSON.stringify({ error: 'Validation Error: discount_pct must be a number between 1 and 100.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const validTones = ['exciting', 'luxury', 'urgent', 'casual'];
    if (payload.tone && !validTones.includes(payload.tone)) {
      payload.tone = 'exciting';
    }

    const validLangs = ['english', 'roman_urdu', 'urdu'];
    if (payload.language && !validLangs.includes(payload.language)) {
      payload.language = 'english';
    }

    let result = generateDeterministicCopy(payload);

    // Call Gemini 1.5 Flash if Gemini API key is configured
    if (geminiKey) {
      try {
        const isUrdu = payload.language === 'roman_urdu';
        const prompt = `You are a professional retail copywriter for Pakistani brands on Jumble Sale.
Generate high-converting promotional copy for a deal:
- Brand: ${payload.brand_name || 'Brand'}
- Product/Category: ${payload.product_or_category}
- Discount: ${payload.discount_pct || 'Special'}%
- Tone: ${payload.tone || 'exciting'}
- Language: ${isUrdu ? 'Roman Urdu (Urdu written in English script as spoken in Pakistan)' : 'English'}

Provide:
1. Exactly 3 compelling title options (under 60 characters).
2. Exactly 2 promotional description options (2-3 sentences each, clear, engaging, with terms and urgency).

Return strictly JSON matching this schema:
{
  "titles": ["Title 1", "Title 2", "Title 3"],
  "descriptions": ["Description 1", "Description 2"]
}`;

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
            const aiCopy = JSON.parse(parsedText);
            if (Array.isArray(aiCopy.titles) && Array.isArray(aiCopy.descriptions)) {
              result = {
                titles: aiCopy.titles.slice(0, 3),
                descriptions: aiCopy.descriptions.slice(0, 2),
              };
            }
          }
        }
      } catch (err) {
        console.warn('[Gemini Copy] Using intelligent deterministic copy template:', err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal copy generation error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
