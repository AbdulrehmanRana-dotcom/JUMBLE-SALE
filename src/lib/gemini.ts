import { supabase } from '@/lib/supabase';
import type { Deal } from '@/types/database.types';

// ==============================================================================
// 1. GEMINI API CONFIGURATION & TYPES
// ==============================================================================

const GEMINI_API_KEY =
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  '';

export type CopyTone = 'exciting' | 'luxury' | 'urgent' | 'casual';
export type CopyLanguage = 'english' | 'roman_urdu';

export interface CopyGenerationRequest {
  product_or_category: string;
  brand_name: string;
  discount_pct?: number;
  original_price?: number;
  tone?: CopyTone;
  language?: CopyLanguage;
}

export interface CopyGenerationResult {
  titles: string[];
  descriptions: string[];
  source: 'gemini-1.5-flash' | 'edge-function' | 'semantic-template';
}

export interface SearchIntent {
  language: 'english' | 'roman_urdu';
  category_id?: string | null;
  category_name?: string | null;
  brand?: string | null;
  min_discount?: number | null;
  keywords?: string[];
  reply: string;
  deals: Deal[];
}

// Canonical category UUIDs aligned with seed.sql
export const CATEGORY_UUID_MAP: Record<string, { id: string; name: string }> = {
  fashion: { id: '11111111-1111-1111-1111-111111111111', name: 'Fashion & Apparel' },
  electronics: { id: '22222222-2222-2222-2222-222222222222', name: 'Electronics & Mobiles' },
  food: { id: '33333333-3333-3333-3333-333333333333', name: 'Food & Dining' },
  grocery: { id: '44444444-4444-4444-4444-444444444444', name: 'Grocery & Supermarket' },
  beauty: { id: '55555555-5555-5555-5555-555555555555', name: 'Beauty & Cosmetics' },
  home: { id: '66666666-6666-6666-6666-666666666666', name: 'Home & Living' },
  footwear: { id: '77777777-7777-7777-7777-777777777777', name: 'Footwear & Accessories' },
  shoes: { id: '77777777-7777-7777-7777-777777777777', name: 'Footwear & Accessories' },
  travel: { id: '88888888-8888-8888-8888-888888888888', name: 'Travel & Experiences' },
};

// ==============================================================================
// 2. FEATURE 1: GEMINI NATURAL LANGUAGE DEAL SEARCH (ENGLISH & ROMAN URDU)
// ==============================================================================

export async function searchDealsWithGemini(
  userQuery: string
): Promise<SearchIntent> {
  const q = (userQuery || '').trim();
  const lower = q.toLowerCase();

  // Detect Roman Urdu markers
  const urduMarkers = [
    'pe', 'par', 'sasti', 'sasta', 'dikhao', 'batao', 'chahye', 'hai', 'hain',
    'wali', 'walay', 'mein', 'kapron', 'jootay', 'khana', 'mujhe', 'karo',
    'choot', 'bachat', 'dhamaka', 'aadhi', 'qimat', 'outfitters', 'khaadi'
  ];
  const isRomanUrdu = urduMarkers.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower));
  const language: 'english' | 'roman_urdu' = isRomanUrdu ? 'roman_urdu' : 'english';

  let extractedCategory: string | null = null;
  let extractedBrand: string | null = null;
  let extractedMinDiscount: number | null = null;
  let customKeywords: string[] = [];

  // 1. Try Google Gemini API if key is present
  if (GEMINI_API_KEY) {
    try {
      const prompt = `You are a shopping assistant in Pakistan.
Query: "${q}"
Extract intent as JSON:
{
  "category": "fashion" | "electronics" | "food" | "grocery" | "beauty" | "home" | "footwear" | "travel" | null,
  "brand": string or null,
  "min_discount": number or null,
  "keywords": string[]
}
Return only raw JSON.`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );

      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed.category) extractedCategory = parsed.category.toLowerCase();
          if (parsed.brand) extractedBrand = parsed.brand;
          if (typeof parsed.min_discount === 'number') extractedMinDiscount = parsed.min_discount;
          if (Array.isArray(parsed.keywords)) customKeywords = parsed.keywords;
        }
      }
    } catch (apiErr) {
      console.warn('[Gemini Search] Gemini direct call notice:', apiErr);
    }
  }

  // 2. Semantic Fallback parsing if Gemini direct was unavailable
  if (!extractedCategory) {
    if (/kapr|lawn|kurti|dress|suit|shirt|pant|fashion|cloth|wear/i.test(lower)) {
      extractedCategory = 'fashion';
    } else if (/shoe|joot|sneaker|chappal|sandal|boot|heel/i.test(lower)) {
      extractedCategory = 'footwear';
    } else if (/food|burger|pizza|khana|biryani|dine|restaurant/i.test(lower)) {
      extractedCategory = 'food';
    } else if (/mobile|phone|laptop|electronics|watch|gadget|air conditioner|ac\b|tv\b/i.test(lower)) {
      extractedCategory = 'electronics';
    } else if (/beauty|makeup|skin|perfume|cosmetic/i.test(lower)) {
      extractedCategory = 'beauty';
    } else if (/grocery|supermarket|rashan|oil|atta/i.test(lower)) {
      extractedCategory = 'grocery';
    }
  }

  // Extract Brand mentions
  if (!extractedBrand) {
    const knownBrands = ['Khaadi', 'Outfitters', 'Gul Ahmed'];
    for (const b of knownBrands) {
      if (lower.includes(b.toLowerCase())) {
        extractedBrand = b;
        break;
      }
    }
  }

  // Extract discount numbers (e.g. 50%, 40, flat 30)
  if (!extractedMinDiscount) {
    const discMatch = lower.match(/(\d{1,2})\s*%/);
    if (discMatch) {
      extractedMinDiscount = parseInt(discMatch[1], 10);
    } else if (/half\s*price|aadhi\s*qimat/i.test(lower)) {
      extractedMinDiscount = 50;
    }
  }

  // 3. Query Real Database Deals matching the extracted criteria
  let dbQuery = supabase
    .from('deals')
    .select('*, brand:brands(*), category:categories(*)')
    .eq('status', 'active')
    .order('discount_pct', { ascending: false })
    .limit(8);

  const mappedCat = extractedCategory ? CATEGORY_UUID_MAP[extractedCategory] : null;
  if (mappedCat) {
    dbQuery = dbQuery.eq('category_id', mappedCat.id);
  }

  if (extractedMinDiscount && extractedMinDiscount > 0) {
    dbQuery = dbQuery.gte('discount_pct', extractedMinDiscount);
  }

  const { data: dbDeals } = await dbQuery;
  let matchedDeals: Deal[] = (dbDeals as Deal[]) || [];

  // Filter by brand name if specified
  if (extractedBrand && matchedDeals.length > 0) {
    const bFilter = extractedBrand.toLowerCase();
    const filtered = matchedDeals.filter((d: any) =>
      ((d.brand?.name || '') as string).toLowerCase().includes(bFilter)
    );
    if (filtered.length > 0) matchedDeals = filtered;
  }

  // If no deals found under specific category, fetch top overall active deals as intelligent fallback
  if (matchedDeals.length === 0) {
    const { data: fallbackDeals } = await supabase
      .from('deals')
      .select('*, brand:brands(*), category:categories(*)')
      .eq('status', 'active')
      .order('discount_pct', { ascending: false })
      .limit(4);

    if (fallbackDeals && fallbackDeals.length > 0) {
      matchedDeals = fallbackDeals as Deal[];
    }
  }

  // 4. Generate Natural Language AI Reply in English or Roman Urdu
  let replyText = '';
  const count = matchedDeals.length;
  const catName = mappedCat?.name || 'Top Deals';

  if (language === 'roman_urdu') {
    if (count > 0) {
      replyText = `Mujhe aap ke liye ${catName} ki yeh ${count} verified active deals mili hain! Kisi bhi deal par tap kar ke direct brand website se discount par khareed saktay hain:`;
    } else {
      replyText = `Is waqt is query par koi active deal nahi mili, magar Pakistan bhar ki doosri trending deals check karein!`;
    }
  } else {
    if (count > 0) {
      replyText = `I found ${count} verified active deals in ${catName} matching your search! Tap any deal to view full details and buy directly on the brand's store:`;
    } else {
      replyText = `No exact active sales found for "${q}" right now, but here are our top verified discounts available today:`;
    }
  }

  return {
    language,
    category_id: mappedCat?.id || null,
    category_name: catName,
    brand: extractedBrand,
    min_discount: extractedMinDiscount,
    keywords: customKeywords,
    reply: replyText,
    deals: matchedDeals,
  };
}

// ==============================================================================
// 3. FEATURE 2: BRAND AI TITLE & DESCRIPTION GENERATOR
// ==============================================================================

export async function generateBrandPromoCopy(
  req: CopyGenerationRequest
): Promise<CopyGenerationResult> {
  const item = req.product_or_category.trim() || 'Retail Collection';
  const brand = req.brand_name.trim() || 'Official Brand';
  const discount = req.discount_pct || 40;
  const tone = req.tone || 'exciting';
  const language = req.language || 'english';

  // 1. Try Google Gemini 1.5 Flash API if API key is configured
  if (GEMINI_API_KEY) {
    try {
      const prompt = `You are an elite retail marketing copywriter for Pakistani brands.
Generate promotional titles and descriptions for a discount sale.
Parameters:
- Brand: "${brand}"
- Item/Collection: "${item}"
- Discount: ${discount}%
- Tone: ${tone} (exciting / luxury / urgent / casual)
- Language: ${language} (english OR roman_urdu)

Return JSON matching this format:
{
  "titles": ["Title 1", "Title 2", "Title 3"],
  "descriptions": ["Description 1 (2-3 sentences)", "Description 2 (2-3 sentences)"]
}
Return ONLY valid JSON.`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
          const aiJson = JSON.parse(parsedText);
          if (Array.isArray(aiJson.titles) && Array.isArray(aiJson.descriptions)) {
            return {
              titles: aiJson.titles,
              descriptions: aiJson.descriptions,
              source: 'gemini-1.5-flash',
            };
          }
        }
      }
    } catch (geminiErr) {
      console.warn('[Gemini Copywriter] Direct API notice:', geminiErr);
    }
  }

  // 2. Try Supabase Edge Function: generate-promo-copy
  try {
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke(
      'generate-promo-copy',
      {
        body: {
          product_or_category: item,
          brand_name: brand,
          discount_pct: discount,
          tone,
          language,
        },
      }
    );

    if (!edgeError && edgeData?.titles && edgeData?.descriptions) {
      return {
        titles: edgeData.titles,
        descriptions: edgeData.descriptions,
        source: 'edge-function',
      };
    }
  } catch (edgeErr) {
    console.warn('[Gemini Copywriter] Edge function notice:', edgeErr);
  }

  // 3. Intelligent High-Converting Semantic Templates (Zero-Failure Fallback)
  if (language === 'roman_urdu') {
    if (tone === 'urgent') {
      return {
        titles: [
          `⏰ Aakhri Mauqa: ${brand} ${item} par Flat ${discount}% Off!`,
          `Stock Khatam Honay Wala Hai: ${item} ab sirf ${discount}% Chhoot par`,
          `Limited Hours Sale: ${item} par zabardast bachat offer!`,
        ],
        descriptions: [
          `${brand} ki sab se barri clearance sale shuru ho chuki hai! ${item} par flat ${discount}% discount mil raha hai. Stock mehdood hai, foran order karein taake mauqa haath se na jaye!`,
          `Waqt bohat kam hai! Apnay pasandeeda ${item} par flat ${discount}% ki zabardast bachat karein. Poore Pakistan mein fast home delivery dastiyab hai.`,
        ],
        source: 'semantic-template',
      };
    } else if (tone === 'luxury') {
      return {
        titles: [
          `✨ The Signature Sale: ${brand} Premium ${item} at ${discount}% Off`,
          `Exclusive Elegance: ${item} par Khas Discount`,
          `Luxury Lifestyle: ${brand} ki Nayi Range par ${discount}% Bachat`,
        ],
        descriptions: [
          `${brand} ki taraf se shandar premium collection par flat ${discount}% ka khas discount. Behtareen fabric aur elegant design ke sath apnay style ko upgrade karein.`,
          `Nafasat aur bachat ka behtareen imtizaj! ${brand} ${item} par khas concessions ka lutf uthayein. Tamam flagship stores aur online dastiyab.`,
        ],
        source: 'semantic-template',
      };
    } else {
      return {
        titles: [
          `🔥 Dhamaka Bachat: ${item} par Flat ${discount}% Off!`,
          `Khas Offer: ${brand} ki ${item} par Zabardast Discount`,
          `Ab Shopping Hogi Asaan: ${item} Aadhi Qimat par`,
        ],
        descriptions: [
          `${brand} le kar aaya hai aap ke liye zabardast bachat! Abhi shopping karein aur ${item} par flat ${discount}% discount payein. Tamam online orders aur outlets par laagu.`,
          `Shopping ka shandar mauqa! ${brand} par ${item} par barri chhoot. Poore Pakistan mein fast delivery dastiyab hai. Stock khatam honay se pehlay faida uthayein!`,
        ],
        source: 'semantic-template',
      };
    }
  } else {
    if (tone === 'urgent') {
      return {
        titles: [
          `⏰ Final Hours: Flat ${discount}% Off ${brand} ${item}!`,
          `Clearance Countdown: Save ${discount}% on ${item} Before It's Gone`,
          `Flash Sale Alert: ${discount}% Off ${item} - Limited Stock Only!`,
        ],
        descriptions: [
          `Don't miss the biggest clearance event from ${brand}! Grab ${item} at an extraordinary flat ${discount}% off. Extremely limited units available nationwide with same-day dispatch.`,
          `Time is running out! Take advantage of unbeatable discounts on our top-tier ${item} collection. Shop now and secure your savings before stock runs out!`,
        ],
        source: 'semantic-template',
      };
    } else if (tone === 'luxury') {
      return {
        titles: [
          `✨ The Heritage Collection: ${discount}% Off ${brand} ${item}`,
          `Luxury Meets Value: Exclusive ${discount}% Reduction on ${item}`,
          `Elegance Redefined: Special Promotional Offer on ${brand} ${item}`,
        ],
        descriptions: [
          `Experience unparalleled craftsmanship with ${brand}'s curated ${item} collection, now offered with an exclusive ${discount}% discount. Elevate your everyday style effortlessly.`,
          `Indulge in sophisticated design and enduring quality. Enjoy flat ${discount}% savings on our most coveted ${item} range. Available online and at select flagship locations.`,
        ],
        source: 'semantic-template',
      };
    } else {
      return {
        titles: [
          `🎉 Mega Sale: Flat ${discount}% Off All ${item} at ${brand}!`,
          `Unbeatable Savings: Get ${discount}% Off Your Favorite ${item}`,
          `Special Promotion: ${discount}% Off Entire ${item} Collection`,
        ],
        descriptions: [
          `Upgrade your lifestyle with flat ${discount}% off on all ${item} from ${brand}! Shop the latest trends and everyday essentials at unbeatable promotional prices across Pakistan.`,
          `The mega savings festival is here! Enjoy up to ${discount}% discount on your favorite ${item}. Limited time offer with nationwide express delivery while supplies last!`,
        ],
        source: 'semantic-template',
      };
    }
  }
}

// ==============================================================================
// 4. FEATURE 3: PERSONALIZED CONSUMER RECOMMENDATIONS
// ==============================================================================

export interface ScoredDeal extends Deal {
  recommendationScore: number;
  recommendationReason?: string;
}

export async function fetchPersonalizedRecommendations(
  userId?: string | null,
  allDeals: Deal[] = []
): Promise<ScoredDeal[]> {
  if (allDeals.length === 0) return [];

  // Default scoring based on discount percentage and freshness
  const baseScored: ScoredDeal[] = allDeals.map((deal) => {
    const discountScore = (deal.discount_pct || 0) * 1.5;
    return {
      ...deal,
      recommendationScore: discountScore,
      recommendationReason: deal.discount_pct >= 40 ? 'Mega Discount' : 'Trending Sale',
    };
  });

  if (!userId) {
    // Guest user: sort by highest score
    return baseScored.sort((a, b) => b.recommendationScore - a.recommendationScore);
  }

  try {
    // 1. Fetch user's liked deals from Supabase
    const { data: likedRows } = await (supabase.from('likes') as any)
      .select('deal_id, deals(category_id, brand_id)')
      .eq('user_id', userId);

    // 2. Fetch user's saved deals from Supabase
    const { data: savedRows } = await (supabase.from('saved_deals') as any)
      .select('deal_id, deals(category_id, brand_id)')
      .eq('user_id', userId);

    const categoryAffinity: Record<string, number> = {};
    const brandAffinity: Record<string, number> = {};

    const processItem = (item: any, weight: number) => {
      const catId = item?.deals?.category_id || item?.category_id;
      const bId = item?.deals?.brand_id || item?.brand_id;
      if (catId) categoryAffinity[catId] = (categoryAffinity[catId] || 0) + weight;
      if (bId) brandAffinity[bId] = (brandAffinity[bId] || 0) + weight;
    };

    if (Array.isArray(likedRows)) {
      likedRows.forEach((r) => processItem(r, 10));
    }
    if (Array.isArray(savedRows)) {
      savedRows.forEach((r) => processItem(r, 15));
    }

    // 3. Re-score deals with personalization boost
    const personalized = baseScored.map((deal) => {
      let boost = 0;
      let reason: string | undefined = undefined;

      if (deal.category_id && categoryAffinity[deal.category_id]) {
        boost += categoryAffinity[deal.category_id] * 5;
        reason = 'Based on your liked categories';
      }

      if (deal.brand_id && brandAffinity[deal.brand_id]) {
        boost += brandAffinity[deal.brand_id] * 7;
        reason = reason ? 'Favorite Brand & Category' : 'From a brand you love';
      }

      const totalScore = deal.recommendationScore + boost;
      return {
        ...deal,
        recommendationScore: totalScore,
        recommendationReason: reason || deal.recommendationReason,
      };
    });

    return personalized.sort((a, b) => b.recommendationScore - a.recommendationScore);
  } catch (err) {
    console.warn('[PersonalizedRecommendations] Personalization notice:', err);
    return baseScored.sort((a, b) => b.recommendationScore - a.recommendationScore);
  }
}
