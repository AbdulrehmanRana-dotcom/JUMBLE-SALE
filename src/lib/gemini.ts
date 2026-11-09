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
        return res.data as Deal[];
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
        return {
          ...d,
          brand: brandMatch,
          brand_name: brandMatch.name,
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
}

function runDeterministicBachatSearch(
  query: string,
  liveDeals: Deal[],
  language: 'roman_urdu' | 'english'
): AssistantResponse {
  const lower = query.toLowerCase();

  // 1. Budget Query
  const budgetMatch = lower.match(/(?:budget|range|under|andar|tak|mein)\s*(?:rs\.?|pkr)?\s*(\d{3,6})/i) ||
                      lower.match(/(?:rs\.?|pkr)?\s*(\d{3,6})\s*(?:budget|ke andar|tak)/i);

  if (budgetMatch) {
    const maxBudget = parseInt(budgetMatch[1], 10);
    const affordableDeals = liveDeals.filter((d) => {
      const price = d.discount_price || (d as any).price || (d.original_price && d.discount_pct ? Math.round(d.original_price * (1 - d.discount_pct / 100)) : 0);
      return price > 0 && price <= maxBudget;
    });

    if (affordableDeals.length > 0) {
      const topPick = affordableDeals[0];
      const topPrice = topPick.discount_price || (topPick as any).price || (topPick.original_price && topPick.discount_pct ? Math.round(topPick.original_price * (1 - topPick.discount_pct / 100)) : 0);
      const savings = (topPick.original_price || topPrice) - topPrice;

      const reply =
        language === 'roman_urdu'
          ? `Zabardast! Aapke Rs. ${maxBudget.toLocaleString()} ke budget mein mujhe yeh ${affordableDeals.length} live verified deals mili hain. Sab se behtareen pick ${(topPick as any).brand?.name || 'Brand'} ka "${topPick.title}" hai jo sirf Rs. ${topPrice.toLocaleString()} mein mil raha hai (aur Rs. ${savings.toLocaleString()} ki bachat ho rahi hai!). Neechay diye gaye deal cards par tap karein:`
          : `Great news! Within your budget of Rs. ${maxBudget.toLocaleString()}, I found ${affordableDeals.length} active verified deals. Top recommendation is "${topPick.title}" from ${(topPick as any).brand?.name || 'Brand'} at Rs. ${topPrice.toLocaleString()} (saving Rs. ${savings.toLocaleString()}!). Tap any card below:`;

      return { reply, deals: affordableDeals.slice(0, 5), is_off_topic: false, language };
    }
  }

  // 2. Discount Percentage Query
  const pctMatch = lower.match(/(\d{1,2})\s*%/);
  if (pctMatch) {
    const requestedPct = parseInt(pctMatch[1], 10);
    const highDiscountDeals = liveDeals.filter((d) => (d.discount_pct || 0) >= requestedPct);

    if (highDiscountDeals.length > 0) {
      const reply =
        language === 'roman_urdu'
          ? `Mujhe aapke liye ${requestedPct}% ya is se zyada discount wali ${highDiscountDeals.length} active verified deals mili hain! Kisi bhi deal par tap kar ke verify karein aur brand ki website se direct claim karein:`
          : `I found ${highDiscountDeals.length} active verified deals offering ${requestedPct}% or more discount! Tap any deal below to claim directly:`;
      return { reply, deals: highDiscountDeals.slice(0, 5), is_off_topic: false, language };
    }
  }

  // 3. Category or Keyword matching
  let filtered = liveDeals.filter((d) => {
    const title = (d.title || '').toLowerCase();
    const desc = (d.description || '').toLowerCase();
    const bName = ((d as any).brand?.name || '').toLowerCase();
    const catName = ((d as any).category?.name || '').toLowerCase();

    if (/kapr|lawn|kurti|dress|suit|shirt|pant|fashion|cloth/i.test(lower)) {
      return catName.includes('fashion') || /lawn|kurti|suit|unstitched|khaadi|outfitters|gul ahmed/i.test(title);
    }
    if (/shoe|joot|sneaker|chappal|sandal|boot|footwear/i.test(lower)) {
      return catName.includes('footwear') || /shoe|sneaker|bata|sandal|chappal/i.test(title);
    }
    if (/food|burger|pizza|khana|biryani|dine|restaurant|deal/i.test(lower)) {
      return catName.includes('food') || /pizza|burger|cheezious|meal|combo/i.test(title);
    }
    if (/mobile|phone|laptop|electronics|tech|watch|gadget/i.test(lower)) {
      return catName.includes('electronics') || /phone|mobile|redmi|priceoye|earbud/i.test(title);
    }
    if (/beauty|makeup|skin|perfume|cosmetic/i.test(lower)) {
      return catName.includes('beauty') || /rose water|skincare|saeed ghani|cream/i.test(title);
    }

    return (
      title.includes(lower) ||
      desc.includes(lower) ||
      bName.includes(lower) ||
      catName.includes(lower)
    );
  });

  if (filtered.length === 0) {
    filtered = liveDeals.slice(0, 4);
  }

  const reply =
    language === 'roman_urdu'
      ? `Jumble Sale database se mujhe aapki search ke mutabiq yeh ${filtered.length} live verified deals mili hain! Neechay cards par tap karein:`
      : `Here are the top ${filtered.length} active verified deals matching your search on Jumble Sale! Tap any card below:`;

  return { reply, deals: filtered.slice(0, 5), is_off_topic: false, language };
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
    'pe', 'par', 'sasti', 'sasta', 'dikhao', 'batao', 'chahye', 'hai', 'hain',
    'wali', 'walay', 'mein', 'kapron', 'jootay', 'khana', 'mujhe', 'karo',
    'choot', 'bachat', 'dhamaka', 'aadhi', 'qimat', 'kya', 'le', 'sakta', 'meri',
    'kese', 'kaise', 'bhi', 'kuch', 'kitna'
  ];
  const isRomanUrdu = urduMarkers.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower));
  const language: 'roman_urdu' | 'english' = isRomanUrdu ? 'roman_urdu' : 'english';

  // 2. Strict Off-Topic Guard
  const offTopicPatterns = [
    /\bcricket\b/i, /\bmatch\b/i, /\bpolitics\b/i, /\bsiasat\b/i, /\bprime minister\b/i,
    /\bweather\b/i, /\bmausam\b/i, /\bpython\b/i, /\bjavascript\b/i, /\bcoding\b/i,
    /\bcode\b/i, /\bhomework\b/i, /\bessay\b/i, /\bmovie\b/i, /\bfilm\b/i, /\bsong\b/i,
    /\blatifa\b/i, /\bjoke\b/i, /\bcapital of\b/i, /\bpresident\b/i, /\bmath problem\b/i
  ];
  const isStrictlyOffTopic = offTopicPatterns.some((rgx) => rgx.test(lower));

  if (isStrictlyOffTopic) {
    const refusal =
      language === 'roman_urdu'
        ? 'Main sirf Jumble Sale par live verified deals, discounts aur shopping bachat ke liye hazir hoon! 🛍️ Batayein aaj Pakistan ke kis brand ya category par sasti deal dhoondhni hai?'
        : 'I am your Jumble Sale shopping deals assistant! I exclusively help you discover genuine sales, discounts, and brand savings across Pakistan. What product or brand deal can I help you find today?';
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
      const catName = (d as any).category?.name || 'Retail';
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
      const systemPrompt = `You are "Jumble Bachat Assistant", the official AI shopping & deals concierge for the Jumble Sale platform in Pakistan.

STRICT INSTRUCTIONS:
1. PLATFORM GROUNDING: Below is the list of REAL LIVE DEALS currently available in the Jumble Sale database. You MUST ONLY recommend and cite deals from this list. DO NOT hallucinate or invent fake deals or fake brands.
2. SCOPE: ONLY answer questions about shopping, sales, promotions, product pricing, budget management, discount vouchers, and retail stores in Pakistan on Jumble Sale.
3. OFF-TOPIC REJECTION: If the user asks about ANYTHING outside shopping/sales (such as cricket, politics, weather, school homework, coding, general trivia), politely refuse:
   "Main sirf Jumble Sale par live deals, discounts aur shopping bachat ke liye hazir hoon! 🛍️ Batayein aaj Pakistan ke kis brand ya category par sasti deal dhoondhni hai?"
4. BUDGET ASSISTANCE: If user mentions a budget (e.g. "Rs. 5000 budget hai"), inspect the prices of live deals, suggest which items they can buy together within that budget, and calculate their total savings!
5. TONE & LANGUAGE: Reply warmly and politely in conversational ${language === 'roman_urdu' ? 'Pakistani Roman Urdu' : 'English'}. Be helpful, concise, and enthusiastic about savings!
6. MATCHED DEALS: In the JSON, provide the array "matched_deal_ids" containing the exact string IDs of the relevant live deals from the catalog below so the app can display clickable cards for the user!

LIVE DEALS CATALOG FROM DATABASE:
${catalogContext || 'No deals currently active.'}

OUTPUT FORMAT: Return ONLY valid JSON matching this exact schema:
{
  "reply": "Your conversational response explaining the deals, savings, or answers to the user...",
  "matched_deal_ids": ["deal-id-1", "deal-id-2"],
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
          const matchedDeals = liveDeals.filter((d) => matchedIds.includes(d.id));

          return {
            reply: parsed.reply || 'Yeh rahein aap ke liye behtareen deals:',
            deals:
              matchedDeals.length > 0
                ? matchedDeals
                : parsed.is_off_topic
                ? []
                : liveDeals.slice(0, 3),
            is_off_topic: Boolean(parsed.is_off_topic),
            language,
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
