// Supabase Edge Function: brand-copilot
// Dedicated Brand Marketing AI Assistant ("Bhai") powered by Google Gemini 1.5 Flash.
// Strictly bound to Jumble Sale brand marketing, pricing calculations, terms, and promotions.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `
You are "Bhai", the official AI Brand Marketing Copilot for the Jumble Sale platform in Pakistan.

STRICT BEHAVIORAL RULES:
1. NAME: Your name is strictly "Bhai". When asked who you are, what your name is, or your identity, always say your name is "Bhai".
2. APP & PURPOSE: You exclusively serve brands, sellers, and merchants on Jumble Sale (Pakistan's deals & discounts platform).
3. INTRODUCTION: When asked for your intro or what you can do ("apne baray mai batao", "intro do", "kya kar sakte ho"), explain:
   - Your name is Bhai, the official Brand Copilot for Jumble Sale.
   - You help brands with:
     * Catchy & viral titles / slogans
     * Compelling product & deal descriptions
     * Smart pricing & discount calculation (selling price, customer savings, psychological charm price e.g. Rs. 2,999)
     * Official retail terms & conditions (7/14 day exchange, invoice policies, outlet rules)
     * Instagram & TikTok captions with viral hashtags
     * Ready-to-send WhatsApp / SMS broadcast blast copy
4. GREETINGS: You can warmly and politely reply to normal greetings (Salam, Assalam o Alaikum, Hello, Hi, Kese ho).
5. STRICT SCOPE ENFORCEMENT: You must ONLY answer questions directly related to Jumble Sale, brand promotion, marketing, products, discounts, pricing, copy, and retail deals.
   IF the user asks about ANYTHING ELSE (general knowledge, politics, sports, coding, homework, personal gossip, weather, unrelated banter):
   You MUST politely refuse and redirect them:
   "Bhai, main sirf Jumble Sale aur aapke brand business ke liye kaam karta hoon! Fazool ya ghair-mutalliq baaton ke bajaye aain apni deal ka title, description, discount price ya terms set karein."
6. TONE & LANGUAGE: Speak respectfully in Roman Urdu or English depending on how the brand user talks to you. Be punchy, helpful, and retail-focused.
`;

function getDeterministicReply(prompt: string, brandName: string): string {
  const p = prompt.toLowerCase();

  // Greetings
  if (p.includes('salam') || p.includes('hello') || p.includes('hi') || p.includes('kese ho') || p.includes('kaise ho')) {
    return `Walaikum Assalam! Main bilkul theek hoon, Bhai. Aap batayein, aaj Jumble Sale par aapke brand **${brandName}** ke liye kaunsi deal tayyar karni hai? Koi title, description ya pricing set karni hai?`;
  }

  // Identity / Name / Intro
  if (p.includes('naam') || p.includes('who are you') || p.includes('kon ho') || p.includes('intro') || p.includes('apne baray') || p.includes('kya kar sakte')) {
    return `Mera naam **Bhai** hai! 👋 Main **Jumble Sale** ka official AI Brand Copilot hoon.

Main aapke brand **${brandName}** ki growth ke liye yeh kaam kar sakta hoon:
1. 🏷️ **Catchy & Viral Titles**: High-converting headings aur slogans likhna.
2. 📝 **Compelling Descriptions**: Fabric quality, features aur nationwide delivery highlight karne wali descriptions likhna.
3. 💰 **Smart Pricing & Discount Calculation**: Original price se discount ke baad final selling price, customer savings aur psychological charm price (jaise Rs. 2,999) calculate karna.
4. 📜 **Terms & Conditions**: 7-day exchange, invoice proof aur retail rules draft karna.
5. 📢 **Social & WhatsApp Marketing**: Instagram captions with hashtags aur ready-to-broadcast WhatsApp messages tayyar karna.
6. 🚀 **Jumble Sale Promotions**: Deals ko optimize karke sales barhana.

Aap mujhse apni kisi bhi item ya deal ke mutalliq poochh sakte hain!`;
  }

  // Pricing Query
  const priceMatch = p.match(/\b(\d{3,6})\b/);
  const pctMatch = p.match(/\b(\d{1,2})\s*%/);
  if ((p.includes('price') || p.includes('discount') || p.includes('qimat') || p.includes('bachat')) && priceMatch) {
    const origPrice = parseInt(priceMatch[1], 10);
    const discountPct = pctMatch ? parseInt(pctMatch[1], 10) : 30;
    const sellingPrice = Math.round(origPrice * (1 - discountPct / 100));
    const savings = origPrice - sellingPrice;
    const charmPrice = sellingPrice >= 1000 ? Math.floor(sellingPrice / 100) * 100 - 1 : sellingPrice - 1;

    return `💰 **Smart Pricing & Discount Analysis by Bhai:**

• **Original Price:** Rs. ${origPrice.toLocaleString()}
• **Discount Rate:** ${discountPct}% OFF
• **Final Selling Price:** Rs. ${sellingPrice.toLocaleString()}
• **Customer Savings:** Rs. ${savings.toLocaleString()}

✨ **Psychological Charm Price Recommendation:**
👉 **Rs. ${charmPrice.toLocaleString()}**
*(Bhai ka mashwara: .999 wali pricing customers ko zyada attractive lagti hai aur conversion 14% barha deti hai!)*`;
  }

  // Titles
  if (p.includes('title') || p.includes('slogan') || p.includes('heading')) {
    return `🏷️ **Bhai ke Top 3 Recommended Titles (${brandName}):**

1. ⚡ **Flash Sale / Urgent:**
"Aakhri Mauqa: ${brandName} ki Special Collection par Flat 30% Off!"

2. 🔥 **Viral / Click-Magnet:**
"Bachat Mela: Premium Items ab Sirf Rs. 2,999 mein — Limited Stock!"

3. ✨ **Luxury / Signature:**
"${brandName} Signature Elegance: Unbeatable Quality at Special Promotional Price"`;
  }

  // Terms & Conditions
  if (p.includes('term') || p.includes('condition') || p.includes('policy') || p.includes('exchange') || p.includes('return')) {
    return `📜 **Official Terms & Conditions for ${brandName}:**

1. Yeh promotional offer stock khatam honay tak valid hai.
2. Discount online store aur tamam official retail outlets par laagu hai.
3. 7 din ke andar exchange ki suhoolat asli invoice aur intact security tags ke sath dastyaab hai.
4. Yeh deal kisi doosray promotional voucher ya bank discount ke sath combine nahi ki ja sakti.
5. Standard nationwide cash-on-delivery aur delivery charges laagu honge.`;
  }

  // Social / Promo
  if (p.includes('instagram') || p.includes('whatsapp') || p.includes('caption') || p.includes('promote')) {
    return `📢 **Social Media & Broadcast Copy by Bhai:**

📸 **Instagram / TikTok Caption:**
"🔥 BIGGEST SALE OF THE SEASON! 🔥

Aapki pasandeeda collection par ab chal rahi hai FLAT 30% OFF ki Dhamaka Sale! 🎉

🛍️ In-store & online
🚚 Fast Delivery Across Pakistan
👉 Bio ke link par click karein aur apna order book karein!

#JumbleSale #PakistanSale #SaleAlertPK #${brandName.replace(/[^a-zA-Z0-9]/g, '')} #BestDeals"

---

💬 **WhatsApp Broadcast Message:**
"📢 Salam! ${brandName} ki taraf se shandaar khushkhabri! Hamari viral collection par ab Flat 30% OFF shuru ho chuki hai! Limited stock dastyaab hai, foran order karein: [Shop Link]!"`;
  }

  // Off-topic guardrail rejection
  if (
    p.includes('weather') ||
    p.includes('prime minister') ||
    p.includes('cricket') ||
    p.includes('joke') ||
    p.includes('code') ||
    p.includes('python') ||
    p.includes('politics') ||
    p.includes('movie')
  ) {
    return `Bhai, main sirf **Jumble Sale** aur aapke brand business ke liye kaam karta hoon! 🚫 Fazool ya ghair-mutalliq baaton ke bajaye aain apni kisi product ka title, description, discount price ya terms & conditions set karein.`;
  }

  // General marketing response
  return `🚀 **Bhai's Marketing Recommendation for ${brandName}:**

Main aapke brand ke liye:
• Catchy title tayyar kar sakta hoon
• High-converting description likh sakta hoon
• Smart discount price calculate kar sakta hoon
• Terms & Conditions aur WhatsApp broadcast bana sakta hoon

Aap apni product ka naam aur discount batayein, baqi kaam Bhai par chorh dein!`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const payload = await req.json();
    const userMessage = (payload.message || '').trim();
    const brandName = payload.brand_name || 'My Brand';

    if (!userMessage) {
      return new Response(JSON.stringify({ error: 'Message cannot be empty.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try Google Gemini 1.5 Flash if API key is configured
    if (geminiKey) {
      try {
        const fullPrompt = `${SYSTEM_PROMPT}

Current Brand Name: "${brandName}".
Brand User Message: "${userMessage}".

Generate your response directly as Bhai following all rules strictly:`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 600,
              },
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const parsedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (parsedText && parsedText.trim()) {
            return new Response(
              JSON.stringify({
                success: true,
                reply: parsedText.trim(),
                source: 'gemini-1.5-flash',
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      } catch (geminiErr) {
        console.warn('[Brand Copilot] Gemini API error, falling back to deterministic:', geminiErr);
      }
    }

    // Fallback to high-precision local retail engine
    const reply = getDeterministicReply(userMessage, brandName);
    return new Response(
      JSON.stringify({
        success: true,
        reply,
        source: 'local-engine',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
