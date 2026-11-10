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

export interface ConversationState {
  activeBrand?: string;
  activeCategory?: string;
  activeBudget?: number;
  targetAudience?: 'ladies' | 'gents' | 'unisex';
  lastPitchedDealIds?: string[];
  lastDiscussedBrands?: string[];
  lastPitchedDeals?: Deal[];
}

export function extractConversationState(
  history: { role: string; content: string; deals?: Deal[] }[] = [],
  liveDeals: Deal[] = []
): ConversationState {
  const state: ConversationState = {
    lastDiscussedBrands: [],
    lastPitchedDealIds: [],
    lastPitchedDeals: [],
  };

  for (const msg of history) {
    const text = (msg.content || '').toLowerCase();

    // 1. Budget extraction
    const budgetMatch =
      text.match(/(?:budget|range|under|andar|tak|mein)(?:[^\d]{1,15})?(\d{3,6})/i) ||
      text.match(/(\d{3,6})(?:[^\d]{1,15})?(?:budget|ke\s*andar|tak)/i) ||
      text.match(/(?:rs\.?|pkr)\s*(\d{3,6})/i);
    if (budgetMatch) {
      state.activeBudget = parseInt(budgetMatch[1], 10);
    }

    // 2. Demographic extraction
    if (/\b(?:ladies|women|female|aurat|auraton|baji|girls)\b/i.test(text)) {
      state.targetAudience = 'ladies';
    } else if (/\b(?:gents|men|mens|male|mard|bhai|boys)\b/i.test(text)) {
      state.targetAudience = 'gents';
    }

    // 3. Brand extraction
    if (/khaadi/i.test(text)) {
      state.activeBrand = 'Khaadi';
      state.activeCategory = 'fashion';
    } else if (/outfitter/i.test(text)) {
      state.activeBrand = 'Outfitters';
      state.activeCategory = 'fashion';
    } else if (/gul\s*ahmed|gulahmed/i.test(text)) {
      state.activeBrand = 'Gul Ahmed';
      state.activeCategory = 'fashion';
    } else if (/bata/i.test(text)) {
      state.activeBrand = 'Bata Pakistan';
      state.activeCategory = 'footwear';
    } else if (/cheezious/i.test(text)) {
      state.activeBrand = 'Cheezious';
      state.activeCategory = 'food';
    } else if (/price\s*oye|priceoye/i.test(text)) {
      state.activeBrand = 'PriceOye';
      state.activeCategory = 'electronics';
    } else if (/saeed\s*ghani|saeedghani/i.test(text)) {
      state.activeBrand = 'Saeed Ghani';
      state.activeCategory = 'beauty';
    } else if (/imtiaz/i.test(text)) {
      state.activeBrand = 'Imtiaz Super Market';
      state.activeCategory = 'grocery';
    } else if (/habitt/i.test(text)) {
      state.activeBrand = 'Habitt';
      state.activeCategory = 'home';
    }

    // 4. Category keywords if brand was not explicitly mentioned in this turn
    if (/\b(?:kapr|kapray|lawn|kurti|kurtis|suit|dress)\b/i.test(text)) {
      state.activeCategory = 'fashion';
    } else if (/\b(?:shoe|shoes|joot|jootay|sneaker|chappal|sandal)\b/i.test(text)) {
      state.activeCategory = 'footwear';
    } else if (/\b(?:food|pizza|burger|fast\s*food|khana|dinner)\b/i.test(text)) {
      state.activeCategory = 'food';
    } else if (/\b(?:mobile|phone|gadget|earbud)\b/i.test(text)) {
      state.activeCategory = 'electronics';
    }

    // 5. Track discussed alternative brands (e.g. from Diners clarification)
    if (/\b(?:diners|diner|dinners)\b/i.test(text)) {
      state.lastDiscussedBrands = ['Khaadi', 'Outfitters'];
    }

    // 6. Track deals from assistant messages
    if (msg.role === 'assistant') {
      if (Array.isArray(msg.deals) && msg.deals.length > 0) {
        state.lastPitchedDeals = msg.deals;
        state.lastPitchedDealIds = msg.deals.map((d) => d.id);
      }
    }
  }

  // If lastPitchedDeals is empty but we have activeBrand, populate from liveDeals
  if ((!state.lastPitchedDeals || state.lastPitchedDeals.length === 0) && state.activeBrand && liveDeals.length > 0) {
    const brandDeals = liveDeals.filter(d => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      return bName.includes(state.activeBrand!.toLowerCase());
    });
    if (brandDeals.length > 0) {
      state.lastPitchedDeals = brandDeals;
      state.lastPitchedDealIds = brandDeals.map(d => d.id);
    }
  }

  return state;
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
  // Category common typos (preserve "diners"/"diner" for Pakistani brand handling, only fix dinnr)
  normalized = normalized.replace(/\b(?:dinr|dinnr)\b/g, 'dinner');
  normalized = normalized.replace(/\b(?:shose|snekers|sneker|joty|chpal)\b/g, 'shoes');
  normalized = normalized.replace(/\b(?:kpry|kapray|korti|kurtiyan)\b/g, 'kapray');
  return normalized;
}

// ==============================================================================
// 2B. OMNI-DOMAIN DEEP QUERY PARSER & SEMANTIC UNDERSTANDING
// ==============================================================================

export type SalesmanIntent =
  | 'greeting'
  | 'platform_inquiry'
  | 'guidance_discovery'
  | 'product_inquiry'
  | 'show_request'
  | 'budget_constrained'
  | 'coreference_followup'
  | 'policy_support'
  | 'off_topic_trivia';

export interface ParsedSentence {
  raw: string;
  normalized: string;
  intent: SalesmanIntent;
  coreEntity?: string;
  modifiers: string[];
  primaryCategory?: string;
  primaryBrand?: string;
  isExplicitShow: boolean;
  budgetConstraint?: number;
  demographic?: 'ladies' | 'gents' | 'unisex';
  hasShoppingIntent: boolean;
}

export function parseFullSentence(
  rawQuery: string,
  state?: ConversationState
): ParsedSentence {
  const raw = (rawQuery || '').trim();
  const lower = raw.toLowerCase();
  const normalized = normalizeDesiTypos(lower);

  // 1. Explicit Show Command Detection (Show-on-Demand Policy)
  const isExplicitShow =
    /\b(?:dikhao|dikhayein|dikha|dekhao|dekhein|show|posts|cards|post|card|dikha\s*do|dikhao\s*bhai|dikha\s*de|dikha\s*dein|dikhao\s*deals)\b/i.test(
      normalized
    );

  // 2. Budget Extraction
  let budgetConstraint: number | undefined;
  const budgetMatch =
    normalized.match(/(?:budget|range|under|andar|tak|mein|mai|neechay|se\s*neechay|se\s*kam|kam)(?:[^\d]{1,15})?(\d{3,6})/i) ||
    normalized.match(/(\d{3,6})(?:[^\d]{1,15})?(?:budget|ke\s*andar|tak|se\s*neechay|se\s*kam|neechay|mein|mai)/i) ||
    normalized.match(/(?:rs\.?|pkr)\s*(\d{3,6})/i);
  if (budgetMatch) {
    budgetConstraint = parseInt(budgetMatch[1], 10);
  } else if (state?.activeBudget) {
    budgetConstraint = state.activeBudget;
  }

  // 3. Demographic Extraction
  let demographic: 'ladies' | 'gents' | 'unisex' | undefined;
  if (/\b(?:ladies|women|female|aurat|auraton|baji|girls)\b/i.test(normalized)) {
    demographic = 'ladies';
  } else if (/\b(?:gents|men|mens|male|mard|bhai|boys)\b/i.test(normalized)) {
    demographic = 'gents';
  } else if (state?.targetAudience) {
    demographic = state.targetAudience;
  }

  // 4. Primary Brand Extraction
  let primaryBrand: string | undefined;
  if (/khaadi/i.test(normalized)) primaryBrand = 'Khaadi';
  else if (/outfitter/i.test(normalized)) primaryBrand = 'Outfitters';
  else if (/gul\s*ahmed|gulahmed/i.test(normalized)) primaryBrand = 'Gul Ahmed';
  else if (/bata/i.test(normalized)) primaryBrand = 'Bata Pakistan';
  else if (/cheezious/i.test(normalized)) primaryBrand = 'Cheezious';
  else if (/price\s*oye|priceoye/i.test(normalized)) primaryBrand = 'PriceOye';
  else if (/saeed\s*ghani|saeedghani/i.test(normalized)) primaryBrand = 'Saeed Ghani';
  else if (/imtiaz/i.test(normalized)) primaryBrand = 'Imtiaz Super Market';
  else if (/habitt/i.test(normalized)) primaryBrand = 'Habitt';
  else if (
    /\b(?:diners|diner|dinners)\b/i.test(normalized) &&
    !/\b(?:pizza|burger|fast\s*food|khana|dine)\b/i.test(normalized)
  ) {
    primaryBrand = 'Diners';
  }

  // 5. Primary Category Extraction
  let currentQueryCategory: string | undefined;
  if (
    /\b(?:shoe|shoes|joot|jootay|jooton|sneaker|sneakers|boot|boots|jogger|joggers|chappal|sandal|sandals|cleats|studs|slippers|khussa|kherian)\b/i.test(
      normalized
    )
  ) {
    currentQueryCategory = 'footwear';
  } else if (
    /\b(?:kapr|kapray|kapron|lawn|kurti|kurtis|suit|suits|dress|dresses|pret|streetwear|fashion|clothes|cloth|shirt|shirts|pant|pants|trouser|trousers|jeans|denim|cargo|cargos|chinos|shorts|bottom|bottoms|shalwar|shalwars|pajama|pajamas|tights|legging|leggings|culottes|hoodie|hoodies|jacket|jackets|sweater|sweaters|sweatshirt|sweatshirts|coat|coats|blazer|blazers|kameez|dupatta|dupattas|shawl|shawls|tracksuit|tracksuits)\b/i.test(
      normalized
    )
  ) {
    currentQueryCategory = 'fashion';
  } else if (
    /\b(?:food|pizza|pizzas|burger|burgers|wings|khana|dinner|fast\s*food|shawarma|karahi|roll|rolls|meal|restaurant|biryani)\b/i.test(
      normalized
    )
  ) {
    currentQueryCategory = 'food';
  } else if (
    /\b(?:mobile|mobiles|phone|phones|smartphone|smartphones|gadget|gadgets|earbud|earbuds|airpod|airpods|headphone|headphones|laptop|electronics|redmi|xiaomi)\b/i.test(
      normalized
    )
  ) {
    currentQueryCategory = 'electronics';
  } else if (
    /\b(?:beauty|makeup|skin|skincare|serum|serums|hair\s*oil|cream|cosmetics|rose\s*water|shampoo|soap|lotion)\b/i.test(
      normalized
    )
  ) {
    currentQueryCategory = 'beauty';
  } else if (
    /\b(?:grocery|groceries|rashan|supermarket|oil|ghee|atta|sugar|rice|daal|flour|tea|chai)\b/i.test(
      normalized
    )
  ) {
    currentQueryCategory = 'grocery';
  } else if (
    /\b(?:furniture|bed|beds|bedsheet|bedsheets|sofa|sofas|cushion|cushions|decor|curtain|curtains|home|mattress)\b/i.test(
      normalized
    )
  ) {
    currentQueryCategory = 'home';
  }

  let primaryCategory = currentQueryCategory;
  if (!primaryCategory && primaryBrand) {
    if (['Khaadi', 'Outfitters', 'Gul Ahmed', 'Diners'].includes(primaryBrand)) primaryCategory = 'fashion';
    else if (primaryBrand === 'Bata Pakistan') primaryCategory = 'footwear';
    else if (primaryBrand === 'Cheezious') primaryCategory = 'food';
    else if (primaryBrand === 'PriceOye') primaryCategory = 'electronics';
    else if (primaryBrand === 'Saeed Ghani') primaryCategory = 'beauty';
    else if (primaryBrand === 'Imtiaz Super Market') primaryCategory = 'grocery';
    else if (primaryBrand === 'Habitt') primaryCategory = 'home';
  }

  // 6. Has Retail/Shopping Intent Check in current query
  const hasCurrentShoppingIntent =
    Boolean(currentQueryCategory || primaryBrand) ||
    Boolean(budgetMatch) ||
    /\b(?:deal|deals|sale|sales|discount|discounts|bachat|offer|offers|coupon|voucher|sasta|sasti|saste|mehnga|mehngi|budget|price|qimat|rate|khareed|buy|shopping|order|claim|mil\s*jaye|milega|milenge|available|chahiye|dekhna|dikhao|dikhayein|brand|brands|products|product|shop|store|collection|pret|lawn|unstitched|suit|jootay|sneakers|phone|delivery|exchange|return|cost|neechay|se\s*neechay|se\s*kam|andar|ke\s*andar|mil\s*raha|mil\s*rahi|mil\s*rahay|mil\s*rahe|mil\s*ta|mil\s*ti|mil\s*te|mil\s*sakta|mil\s*sakti|mil\s*sakte|mojood|konsi|kaunsi|kiya\s*mil|kya\s*mil|apke\s*paas|aapke\s*paas|apke\s*pas|aapke\s*pas|paas\s*hai|paas\s*ha|pas\s*hai|pas\s*ha|rakhte\s*ho|rakhtay\s*ho|rakhte\s*hain|rakhtay\s*han|bechte\s*ho|bechtay\s*ho|bechte\s*hain|bechtay\s*han|hoga|hogi|hongay|honge|mile\s*ga|milay\s*ga|milti\s*hai|milta\s*hai|milte\s*hain|hai\s*kya|ha\s*kya|par\s*kya|app\s*mai|app\s*mein|aapki\s*app|apki\s*app)\b/i.test(
      normalized
    ) ||
    /ha\s*apke\s*paas|hai\s*aapke\s*paas|apke\s*paas\s*hai|apke\s*pas\s*ha|app\s*mai\s*available|app\s*mein\s*available/i.test(
      normalized
    );

  // Inherit category from conversation memory ONLY when not asking an open cross-product query
  const isOpenProductQuery = /\b(?:kiya\s*mil|kya\s*mil|konsi\s*product|kaunsi\s*product|konsi\s*cheez|kaunsi\s*cheez|kya\s*hai|kiya\s*hai|kuch\s*bhi|kya\s*kya)\b/i.test(normalized);
  if (!primaryCategory && state?.activeCategory && !isOpenProductQuery && (hasCurrentShoppingIntent || isExplicitShow)) {
    primaryCategory = state.activeCategory;
  }

  const hasShoppingIntent = hasCurrentShoppingIntent || Boolean(primaryCategory);

  // 7. Core Entity & Modifiers extraction
  const modifiers: string[] = [];
  let coreEntity = primaryCategory || 'general';

  if (/\b(?:football|soccer|cricket|tennis|hockey|running|gym|workout|sports)\b/i.test(normalized)) {
    modifiers.push('sports');
    if (/\bfootball\b/i.test(normalized)) modifiers.push('football');
  }
  if (/\b(?:trouser|trousers|pant|pants|jeans|denim|cargo|cargos|chinos|bottom|bottoms|shalwar|pajama|tights)\b/i.test(normalized)) {
    modifiers.push('trousers');
  }
  if (/\b(?:hoodie|hoodies|jacket|jackets|sweater|sweaters|sweatshirt|sweatshirts|coat|blazer)\b/i.test(normalized)) {
    modifiers.push('hoodies');
  }
  if (/\b(?:kurti|kurtis|suit|suits|lawn|pret|unstitched|kameez|dupatta|shawl)\b/i.test(normalized)) {
    modifiers.push('suits_kurtis');
  }
  if (/\b(?:formal|casual|party|shaadi|wedding|pret|unstitched)\b/i.test(normalized)) {
    modifiers.push('formal_pret');
  }
  if (/\b(?:sasta|cheapest|low\s*price|kam\s*qimat|bachat)\b/i.test(normalized)) {
    modifiers.push('cheapest');
  }

  // 8. Intent Classification
  const isSalam = /\b(?:salam|asalam|assalam|aslamu|assalamu|aoa)\b/i.test(normalized);
  const isHey = /^(?:hey|hi|hello|heya)\b/i.test(normalized);
  const isCasualGreeting = /^(?:kya haal|kese ho|kaise ho)\b/i.test(normalized);
  const isPureGreeting = (isSalam || isHey || isCasualGreeting) && !hasShoppingIntent;

  const isPlatformInquiry =
    /\b(?:kis\s*trah\s*ki|kis\s*tarah\s*ki|kis\s*qism\s*ki|kya\s*milta|kya\s*bechte|kya\s*kya\s*hai|kaun\s*se\s*brand|konse\s*brand|brands\s*hain|brands\s*han|products\s*hain|products\s*han|jumble\s*sale\s*kya|about\s*jumble|what\s*products|what\s*brands)\b/i.test(
      normalized
    ) ||
    /kis\s*trah\s*ki\s*products|kis\s*tarah\s*ki\s*products|brand\s*mai\s*kis|brand\s*mein\s*kis|products\s*han|products\s*hain|app\s*mai\s*kya|app\s*mein\s*kya/i.test(
      normalized
    );

  const isGuidance =
    /\b(?:madad|help|guide|guidance|mashwara|mashwarah|suggest|suggestion|recommend|recommendation|samajh\s*nahi\s*aa\s*raha|kya\s*khareedon|kya\s*loon|kuch\s*batao|kahan\s*se\s*shuru)\b/i.test(
      normalized
    ) ||
    /madad\s*kro|madad\s*karo|shopping\s*krnay\s*mai|shopping\s*karne\s*mein|shopping\s*guide/i.test(normalized);

  const isCoreference =
    /\b(?:in\s*mai\s*se|in\s*mein\s*se|in\s*me\s*se|in\s*se|un\s*mai\s*se|un\s*mein\s*se|unke\s*hi|unhi\s*ke|wohi\s*dikha|unke\s*dikhao)\b/i.test(
      normalized
    ) ||
    (/\b(?:sab\s*se\s*sasta|sab\s*se\s*sasti|sab\s*se\s*kam|cheapest|lowest)\b/i.test(normalized) &&
      Boolean(state?.activeBrand || (state?.lastPitchedDeals && state.lastPitchedDeals.length > 0)));

  const isPolicySupport =
    /\b(?:delivery\s*time|kitne\s*din|delivery\s*charges|delivery\s*fees|return\s*policy|exchange\s*policy|cod|cash\s*on\s*delivery|shipping|order\s*track)\b/i.test(
      normalized
    );

  const isSportsTrivia =
    /\b(?:match|score|player|ronaldo|messi|babar|virat|fifa|pes|pubg|free\s*fire|who\s*won|kaun\s*jeeta|score\s*kya|tournament)\b/i.test(
      normalized
    ) ||
    (/\b(?:football|soccer|cricket|hockey|tennis)\b/i.test(normalized) &&
      !/\b(?:shoe|shoes|joot|jootay|boot|boots|sneaker|sneakers|spikes|studs|chappal|sandal|jogger|kit|jersey|shirt|bat|ball|equipment|khareed|buy|available|mil\s*jaye|chahiye|dikhao|price|rate|deal)\b/i.test(
        normalized
      ));

  const otherOffTopic = [
    /\b(?:dekhtay\s*ho|dekhte\s*ho|khelte\s*ho|kheltay\s*ho|kya\s*kar\s*rahe\s*ho|kya\s*karte\s*ho|kahan\s*rehte\s*ho|kahan\s*se\s*ho|shadi\s*karoge|shadi\s*hui|girlfriend|boyfriend|love\s*you|pyar|dost\s*banoge|friendship|bore\s*ho\s*raha|baat\s*karo|kuch\s*sunao|latifa|joke|jokes|shayari|ghazal|poetry|song|songs|gaana|movie|movies|film|drama|dramas|netflix|tiktok|youtube)\b/i,
    /\b(?:politics|siasat|prime\s*minister|president|imran|nawaz|shehbaz|army|weather|mausam|barish|barsaat|python|javascript|coding|code|homework|essay|capital\s*of|math\s*problem|science|physics|chemistry|biology|history|who\s*is|who\s*created|tell\s*me\s*a\s*story)\b/i,
  ];
  const isGeneralOffTopic = otherOffTopic.some((rgx) => rgx.test(normalized));

  let intent: SalesmanIntent = 'product_inquiry';

  if (isPureGreeting) {
    intent = 'greeting';
  } else if (isGeneralOffTopic || (isSportsTrivia && !hasCurrentShoppingIntent)) {
    intent = 'off_topic_trivia';
  } else if (isPlatformInquiry) {
    intent = 'platform_inquiry';
  } else if (isGuidance) {
    intent = 'guidance_discovery';
  } else if (isCoreference) {
    intent = 'coreference_followup';
  } else if (isPolicySupport) {
    intent = 'policy_support';
  } else if (isExplicitShow) {
    intent = 'show_request';
  } else if (budgetConstraint && (hasCurrentShoppingIntent || /\b(?:kya|kiya|konsi|kaunsi|kuch|cheez|product|mil|dekhna)\b/i.test(normalized))) {
    intent = isExplicitShow ? 'show_request' : 'budget_constrained';
  } else if (hasShoppingIntent) {
    intent = isExplicitShow ? 'show_request' : 'product_inquiry';
  } else {
    intent = 'off_topic_trivia';
  }

  return {
    raw,
    normalized,
    intent,
    coreEntity,
    modifiers,
    primaryCategory,
    primaryBrand,
    isExplicitShow,
    budgetConstraint,
    demographic,
    hasShoppingIntent,
  };
}

// ==============================================================================
// 2C. THE 7 CORE CONDITIONS GATEKEEPER & ZERO-JARGON SANITIZER
// ==============================================================================

export function sanitizeSalesmanJargon(text: string): string {
  if (!text) return '';
  let clean = text;
  clean = clean.replace(/\blive database\b/gi, 'hamare platform');
  clean = clean.replace(/\bdatabase mein\b/gi, 'hamare paas');
  clean = clean.replace(/\bdatabase\b/gi, 'verified brand partners');
  clean = clean.replace(/\bsystem\b/gi, 'platform');
  clean = clean.replace(/\brecords\b/gi, 'brand offers');
  clean = clean.replace(/\bquery\b/gi, 'sawal');
  return clean;
}

export function enforceSalesmanConditions(
  res: AssistantResponse,
  parsed: ParsedSentence,
  state?: ConversationState,
  liveDeals: Deal[] = []
): AssistantResponse {
  // Condition 2: Zero Developer Jargon Enforcement
  const cleanReply = sanitizeSalesmanJargon(res.reply || '');

  // Condition 7: Strict Out-of-Syllabus Boundary Enforcement
  if (parsed.intent === 'off_topic_trivia') {
    return {
      reply:
        res.language === 'roman_urdu'
          ? "Sorry, I can't answer that. Main sirf Jumble Sale aur aapke shopping deals aur bachat ke liye hazir hoon! 🛍️ Batayein aaj Pakistan ke kis brand ya product par discount dekhna hai?"
          : "Sorry, I can't answer that. I am your Jumble Sale shopping assistant, exclusively here to help you discover verified brand deals and discounts across Pakistan.",
      deals: [],
      is_off_topic: true,
      language: res.language,
      suggested_chips: [
        '👗 Khaadi & Gul Ahmed Sale',
        '🍕 Cheezious Pizza Combos',
        '👟 Bata Shoes 50% Off',
        '🎯 Rs. 3,000 Budget Deals',
      ],
    };
  }

  // Condition 3: Show-on-Demand Policy Enforcement
  // Deal cards are STRICTLY suppressed (deals: []) unless:
  // - The user explicitly commanded to show/view deals ("dikhao", "show", "posts", "cards")
  // - OR it was an explicit coreference follow-up like "in mai se sasta" / "unke hi dikha do"
  const isAllowableFollowup =
    parsed.intent === 'coreference_followup' &&
    /\b(?:sasta|sasti|kam|unke|unhi|wohi)\b/i.test(parsed.normalized);

  let finalDeals: Deal[] = res.deals || [];
  if (!parsed.isExplicitShow && !isAllowableFollowup) {
    finalDeals = [];
  }

  return {
    ...res,
    reply: cleanReply,
    deals: finalDeals,
    is_off_topic: Boolean(res.is_off_topic),
  };
}

// ==============================================================================
// 2D. DETERMINISTIC HEURISTIC SALESMAN (EVALUATING 7 CONDITIONS & 8 DOMAINS)
// ==============================================================================

function runDeterministicBachatSearch(
  query: string,
  liveDeals: Deal[],
  language: 'roman_urdu' | 'english',
  state?: ConversationState,
  preParsed?: ParsedSentence
): AssistantResponse {
  const parsed = preParsed || parseFullSentence(query, state);
  const lower = parsed.normalized;

  // BRANCH 1: Strict Out-of-Syllabus Off-Topic
  if (parsed.intent === 'off_topic_trivia') {
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

  // BRANCH 2: Respectful Pakistani Greetings
  if (parsed.intent === 'greeting') {
    const isSalam = /\b(?:salam|asalam|assalam|aslamu|assalamu|aoa)\b/i.test(lower);
    const reply = isSalam
      ? 'Walaikum Assalam Janab! Main aap ki kya madad kar sakta hoon? 🛍️\n\nBatayein aaj Pakistan ke kis brand ya category par shopping ka irada hai — kapray, branded shoes, naya smartphone ya shaam ka khana? Aur budget kitna zehan mein hai?\n\nAap batayein, main foran behtareen verified deals nikaal deta hoon!'
      : 'Hello Janab! Main aap ki kya madad kar sakta hoon? 🛍️\n\nBatayein aaj kis cheez ki shopping ka irada hai — naye kapray, jootay, budget smartphone ya shaam ka dinner? Aur kitna budget zehan mein hai?\n\nAap batayein, main foran behtareen verified deals dikha deta hoon!';

    return {
      reply,
      deals: [],
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

  // BRANCH 3: Platform & Brand Information Inquiries
  if (parsed.intent === 'platform_inquiry') {
    const reply =
      'Janab, Jumble Sale par Pakistan ke registered official brands ki verified discounted products aur exclusive sales milti hain!\n\nHamare registered partners par in categories mein 30% se 70% tak direct bachat hoti hai:\n• 👗 Fashion & Kapray (Khaadi, Outfitters, Gul Ahmed)\n• 👟 Footwear & Jootay (Bata Pakistan)\n• 📱 Mobiles & Electronics (PriceOye)\n• 🍕 Dinners & Fast Food (Cheezious)\n• 🛒 Grocery & Supermarket (Imtiaz Super Market)\n• 🏠 Home & Decor (Habitt)\n\nBatayein Janab, aapko kis brand ya category ki deals dekhni hain?';

    return {
      reply,
      deals: [],
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

  // BRANCH 4: Shopping Guidance & Consultative Discovery (e.g. "madad kro meri shopping krnay mai")
  if (parsed.intent === 'guidance_discovery') {
    const reply =
      'Hukam karein Janab! Main aapki shopping mein madad karne aur aapke hazaron rupay bachane ke liye hi hazir hoon! 🛍️\n\nSir, aap aaj kis tarah ke product mein dilchaspi rakhte hain?\n• 👗 Fashion & Kapray (Khaadi, Outfitters, Gul Ahmed)\n• 👟 Footwear & Jootay (Bata Pakistan)\n• 📱 Mobiles & Electronics (PriceOye)\n• 🍕 Dinners & Fast Food (Cheezious)\n\nAur shopping ke liye aap ka target budget kitna zehan mein hai? Aap batayein main foran best verified deals nikaal deta hoon!';

    return {
      reply,
      deals: [],
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

  // BRANCH 5: Policy & Support Inquiries (Delivery, Returns, Logistics)
  if (parsed.intent === 'policy_support') {
    const reply =
      'Janab, Jumble Sale ke tamam registered official brand partners nationwide delivery provide karte hain (aam tor par 2 se 4 working days mein). Tamam deals 100% verified aur direct brand outlets aur websites se hoti hain.\n\nAapko kis specific brand ya product ki delivery ya order details maloom karni hain?';

    return {
      reply,
      deals: [],
      is_off_topic: false,
      language: 'roman_urdu',
      suggested_chips: [
        '👗 Khaadi Deals Dikhao',
        '🍕 Cheezious Delivery Info',
        '👟 Bata Exchange Policy',
      ],
    };
  }

  // BRANCH 6: Sub-category Disambiguation: Sports Footwear / Cleats (e.g. "football shoes mil jaye gai?")
  if (parsed.modifiers.includes('football') && parsed.primaryCategory === 'footwear') {
    const shoeDeals = liveDeals.filter((d) => {
      const cat = ((d as any).category_name || (d as any).category?.name || '').toLowerCase();
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      return cat.includes('footwear') || bName.includes('bata');
    });

    const reply =
      "Janab, football ke specific professional studs/cleats filhal hamare platform par registered nahi hain, magar sports, running aur workout ke liye Bata ke Power sneakers aur shoes par flat 40% discount chal raha hai!\n\nKya main aapko Bata ke verified sports sneakers aur shoes ki deals dikhaoon?";

    return {
      reply,
      deals: parsed.isExplicitShow ? shoeDeals.slice(0, 3) : [],
      is_off_topic: false,
      language: 'roman_urdu',
      suggested_chips: [
        '👟 Bata Sports Shoes Dikhao',
        '💰 Rs. 3,000 ke andar shoes',
        '🔥 50%+ OFF Flash Deals',
      ],
    };
  }

  // BRANCH 7: Brand Disambiguation: Diners (Menswear) vs Dinner (Food)
  if (parsed.primaryBrand === 'Diners') {
    const reply =
      "Janab, agar aap Diners (menswear brand) ki baat kar rahe hain to filhal Diners hamare platform par registered nahi hai, magar men's fashion aur kapron par hamare registered brands Khaadi aur Outfitters par 40% se 50% tak flat discount available hai!\n\nAur agar aap shaam ke Dinner (fast food ya pizza) ki deal dhoondh rahe hain to Cheezious par 30% OFF pizza combos live hain.\n\nBatayein Janab, aapko men's fashion deals dekhni hain ya dinner fast food ki posts dikhaoon?";

    const fashionDeals = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      return bName.includes('outfitter') || bName.includes('khaadi');
    });

    return {
      reply,
      deals: parsed.isExplicitShow ? fashionDeals.slice(0, 3) : [],
      is_off_topic: false,
      language: 'roman_urdu',
      suggested_chips: [
        '👕 Men\'s Fashion Deals Dikhao',
        '🍕 Cheezious Pizza Dikhao',
        '👗 Khaadi Deals Dikhao',
      ],
    };
  }

  // BRANCH 8: Coreference Resolution Engine (Multi-Turn Pronouns)
  // 8A: "in mai se sasta kaun sa hai?" / "sab se sasta"
  const isCheapestQuery =
    /\b(?:in\s*mai\s*se|in\s*mein\s*se|in\s*me\s*se|in\s*se|un\s*mai\s*se|un\s*mein\s*se)\b/i.test(lower) ||
    (/\b(?:sab\s*se\s*sasta|sab\s*se\s*sasti|sab\s*se\s*kam|cheapest|lowest|is\s*se\s*sasta)\b/i.test(lower) &&
      Boolean(state?.activeBrand || (state?.lastPitchedDeals && state.lastPitchedDeals.length > 0)));

  if (isCheapestQuery) {
    let candidateDeals: Deal[] = [];
    if (state?.lastPitchedDeals && state.lastPitchedDeals.length > 0) {
      candidateDeals = state.lastPitchedDeals;
    } else if (state?.activeBrand) {
      candidateDeals = liveDeals.filter((d) => {
        const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
        return bName.includes(state.activeBrand!.toLowerCase());
      });
    } else {
      candidateDeals = liveDeals;
    }

    if (candidateDeals.length > 0) {
      const sorted = [...candidateDeals].sort((a, b) => {
        const pA =
          a.discount_price ||
          (a.original_price && a.discount_pct
            ? Math.round(a.original_price * (1 - a.discount_pct / 100))
            : a.original_price || 999999);
        const pB =
          b.discount_price ||
          (b.original_price && b.discount_pct
            ? Math.round(b.original_price * (1 - b.discount_pct / 100))
            : b.original_price || 999999);
        return pA - pB;
      });
      const topPick = sorted[0];
      const origPrice = topPick.original_price || 0;
      const discPrice =
        topPick.discount_price ||
        (origPrice && topPick.discount_pct
          ? Math.round(origPrice * (1 - topPick.discount_pct / 100))
          : origPrice);
      const savings = origPrice > discPrice ? origPrice - discPrice : 0;
      const savingsNote =
        savings > 0 ? ` (aur seedha Rs. ${savings.toLocaleString()} ki bachat ho rahi hai!)` : '';

      const brandText = state?.activeBrand ? `${state.activeBrand} ki` : 'In';
      const reply = `Janab! ${brandText} deals mein se sab se sasta option "${topPick.title}" hai jo sirf Rs. ${discPrice.toLocaleString()} mein mil raha hai${savingsNote}. Limited stock hai, aap neechay diye gaye card se direct claim kar sakte hain:`;

      return {
        reply,
        deals: [topPick],
        is_off_topic: false,
        language: 'roman_urdu',
        suggested_chips: [
          '⚡ Claim Deal',
          '🔥 50%+ OFF Flash Deals',
          '👟 Matching Shoes',
          '💰 Aur Sasta Dikhao',
        ],
      };
    }
  }

  // 8B: "unke hi dikha do" / "unhi ke dikhao"
  const isAlternativePronounQuery =
    /\b(?:unke\s*hi|unhi\s*ke|unke\s*dikha|unka\s*dikha|un\s*ke\s*posts|unke\s*deals|wohi\s*dikha|unhi\s*par|unke\s*hi\s*dikha\s*do|acha\s*unke)\b/i.test(
      lower
    );

  if (isAlternativePronounQuery) {
    const brandNames =
      state?.lastDiscussedBrands && state.lastDiscussedBrands.length > 0
        ? state.lastDiscussedBrands
        : state?.activeBrand
        ? [state.activeBrand]
        : ['Khaadi', 'Outfitters'];

    const targetDeals = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      return brandNames.some((b) => bName.includes(b.toLowerCase()));
    });

    const reply = `Beshak Janab! ${brandNames.join(
      ' aur '
    )} par is waqt yeh top verified deals active hain jahan 40% se 50% tak flat discount chal raha hai. Aap direct card se claim kar sakte hain:`;

    return {
      reply,
      deals: targetDeals.slice(0, 4),
      is_off_topic: false,
      language: 'roman_urdu',
      suggested_chips: [
        '👟 Matching Bata Shoes',
        '💰 Rs. 3,000 ke andar',
        '🔥 50%+ OFF Deals',
      ],
    };
  }

  // 8C: Cross-Selling / Matching (e.g. "matching shoes")
  const isMatchingQuery = /\b(?:match|matching|sath\s*ke|sath\s*wali)\b/i.test(lower);
  if (
    isMatchingQuery &&
    (lower.includes('shoe') ||
      lower.includes('joot') ||
      lower.includes('chappal') ||
      lower.includes('sandal') ||
      state?.activeCategory === 'fashion')
  ) {
    const shoeDeals = liveDeals.filter((d) => {
      const cat = ((d as any).category_name || (d as any).category?.name || '').toLowerCase();
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      return cat.includes('footwear') || bName.includes('bata');
    });

    if (shoeDeals.length > 0) {
      const brandContext = state?.activeBrand ? `${state.activeBrand} ke dresses` : 'aapke outfits';
      const reply = `Zabardast choice Janab! ${brandContext} ke sath match karne ke liye Bata par yeh footwear deals live hain jahan flat discount mil raha hai:`;

      return {
        reply,
        deals: shoeDeals.slice(0, 4),
        is_off_topic: false,
        language: 'roman_urdu',
        suggested_chips: [
          '👟 Bata Casual Sneakers',
          '👠 Formal Khussa / Sandal',
          '💰 Under Rs. 2,500',
        ],
      };
    }
  }

  // BRANCH 8D: Sub-category Apparel Entity: Trousers, Pants, Jeans, Cargos, Chinos, Bottoms
  if (
    /\b(?:trouser|trousers|pant|pants|jeans|denim|cargo|cargos|chinos|bottom|bottoms|shalwar|pajama|tights)\b/i.test(
      lower
    )
  ) {
    const trouserDeals = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      const desc = (d.description || '').toLowerCase();
      return (
        bName.includes('outfitter') ||
        bName.includes('khaadi') ||
        title.includes('streetwear') ||
        desc.includes('jeans') ||
        desc.includes('pret')
      );
    });

    if (parsed.isExplicitShow) {
      const reply =
        "Janab! Trousers aur bottoms ke liye hamare verified brand **Outfitters** (streetwear pants aur denim par 40% OFF) aur **Khaadi** (matching pret trousers par 50% tak bachat) par active deals yeh rahi hain. Aap direct card se claim kar sakte hain:";
      return {
        reply,
        deals: trouserDeals.slice(0, 4),
        is_off_topic: false,
        language: 'roman_urdu',
        suggested_chips: [
          '👖 Outfitters Trousers Dikhao',
          '👗 Khaadi Pret Bottoms',
          '👟 Matching Bata Shoes',
          '💰 Under Rs. 3,000',
        ],
      };
    } else {
      const reply =
        "Janab! Trousers aur pants bilkul available hain! Hamare verified registered brand **Outfitters** par streetwear trousers, cargo aur denim jeans par up to 40% flat discount chal raha hai (fresh collection sirf Rs. 2,994 mein), aur **Khaadi** par matching pret trousers aur bottoms par 50% tak bachat mojood hai!\n\nKya main aapko Outfitters aur Khaadi ke trousers aur bottoms ki verified deals aur posts dikhaoon?";
      return {
        reply,
        deals: [],
        is_off_topic: false,
        language: 'roman_urdu',
        suggested_chips: [
          '👖 Trousers Deals Dikhao',
          '👕 Outfitters Sale Dikhao',
          '👗 Khaadi Bottoms Dikhao',
          '💰 Rs. 3,000 ke andar',
        ],
      };
    }
  }

  // BRANCH 8E: Sub-category Apparel Entity: Hoodies, Jackets, Sweaters, Sweatshirts
  if (
    /\b(?:hoodie|hoodies|jacket|jackets|sweater|sweaters|sweatshirt|sweatshirts|coat|blazer)\b/i.test(
      lower
    )
  ) {
    const hoodieDeals = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      const desc = (d.description || '').toLowerCase();
      return bName.includes('outfitter') || title.includes('streetwear') || desc.includes('hoodie');
    });

    if (parsed.isExplicitShow) {
      const reply =
        "Janab! Hoodies aur denim jackets ke liye hamare verified partner **Outfitters** par yeh active deals hain jahan up to 40% discount mil raha hai:";
      return {
        reply,
        deals: hoodieDeals.slice(0, 4),
        is_off_topic: false,
        language: 'roman_urdu',
        suggested_chips: [
          '⚡ Claim Deal',
          '👖 Matching Trousers',
          '👟 Bata Casual Sneakers',
          '💰 Under Rs. 3,000',
        ],
      };
    } else {
      const reply =
        "Janab! Hoodies aur denim jackets bilkul available hain! Hamare verified registered brand **Outfitters** par fresh hoodies aur denim jackets par 40% flat discount chal raha hai (sirf Rs. 2,994 mein)!\n\nKya main aapko Outfitters ki hoodies aur streetwear deals ki posts dikhaoon?";
      return {
        reply,
        deals: [],
        is_off_topic: false,
        language: 'roman_urdu',
        suggested_chips: [
          '🧥 Outfitters Hoodies Dikhao',
          '👖 Matching Jeans & Trousers',
          '👟 Bata Casual Shoes',
        ],
      };
    }
  }

  // BRANCH 8F: Sub-category Apparel Entity: Kurtis, Suits, Lawn
  if (
    /\b(?:kurti|kurtis|suit|suits|lawn|pret|unstitched|kameez|dupatta|shawl)\b/i.test(
      lower
    )
  ) {
    const kurtiDeals = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      return bName.includes('khaadi') || bName.includes('gul ahmed');
    });

    if (parsed.isExplicitShow) {
      const reply =
        "Janab! Kurtis aur suits ke liye hamare registered brand **Khaadi** (Buy 1 Get 1 Free & Flat 50% OFF) aur **Gul Ahmed** (30% OFF) par verified active deals yeh rahi hain:";
      return {
        reply,
        deals: kurtiDeals.slice(0, 4),
        is_off_topic: false,
        language: 'roman_urdu',
        suggested_chips: [
          '⚡ Claim Deal',
          '👟 Matching Bata Shoes',
          '💰 Rs. 3,000 ke andar',
        ],
      };
    } else {
      const reply =
        "Janab! Kurtis aur suits bilkul available hain! Hamare registered brand **Khaadi** par Buy 1 Get 1 Free (ready-to-wear kurtis) aur Flat 50% OFF summer lawn sale chal rahi hai, jabke **Gul Ahmed** par 30% OFF unstitched luxury collection mojood hai!\n\nKya main aapko Khaadi aur Gul Ahmed ki kurti aur suit deals ki posts dikhaoon?";
      return {
        reply,
        deals: [],
        is_off_topic: false,
        language: 'roman_urdu',
        suggested_chips: [
          '👗 Khaadi Kurti Deals Dikhao',
          '🌸 Gul Ahmed Lawn Dikhao',
          '👟 Matching Bata Shoes',
        ],
      };
    }
  }

  // BRANCH 9: Exact Brand Mention (Khaadi, Outfitters, Bata, PriceOye, Cheezious, Gul Ahmed, etc.)
  if (parsed.primaryBrand && parsed.primaryBrand !== 'Diners') {
    const brandName = parsed.primaryBrand;
    const brandMatches = liveDeals.filter((d) => {
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return bName.includes(brandName.toLowerCase().split(' ')[0]) || title.includes(brandName.toLowerCase().split(' ')[0]);
    });

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

      if (parsed.isExplicitShow) {
        const reply = `Janab! ${brandName} par is waqt zabardast verified deals active hain! Sab se top deal "${topDeal.title}" par ${topDeal.discount_pct}% discount chal raha hai${savingsNote}. Limited stock hai, aap direct card se claim kar sakte hain:`;
        return {
          reply,
          deals: brandMatches.slice(0, 5),
          is_off_topic: false,
          language: 'roman_urdu',
          suggested_chips: [
            '💰 Is se sasta alternative',
            '🔥 50%+ OFF Flash Deals',
            '⚡ Claim Deal',
          ],
        };
      } else {
        const reply = `Janab! ${brandName} par is waqt zabardast verified offers chal rahi hain jahan ${topDeal.discount_pct}% tak flat discount mil raha hai${savingsNote}!\n\nKya main aapko ${brandName} ki deals aur posts dikhaoon?`;
        return {
          reply,
          deals: [],
          is_off_topic: false,
          language: 'roman_urdu',
          suggested_chips: [
            `👗 ${brandName} Deals Dikhao`,
            '💰 Is se sasta alternative',
            '🔥 50%+ OFF Flash Deals',
          ],
        };
      }
    }
  }

  // BRANCH 10: Budget Range Search & Price-Level Honesty
  if (parsed.budgetConstraint) {
    const maxBudget = parsed.budgetConstraint;
    let affordableDeals = liveDeals.filter((d) => {
      const price =
        d.discount_price ||
        (d as any).price ||
        (d.original_price && d.discount_pct
          ? Math.round(d.original_price * (1 - d.discount_pct / 100))
          : 0);
      return price > 0 && price <= maxBudget;
    });

    if (parsed.primaryCategory) {
      const categoryFiltered = affordableDeals.filter((d) => {
        const cat = ((d as any).category_name || (d as any).category?.name || '').toLowerCase();
        return cat.includes(parsed.primaryCategory!);
      });
      // If found in category, prioritize category; otherwise retain cross-platform
      if (categoryFiltered.length > 0) {
        affordableDeals = categoryFiltered;
      }
    }

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

      if (parsed.isExplicitShow) {
        const reply = `Befikar rahein Janab! Aapke Rs. ${maxBudget.toLocaleString()} ke budget mein verified products available hain. Meri sab se bari recommendation ${brandName} ka "${topPick.title}" hai jo sirf Rs. ${topPrice.toLocaleString()} mein mil raha hai (seedha Rs. ${savings.toLocaleString()} ki bachat!). Neechay diye gaye cards se foran claim karein:`;
        return {
          reply,
          deals: affordableDeals.slice(0, 5),
          is_off_topic: false,
          language: 'roman_urdu',
          suggested_chips: [
            '⚡ Claim Deal',
            '💰 Aur Sasta Dikhao',
            '🔥 50%+ OFF Deals',
          ],
        };
      } else {
        const reply = `Befikar rahein Janab! Aapke Rs. ${maxBudget.toLocaleString()} ke budget mein verified products available hain! Sab se behtareen option ${brandName} ka "${topPick.title}" hai jo sirf Rs. ${topPrice.toLocaleString()} mein Rs. ${savings.toLocaleString()} ki direct bachat ke sath mil raha hai!\n\nKya main aapko is budget ki deals aur posts dikhaoon?`;
        return {
          reply,
          deals: [],
          is_off_topic: false,
          language: 'roman_urdu',
          suggested_chips: [
            `💰 Rs. ${maxBudget.toLocaleString()} Deals Dikhao`,
            '👗 Fashion in Budget',
            '👟 Shoes in Budget',
          ],
        };
      }
    } else {
      // Nothing is available under the requested budget!
      // Sort all active deals by price ascending to find closest lowest options
      const sortedByPrice = [...liveDeals].sort((a, b) => {
        const pA =
          a.discount_price ||
          (a.original_price && a.discount_pct
            ? Math.round(a.original_price * (1 - a.discount_pct / 100))
            : a.original_price || 999999);
        const pB =
          b.discount_price ||
          (b.original_price && b.discount_pct
            ? Math.round(b.original_price * (1 - b.discount_pct / 100))
            : b.original_price || 999999);
        return pA - pB;
      });

      const lowestPick = sortedByPrice[0];
      const secondLowest = sortedByPrice[1];
      const lowestP = lowestPick
        ? lowestPick.discount_price ||
          (lowestPick.original_price && lowestPick.discount_pct
            ? Math.round(lowestPick.original_price * (1 - lowestPick.discount_pct / 100))
            : lowestPick.original_price || 0)
        : 0;
      const secondP = secondLowest
        ? secondLowest.discount_price ||
          (secondLowest.original_price && secondLowest.discount_pct
            ? Math.round(secondLowest.original_price * (1 - secondLowest.discount_pct / 100))
            : secondLowest.original_price || 0)
        : 0;

      const lowestBrand =
        (lowestPick as any)?.brand?.name || (lowestPick as any)?.brand_name || 'Brand';
      const secondBrand =
        (secondLowest as any)?.brand?.name || (secondLowest as any)?.brand_name || 'Brand';
      const diff = lowestP > maxBudget ? lowestP - maxBudget : 0;

      const reply =
        `Janab! Filhal hamare platform par Rs. ${maxBudget.toLocaleString()} se neechay koi product ya verified deal available nahi hai.\n\n` +
        `Hamare paas is waqt sab se sasti live verified offer ${lowestBrand} par hai jo sirf Rs. ${lowestP.toLocaleString()} mein mil rahi hai ("${lowestPick?.title || 'Offer'}" - ${lowestPick?.discount_pct || 0}% OFF!)` +
        (secondLowest ? `, aur doosra sasta option ${secondBrand} ki deal Rs. ${secondP.toLocaleString()} mein hai` : '') +
        (diff > 0 ? ` (sirf Rs. ${diff.toLocaleString()} ka farq hai)` : '') +
        `.\n\nKya main aapko in sab se sasti verified deals ki posts dikhaoon?`;

      return {
        reply,
        deals: parsed.isExplicitShow ? [lowestPick, secondLowest].filter(Boolean) : [],
        is_off_topic: false,
        language: 'roman_urdu',
        suggested_chips: [
          `⚡ Rs. ${lowestP.toLocaleString()} Deal Dikhao`,
          '💰 Sab Se Sasti Deals',
          '🔥 50%+ OFF Flash Deals',
        ],
      };
    }
  }

  // BRANCH 11: Specific Category Searches (Fashion, Footwear, Electronics, Food, Beauty, Grocery, Home)
  if (parsed.primaryCategory) {
    const catDeals = liveDeals.filter((d) => {
      const cat = ((d as any).category_name || (d as any).category?.name || '').toLowerCase();
      const bName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return (
        cat.includes(parsed.primaryCategory!) ||
        bName.includes(parsed.primaryCategory!) ||
        title.includes(parsed.primaryCategory!)
      );
    });

    if (catDeals.length > 0) {
      const topDeal = catDeals[0];
      const origPrice = topDeal.original_price || 0;
      const discPrice =
        topDeal.discount_price ||
        (origPrice && topDeal.discount_pct
          ? Math.round(origPrice * (1 - topDeal.discount_pct / 100))
          : origPrice);
      const savings = origPrice > discPrice ? origPrice - discPrice : 0;
      const savingsNote =
        savings > 0 ? ` (aur seedha Rs. ${savings.toLocaleString()} ki bachat mil rahi hai!)` : '';

      let categorySalesPitch = '';
      let categoryChips = ['⚡ Deals Dikhao', '💰 Under Rs. 3,000', '🔥 Flash Sale Dikhao'];

      if (parsed.primaryCategory === 'fashion') {
        categorySalesPitch =
          'Janab! Fashion aur kapron ke liye hamare verified registered brands **Khaadi** par 50% OFF (lawn aur kurtis), **Outfitters** par 40% OFF (streetwear, trousers aur hoodies), aur **Gul Ahmed** par 30% OFF chal raha hai!';
        categoryChips = ['👗 Khaadi Deals Dikhao', '👕 Outfitters Deals Dikhao', '🌸 Gul Ahmed Sale Dikhao'];
      } else if (parsed.primaryCategory === 'footwear') {
        categorySalesPitch =
          "Janab! Shoes aur footwear ke liye hamare verified brand **Bata Pakistan** par men's aur women's sneakers, joggers aur formal shoes par flat 40% discount chal raha hai (sirf Rs. 3,599 mein)!";
        categoryChips = ['👟 Bata Shoes Dikhao', '👟 Casual Sneakers', '💰 Under Rs. 4,000'];
      } else if (parsed.primaryCategory === 'electronics') {
        categorySalesPitch =
          'Janab! Mobiles aur gadgets ke liye hamare verified partner **PriceOye** par Xiaomi Redmi Note 13 aur wireless earbuds par flat 26% discount chal raha hai (seedha Rs. 15,000 ki bachat)!';
        categoryChips = ['📱 PriceOye Deals Dikhao', '🎧 Wireless Earbuds', '⚡ Claim Deal'];
      } else if (parsed.primaryCategory === 'food') {
        categorySalesPitch =
          'Janab! Fast food aur khane ke liye hamare verified partner **Cheezious** par Large Pizza aur free wings combo par flat 30% direct discount chal raha hai!';
        categoryChips = ['🍕 Cheezious Pizza Dikhao', '🍗 Wings & Combos', '💰 Budget Deals'];
      } else if (parsed.primaryCategory === 'beauty') {
        categorySalesPitch =
          'Janab! Skincare aur beauty ke liye hamare registered partner **Saeed Ghani** par organic rose water aur hair care serums par flat 50% discount chal raha hai (sirf Rs. 1,250 mein)!';
        categoryChips = ['✨ Saeed Ghani Deals Dikhao', '🌹 Rose Water Offer', '💰 Under Rs. 1,500'];
      } else if (parsed.primaryCategory === 'grocery') {
        categorySalesPitch =
          'Janab! Monthly rashan aur grocery ke liye hamare verified partner **Imtiaz Super Market** par essential household items aur staples par 25% tak direct bachat chal rahi hai!';
        categoryChips = ['🛒 Imtiaz Deals Dikhao', '🍚 Monthly Rashan', '💰 Sasti Grocery'];
      } else if (parsed.primaryCategory === 'home') {
        categorySalesPitch =
          'Janab! Home living aur decor ke liye hamare registered partner **Habitt** par modern furniture aur bedsheets par flat 35% discount chal raha hai!';
        categoryChips = ['🏠 Habitt Deals Dikhao', '🛏️ Bedsheets Sale', '🛋️ Furniture Deals'];
      } else {
        categorySalesPitch = `Janab! Is category mein hamare verified registered brands par ${topDeal.discount_pct || 0}% tak direct discount chal raha hai${savingsNote}!`;
      }

      if (parsed.isExplicitShow) {
        const reply = `${categorySalesPitch}\n\nYeh dekhein active verified deals. Limited stock hai, foran claim karein:`;
        return {
          reply,
          deals: catDeals.slice(0, 5),
          is_off_topic: false,
          language: 'roman_urdu',
          suggested_chips: [
            '⚡ Claim Deal',
            '💰 Aur Sasta Dikhao',
            '🔥 50%+ OFF Flash Deals',
          ],
        };
      } else {
        const reply = `${categorySalesPitch}\n\nKya main aapko iski active deals aur posts dikhaoon?`;
        return {
          reply,
          deals: [],
          is_off_topic: false,
          language: 'roman_urdu',
          suggested_chips: categoryChips,
        };
      }
    }
  }

  // BRANCH 12: General Fallback for Shopping Inquiries
  if (parsed.hasShoppingIntent) {
    const fallbackReply = parsed.isExplicitShow
      ? 'Janab! Hamare registered official brand partners par yeh garam offers chal rahi hain jahan aap ke hazaron rupay bach sakte hain. Neechay diye gaye cards dekhein:'
      : 'Janab! Hamare registered official brand partners par is waqt 30% se 70% tak zabardast discounts chal rahe hain. Batayein Janab, aapko kapray, jootay, mobile ya food ki posts dikhaoon?';

    return {
      reply: fallbackReply,
      deals: parsed.isExplicitShow ? liveDeals.slice(0, 4) : [],
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

  // Default: Strict Off-Topic Refusal
  return {
    reply:
      "Sorry, I can't answer that. Main sirf Jumble Sale aur aapke shopping deals aur bachat ke liye hazir hoon! 🛍️ Batayein aaj Pakistan ke kis brand ya product par discount dekhna hai?",
    deals: [],
    is_off_topic: true,
    language: 'roman_urdu',
    suggested_chips: [
      '👗 Khaadi & Gul Ahmed Sale',
      '🍕 Cheezious Pizza Combos',
      '👟 Bata Shoes 50% Off',
      '🎯 Rs. 3,000 Budget Deals',
    ],
  };
}

export async function askJumbleBachatAssistant(
  userQuery: string,
  chatHistory: { role: string; content: string; deals?: Deal[] }[] = []
): Promise<AssistantResponse> {
  const query = (userQuery || '').trim();

  // 1. Fetch REAL active live deals directly from platform store
  const liveDeals = await getLiveDatabaseDealsForAI();

  // 2. Extract Multi-Turn Conversation Memory State
  const state = extractConversationState(chatHistory, liveDeals);

  // 3. Deep Full-Sentence Parsing Across All 8 Retail & Support Domains
  const parsed = parseFullSentence(query, state);

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
  const isRomanUrdu = urduMarkers.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(parsed.normalized));
  const language: 'roman_urdu' | 'english' = isRomanUrdu ? 'roman_urdu' : 'roman_urdu';

  // 4. Strict Off-Topic Early Guard
  if (parsed.intent === 'off_topic_trivia') {
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

  // 5. Compact Catalog format for Gemini context
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

  // 6. If Gemini API Key is available, prompt Gemini with Chain-of-Thought
  if (apiKey) {
    try {
      const systemPrompt = `You are "Jumble Master Salesman & Bachat Advisor", the elite personal shopping salesman for the Jumble Sale platform in Pakistan.

YOUR MISSION AS A CUSTOMER-CENTRIC SALESMAN:
You are NOT a software tester, robotic search engine, or developer. You are a respectful, energetic, trustworthy Pakistani personal shopping salesman (like an expert, honest shopkeeper in Liberty / Anarkali / Dolmen Mall who knows every sale in town and treats customers with deep respect).

ACTIVE SHOPPING CONVERSATION MEMORY:
• Active Brand: ${state.activeBrand || 'None yet'}
• Active Category: ${state.activeCategory || 'None yet'}
• Active Budget: ${state.activeBudget ? 'Rs. ' + state.activeBudget.toLocaleString() : 'Not yet set'}
• Target Demographic: ${state.targetAudience || 'General'}
• Recently Shown Deal IDs: ${state.lastPitchedDealIds?.join(', ') || 'None'}
• Recently Discussed Alternative Brands: ${state.lastDiscussedBrands?.join(', ') || 'None'}

CRITICAL RULES & 7 CORE CONDITIONS:
1. STRICT ZERO DEVELOPER JARGON RULE:
   - NEVER, UNDER ANY CIRCUMSTANCES, use the words "database", "live database", "database mein", "system", "records", or "query" to the customer!
   - Always refer to "hamare registered official brand partners" or "Jumble Sale par registered brands".

2. "SHOW ON DEMAND" POST DISPLAY POLICY:
   - ONLY populate "matched_deal_ids" with deal IDs when the customer EXPLICITLY asks to see or show posts/deals (e.g. using words like "dikhao", "dikhayein", "show", "cards", "deals dikhao", "posts dikhao") OR when asking for deals under a specific budget ("3000 ke andar dikhao") or follow-up cheapest ("in mai se sasta kaun sa hai").
   - For greetings, platform questions, help requests ("madad kro meri shopping krnay mai"), product availability inquiries ("football shoes mil jaye gai?"), general chit-chat: ALWAYS return "matched_deal_ids": [] (EMPTY ARRAY!). Do NOT blurt out product cards unless commanded!

3. CONVERSATIONAL CONTINUITY & PRONOUN RESOLUTION:
   - If the customer asks "in mai se sasta kaun sa hai?": highlight the single cheapest option with its exact price and rupee savings math!
   - If the customer says "unke hi dikha do": look at the recently discussed alternative brands (e.g. Khaadi/Outfitters) and show their deals!
   - If the customer specifies a budget (e.g. "Rs. 3,000") in a previous turn, KEEP that budget active for subsequent item queries.
   - If customer asks for "matching" shoes or accessories, recommend complementary items (e.g. matching Bata shoes for Khaadi clothes).

4. RESPECTFUL GREETINGS:
   - When user says "hey", "hi", "hello" or "salam": Greet respectfully Janab, ask what they wish to shop for and what budget they have. Return matched_deal_ids: [].

5. PLATFORM & PRODUCT INQUIRIES:
   - When user asks what products or brands are available (e.g. "tumharay brand mai kis trah ki products han?"):
     Explain warmly that Jumble Sale offers verified discounts from Pakistan's registered official brand partners across Fashion (Khaadi, Outfitters, Gul Ahmed), Footwear (Bata), Electronics (PriceOye), Food (Cheezious), Grocery (Imtiaz), and Home (Habitt) with 30% to 70% discounts. Return matched_deal_ids: [].

6. FOOTWEAR & SPORTS DISAMBIGUATION:
   - If user asks "football shoes mil jaye gai?": This is a retail footwear inquiry, NOT off-topic sports trivia. Explain football cleats are not registered, but Bata Power sports/running sneakers are available with 40% discount. Return matched_deal_ids: [] unless they ask to show them.

7. DINERS VS DINNER DISAMBIGUATION:
   - Clarify Diners menswear brand vs evening dinner food. Return matched_deal_ids: [].

8. VALUE PITCHING & SAVINGS MATH:
   - When showing deals, state original price, discounted price, and rupee savings! Speak in natural, respectful Pakistani Roman Urdu (aap, janab, bachat).

9. BUDGET & AVAILABILITY HONESTY RULE:
   - When the user asks what products or deals are available under a budget (e.g. "Rs 1000 se neechay kiya mil raha ha?", "Rs 1000 se neechay konsi product mil rahi ha?"):
     Check the catalog prices!
     If no deals exist under that budget (e.g. lowest live deal is Saeed Ghani at Rs. 1,250):
     Explicitly and honestly inform the customer: "Janab! Filhal hamare platform par Rs. 1,000 se neechay koi product ya verified deal available nahi hai."
     Then recommend the closest lowest-priced deals on the platform (Saeed Ghani at Rs. 1,250 with 50% OFF, Cheezious pizza deal at Rs. 1,450) and mention the rupee difference.
     Return matched_deal_ids: [] unless they commanded to show posts.

10. APPAREL & EVERYDAY PRODUCT AVAILABILITY RULE:
   - When the customer asks about everyday retail items (e.g. "trouser ha apke paas", "trousers available ha aapki app mai?", "hoodies mil jaye gi?", "jeans hai?", "shoes milenge?"):
     NEVER treat it as off-topic! Recognize it as a retail product inquiry immediately.
     Explicitly state that it is available and name the registered brands:
     • Trousers / pants / jeans / cargo: available at Outfitters (streetwear pants & denim at 40% OFF) and Khaadi (pret bottoms).
     • Hoodies / jackets: available at Outfitters (fresh hoodies & denim jackets at 40% OFF).
     • Kurtis / suits: available at Khaadi (Buy 1 Get 1 Free & 50% OFF) and Gul Ahmed (30% OFF).
     • Shoes / sneakers: available at Bata Pakistan (sneakers & formal shoes at 40% OFF).
     • Mobiles: available at PriceOye (Redmi Note 13 & earbuds at 26% OFF).
     • Fast food: available at Cheezious (Large Pizza combo at 30% OFF).
     • Skincare: available at Saeed Ghani (organic rose water at 50% OFF).
     Keep "matched_deal_ids": [] unless the customer explicitly commanded "dikhao" / "show posts"!

LIVE REGISTERED BRANDS & DEALS CATALOG:
${catalogContext || 'No deals currently active.'}

OUTPUT FORMAT: Return ONLY valid JSON matching this exact schema:
{
  "thought_analysis": {
    "full_query_meaning": "...",
    "core_entity": "...",
    "intent_type": "...",
    "has_shopping_intent": true,
    "user_explicitly_requested_cards": false,
    "should_display_deal_cards": false
  },
  "reply": "Your persuasive, energetic, consultative salesman pitch explaining the savings and advice...",
  "matched_deal_ids": [],
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
          const geminiParsed = JSON.parse(text);
          const matchedIds: string[] = Array.isArray(geminiParsed.matched_deal_ids)
            ? geminiParsed.matched_deal_ids
            : [];
          let matchedDeals = liveDeals.filter((d) => matchedIds.includes(d.id));

          let contextualChips = [
            '👗 Khaadi Deals Dikhao',
            '🍕 Cheezious Pizza Dikhao',
            '👟 Bata Shoes Dikhao',
            '🎯 Rs. 3,000 Budget Deals',
          ];
          if (parsed.primaryBrand === 'Khaadi' || parsed.primaryBrand === 'Outfitters') {
            contextualChips = ['👟 Matching Bata Shoes', '💰 Is se sasta alternative', '🔥 50%+ OFF Flash Deals'];
          } else if (parsed.primaryBrand === 'Cheezious') {
            contextualChips = ['🥤 Wings & Drinks Combo', '🍔 Burger Deals', '🛵 Fast Delivery Info'];
          } else if (parsed.primaryBrand === 'Bata Pakistan' || parsed.primaryCategory === 'footwear') {
            contextualChips = ['👗 Matching Khaadi Kurti', '👟 Casual Sneakers', '💰 Under Rs. 2,000'];
          }

          const rawAssistantRes: AssistantResponse = {
            reply: geminiParsed.reply || 'Janab! Yeh rahi hamari behtareen verified deals:',
            deals: matchedDeals,
            is_off_topic: Boolean(geminiParsed.is_off_topic),
            language,
            suggested_chips: contextualChips,
          };

          return enforceSalesmanConditions(rawAssistantRes, parsed, state, liveDeals);
        }
      }
    } catch (apiErr) {
      console.warn('[Jumble Assistant] Gemini live call notice:', apiErr);
    }
  }

  // 7. Intelligent Deterministic Heuristic Matcher evaluating 7 Conditions
  const deterministicRes = runDeterministicBachatSearch(query, liveDeals, language, state, parsed);
  return enforceSalesmanConditions(deterministicRes, parsed, state, liveDeals);
}

// ==============================================================================
// 4. BHAI - EXECUTIVE BRAND GROWTH & OPERATIONS COPILOT (REAL-TIME DB GROUNDED)
// ==============================================================================

export interface BhaiAction {
  label: string;
  route: string;
  icon?: string;
}

export interface BhaiResponse {
  reply: string;
  hasPostAction: boolean;
  actions?: BhaiAction[];
  suggested_prompts?: string[];
}

export interface BrandLiveContext {
  brandId: string;
  brandName: string;
  category: string;
  city?: string;
  activeDeals: Deal[];
  pendingDeals: Deal[];
  rejectedDeals: Deal[];
  expiredDeals: Deal[];
  competitorBenchmark?: { brandName: string; title: string; discountPct: number }[];
}

/**
 * Fetches real-time brand store database context including active deals,
 * pending review approvals, rejected items with reasons, and competitor category trends.
 */
export async function getBrandLiveContext(
  brandIdOrName: string,
  ownerId?: string
): Promise<BrandLiveContext> {
  let brandName = brandIdOrName || 'Brand';
  let category = 'Retail';
  let city = 'All Pakistan';
  let brandId = '';

  // 1. Resolve Brand from Supabase or Local Store
  try {
    const localBrands = await getLocalBrands();
    let matched = localBrands.find(
      (b) =>
        (b.id && b.id === brandIdOrName) ||
        (ownerId && b.owner_id === ownerId) ||
        b.name.toLowerCase() === brandName.toLowerCase()
    );

    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase
          .from('brands')
          .select('*')
          .or(`id.eq.${brandIdOrName},name.ilike.%${brandName}%${ownerId ? `,owner_id.eq.${ownerId}` : ''}`)
          .limit(1)
          .maybeSingle();
        if (data) matched = data as any;
      } catch {}
    }

    if (matched) {
      brandId = matched.id;
      brandName = matched.name;
      category = matched.category || 'Retail';
      city = (matched as any).city || 'All Pakistan';
    }
  } catch (err) {
    console.warn('[BrandLiveContext] Brand resolve note:', err);
  }

  // 2. Fetch all deals for this brand across statuses (active, pending, rejected, expired)
  let allDeals: Deal[] = [];
  try {
    if (isSupabaseConfigured) {
      const query = supabase
        .from('deals')
        .select('*, brand:brands(id, name, logo_url, category), category:categories(id, name)');

      if (brandId) {
        query.eq('brand_id', brandId);
      } else {
        query.ilike('brand.name', `%${brandName}%`);
      }

      const { data } = await query;
      if (data && Array.isArray(data) && data.length > 0) {
        allDeals = data as Deal[];
      }
    }
  } catch (err) {
    console.warn('[BrandLiveContext] Supabase deals fetch note:', err);
  }

  // Fallback to local deals store if Supabase has no data
  if (allDeals.length === 0) {
    try {
      const localDeals = await getLocalBrandDeals();
      allDeals = localDeals.filter((d) => {
        const dBrandId = d.brand_id || (d as any).brand?.id;
        const dBrandName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
        return (brandId && dBrandId === brandId) || dBrandName.includes(brandName.toLowerCase());
      });
    } catch {}
  }

  const activeDeals = allDeals.filter((d) => d.status === 'active');
  const pendingDeals = allDeals.filter((d) => d.status === 'pending');
  const rejectedDeals = allDeals.filter((d) => d.status === 'rejected');
  const expiredDeals = allDeals.filter((d) => d.status === 'expired');

  // 3. Competitor Benchmarks in same category
  let competitorBenchmark: { brandName: string; title: string; discountPct: number }[] = [];
  try {
    const liveMarketDeals = await getLiveDatabaseDealsForAI();
    competitorBenchmark = liveMarketDeals
      .filter((d) => {
        const dBrandName = ((d as any).brand?.name || (d as any).brand_name || '').toLowerCase();
        return !dBrandName.includes(brandName.toLowerCase());
      })
      .slice(0, 3)
      .map((d) => ({
        brandName: (d as any).brand?.name || (d as any).brand_name || 'Brand Partner',
        title: d.title,
        discountPct: d.discount_pct || 0,
      }));
  } catch {}

  return {
    brandId,
    brandName,
    category,
    city,
    activeDeals,
    pendingDeals,
    rejectedDeals,
    expiredDeals,
    competitorBenchmark,
  };
}

export function runDeterministicBhaiReply(
  prompt: string,
  brandContextOrName: string | BrandLiveContext
): BhaiResponse {
  const p = prompt.toLowerCase();
  const context: BrandLiveContext =
    typeof brandContextOrName === 'string'
      ? {
          brandId: '',
          brandName: brandContextOrName,
          category: 'Retail',
          activeDeals: [],
          pendingDeals: [],
          rejectedDeals: [],
          expiredDeals: [],
        }
      : brandContextOrName;

  const brandName = context.brandName || 'Brand';
  const activeCount = context.activeDeals.length;
  const pendingCount = context.pendingDeals.length;
  const rejectedCount = context.rejectedDeals.length;
  const expiredCount = context.expiredDeals.length;

  // 1. Respectful Greetings
  if (
    /\b(?:salam|asalam|assalam|aslamu|assalamu|aoa|hello|hi|hey|kese ho|kaise ho|kaise hain|kya haal)\b/i.test(
      p
    )
  ) {
    const statusNote =
      activeCount > 0
        ? `Is waqt aapke store par **${activeCount} verified deals live** hain${pendingCount > 0 ? `, aur ${pendingCount} deal verification pipeline mein hai` : ''}.`
        : `Aapke brand par filhal nayi deals launch karne ka behtareen mauqa hai!`;

    return {
      reply: `Walaikum Assalam Janab! Main bilkul khairiat se hoon. Jumble Sale par aapke brand **${brandName}** ki business growth aur portal operations ke liye hazir hoon!\n\n${statusNote}\n\nBataiye Janab, aaj kis deal ka viral title, description, smart pricing ya verification inquiry mein aapki madad karoon?`,
      hasPostAction: false,
      actions: [
        { label: '👉 Nayi Deal Banayein', route: '/(brand)/create-deal' },
        { label: '📊 Active Posts Dekhein', route: '/(brand)/posts' },
      ],
      suggested_prompts: [
        '📊 Meri kitni deals live hain?',
        '💡 Summer Collection ka Catchy Title do',
        '💰 Rs. 5,000 par 30% discount calculate karo',
      ],
    };
  }

  // 2. Identity & Introduction
  if (
    /\b(?:naam|who are you|kon ho|kaun ho|intro|apne baray|apne bare|kya kar sakte|kiya kar sakte|help|madad)\b/i.test(
      p
    )
  ) {
    return {
      reply: `Janab! Mera naam **Bhai** hai — main **Jumble Sale** ka official AI Executive Brand Assistant aur Growth Copilot hoon.\n\nMain aapke brand **${brandName}** ke liye in ahem umoor mein assistance provide karta hoon:\n\n1. 📊 **Real-Time Store Status**: Aapke live, pending review aur rejected deals ki instant details.\n2. 🏷️ **Viral Titles & Catchy Slogans**: High-converting headings jo customers ke clicks barhati hain.\n3. 📝 **Compelling Descriptions**: Fabric quality, warranty aur nationwide delivery highlight karne wali sales copy.\n4. 💰 **Smart Pricing & Margins**: Discount calculation, customer savings aur psychological charm price (.999 jaise Rs. 2,999).\n5. 📜 **Policies & Terms**: 7-day exchange rules aur verification guidelines.\n6. 📢 **Social & WhatsApp Copy**: Ready-to-send broadcast messages aur Instagram captions.\n\nBataiye Janab, aaj aapke store ke liye kya tayyar karein?`,
      hasPostAction: false,
      actions: [
        { label: '👉 Nayi Deal Banayein', route: '/(brand)/create-deal' },
        { label: '📊 Active Posts Dekhein', route: '/(brand)/posts' },
        { label: '👤 Profile Kholein', route: '/(brand)/profile' },
      ],
      suggested_prompts: [
        '📊 Mere store ka status batao',
        '💡 Deal ka title aur description likho',
        '⏳ Pending deal kab approve hogi?',
      ],
    };
  }

  // 3. Pending Review & Verification Guidance (Checked before general status)
  if (
    /\b(?:pending|live kyu nahi|live kyun nahi|approve kab|approval|verification|verify|review|kitna time|kitne time)\b/i.test(
      p
    )
  ) {
    const pendingList =
      pendingCount > 0
        ? `Aapki yeh **${pendingCount} deal(s)** filhal review queue mein hain:\n` +
          context.pendingDeals.map((d, i) => `${i + 1}. "${d.title}" (${d.discount_pct}% OFF)`).join('\n') +
          `\n\nYeh jald verify ho kar customer feed par live ho jayengi!`
        : 'Is waqt aapki koi deal review queue mein pending nahi hai.';

    return {
      reply: `Janab! Jumble Sale par nayi deals ki verification hamari quality assurance team karti hai taake platform par sirf 100% authentic aur verified discounts shamil hon.\n\n⏱️ **Verification Timing:**\nAam tor par deals **2 se 12 working hours** ke andar review ho kar live ho jati hain.\n\n✅ **Verification Ke 3 Ahem Assool:**\n1. 📸 **Image Quality:** Saaf aur high-resolution product photos (baghair kisi watermark ke).\n2. 🏷️ **Authentic Pricing:** Discount percentage aur original price ka durust hisaab.\n3. 📜 **Clear Terms:** Valid start/end dates aur exchange policies.\n\n${pendingList}\n\nKya aap pending deals check karna chahte hain?`,
      hasPostAction: false,
      actions: [
        { label: '⏳ Pending Deals Dekhein', route: '/(brand)/pending' },
        { label: '👉 Nayi Deal Banayein', route: '/(brand)/create-deal' },
      ],
      suggested_prompts: [
        '⏳ Pending deals kholen',
        '👉 Nayi deal create karein',
        '📊 Active posts check karein',
      ],
    };
  }

  // 4. Real-Time Store Status & Inventory Inquiries
  if (
    /\b(?:status|kitni deals|kitne deals|active posts|meri posts|meri post|meri deals|live deals|kya status|store status|inventory)\b/i.test(
      p
    )
  ) {
    if (activeCount > 0) {
      const activeDealsList = context.activeDeals
        .slice(0, 4)
        .map(
          (d, idx) =>
            `${idx + 1}. **"${d.title}"** — ${d.discount_pct}% OFF (Rs. ${(d.discount_price || (d as any).price || 0).toLocaleString()})`
        )
        .join('\n');

      return {
        reply: `Janab! Is waqt aapke brand **${brandName}** ka live database status yeh hai:\n\n• 🟢 **Active Live Deals:** ${activeCount}\n• ⏳ **Pending Verification:** ${pendingCount}\n• ⚠️ **Rejected Deals:** ${rejectedCount}\n• ⏰ **Expired Deals:** ${expiredCount}\n\n**Aapki Active Live Deals:**\n${activeDealsList}\n\nKya aap kisi deal ko edit karna chahte hain ya nayi promotion launch karni hai?`,
        hasPostAction: true,
        actions: [
          { label: '📊 Active Posts Dekhein', route: '/(brand)/posts' },
          { label: '👉 Nayi Deal Banayein', route: '/(brand)/create-deal' },
          ...(pendingCount > 0 ? [{ label: '⏳ Pending Deals', route: '/(brand)/pending' }] : []),
        ],
        suggested_prompts: [
          '👉 Nayi deal create karein',
          '💰 Discount price calculate karein',
          '📢 WhatsApp broadcast copy tayyar karein',
        ],
      };
    } else {
      return {
        reply: `Janab! Filhal aapke brand **${brandName}** par koi verified deal live nahi hai${pendingCount > 0 ? ` (magar **${pendingCount} deal** verification pipeline mein hai)` : ''}.\n\nJumble Sale ke hazaron shoppers tak pohnchne ke liye aayein abhi ek zabardast discount deal launch karein!`,
        hasPostAction: true,
        actions: [
          { label: '👉 Nayi Deal Banayein', route: '/(brand)/create-deal' },
          ...(pendingCount > 0 ? [{ label: '⏳ Pending Deals', route: '/(brand)/pending' }] : []),
        ],
        suggested_prompts: [
          '👉 Nayi deal banayein',
          '💡 Catchy Title Banayein',
          '⏳ Pending deal kab live hogi?',
        ],
      };
    }
  }

  // 5. Rejection Troubleshooting & Fix
  if (/\b(?:reject|rejected|rejection|namanzoor|reject kyu|reject kyun)\b/i.test(p)) {
    if (rejectedCount > 0) {
      const rejectedList = context.rejectedDeals
        .map((d, i) => `${i + 1}. "${d.title}": *${d.rejection_reason || 'Image ya pricing update darj karein'}*`)
        .join('\n');

      return {
        reply: `Janab! Review team ne aapki deal par yeh wazahati note darj kiya hai:\n\n${rejectedList}\n\n**Deal Ko Re-submit Karne Ka Aasan Tareeqa:**\n1. Neechay diye gaye button se 'Rejected Deals' section kholen\n2. Mutalliqa deal par 'Edit' tap karein\n3. Review team ke note ke mutabiq tasveer ya discount theek karein\n4. 'Save & Resubmit' dabayen — hamari team foran re-verify kar degi!`,
        hasPostAction: true,
        actions: [
          { label: '⚠️ Rejected Deals Kholein', route: '/(brand)/rejected' },
          { label: '👉 Nayi Deal Banayein', route: '/(brand)/create-deal' },
        ],
        suggested_prompts: [
          '⚠️ Rejected deals check karein',
          '👉 Nayi deal create karein',
        ],
      };
    } else {
      return {
        reply: `Janab! Mashallah is waqt aapke brand ki koi deal rejected nahi hai. Tamam policies standard hain: saaf images, durust discount rate aur valid dates honi chahiyein.`,
        hasPostAction: false,
        actions: [
          { label: '📊 Active Posts Dekhein', route: '/(brand)/posts' },
          { label: '👉 Nayi Deal Banayein', route: '/(brand)/create-deal' },
        ],
      };
    }
  }

  // 6. Pricing, Margins & Psychological Charm Math (.999)
  const cleanForMath = p.replace(/,/g, '');
  const priceMatch = cleanForMath.match(/\b(\d{3,6})\b/);
  const pctMatch = cleanForMath.match(/\b(\d{1,2})\s*%/);
  if (
    (cleanForMath.includes('price') ||
      cleanForMath.includes('discount') ||
      cleanForMath.includes('qimat') ||
      cleanForMath.includes('calculate') ||
      cleanForMath.includes('margin') ||
      cleanForMath.includes('charm') ||
      cleanForMath.includes('bachat')) &&
    priceMatch
  ) {
    const origPrice = parseInt(priceMatch[1], 10);
    const discountPct = pctMatch ? parseInt(pctMatch[1], 10) : 30;
    const sellingPrice = Math.round(origPrice * (1 - discountPct / 100));
    const savings = origPrice - sellingPrice;
    const charmPrice =
      sellingPrice >= 1000 ? Math.floor(sellingPrice / 100) * 100 - 1 : sellingPrice - 1;

    const discountAdvice =
      discountPct <= 20
        ? 'Yeh discount profit margins ko mehfooz rakhta hai aur high-end luxury items ke liye best hai.'
        : discountPct <= 40
        ? 'Yeh Pakistani retail e-commerce ka "sweet spot" hai jisme sab se zyada sales convert hoti hain!'
        : 'Clearance aur bulk inventory move karne ke liye zabardast dhamaka deal hai!';

    return {
      reply: `💰 **Smart Commercial Pricing Analysis by Bhai (${brandName})**\n\n• **Asal Qimat (Original Price):** Rs. ${origPrice.toLocaleString()}\n• **Discount Rate:** ${discountPct}% OFF\n• **Customer Savings:** Rs. ${savings.toLocaleString()} ki seedhi bachat!\n• **Final Selling Price:** Rs. ${sellingPrice.toLocaleString()}\n\n✨ **Bhai Ka Charm Price Mashwara:**\n👉 **Rs. ${charmPrice.toLocaleString()}**\n*(Pakistani retail e-commerce mein .999 charm price impulse buying aur order volume ko 14% tak barha deti hai!)*\n\n💡 **Margin Advice:**\n${discountAdvice}\n\nKya main is pricing ke sath aapke liye deal draft karoon?`,
      hasPostAction: true,
      actions: [
        { label: '👉 Is Deal Ko Create Karein', route: '/(brand)/create-deal' },
        { label: '📊 Active Posts Dekhein', route: '/(brand)/posts' },
      ],
      suggested_prompts: [
        '👉 Deal create karein',
        '💡 Iske liye catchy title likho',
        '📝 Product description banao',
      ],
    };
  }

  // 7. Viral Titles & Catchy Slogans
  if (/\b(?:title|slogan|heading|naam do|catchy)\b/i.test(p)) {
    return {
      reply: `🏷️ **Bhai ke Top 3 Recommended Titles (${brandName}):**\n\n1. ⚡ **Flash Sale / Urgency:**\n"Aakhri Mauqa: ${brandName} ki Exclusive Sale par Flat 35% Off!"\n\n2. 🔥 **Viral / Click-Magnet:**\n"Bachat Mela: Premium Collection ab Sirf Rs. 2,999 mein — Limited Stock!"\n\n3. ✨ **Luxury / Signature:**\n"${brandName} Signature Style: Unmatched Quality with Special Promotional Savings"\n\nAap in mein se koi bhi title direct apni Jumble Sale post mein laga sakte hain!`,
      hasPostAction: true,
      actions: [
        { label: '👉 Is Title Se Deal Banayein', route: '/(brand)/create-deal' },
        { label: '📝 Description Likho', route: '/(brand)/create-deal' },
      ],
      suggested_prompts: [
        '📝 Is deal ki description likho',
        '📢 WhatsApp broadcast copy banao',
        '💰 Rs. 4,000 par discount calculate karo',
      ],
    };
  }

  // 8. Compelling Product Descriptions
  if (/\b(?:desc|description|tafseel|detail|likho|write)\b/i.test(p)) {
    return {
      reply: `📝 **High-Converting Product Description by Bhai (${brandName}):**\n\n"${brandName} pesh karta hai aapke liye behtareen quality aur munfarid design. Yeh collection un khareedaron ke liye tayyar ki gayi hai jo premium standard, aala mayaar aur zabardast value pasand karte hain.\n\nAb haasil karein flat discount ki behtareen bachat mehdood waqt ke liye! Pure Pakistan mein fast delivery, cash on delivery aur asaan exchange ki suhoolat ke sath dastyaab hai. Aaj hi shopping karein aur is shandaar offer ka faida uthayein!"`,
      hasPostAction: true,
      actions: [
        { label: '👉 Nayi Deal Banayein', route: '/(brand)/create-deal' },
        { label: '📢 WhatsApp Copy Tayyar Karein', route: '/(brand)/create-deal' },
      ],
    };
  }

  // 9. WhatsApp Broadcast & Social Media Marketing
  if (/\b(?:whatsapp|broadcast|sms|instagram|caption|social|promote|ad)\b/i.test(p)) {
    return {
      reply: `📱 **Ready-to-Copy WhatsApp Broadcast Blast by Bhai:**\n\nAssalam-o-Alaikum! 🌟\n*Special Flash Sale Alert from ${brandName}!* 🔥\n\nHum le kar aaye hain aap ke liye mahinay ki sab se barri bachat offer!\n🛍️ **Flat 35% OFF** on entire new collection!\n⏰ *Limited Time Only* — Stock tezi se khatam ho raha hai.\n\nOrder karne ke liye abhi link par click karein:\n👉 [Jumble Sale Deal Link]\n\nFree Home Delivery available across Pakistan! 🇵🇰\n\n---\n\n📸 **Instagram & TikTok Viral Caption:**\n"Style that speaks, prices that please! ✨\nElevate your everyday look with ${brandName}'s signature range, now at an unbelievable discount exclusively on @JumbleSale.pk.\n\n👉 Tap the link in bio to claim your voucher before stocks run out!\n🚚 Nationwide Cash on Delivery available.\n\n#JumbleSale #PakistanFashion #${brandName.replace(/\s+/g, '')} #SaleAlert #DiscountPakistan"`,
      hasPostAction: true,
      actions: [
        { label: '👉 Deal Banayein', route: '/(brand)/create-deal' },
      ],
    };
  }

  // 10. Portal Navigation & Settings Guidance
  if (
    /\b(?:profile|setting|settings|password|city|logo|banner|number|email|kese karoon|kaise karoon|edit post|delete post)\b/i.test(
      p
    )
  ) {
    return {
      reply: `Janab! Apne brand portal ki settings ya profile update karne ka aasan tareeqa yeh hai:\n\n1. **Profile & Info:** Bottom navigation mein 'Profile' icon par tap karein, jahan se aap apna logo, banner, business email aur contact number update kar sakte hain.\n2. **Active Deals Edit/Delete:** Bottom navigation mein 'Posts' tab kholen, mutalliqa post ke 'Edit' icon par tap kar ke pricing ya validity tabdeel karein.\n3. **Pending Approvals:** 'Pending' section se check karein ke review status kya chal raha hai.\n\nBataiye Janab, kis section mein navigate karna chahte hain?`,
      hasPostAction: false,
      actions: [
        { label: '👤 Profile Kholein', route: '/(brand)/profile' },
        { label: '📊 Posts Dekhein', route: '/(brand)/posts' },
        { label: '👉 Nayi Deal Banayein', route: '/(brand)/create-deal' },
      ],
    };
  }

  // 11. Competitor Trends & Market Intelligence
  if (/\b(?:competitor|market|muqabla|dusray brand|doosray brand|trends)\b/i.test(p)) {
    const benchText =
      context.competitorBenchmark && context.competitorBenchmark.length > 0
        ? context.competitorBenchmark
            .map((b, i) => `${i + 1}. **${b.brandName}**: "${b.title}" (${b.discountPct}% OFF)`)
            .join('\n')
        : '• Market mein standard discounts 30% se 50% chal rahe hain.';

    return {
      reply: `Janab! Jumble Sale platform par verified brands ke live market trends yeh hain:\n\n${benchText}\n\n💡 **Bhai Ka Strategic Mashwara:**\nCustomers ko attract karne ke liye 30% se 40% discount sab se zyada effective volume lata hai. Agar aap clearance kar rahe hain to 50% flat discount customer clicks ko 3 guna barha deta hai!`,
      hasPostAction: true,
      actions: [
        { label: '👉 Nayi Deal Banayein', route: '/(brand)/create-deal' },
        { label: '📊 Active Posts Dekhein', route: '/(brand)/posts' },
      ],
    };
  }

  // 12. Strict Out-of-Scope / Fazool Baatein Rejection
  const offTopicKeywords = [
    'weather', 'mausam', 'cricket', 'match', 'politics', 'siasat', 'prime minister',
    'movie', 'film', 'song', 'gaana', 'joke', 'latifa', 'homework', 'essay',
    'python', 'javascript', 'coding', 'science', 'math', 'capital of', 'president'
  ];
  if (offTopicKeywords.some((word) => p.includes(word))) {
    return {
      reply: `Janab, main sirf **Jumble Sale** aur aapke brand **${brandName}** ki business growth aur portal operations ke liye hazir hoon! 💼\n\nAayein kisi deal ka catchy title, description, discount pricing ya active inventory check karein.`,
      hasPostAction: false,
      actions: [
        { label: '👉 Nayi Deal Banayein', route: '/(brand)/create-deal' },
        { label: '📊 Active Posts Dekhein', route: '/(brand)/posts' },
      ],
    };
  }

  // General Brand Strategy fallback
  return {
    reply: `💼 **Bhai's Strategic Assistance for ${brandName}:**\n\nJumble Sale par aapke brand ke liye yeh 3 cheezein sab se zyada orders generate karti hain:\n1. 🏷️ **Clear Discount Title**: Flat 30% ya 40% discount ko heading mein darj karein.\n2. 📸 **Clear Photos**: Asli aur high-resolution product pictures upload karein.\n3. ⏰ **Urgency Factor**: "Limited 48 Hours Flash Sale" likhne se customer foran purchase karta hai.\n\nBataiye Janab, kya main aapke liye is campaign ka title, description ya pricing tayyar karoon?`,
    hasPostAction: true,
    actions: [
      { label: '👉 Nayi Deal Banayein', route: '/(brand)/create-deal' },
      { label: '📊 Active Posts Dekhein', route: '/(brand)/posts' },
    ],
  };
}

export async function askBhaiBrandCopilot(
  prompt: string,
  brandNameOrId: string,
  brandCategory: string = 'Retail',
  ownerId?: string,
  preloadedContext?: BrandLiveContext
): Promise<BhaiResponse> {
  const p = (prompt || '').trim();

  // 1. Fetch Real-time Database Context for the Brand
  const context = preloadedContext || (await getBrandLiveContext(brandNameOrId, ownerId));
  const brandName = context.brandName || 'Brand';

  const marketSummary = (context.competitorBenchmark || [])
    .map((d) => `• ${d.brandName}: "${d.title}" (${d.discountPct}% OFF)`)
    .join('\n');

  const ownDealsSummary =
    context.activeDeals.length > 0
      ? context.activeDeals.map((d) => `• "${d.title}" (${d.discount_pct}% OFF - Active)`).join('\n')
      : 'No active deals live.';

  const pendingSummary =
    context.pendingDeals.length > 0
      ? context.pendingDeals.map((d) => `• "${d.title}" (${d.discount_pct}% OFF - Pending Review)`).join('\n')
      : 'None pending.';

  const apiKey = await getEffectiveGeminiKey();

  if (apiKey) {
    try {
      const systemPrompt = `You are "Bhai", the official AI Executive Brand Assistant & Business Growth Copilot for Jumble Sale Pakistan.

STRICT BEHAVIORAL & PERSONA RULES:
1. RESPECTFUL TONE: You are speaking to the respected brand manager/owner of "${brandName}" (Category: "${context.category}"). Always address them with deep respect ("Janab", "Aap", "Sir") in natural, polished Pakistani Roman Urdu (or English if addressed in English).
2. MISSION: Provide elite business assistance — store status, deal titles, descriptions, smart pricing math (.999 charm prices), terms drafting, WhatsApp broadcast copy, and portal troubleshooting.
3. LIVE DATABASE CONTEXT:
• Brand Name: ${brandName}
• Active Deals (${context.activeDeals.length}):\n${ownDealsSummary}
• Pending Deals (${context.pendingDeals.length}):\n${pendingSummary}
• Rejected Deals (${context.rejectedDeals.length})
• Competitor Category Trends:\n${marketSummary || 'Market discounts range 30% to 50%'}

4. OUTPUT FORMAT: Return JSON:
{
  "reply": "Your respectful, structured answer in Roman Urdu...",
  "hasPostAction": true,
  "actions": [
    { "label": "👉 Nayi Deal Banayein", "route": "/(brand)/create-deal" }
  ]
}`;

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
              responseMimeType: 'application/json',
              temperature: 0.5,
              maxOutputTokens: 700,
            },
          }),
        }
      );

      if (res.ok) {
        const json = await res.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && text.trim()) {
          const parsed = JSON.parse(text);
          return {
            reply: parsed.reply || text.trim(),
            hasPostAction: Boolean(parsed.hasPostAction),
            actions: parsed.actions || [
              { label: '👉 Nayi Deal Banayein', route: '/(brand)/create-deal' },
              { label: '📊 Active Posts Dekhein', route: '/(brand)/posts' },
            ],
          };
        }
      }
    } catch (apiErr) {
      console.warn('[Bhai Copilot] Gemini API call notice:', apiErr);
    }
  }

  // Local Deterministic Executive Engine with Real-Time Database Grounding
  return runDeterministicBhaiReply(p, context);
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
