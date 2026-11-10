import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalBrandDeals } from '@/lib/dealStore';
import { getLocalBrands, KHAADI_BRAND } from '@/lib/brandStore';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Deal } from '@/types/database.types';

// ==============================================================================
// 1. GEMINI API CONFIGURATION & TYPES
// ==============================================================================

export async function getEffectiveGeminiKey(): Promise<string> {
  const envKey =
    process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    '';
  if (envKey && envKey.trim()) return envKey.trim();

  try {
    const stored = await AsyncStorage.getItem('@jumble_gemini_api_key');
    if (stored && stored.trim()) return stored.trim();
  } catch {}

  return '';
}

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

export const UUID_TO_CATEGORY_MAP: Record<string, string> = {
  '11111111-1111-1111-1111-111111111111': 'Fashion & Apparel',
  '22222222-2222-2222-2222-222222222222': 'Electronics & Mobiles',
  '33333333-3333-3333-3333-333333333333': 'Food & Dining',
  '44444444-4444-4444-4444-444444444444': 'Grocery & Supermarket',
  '55555555-5555-5555-5555-555555555555': 'Beauty & Cosmetics',
  '66666666-6666-6666-6666-666666666666': 'Home & Living',
  '77777777-7777-7777-7777-777777777777': 'Footwear & Accessories',
  '88888888-8888-8888-8888-888888888888': 'Travel & Experiences',
};

// ==============================================================================
// 2. LIVE DATABASE DEALS RETRIEVER FOR AI CONTEXT
// ==============================================================================

/**
 * Fetches all currently active deals directly from Supabase DB, enriched with brand and category data.
 * Falls back to local store if offline or on network error.
 */
export async function getLiveDatabaseDealsForAI(): Promise<Deal[]> {
  try {
    if (isSupabaseConfigured) {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 1500)
      );
      const queryPromise = supabase
        .from('deals')
        .select('*, brand:brands(id, name, logo_url, category), category:categories(id, name)')
        .eq('status', 'active')
        .order('discount_pct', { ascending: false })
        .limit(30);

      const res: any = await Promise.race([queryPromise, timeoutPromise]);
      if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
        return (res.data as Deal[]).map((d) => {
          const catName =
            (d as any).category?.name ||
            UUID_TO_CATEGORY_MAP[d.category_id || ''] ||
            'Retail';
          return {
            ...d,
            category: (d as any).category || { id: d.category_id, name: catName },
            category_name: catName,
          };
        });
      }
    }
  } catch (err) {
    console.warn('[Gemini] Supabase live deals fetch note:', err);
  }

  // Fallback to local store
  try {
    const localDeals = await getLocalBrandDeals();
    const localBrands = await getLocalBrands();
    return localDeals
      .filter((d) => d.status === 'active')
      .map((d) => {
        const brandMatch =
          (d as any).brand ||
          localBrands.find((b) => b.id === d.brand_id) ||
          KHAADI_BRAND;
        const catName =
          (d as any).category?.name ||
          UUID_TO_CATEGORY_MAP[d.category_id || ''] ||
          'Retail';
        return {
          ...d,
          brand: brandMatch,
          brand_name: brandMatch.name,
          category: (d as any).category || { id: d.category_id, name: catName },
          category_name: catName,
        };
      });
  } catch {
    return [];
  }
}

// ==============================================================================
// 3. JUMBLE BACHAT ASSISTANT (CONSUMER SHOPPING AI CONCIERGE)
// ==============================================================================

export interface AssistantResponse {
  reply: string;
  deals: Deal[];
  is_off_topic: boolean;
  language: 'roman_urdu' | 'english';
  suggested_chips?: string[];
}

export function normalizeDesiTypos(text: string): string {
  let normalized = (text || '').toLowerCase();
  // Brand name common typos
  normalized = normalized.replace(/\b(?:khadi|khaddi|khedi|kaddi)\b/g, 'khaadi');
  normalized = normalized.replace(/\b(?:otfiters|outfiter|outfitr|otfitr)\b/g, 'outfitters');
  normalized = normalized.replace(/\b(?:gulahmed|gul\s*ahmd|gull\s*ahmed)\b/g, 'gul ahmed');
  normalized = normalized.replace(/\b(?:cheezios|cheezus|chezious|cheezos|chezios)\b/g, 'cheezious');
  normalized = normalized.replace(/\b(?:batta)\b/g, 'bata');
  normalized = normalized.replace(/\b(?:pricoye|priceoi|price\s*oi)\b/g, 'priceoye');
  normalized = normalized.replace(/\b(?:saeedgani|said\s*ghani|saeed\s*gani)\b/g, 'saeed ghani');
  // Category common typos (note: preserve "diners"/"diner" for Pakistani brand handling, only fix dinnr)
  normalized = normalized.replace(/\b(?:dinr|dinnr)\b/g, 'dinner');
  normalized = normalized.replace(/\b(?:shose|snekers|sneker|joty|chpal)\b/g, 'shoes');
  normalized = normalized.replace(/\b(?:kpry|kapray|korti|kurtiyan)\b/g, 'kapray');
  return normalized;
}

function runDeterministicBachatSearch(
  query: string,
  liveDeals: Deal[],
  language: 'roman_urdu' | 'english'
): AssistantResponse {
  const rawLower = query.toLowerCase().trim();
  const lower = normalizeDesiTypos(rawLower);

  // 1. Strict Out-of-Syllabus Guard (Prioritized)
  const offTopicPatterns = [
    // Sports, matches, players, games
    /\b(?:football|soccer|cricket|hockey|tennis|badminton|sports|game|games|gaming|pubg|free\s*fire|fifa|pes|match|score|player|ronaldo|messi|babar|virat)\b/i,
    // Casual Chit-Chat, Personal Queries, TV & Media
    /\b(?:dekhtay\s*ho|dekhte\s*ho|khelte\s*ho|kheltay\s*ho|kya\s*kar\s*rahe\s*ho|kya\s*karte\s*ho|kahan\s*rehte\s*ho|kahan\s*se\s*ho|shadi\s*karoge|shadi\s*hui|girlfriend|boyfriend|love\s*you|pyar|dost\s*banoge|friendship|bore\s*ho\s*raha|baat\s*karo|kuch\s*sunao|latifa|joke|jokes|shayari|ghazal|poetry|song|songs|gaana|movie|movies|film|drama|dramas|netflix|tiktok|youtube)\b/i,
    // Politics, News, Weather, Coding & General Knowledge
    /\b(?:politics|siasat|prime\s*minister|president|imran|nawaz|shehbaz|army|weather|mausam|barish|barsaat|python|javascript|coding|code|homework|essay|capital\s*of|math\s*problem|science|physics|chemistry|biology|history|who\s*is|who\s*won|who\s*was|who\s*created|tell\s*me\s*a\s*story)\b/i
  ];
  if (offTopicPatterns.some((rgx) => rgx.test(lower))) {
    const refusal =
      language === 'roman_urdu'
        ? "Sorry, I can't answer that. Main sirf Jumble Sale aur aapke shopping deals aur bachat ke liye hazir hoon! 🛍️ Batayein aaj Pakistan ke kis brand ya product par discount dekhna hai?"
        : "Sorry, I can't answer that. I am your Jumble Sale shopping assistant, exclusively here to help you discover verified brand deals and discounts across Pakistan.";
    return {
      reply: refusal,
      deals: [],
      is_off_topic: true,
      language,
      suggested_chips: [
        '👗 Khaadi & Gul Ahmed Sale',
        '🍕 Cheezious Pizza Combos',
        '👟 Bata Shoes 50% Off',
        '🎯 Rs. 3,000 Budget Deals',
      ],
    };
  }

  // 2. Greeting Detection (Trained Customer Service Courtesy)
  const isSalam = /\b(?:salam|asalam|assalam|aslamu|assalamu|aoa)\b/i.test(lower);
  const isHey = /^(?:hey|hi|hello|heya)\b/i.test(lower);
  const isCasualGreeting = /^(?:kya haal|kese ho|kaise ho)\b/i.test(lower);

  if (isSalam) {
    const reply =
      'Walaikum Assalam Janab! Main aap ki kya madad kar sakta hoon? 🛍️\n\nBatayein aaj Pakistan ke kis brand ya category par shopping ka irada hai — kapray, branded shoes, naya smartphone ya shaam ka khana? Aur budget kitna zehan mein hai?\n\nAap batayein, main foran behtareen verified deals aur posts nikaal kar dikha deta hoon!';
    return {
      reply,
      deals: [], // NO CARDS DUMPED ON GREETINGS!
      is_off_topic: false,
      language: 'roman_urdu',
      suggested_chips: [
        '👗 Khaadi Deals Dikhao',
        '👟 Bata Shoes Dikhao',
        '🍕 Cheezious Pizza Dikhao',
        '🎯 Rs. 3,000 Budget Deals',
      ],
    };
  }

  if (isHey || isCasualGreeting) {
    const reply =
      'Hello Janab! Main aap ki kya madad kar sakta hoon? 🛍️\n\nBatayein aaj kis cheez ki shopping ka irada hai — naye kapray, jootay, budget smartphone ya shaam ka dinner? Aur kitna budget zehan mein hai?\n\nAap batayein, main foran behtareen verified posts dikha deta hoon!';
    return {
      reply,
      deals: [], // NO CARDS DUMPED ON GREETINGS!
      is_off_topic: false,
      language: 'roman_urdu',
      suggested_chips: [
        '👗 Khaadi Deals Dikhao',
        '👟 Bata Shoes Dikhao',
        '🍕 Cheezious Pizza Dikhao',
        '🎯 Rs. 3,000 Budget Deals',
      ],
    };
  }

  // 3. Platform & Brand Information Inquiries (e.g. "tumharay brand mai kis trah ki products han?", "yahan kya milta hai?")
  const isPlatformInfoQuery =
    /\b(?:kis\s*trah\s*ki|kis\s*tarah\s*ki|kis\s*qism\s*ki|kya\s*milta|kya\s*bechte|kya\s*kya\s*hai|kaun\s*se\s*brand|konse\s*brand|brands\s*hain|brands\s*han|products\s*hain|products\s*han|jumble\s*sale\s*kya|about\s*jumble|what\s*products|what\s*brands)\b/i.test(
      lower
    ) ||
    /kis\s*trah\s*ki\s*products|kis\s*tarah\s*ki\s*products|brand\s*mai\s*kis|brand\s*mein\s*kis|products\s*han|products\s*hain|app\s*mai\s*kya|app\s*mein\s*kya/i.test(
      lower
    );

  if (isPlatformInfoQuery) {
    const reply =
      'Janab, Jumble Sale par Pakistan ke registered official brands ki verified discounted products aur exclusive sales milti hain!\n\nHamare registered partners par in categories mein 30% se 70% tak direct bachat hoti hai:\n• 👗 Fashion & Kapray (Khaadi, Outfitters, Gul Ahmed)\n• 👟 Footwear & Jootay (Bata Pakistan)\n• 📱 Mobiles & Electronics (PriceOye)\n• 🍕 Dinners & Fast Food (Cheezious)\n• 🛒 Grocery & Supermarket (Imtiaz Super Market)\n• 🏠 Home & Decor (Habitt)\n\nBatayein Janab, aapko kis brand ya category ki deals aur posts dekhni hain?';
    return {
      reply,
      deals: [], // NO BLIND POST DUMPING! Show on demand
      is_off_topic: false,
      language: 'roman_urdu',
      suggested_chips: [
        '👗 Khaadi Deals Dikhao',
        '🍕 Cheezious Pizza Dikhao',
        '👟 Bata Shoes Dikhao',
        '📱 Mobile Deals Dikhao',
      ],
    };
  }

  // 4. Diners (Menswear Brand) vs Dinner (Food) Handling (e.g. "orr dinners ki ha?", "dinners ki deal available ha?")
  const isDinersBrandOrDinnerQuery =
    /\b(?:diners|diner|dinners)\b/i.test(lower) &&
    !/\b(?:pizza|burger|fast\s*food|shawarma|wings|karahi|lunch|breakfast)\b/i.test(lower) &&
    !/\b(?:bhook|khane|khana)\b/i.test(lower);

  if (isDinersBrandOrDinnerQuery) {
    const isExplicitShow = /\b(?:dikhao|dikhayein|dekhao|show|posts|cards)\b/i.test(lower);
    const reply =
      "Janab, agar aap Diners (menswear brand) ki baat kar rahe hain to filhal Diners hamare platform par registered nahi hai, magar men's fashion aur kapron par hamare registered brands Khaadi aur Outfitters par 40% se 50% tak flat discount available hai!\n\nAur agar aap shaam ke Dinner (fast food ya pizza) ki deal dhoondh rahe hain to Cheezious par 30% OFF pizza combos live hain.\n\nBatayein Janab, aapko men's fashion deals dekhni hain ya dinner fast food ki posts dikhaoon?";

    return {
      reply,
      deals: isExplicitShow
        ? liveDeals.filter(d => {
            const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
            return bName.includes('outfitter') || bName.includes('cheezious') || bName.includes('khaadi');
          }).slice(0, 3)
        : [],
      is_off_topic: false,
      language: 'roman_urdu',
      suggested_chips: [
        '👕 Men\'s Fashion Deals Dikhao',
        '🍕 Cheezious Pizza Dikhao',
        '👗 Khaadi Deals Dikhao',
      ],
    };
  }

  // 3. Needs Discovery & Broad Shopping Guidance (e.g. "madad kro meri shopping krnay mai")
  const isGuidanceOrHelpQuery =
    /\b(?:madad|help|guide|guidance|mashwara|mashwarah|suggest|suggestion|recommend|recommendation|shopping\s*krnay|shopping\s*karni|samajh\s*nahi\s*aa\s*raha|kya\s*khareedon|kya\s*loon|kuch\s*batao|kahan\s*se\s*shuru)\b/i.test(
      lower
    ) ||
    /madad\s*kro|shopping\s*krnay\s*mai|shopping\s*karne\s*mein|shopping\s*guide/i.test(lower);

  if (isGuidanceOrHelpQuery) {
    const reply =
      'Hukam karein Janab! Main aapki shopping mein madad karne aur aapke hazaron rupay bachane ke liye hi hazir hoon! 🛍️\n\nSir, aap aaj kis tarah ke product mein dilchaspi rakhte hain?\n• 👗 Fashion & Kapray (Khaadi, Outfitters, Gul Ahmed)\n• 👟 Footwear & Jootay (Bata Pakistan)\n• 📱 Mobiles & Electronics (PriceOye)\n• 🍕 Dinners & Fast Food (Cheezious)\n\nAur shopping ke liye aap ka target budget kitna zehan mein hai? Neechay diye gaye options par tap karein ya mujhe batayein:';

    return {
      reply,
      deals: [], // NO BLIND POST DUMPING! True consultative discovery
      is_off_topic: false,
      language: 'roman_urdu',
      suggested_chips: [
        '👗 Kapray & Lawn',
        '👟 Branded Shoes',
        '🍕 Dinners & Food',
        '📱 Phones & Tech',
        '🎯 Rs. 3,000 Budget',
      ],
    };
  }

  // 4. Ambiguity Counter-Questioning (e.g. "kuch acha dikhao", "kuch sasta", "gift chahiye")
  const isAmbiguousBroadQuery =
    /\b(?:kuch\s*acha|kuch\s*bhi|acha\s*sa|gift\s*lena|gift\s*chahiye|best\s*cheez|top\s*cheez|sab\s*se\s*acha)\b/i.test(
      lower
    ) &&
    !/khaadi|outfitters|bata|cheezious|priceoye|saeed|lawn|shoe|pizza|phone|dinner/i.test(lower);

  if (isAmbiguousBroadQuery) {
    const reply =
      'Zaroor Janab! Behtareen recommendations nikaal deta hoon jahan sab se bari bachat ho rahi hai. Sir, thora wazeh farmayein:\n1. Yeh shopping ladies ke liye hai ya gents ke liye?\n2. Aap naye kapray, jootay, gadgets ya dinner deal dhoondh rahe hain?\n3. Aur target budget kitna zehan mein hai?';

    return {
      reply,
      deals: [],
      is_off_topic: false,
      language: 'roman_urdu',
      suggested_chips: [
        '👗 Ladies Lawn & Kurtis',
        '👕 Gents Casual Wear',
        '👟 Bata Footwear',
        '📱 Tech Deals',
        '💰 Under Rs. 4,000',
      ],
    };
  }

  // 2. Specific Brand Name Mentions (Exact Brand Pitching)
  const isKhaadi = /khaadi/i.test(lower);
  const isOutfitters = /outfitter/i.test(lower);
  const isGulAhmed = /gul\s*ahmed|gulahmed/i.test(lower);
  const isBata = /bata/i.test(lower);
  const isCheezious = /cheezious/i.test(lower);
  const isPriceOye = /price\s*oye|priceoye/i.test(lower);
  const isSaeedGhani = /saeed\s*ghani|saeedghani/i.test(lower);
  const isImtiaz = /imtiaz/i.test(lower);
  const isHabitt = /habitt/i.test(lower);

  let brandMatches: Deal[] = [];
  let brandPitchedName = '';

  if (isKhaadi) {
    brandPitchedName = 'Khaadi';
    brandMatches = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return bName.includes('khaadi') || title.includes('khaadi');
    });
  } else if (isOutfitters) {
    brandPitchedName = 'Outfitters';
    brandMatches = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return bName.includes('outfitter') || title.includes('outfitter');
    });
  } else if (isGulAhmed) {
    brandPitchedName = 'Gul Ahmed';
    brandMatches = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return bName.includes('gul') || bName.includes('ahmed') || title.includes('gul ahmed');
    });
  } else if (isBata) {
    brandPitchedName = 'Bata Pakistan';
    brandMatches = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return bName.includes('bata') || title.includes('bata');
    });
  } else if (isCheezious) {
    brandPitchedName = 'Cheezious';
    brandMatches = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return bName.includes('cheezious') || title.includes('cheezious');
    });
  } else if (isPriceOye) {
    brandPitchedName = 'PriceOye';
    brandMatches = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return bName.includes('priceoye') || title.includes('priceoye');
    });
  } else if (isSaeedGhani) {
    brandPitchedName = 'Saeed Ghani';
    brandMatches = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return bName.includes('saeed') || bName.includes('ghani') || title.includes('saeed ghani');
    });
  } else if (isImtiaz) {
    brandPitchedName = 'Imtiaz Super Market';
    brandMatches = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      return bName.includes('imtiaz');
    });
  } else if (isHabitt) {
    brandPitchedName = 'Habitt';
    brandMatches = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      return bName.includes('habitt');
    });
  }

  if (brandMatches.length > 0) {
    const topDeal = brandMatches[0];
    const origPrice = topDeal.original_price || 0;
    const discPrice =
      topDeal.discount_price ||
      (origPrice && topDeal.discount_pct
        ? Math.round(origPrice * (1 - topDeal.discount_pct / 100))
        : origPrice);
    const savings = origPrice > discPrice ? origPrice - discPrice : 0;
    const savingsNote =
      savings > 0 ? ` (aur seedha Rs. ${savings.toLocaleString()} ki bachat mil rahi hai!)` : '';

    const reply =
      language === 'roman_urdu'
        ? `Janab! ${brandPitchedName} par is waqt zabardast offers chal rahi hain! Sab se top deal "${topDeal.title}" par ${topDeal.discount_pct}% discount chal raha hai${savingsNote}. Stock bohot tezi se nikal raha hai, yeh dekhein ${brandPitchedName} ki active verified deals:`
        : `Great news Janab! ${brandPitchedName} currently has verified active sales with up to ${topDeal.discount_pct}% OFF${savingsNote}. Here are the top deals from ${brandPitchedName}:`;

    let brandChips = [
      '💰 Is se sasta alternative',
      '🔥 50%+ OFF Flash Deals',
      '⚡ Claim Deal',
    ];
    if (isKhaadi || isOutfitters || isGulAhmed) {
      brandChips = ['👟 Matching Bata Shoes', '💰 Is se sasta alternative', '🔥 50%+ OFF Flash Deals'];
    } else if (isCheezious) {
      brandChips = ['🥤 Wings & Drinks Combo', '🍔 Fast Food Alternative', '🛵 Delivery Info'];
    } else if (isBata) {
      brandChips = ['👗 Matching Khaadi Kurti', '👟 Casual Sneakers', '💰 Under Rs. 2,000'];
    }

    return {
      reply,
      deals: brandMatches.slice(0, 5),
      is_off_topic: false,
      language,
      suggested_chips: brandChips,
    };
  }

  // 3. Budget Query
  const budgetMatch =
    lower.match(/(?:budget|range|under|andar|tak|mein)\s*(?:rs\.?|pkr)?\s*(\d{3,6})/i) ||
    lower.match(/(?:rs\.?|pkr)?\s*(\d{3,6})\s*(?:budget|ke andar|tak)/i);

  if (budgetMatch) {
    const maxBudget = parseInt(budgetMatch[1], 10);
    const affordableDeals = liveDeals.filter((d) => {
      const price =
        d.discount_price ||
        (d as any).price ||
        (d.original_price && d.discount_pct
          ? Math.round(d.original_price * (1 - d.discount_pct / 100))
          : 0);
      return price > 0 && price <= maxBudget;
    });

    if (affordableDeals.length > 0) {
      const topPick = affordableDeals[0];
      const topPrice =
        topPick.discount_price ||
        (topPick as any).price ||
        (topPick.original_price && topPick.discount_pct
          ? Math.round(topPick.original_price * (1 - topPick.discount_pct / 100))
          : 0);
      const savings = (topPick.original_price || topPrice) - topPrice;
      const brandName = (topPick as any).brand?.name || 'Brand';

      const reply =
        language === 'roman_urdu'
          ? `Befikar rahein Janab! Aapke Rs. ${maxBudget.toLocaleString()} ke budget mein main ne top verified deals nikali hain. Meri sab se bari recommendation ${brandName} ka "${topPick.title}" hai jo sirf Rs. ${topPrice.toLocaleString()} mein mil raha hai (aur seedha Rs. ${savings.toLocaleString()} ki bachat ho rahi hai!). Stock limited hai, neechay diye gaye card se foran claim karein:`
          : `Don't worry Janab! Within your Rs. ${maxBudget.toLocaleString()} budget, I hand-picked the best deals. Top recommendation is "${topPick.title}" from ${brandName} at only Rs. ${topPrice.toLocaleString()} (saving Rs. ${savings.toLocaleString()}!). Limited stock, claim below:`;

      return {
        reply,
        deals: affordableDeals.slice(0, 5),
        is_off_topic: false,
        language,
        suggested_chips: [
          '👗 Outfits in Budget',
          '👟 Shoes in Budget',
          '🍕 Food in Budget',
          '💡 Sasta Alternative',
        ],
      };
    }
  }

  // 4. Sasta / Mehnga / Objection Handling
  const isCheapOrObjection = /sasta|kam budget|mehnga|discount zyada|chhoot|sasti|alternative/i.test(lower);
  if (isCheapOrObjection) {
    const sortedCheapest = [...liveDeals].sort((a, b) => {
      const pA =
        a.discount_price ||
        (a.original_price ? Math.round(a.original_price * (1 - (a.discount_pct || 0) / 100)) : 999999);
      const pB =
        b.discount_price ||
        (b.original_price ? Math.round(b.original_price * (1 - (b.discount_pct || 0) / 100)) : 999999);
      return pA - pB;
    });
    const topCheap = sortedCheapest.slice(0, 4);
    const reply =
      language === 'roman_urdu'
        ? `Befikar rahein! Ek acha salesman hamesha customer ke paisay bachata hai. Yeh dekhein hamari sab se sasti aur high-value verified deals jahan qimat intehai munasib hai aur bachat zabardast hai:`
        : `No worries Janab! A great personal shopper always watches your wallet. Here are our lowest-price, maximum-value verified deals right now:`;
    return { reply, deals: topCheap, is_off_topic: false, language };
  }

  // 5. Discount Percentage Query
  const pctMatch = lower.match(/(\d{1,2})\s*%/);
  if (pctMatch) {
    const requestedPct = parseInt(pctMatch[1], 10);
    const highDiscountDeals = liveDeals.filter((d) => (d.discount_pct || 0) >= requestedPct);

    if (highDiscountDeals.length > 0) {
      const reply =
        language === 'roman_urdu'
          ? `Zabardast choice! Mujhe aapke liye ${requestedPct}% ya is se zyada discount wali ${highDiscountDeals.length} dhamaka deals mili hain! Yeh limited time offers hain, neechay diye gaye cards se direct claim karein:`
          : `Excellent choice! I found ${highDiscountDeals.length} active verified deals offering ${requestedPct}% or more discount! These are limited-time offers, claim below:`;
      return { reply, deals: highDiscountDeals.slice(0, 5), is_off_topic: false, language };
    }
  }

  // 6. Category Direct Matchers (Deep Pakistani Retail Synonyms)
  const isFood =
    /\b(?:food|foods|burger|burgers|pizza|pizzas|khana|khane|biryani|dine|dining|dinner|dinners|lunch|breakfast|fast\s*food|shawarma|karahi|roll|rolls|wings|combo|meal|meals|restaurant|restaurants)\b/i.test(
      lower
    ) || /dinner|dinners|pizza/i.test(lower);

  const isFashion =
    /\b(?:kapr|kapray|kapron|lawn|kurti|kurtis|dress|dresses|suit|suits|shirt|shirts|pant|pants|fashion|cloth|clothes|clothing|pret|unstitched|streetwear)\b/i.test(
      lower
    );

  const isFootwear =
    /\b(?:shoe|shoes|joot|jootay|jooton|sneaker|sneakers|chappal|chappals|sandal|sandals|boot|boots|jogger|joggers|footwear)\b/i.test(
      lower
    );

  const isElectronics =
    /\b(?:mobile|mobiles|phone|phones|smartphone|smartphones|laptop|laptops|electronics|tech|watch|watches|gadget|gadgets|earbud|earbuds|airpod|airpods|redmi)\b/i.test(
      lower
    );

  const isBeauty =
    /\b(?:beauty|makeup|skin|skincare|perfume|perfumes|cosmetic|cosmetics|serum|rose\s*water|arq-e-gulab|hair\s*oil|cream)\b/i.test(
      lower
    );

  const isGrocery =
    /\b(?:grocery|groceries|rashan|supermarket|oil|ghee|atta|sugar|chawal|rice|masala|daal)\b/i.test(
      lower
    );

  const isHome =
    /\b(?:furniture|bed|beds|bedsheet|bedsheets|sofa|sofas|cushion|cushions|decor|curtain|curtains|living)\b/i.test(
      lower
    );

  if (isFood) {
    const foodDeals = liveDeals.filter((d) => {
      const cat = ((d as any).category_name || (d as any).category?.name || '').toLowerCase();
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return (
        cat.includes('food') ||
        cat.includes('dining') ||
        bName.includes('cheezious') ||
        /pizza|burger|wings|combo|meal|crust/i.test(title)
      );
    });

    if (foodDeals.length > 0) {
      const topDeal = foodDeals[0];
      const origPrice = topDeal.original_price || 0;
      const discPrice =
        topDeal.discount_price ||
        (origPrice && topDeal.discount_pct
          ? Math.round(origPrice * (1 - topDeal.discount_pct / 100))
          : origPrice);
      const savings = origPrice > discPrice ? origPrice - discPrice : 0;
      const savingsNote =
        savings > 0 ? ` (aur seedha Rs. ${savings.toLocaleString()} ki bachat mil rahi hai!)` : '';

      const reply =
        language === 'roman_urdu'
          ? `Bhook lagi hai Janab? Cheezious aur hamare verified food partners par dinner, fast food aur pizza combos par 30% tak discount chal raha hai — khana lazeez aur bachat zabardast! Top deal par ${topDeal.discount_pct}% discount chal raha hai${savingsNote}. Yeh dekhein active food & dinner deals:`
          : `Hungry Janab? Cheezious and food partners have special 30% discount combos live right now${savingsNote}! Here are the active dinner and food deals:`;

      return {
        reply,
        deals: foodDeals.slice(0, 5),
        is_off_topic: false,
        language,
        suggested_chips: [
          '🥤 Wings & Drinks Combo',
          '🍔 Burger Deals',
          '💰 Under Rs. 1,500',
          '🛵 Fast Delivery',
        ],
      };
    }
  }

  if (isFashion) {
    const fashionDeals = liveDeals.filter((d) => {
      const cat = ((d as any).category_name || (d as any).category?.name || '').toLowerCase();
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return (
        cat.includes('fashion') ||
        bName.includes('khaadi') ||
        bName.includes('outfitter') ||
        bName.includes('gul') ||
        /lawn|kurti|suit|unstitched|pret|streetwear/i.test(title)
      );
    });

    if (fashionDeals.length > 0) {
      const topDeal = fashionDeals[0];
      const origPrice = topDeal.original_price || 0;
      const discPrice =
        topDeal.discount_price ||
        (origPrice && topDeal.discount_pct
          ? Math.round(origPrice * (1 - topDeal.discount_pct / 100))
          : origPrice);
      const savings = origPrice > discPrice ? origPrice - discPrice : 0;
      const savingsNote =
        savings > 0 ? ` (aur seedha Rs. ${savings.toLocaleString()} ki bachat mil rahi hai!)` : '';

      const reply =
        language === 'roman_urdu'
          ? `Wah Janab! Kapron aur lawn collection par is waqt Jumble Sale par sab se bari bachat chal rahi hai! Khaadi, Outfitters aur Gul Ahmed par 30% se 50% tak flat discount mil raha hai${savingsNote}. Yeh dekhein top verified fashion deals:`
          : `Superb choice Janab! We have massive sales on lawn, pret and apparel today with up to 50% OFF${savingsNote}. Here are the top verified fashion deals:`;

      return {
        reply,
        deals: fashionDeals.slice(0, 5),
        is_off_topic: false,
        language,
        suggested_chips: [
          '👟 Matching Bata Shoes',
          '👗 Khaadi Flat 50%',
          '👕 Outfitters Streetwear',
          '💰 Under Rs. 3,000',
        ],
      };
    }
  }

  if (isFootwear) {
    const shoeDeals = liveDeals.filter((d) => {
      const cat = ((d as any).category_name || (d as any).category?.name || '').toLowerCase();
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return (
        cat.includes('footwear') ||
        bName.includes('bata') ||
        /shoe|sneaker|sandal|chappal|boot/i.test(title)
      );
    });

    if (shoeDeals.length > 0) {
      const topDeal = shoeDeals[0];
      const origPrice = topDeal.original_price || 0;
      const discPrice =
        topDeal.discount_price ||
        (origPrice && topDeal.discount_pct
          ? Math.round(origPrice * (1 - topDeal.discount_pct / 100))
          : origPrice);
      const savings = origPrice > discPrice ? origPrice - discPrice : 0;
      const savingsNote =
        savings > 0 ? ` (aur seedha Rs. ${savings.toLocaleString()} ki bachat mil rahi hai!)` : '';

      const reply =
        language === 'roman_urdu'
          ? `Zabardast choice Janab! Jooton aur sneakers par Bata aur top footwear brands ne qeematein aadhi kar di hain, jahan seedha Rs. 1,000+ ki bachat mil rahi hai${savingsNote}. Yeh dekhein top footwear deals:`
          : `Great taste Janab! Bata and top footwear brands are offering huge markdowns right now${savingsNote}. Here are the verified shoe deals:`;

      return {
        reply,
        deals: shoeDeals.slice(0, 5),
        is_off_topic: false,
        language,
        suggested_chips: [
          '👗 Matching Outfits',
          '👟 Bata Casual Sneakers',
          '👠 Formal Khussa / Heels',
          '💰 Under Rs. 2,000',
        ],
      };
    }
  }

  if (isElectronics) {
    const techDeals = liveDeals.filter((d) => {
      const cat = ((d as any).category_name || (d as any).category?.name || '').toLowerCase();
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return (
        cat.includes('electronics') ||
        bName.includes('priceoye') ||
        /phone|mobile|redmi|earbud|airpod|laptop/i.test(title)
      );
    });

    if (techDeals.length > 0) {
      const topDeal = techDeals[0];
      const origPrice = topDeal.original_price || 0;
      const discPrice =
        topDeal.discount_price ||
        (origPrice && topDeal.discount_pct
          ? Math.round(origPrice * (1 - topDeal.discount_pct / 100))
          : origPrice);
      const savings = origPrice > discPrice ? origPrice - discPrice : 0;
      const savingsNote =
        savings > 0 ? ` (aur seedha Rs. ${savings.toLocaleString()} ki bachat mil rahi hai!)` : '';

      const reply =
        language === 'roman_urdu'
          ? `Tech aur gadget lovers ke liye khushkhabri! PriceOye aur top electronics par verified official warranty ke sath dhamaka sale chal rahi hai${savingsNote}. Yeh dekhein sab se saste tech deals:`
          : `Smart thinking Janab! PriceOye and electronics partners are offering massive markdowns with official warranty${savingsNote}. Here are the top tech deals:`;

      return { reply, deals: techDeals.slice(0, 5), is_off_topic: false, language };
    }
  }

  if (isBeauty) {
    const beautyDeals = liveDeals.filter((d) => {
      const cat = ((d as any).category_name || (d as any).category?.name || '').toLowerCase();
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return (
        cat.includes('beauty') ||
        bName.includes('saeed') ||
        /rose water|skincare|serum|cream|hair oil/i.test(title)
      );
    });

    if (beautyDeals.length > 0) {
      const topDeal = beautyDeals[0];
      const origPrice = topDeal.original_price || 0;
      const discPrice =
        topDeal.discount_price ||
        (origPrice && topDeal.discount_pct
          ? Math.round(origPrice * (1 - topDeal.discount_pct / 100))
          : origPrice);
      const savings = origPrice > discPrice ? origPrice - discPrice : 0;
      const savingsNote =
        savings > 0 ? ` (aur seedha Rs. ${savings.toLocaleString()} ki bachat mil rahi hai!)` : '';

      const reply =
        language === 'roman_urdu'
          ? `Self-care aur cosmetics par Saeed Ghani aur top brands par direct bachat mil rahi hai! 100% natural aur certified products par special discounts dekhein${savingsNote}:`
          : `Self-care time Janab! Saeed Ghani and beauty brands are running limited-time markdowns${savingsNote}. Here are the top beauty deals:`;

      return { reply, deals: beautyDeals.slice(0, 5), is_off_topic: false, language };
    }
  }

  if (isGrocery) {
    const groceryDeals = liveDeals.filter((d) => {
      const cat = ((d as any).category_name || (d as any).category?.name || '').toLowerCase();
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      return cat.includes('grocery') || bName.includes('imtiaz');
    });

    if (groceryDeals.length > 0) {
      const reply =
        language === 'roman_urdu'
          ? 'Ghar ke rashan aur daily grocery par Imtiaz Super Market par monthly bachat deals chal rahi hain. Yeh dekhein live grocery savings:'
          : 'Daily essentials Janab! Imtiaz Super Market has live supermarket savings:';
      return { reply, deals: groceryDeals.slice(0, 5), is_off_topic: false, language };
    }
  }

  if (isHome) {
    const homeDeals = liveDeals.filter((d) => {
      const cat = ((d as any).category_name || (d as any).category?.name || '').toLowerCase();
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      return cat.includes('home') || bName.includes('habitt');
    });

    if (homeDeals.length > 0) {
      const reply =
        language === 'roman_urdu'
          ? 'Home decor aur furniture par Habitt aur home partners par exclusive bachat discounts chal rahe hain. Yeh dekhein active home deals:'
          : 'Home & living deals Janab! Check out Habitt furniture and decor discounts:';
      return { reply, deals: homeDeals.slice(0, 5), is_off_topic: false, language };
    }
  }

  // 7. General Tokenized Search
  const words = lower.split(/\s+/).filter(w => w.length > 2 && !['ki', 'ka', 'ke', 'ko', 'se', 'deals', 'deal', 'sale', 'btana', 'batao', 'btao', 'hai', 'hain', 'orr', 'aur'].includes(w));
  const tokenMatches = liveDeals.filter(d => {
    const title = (d.title || '').toLowerCase();
    const desc = (d.description || '').toLowerCase();
    const bName = ((d as any).brand?.name || '').toLowerCase();
    const catName = ((d as any).category_name || (d as any).category?.name || '').toLowerCase();
    return words.some(w => title.includes(w) || desc.includes(w) || bName.includes(w) || catName.includes(w));
  });

  if (tokenMatches.length > 0) {
    const topDeal = tokenMatches[0];
    const origPrice = topDeal?.original_price || 0;
    const discPrice =
      topDeal?.discount_price ||
      (origPrice && topDeal?.discount_pct
        ? Math.round(origPrice * (1 - topDeal.discount_pct / 100))
        : origPrice);
    const savings = origPrice > discPrice ? origPrice - discPrice : 0;
    const savingsNote =
      savings > 0 ? ` (aur seedha Rs. ${savings.toLocaleString()} ki bachat mil rahi hai!)` : '';

    const reply =
      language === 'roman_urdu'
        ? `Janab! Hamare registered brand partners par yeh sab se sasti aur zabardast deals chal rahi hain! Top deal par ${topDeal?.discount_pct || 0}% discount chal raha hai${savingsNote}. Limited stock hai, foran claim karein:`
        : `Janab! Our registered brand partners have these high-value savings live right now! The top deal offers ${topDeal?.discount_pct || 0}% OFF${savingsNote}. Limited stock, check them out:`;

    const isExplicitShow = /\b(?:dikhao|dikhayein|dikha|dekhao|dekhein|show|posts|cards|deals|deal|sale|offer)\b/i.test(lower);
    return {
      reply,
      deals: isExplicitShow ? tokenMatches.slice(0, 5) : [],
      is_off_topic: false,
      language,
      suggested_chips: [
        '👗 Khaadi Deals Dikhao',
        '🍕 Cheezious Pizza Dikhao',
        '👟 Bata Shoes Dikhao',
        '📱 Mobile Deals Dikhao',
      ],
    };
  }

  // Honest Salesman Fallback (when no specific item was found in database)
  const shoppingIntentKeywords = /\b(?:deal|deals|sale|sales|discount|discounts|bachat|offer|offers|coupon|coupons|voucher|vouchers|sasta|sasti|saste|mehnga|mehngi|budget|price|qimat|rate|khareed|buy|shopping|order|claim)\b/i;
  const hasShoppingIntent = shoppingIntentKeywords.test(lower);

  if (!hasShoppingIntent) {
    // If no deals matched and user didn't even mention shopping words, it is out of syllabus!
    const refusal =
      "Sorry, I can't answer that. Main sirf Jumble Sale aur aapke shopping deals aur bachat ke liye hazir hoon! 🛍️ Batayein aaj Pakistan ke kis brand ya category par discount dekhna hai?";
    return {
      reply: refusal,
      deals: [],
      is_off_topic: true,
      language: 'roman_urdu',
      suggested_chips: [
        '👗 Khaadi Deals Dikhao',
        '🍕 Cheezious Pizza Dikhao',
        '👟 Bata Shoes Dikhao',
        '🎯 Rs. 3,000 Budget Deals',
      ],
    };
  }

  const fallbackReply =
    language === 'roman_urdu'
      ? 'Janab! Filhal is mutalliq specific verified deal active nahi hai, magar hamare registered brand partners par yeh garam offers chal rahi hain jahan aap ke hazaron rupay bach sakte hain. Batayein Janab, aapko kis brand ya category ki posts dikhaoon?'
      : 'Janab! While we do not have an active deal matching that exact item right now, our registered brand partners have exciting high-value offers today. Which category posts would you like me to show?';

  const isExplicitShow = /\b(?:dikhao|dikhayein|dikha|dekhao|dekhein|show|posts|cards)\b/i.test(lower);
  return {
    reply: fallbackReply,
    deals: isExplicitShow ? liveDeals.slice(0, 4) : [],
    is_off_topic: false,
    language,
    suggested_chips: [
      '👗 Khaadi Deals Dikhao',
      '🍕 Cheezious Pizza Dikhao',
      '👟 Bata Shoes Dikhao',
      '📱 Mobile Deals Dikhao',
    ],
  };
}

export async function askJumbleBachatAssistant(
  userQuery: string,
  chatHistory: { role: string; content: string }[] = []
): Promise<AssistantResponse> {
  const query = (userQuery || '').trim();
  const lower = query.toLowerCase();

  // 1. Fetch REAL active live deals directly from database
  const liveDeals = await getLiveDatabaseDealsForAI();

  // Detect language
  const urduMarkers = [
    'pe', 'par', 'sasti', 'sasta', 'dikhao', 'dikhayein', 'batao', 'btana', 'btao', 'bata',
    'chahye', 'chahiye', 'hai', 'hain', 'ho', 'wali', 'walay', 'wala', 'mein',
    'men', 'kapron', 'jootay', 'khana', 'mujhe', 'karo', 'kar', 'choot',
    'bachat', 'dhamaka', 'aadhi', 'qimat', 'kya', 'le', 'sakta', 'meri',
    'kese', 'kaise', 'bhi', 'kuch', 'kitna', 'ki', 'ka', 'ke', 'ko', 'se',
    'ye', 'yeh', 'wo', 'woh', 'bhai', 'baji', 'janab', 'dost',
    'salam', 'assalam', 'aslamu', 'alaikum', 'aoa', 'hey', 'hello', 'hi',
    'dinners', 'dinner', 'orr', 'aur', 'kuch', 'bata'
  ];
  const isRomanUrdu = urduMarkers.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower));
  const language: 'roman_urdu' | 'english' = isRomanUrdu ? 'roman_urdu' : 'roman_urdu';

  // 2. Strict Off-Topic Guard
  const offTopicPatterns = [
    // Sports, matches, players, games
    /\b(?:football|soccer|cricket|hockey|tennis|badminton|sports|game|games|gaming|pubg|free\s*fire|fifa|pes|match|score|player|ronaldo|messi|babar|virat)\b/i,
    // Casual Chit-Chat, Personal Queries, TV & Media
    /\b(?:dekhtay\s*ho|dekhte\s*ho|khelte\s*ho|kheltay\s*ho|kya\s*kar\s*rahe\s*ho|kya\s*karte\s*ho|kahan\s*rehte\s*ho|kahan\s*se\s*ho|shadi\s*karoge|shadi\s*hui|girlfriend|boyfriend|love\s*you|pyar|dost\s*banoge|friendship|bore\s*ho\s*raha|baat\s*karo|kuch\s*sunao|latifa|joke|jokes|shayari|ghazal|poetry|song|songs|gaana|movie|movies|film|drama|dramas|netflix|tiktok|youtube)\b/i,
    // Politics, News, Weather, Coding & General Knowledge
    /\b(?:politics|siasat|prime\s*minister|president|imran|nawaz|shehbaz|army|weather|mausam|barish|barsaat|python|javascript|coding|code|homework|essay|capital\s*of|math\s*problem|science|physics|chemistry|biology|history|who\s*is|who\s*won|who\s*was|who\s*created|tell\s*me\s*a\s*story)\b/i
  ];
  const isStrictlyOffTopic = offTopicPatterns.some((rgx) => rgx.test(lower));

  if (isStrictlyOffTopic) {
    const refusal =
      language === 'roman_urdu'
        ? "Sorry, I can't answer that. Main sirf Jumble Sale aur aapke shopping deals aur bachat ke liye hazir hoon! 🛍️ Batayein aaj Pakistan ke kis brand ya product par discount dekhna hai?"
        : "Sorry, I can't answer that. I am your Jumble Sale shopping assistant, exclusively here to help you discover verified brand deals and discounts across Pakistan.";
    return {
      reply: refusal,
      deals: [],
      is_off_topic: true,
      language,
    };
  }

  // 3. Compact Catalog format for Gemini context
  const catalogContext = liveDeals
    .map((d, idx) => {
      const brandName = (d as any).brand?.name || (d as any).brand_name || 'Brand';
      const catName = (d as any).category_name || (d as any).category?.name || 'Retail';
      const discPrice =
        d.discount_price ||
        (d as any).price ||
        (d.original_price && d.discount_pct
          ? Math.round(d.original_price * (1 - d.discount_pct / 100))
          : null);
      const origPrice = d.original_price ? `Rs. ${d.original_price.toLocaleString()}` : 'N/A';
      const finalPrice = discPrice ? `Rs. ${discPrice.toLocaleString()}` : origPrice;
      return `[${idx + 1}] ID: "${d.id}" | Brand: "${brandName}" | Title: "${d.title}" | Category: "${catName}" | Discount: ${d.discount_pct || 0}% OFF | Price: ${finalPrice} (Orig: ${origPrice}) | City: "${d.city || 'All Pakistan'}"`;
    })
    .join('\n');

  const apiKey = await getEffectiveGeminiKey();

  // 4. If Gemini API Key is available, prompt Gemini 1.5 Flash with the Live Deals Context
  if (apiKey) {
    try {
      const systemPrompt = `You are "Jumble Master Salesman & Bachat Advisor", the elite personal shopping salesman for the Jumble Sale platform in Pakistan.

YOUR MISSION AS A CUSTOMER-CENTRIC SALESMAN:
You are NOT a software tester, robotic search engine, or developer. You are a respectful, energetic, trustworthy Pakistani personal shopping salesman (like an expert, honest shopkeeper in Liberty / Anarkali / Dolmen Mall who knows every sale in town and treats customers with deep respect).

CRITICAL RULES & CUSTOMER INTERACTIONS:
1. STRICT ZERO DEVELOPER JARGON RULE:
   - NEVER, UNDER ANY CIRCUMSTANCES, use the words "database", "live database", "database mein", "system", "records", or "query" to the customer!
   - Always refer to "hamare registered official brand partners" or "Jumble Sale par registered brands".

2. "SHOW ON DEMAND" POST DISPLAY POLICY:
   - ONLY populate "matched_deal_ids" with deal IDs when the customer EXPLICITLY asks to see or show posts/deals (e.g. using words like "dikhao", "dikhayein", "show", "cards", "deals dikhao", "posts dikhao") OR when asking for deals under a specific budget ("3000 ke andar dikhao").
   - For greetings, platform questions, help requests, general chit-chat, or off-topic questions: ALWAYS return "matched_deal_ids": [] (EMPTY ARRAY!). Do NOT blurt out product cards unless requested!

3. RESPECTFUL GREETINGS:
   - When user says "hey", "hi", "hello": Respond with:
     "Hello Janab! Main aap ki kya madad kar sakta hoon? 🛍️\n\nBatayein aaj kis cheez ki shopping ka irada hai — naye kapray, jootay, budget smartphone ya shaam ka dinner? Aap batayein main foran best deals aur posts dikha deta hoon!"
     Return matched_deal_ids: [].
   - When user says "assalam o alaikum", "aslamu alaikum", "salam", "aoa": Respond with:
     "Walaikum Assalam Janab! Main aap ki kya madad kar sakta hoon? 🛍️\n\nBatayein aaj Pakistan ke kis brand ya category par shopping ka irada hai? Aur budget kitna zehan mein hai? Aap batayein main foran best deals aur posts nikaal deta hoon!"
     Return matched_deal_ids: [].

4. PLATFORM & PRODUCT INQUIRIES:
   - When user asks what products or brands are available (e.g. "tumharay brand mai kis trah ki products han", "yahan kya milta hai", "jumble sale kya hai"):
     Explain warmly that Jumble Sale offers verified discounted products from Pakistan's registered official brand partners across Fashion & Kapray (Khaadi, Outfitters, Gul Ahmed), Footwear & Jootay (Bata), Electronics & Mobiles (PriceOye), Food & Dining (Cheezious), Grocery (Imtiaz), and Home & Living (Habitt) with 30% to 70% discounts.
     Ask which category or brand they want to see, and return matched_deal_ids: []!

5. DINERS (MENSWEAR) VS DINNER (FOOD) HANDLING:
   - In Pakistan, "Diners" is a well-known menswear brand. If user asks "dinners ki deal available ha?" or "orr dinners ki ha?":
     Politely clarify that Diners menswear brand is not currently registered on Jumble Sale (recommend registered fashion brands Khaadi and Outfitters instead), or if they meant evening dinner food, mention Cheezious pizza combos. Return matched_deal_ids: [] unless they ask to show deals.

6. SHOPPING GUIDANCE & DISCOVERY:
   - When user asks "madad kro meri shopping krnay mai", "shopping guide", etc.:
     Warmly ask what product they are interested in (kapray, shoes, tech, dinner) and their budget. Return matched_deal_ids: [].

7. STRICT "OUT OF SYLLABUS" REFUSAL:
   - If user asks ANY non-shopping question (football, cricket, sports, politics, weather, coding, homework, movies, general chit-chat):
     Respond with ONLY:
     "Sorry, I can't answer that. Main sirf Jumble Sale aur aapke shopping deals aur bachat ke liye hazir hoon! 🛍️ Batayein aaj Pakistan ke kis brand ya category par discount dekhna hai?"
     Return matched_deal_ids: [] and is_off_topic: true.

8. VALUE PITCHING & SAVINGS MATH (WHEN SHOWING DEALS):
   - When the user asks to see deals ("dikhao"), do the bachat math! State original price, discounted price, and rupee savings!
   - Highlight limited stock and urgency respectfully.
   - Speak in natural, respectful Pakistani Roman Urdu (aap, janab, bachat, mubarak).

LIVE REGISTERED BRANDS & DEALS CATALOG:
${catalogContext || 'No deals currently active.'}

OUTPUT FORMAT: Return ONLY valid JSON matching this exact schema:
{
  "reply": "Your persuasive, energetic, consultative salesman pitch explaining the savings and advice...",
  "matched_deal_ids": ["deal-id-1"],
  "is_off_topic": false
}`;

      const historyFormatted = chatHistory.slice(-4).map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      }));

      const contents = [
        ...historyFormatted,
        {
          role: 'user',
          parts: [{ text: query }],
        },
      ];

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.4,
              maxOutputTokens: 600,
            },
          }),
        }
      );

      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          const matchedIds: string[] = Array.isArray(parsed.matched_deal_ids)
            ? parsed.matched_deal_ids
            : [];
          let matchedDeals = liveDeals.filter((d) => matchedIds.includes(d.id));

          // Cross-verify: if user specifically asked to see a brand, filter accordingly
          const isExplicitShow = /\b(?:dikhao|dikhayein|dikha|dekhao|show|posts|cards)\b/i.test(lower);
          const isKhaadi = /khaadi/i.test(lower);
          const isOutfitters = /outfitter/i.test(lower);
          const isGulAhmed = /gul\s*ahmed|gulahmed/i.test(lower);
          const isBata = /bata/i.test(lower);
          const isCheezious = /cheezious/i.test(lower);
          const isPriceOye = /price\s*oye|priceoye/i.test(lower);
          const isSaeedGhani = /saeed\s*ghani|saeedghani/i.test(lower);

          if (isExplicitShow) {
            if (isKhaadi) {
              const kb = liveDeals.filter(d => ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase().includes('khaadi') || (d.title || '').toLowerCase().includes('khaadi'));
              if (kb.length > 0) matchedDeals = kb;
            } else if (isOutfitters) {
              const ob = liveDeals.filter(d => ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase().includes('outfitter') || (d.title || '').toLowerCase().includes('outfitter'));
              if (ob.length > 0) matchedDeals = ob;
            } else if (isGulAhmed) {
              const gb = liveDeals.filter(d => ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase().includes('gul') || (d.title || '').toLowerCase().includes('gul'));
              if (gb.length > 0) matchedDeals = gb;
            } else if (isBata) {
              const bb = liveDeals.filter(d => ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase().includes('bata') || (d.title || '').toLowerCase().includes('bata'));
              if (bb.length > 0) matchedDeals = bb;
            } else if (isCheezious) {
              const cb = liveDeals.filter(d => ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase().includes('cheezious') || (d.title || '').toLowerCase().includes('cheezious'));
              if (cb.length > 0) matchedDeals = cb;
            } else if (isPriceOye) {
              const pb = liveDeals.filter(d => ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase().includes('priceoye') || (d.title || '').toLowerCase().includes('priceoye'));
              if (pb.length > 0) matchedDeals = pb;
            } else if (isSaeedGhani) {
              const sb = liveDeals.filter(d => ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase().includes('saeed') || (d.title || '').toLowerCase().includes('saeed'));
              if (sb.length > 0) matchedDeals = sb;
            }
          }

          // Build dynamic chips based on context
          let contextualChips = [
            '👗 Khaadi Deals Dikhao',
            '🍕 Cheezious Pizza Dikhao',
            '👟 Bata Shoes Dikhao',
            '🎯 Rs. 3,000 Budget Deals',
          ];
          if (isKhaadi || isOutfitters || isGulAhmed) {
            contextualChips = ['👟 Matching Bata Shoes', '💰 Is se sasta alternative', '🔥 50%+ OFF Flash Deals'];
          } else if (isCheezious) {
            contextualChips = ['🥤 Wings & Drinks Combo', '🍔 Burger Deals', '🛵 Fast Delivery Info'];
          } else if (isBata) {
            contextualChips = ['👗 Matching Khaadi Kurti', '👟 Casual Sneakers', '💰 Under Rs. 2,000'];
          }

          return {
            reply: parsed.reply || 'Yeh rahein aap ke liye behtareen deals:',
            deals: matchedDeals, // NEVER blindly fall back to liveDeals.slice(0, 3)! If matchedDeals is empty, return []!
            is_off_topic: Boolean(parsed.is_off_topic),
            language,
            suggested_chips: contextualChips,
          };
        }
      }
    } catch (apiErr) {
      console.warn('[Jumble Assistant] Gemini live call notice:', apiErr);
    }
  }

  // 5. Intelligent Deterministic Heuristic Matcher using REAL LIVE DATABASE DEALS
  return runDeterministicBachatSearch(query, liveDeals, language);
}

// ==============================================================================
// 4. BHAI - BRAND MARKETING & RETAIL GROWTH COPILOT
// ==============================================================================

export interface BhaiResponse {
  reply: string;
  hasPostAction: boolean;
}

export function runDeterministicBhaiReply(prompt: string, brandName: string): BhaiResponse {
  const p = prompt.toLowerCase();

  // Greetings
  if (p.includes('salam') || p.includes('hello') || p.includes('hi') || p.includes('kese ho') || p.includes('kaise ho')) {
    return {
      reply: `Walaikum Assalam! Main bilkul theek hoon, Bhai. Aap batayein, aaj Jumble Sale par aapke brand **${brandName}** ke liye kaunsi deal tayyar karni hai? Koi viral title, description ya pricing calculate karni hai?`,
      hasPostAction: false,
    };
  }

  // Intro / Identity
  if (p.includes('naam') || p.includes('who are you') || p.includes('kon ho') || p.includes('intro') || p.includes('apne baray') || p.includes('kya kar sakte')) {
    return {
      reply: `Mera naam **Bhai** hai! 👋 Main **Jumble Sale** ka official AI Brand Copilot hoon.

Main aapke brand **${brandName}** ki growth ke liye yeh kaam kar sakta hoon:
1. 🏷️ **Catchy & Viral Titles**: 3 angles ke sath headings (Flash Urgency, Mass Value, Luxury).
2. 📝 **Compelling Descriptions**: Fabric quality, warranty aur nationwide delivery highlight karne wali sales descriptions.
3. 💰 **Smart Pricing & Margin Math**: Discount ke baad final price, customer savings aur psychological charm price (jaise Rs. 2,999) calculate karna.
4. 📢 **Social & WhatsApp Copy**: Ready-to-copy WhatsApp broadcast messages aur Instagram captions with trending hashtags.
5. 📜 **Retail Policies**: Exchange rules aur terms draft karna.

Bataiye, aaj Jumble Sale par kaunsi deal ya post optimize karni hai?`,
      hasPostAction: false,
    };
  }

  // Strict Off-Topic
  const offTopicKeywords = [
    'weather', 'mausam', 'cricket', 'match', 'politics', 'siasat', 'prime minister',
    'movie', 'film', 'song', 'gaana', 'joke', 'latifa', 'homework', 'essay',
    'python', 'javascript', 'coding', 'science', 'math', 'capital of', 'president'
  ];
  if (offTopicKeywords.some((word) => p.includes(word))) {
    return {
      reply: `Bhai, main sirf **Jumble Sale** aur aapke brand business ke liye kaam karta hoon! 🚫 Fazool ya ghair-mutalliq baaton ke bajaye aain apni kisi deal ka title, description, discount price ya terms & conditions set karein.`,
      hasPostAction: false,
    };
  }

  // Pricing Query
  const priceMatch = p.match(/\b(\d{3,6})\b/);
  const pctMatch = p.match(/\b(\d{1,2})\s*%/);
  if ((p.includes('price') || p.includes('discount') || p.includes('qimat') || p.includes('calculate') || p.includes('bachat')) && priceMatch) {
    const origPrice = parseInt(priceMatch[1], 10);
    const discountPct = pctMatch ? parseInt(pctMatch[1], 10) : 30;
    const sellingPrice = Math.round(origPrice * (1 - discountPct / 100));
    const savings = origPrice - sellingPrice;
    const charmPrice = sellingPrice >= 1000 ? Math.floor(sellingPrice / 100) * 100 - 1 : sellingPrice - 1;

    return {
      reply: `💰 **Smart Pricing & Discount Analysis by Bhai**

• **Original Price:** Rs. ${origPrice.toLocaleString()}
• **Discount Rate:** ${discountPct}% OFF
• **Final Selling Price:** Rs. ${sellingPrice.toLocaleString()}
• **Customer Savings:** Rs. ${savings.toLocaleString()}

✨ **Psychological Charm Price Recommendation:**
👉 **Rs. ${charmPrice.toLocaleString()}**
*(Bhai ka mashwara: .999 wali pricing impulse purchases ko 14% tak barha deti hai!)*

💡 **Margin & Volume Advice:**
${
  discountPct <= 20
    ? 'Yeh discount profit margins ko mehfooz rakhta hai aur high-end luxury items ke liye best hai.'
    : discountPct <= 40
    ? 'Yeh Pakistani e-commerce ka "sweet spot" hai jisme sab se zyada sales convert hoti hain!'
    : 'Clearance aur bulk inventory move karne ke liye zabardast deal hai!'
}`,
      hasPostAction: true,
    };
  }

  // Titles
  if (p.includes('title') || p.includes('slogan') || p.includes('heading')) {
    return {
      reply: `🏷️ **Bhai ke Top 3 Recommended Titles (${brandName}):**

1. ⚡ **Flash Sale / Urgent:**
"Aakhri Mauqa: ${brandName} ki Exclusive Sale par Flat 35% Off!"

2. 🔥 **Viral / Click-Magnet:**
"Bachat Mela: Premium Collection ab Sirf Rs. 2,999 mein — Limited Stock!"

3. ✨ **Luxury / Signature:**
"${brandName} Signature Style: Unmatched Quality with Special Promotional Savings"

Aap in mein se koi bhi title direct apni Jumble Sale post mein laga sakte hain!`,
      hasPostAction: true,
    };
  }

  // WhatsApp Broadcast
  if (p.includes('whatsapp') || p.includes('broadcast') || p.includes('sms')) {
    return {
      reply: `📱 **Ready-to-Copy WhatsApp Broadcast Blast by Bhai:**

Assalam-o-Alaikum! 🌟
*Special Flash Sale Alert from ${brandName}!* 🔥

Hum le kar aaye hain aap ke liye mahinay ki sab se barri bachat offer!
🛍️ **Flat 35% OFF** on entire new collection!
⏰ *Limited Time Only* — Stock tezi se khatam ho raha hai.

Order karne ke liye abhi link par click karein:
👉 [Jumble Sale Deal Link]

Free Home Delivery available across Pakistan! 🇵🇰`,
      hasPostAction: true,
    };
  }

  // Instagram Caption
  if (p.includes('insta') || p.includes('instagram') || p.includes('caption') || p.includes('hashtag')) {
    return {
      reply: `📸 **Instagram & TikTok Viral Caption by Bhai:**

Style that speaks, prices that please! ✨
Elevate your everyday look with ${brandName}'s signature range, now at an unbelievable discount exclusively on @JumbleSale.pk.

👉 Tap the link in bio to claim your voucher before stocks run out!
🚚 Nationwide Cash on Delivery available.

#JumbleSale #PakistanFashion #${brandName.replace(/\s+/g, '')} #SaleAlert #LawnSale #PakistaniBrands #BachatMela #DiscountPakistan`,
      hasPostAction: true,
    };
  }

  // General Brand Strategy fallback
  return {
    reply: `💼 **Bhai's Marketing Recommendation for ${brandName}:**

Aapke brand ke liye Jumble Sale par sab se behtareen tareeqa yeh hai ke:
1. **Attractive Title**: 30% ya 40% discount ko title ke shuru mein highlight karein.
2. **High-Res Photos**: Kam az kam 2 se 3 authentic product angles upload karein.
3. **Clear Expiry Date**: "Limited 48 Hours" ka tag customer ko foran khareedne par aamadah karta hai.

Bataiye, kya main aapke liye is promotion ka title, description ya pricing tayyar karoon?`,
    hasPostAction: true,
  };
}

export async function askBhaiBrandCopilot(
  prompt: string,
  brandName: string,
  brandCategory: string = 'Retail'
): Promise<BhaiResponse> {
  const p = (prompt || '').trim();
  const lower = p.toLowerCase();

  // Fetch live market deals from database so Bhai knows current platform trends
  const liveDeals = await getLiveDatabaseDealsForAI();
  const brandOwnDeals = liveDeals.filter(
    (d) =>
      ((d as any).brand?.name || '').toLowerCase() === brandName.toLowerCase() ||
      ((d as any).brand_name || '').toLowerCase() === brandName.toLowerCase()
  );

  const marketSummary = liveDeals
    .slice(0, 6)
    .map(
      (d) =>
        `• ${(d as any).brand?.name || 'Brand'}: "${d.title}" (${d.discount_pct}% OFF - Rs. ${d.discount_price || (d as any).price || 'Sale'})`
    )
    .join('\n');

  const ownDealsSummary =
    brandOwnDeals.length > 0
      ? brandOwnDeals.map((d) => `• "${d.title}" (${d.discount_pct}% OFF - ${d.status})`).join('\n')
      : 'No active deals posted yet.';

  const apiKey = await getEffectiveGeminiKey();

  if (apiKey) {
    try {
      const systemPrompt = `You are "Bhai", the official AI Brand Marketing Copilot & Retail Growth Strategist for Jumble Sale Pakistan.

STRICT BEHAVIORAL RULES:
1. NAME: Your name is strictly "Bhai". Always introduce yourself as "Bhai - Jumble Sale AI Copilot".
2. TARGET AUDIENCE: You are talking to the brand owner/manager of "${brandName}" (Category: "${brandCategory}").
3. ROLE & PURPOSE: Help this brand create viral, high-converting promotions, calculate discount pricing & profit margins, write WhatsApp broadcast copy, and craft Instagram captions with hashtags.
4. STRICT SCOPE ENFORCEMENT: ONLY answer questions about Jumble Sale, brand marketing, pricing math, customer psychology, retail terms, and promotional copy.
   IF the user asks about ANYTHING ELSE (cricket, politics, weather, coding, school homework, general banter):
   Politely refuse and redirect:
   "Bhai, main sirf Jumble Sale aur aapke brand business ke liye kaam karta hoon! 💼 Aayein apni kisi promotion ka title, discount rate, ya description set karein."
5. MARKET INTELLIGENCE: You are aware of current live sales on Jumble Sale:
${marketSummary}
Your brand's current deals:
${ownDealsSummary}

6. TONE & LANGUAGE: Speak respectfully in Pakistani Roman Urdu (or English if addressed in English). Friendly, punchy, strategic, and business-focused!`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\nBrand User Message: "${p}"\n\nGenerate direct response as Bhai:` }],
              },
            ],
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: 700,
            },
          }),
        }
      );

      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && text.trim()) {
          return {
            reply: text.trim(),
            hasPostAction: /title|discount|description|deal/i.test(lower),
          };
        }
      }
    } catch (apiErr) {
      console.warn('[Bhai Copilot] Gemini API call notice:', apiErr);
    }
  }

  // Local Bhai engine
  return runDeterministicBhaiReply(p, brandName);
}

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
    // 1. Fetch user's liked and saved deals instantly
    const { getLikedDealIds, getSavedDealIds } = await import('@/lib/activityStore');
    const [likedIds, savedIds] = await Promise.all([
      getLikedDealIds(userId),
      getSavedDealIds(userId),
    ]);

    const likedSet = new Set(likedIds);
    const savedSet = new Set(savedIds);

    const categoryAffinity: Record<string, number> = {};
    const brandAffinity: Record<string, number> = {};

    for (const d of allDeals) {
      if (likedSet.has(d.id)) {
        if (d.category_id) categoryAffinity[d.category_id] = (categoryAffinity[d.category_id] || 0) + 10;
        if (d.brand_id) brandAffinity[d.brand_id] = (brandAffinity[d.brand_id] || 0) + 10;
      }
      if (savedSet.has(d.id)) {
        if (d.category_id) categoryAffinity[d.category_id] = (categoryAffinity[d.category_id] || 0) + 15;
        if (d.brand_id) brandAffinity[d.brand_id] = (brandAffinity[d.brand_id] || 0) + 15;
      }
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
