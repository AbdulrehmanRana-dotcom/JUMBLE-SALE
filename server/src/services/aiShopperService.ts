import { getActiveDeals, DealRecord } from './dealService.js';

export interface ShopperResponse {
  reply: string;
  deals: DealRecord[];
  is_off_topic: boolean;
  suggested_chips: string[];
}

export function sanitizeSalesmanJargon(text: string): string {
  if (!text) return '';
  return text
    .replace(/\blive database\b/gi, 'hamare platform')
    .replace(/\bdatabase mein\b/gi, 'hamare paas')
    .replace(/\bdatabase\b/gi, 'verified brand partners')
    .replace(/\bsystem\b/gi, 'platform')
    .replace(/\brecords\b/gi, 'brand offers')
    .replace(/\bquery\b/gi, 'sawal');
}

export async function processShopperAIQuery(
  rawQuery: string,
  chatHistory: { role: string; content: string }[] = []
): Promise<ShopperResponse> {
  const query = (rawQuery || '').trim();
  const lower = query.toLowerCase();

  const deals = await getActiveDeals(30);

  // 1. Explicit Show Command Detection
  const isExplicitShow = /\b(?:dikhao|dikhayein|dikha|dekhao|dekhein|show|posts|cards|post|card|dikha\s*do|dikhao\s*bhai|dikha\s*de|dikha\s*dein|dikhao\s*deals)\b/i.test(lower);

  // 2. Budget Extraction
  const budgetMatch =
    lower.match(/(?:budget|range|under|andar|tak|mein|mai|neechay|se\s*neechay|se\s*kam|kam)(?:[^\d]{1,15})?(\d{3,6})/i) ||
    lower.match(/(\d{3,6})(?:[^\d]{1,15})?(?:budget|ke\s*andar|tak|se\s*neechay|se\s*kam|neechay|mein|mai)/i) ||
    lower.match(/(?:rs\.?|pkr)\s*(\d{3,6})/i);
  const budgetConstraint = budgetMatch ? parseInt(budgetMatch[1], 10) : undefined;

  // 3. Off-Topic Check
  const offTopicKeywords = [
    /\b(?:dekhtay\s*ho|dekhte\s*ho|khelte\s*ho|shadi\s*karoge|girlfriend|boyfriend|love\s*you|pyar|latifa|joke|poetry|song|movie|film|drama)\b/i,
    /\b(?:politics|siasat|prime\s*minister|imran|nawaz|shehbaz|weather|mausam|python|javascript|coding|code|homework|essay)\b/i,
    /\b(?:match|score|player|ronaldo|messi|babar|virat|pubg)\b/i,
  ];
  const isShoppingWord = /\b(?:deal|sale|discount|bachat|trouser|trousers|pant|shoe|shoes|kapray|lawn|kurti|burger|pizza|phone|rs|pkr|budget|brand|buy|order|available|mil|chahiye)\b/i.test(lower);

  if (offTopicKeywords.some(rgx => rgx.test(lower)) && !isShoppingWord) {
    return {
      reply: "Sorry, I can't answer that. Main sirf Jumble Sale aur aapke shopping deals aur bachat ke liye hazir hoon! 🛍️ Batayein aaj Pakistan ke kis brand ya product par discount dekhna hai?",
      deals: [],
      is_off_topic: true,
      suggested_chips: [
        '👗 Khaadi & Gul Ahmed Sale',
        '🍕 Cheezious Pizza Combos',
        '👟 Bata Shoes 50% Off',
        '🎯 Rs. 3,000 Budget Deals',
      ],
    };
  }

  // 4. Greetings
  if (/\b(?:salam|assalam|aoa|aslamu)\b/i.test(lower) && !isShoppingWord) {
    return {
      reply: 'Walaikum Assalam Janab! Main aap ki kya madad kar sakta hoon? 🛍️\n\nBatayein aaj Pakistan ke kis brand ya category par shopping ka irada hai — kapray, branded shoes, naya smartphone ya shaam ka khana? Aur budget kitna zehan mein hai?\n\nAap batayein, main foran behtareen verified deals nikaal deta hoon!',
      deals: [],
      is_off_topic: false,
      suggested_chips: ['👗 Khaadi Deals Dikhao', '👟 Bata Shoes Dikhao', '🍕 Cheezious Pizza Dikhao', '🎯 Rs. 3,000 Budget Deals'],
    };
  }

  // 5. Apparel Sub-Entities: Trousers / Pants
  if (/\b(?:trouser|trousers|pant|pants|jeans|denim|cargo|bottom|bottoms)\b/i.test(lower)) {
    const trouserDeals = deals.filter(d => {
      const bName = (d.brand?.name || '').toLowerCase();
      const title = (d.title || '').toLowerCase();
      return bName.includes('outfitter') || bName.includes('khaadi') || title.includes('streetwear');
    });

    if (isExplicitShow) {
      return {
        reply: "Janab! Trousers aur bottoms ke liye hamare verified brand **Outfitters** (streetwear pants aur denim par 40% OFF) aur **Khaadi** (matching pret trousers par 50% tak bachat) par active deals yeh rahi hain:",
        deals: trouserDeals.slice(0, 4),
        is_off_topic: false,
        suggested_chips: ['👖 Outfitters Trousers Dikhao', '👗 Khaadi Pret Bottoms', '👟 Matching Bata Shoes'],
      };
    } else {
      return {
        reply: "Janab! Trousers aur pants bilkul available hain! Hamare verified registered brand **Outfitters** par streetwear trousers, cargo aur denim jeans par up to 40% flat discount chal raha hai (fresh collection sirf Rs. 2,994 mein), aur **Khaadi** par matching pret trousers aur bottoms par 50% tak bachat mojood hai!\n\nKya main aapko Outfitters aur Khaadi ke trousers aur bottoms ki verified deals aur posts dikhaoon?",
        deals: [],
        is_off_topic: false,
        suggested_chips: ['👖 Trousers Deals Dikhao', '👕 Outfitters Sale Dikhao', '👗 Khaadi Bottoms Dikhao'],
      };
    }
  }

  // 6. Budget Evaluation & Honesty
  if (budgetConstraint) {
    const maxBudget = budgetConstraint;
    const affordableDeals = deals.filter(d => {
      const price = d.discount_price || (d.original_price && d.discount_pct ? Math.round(d.original_price * (1 - d.discount_pct / 100)) : 0);
      return price > 0 && price <= maxBudget;
    });

    if (affordableDeals.length > 0) {
      const topPick = affordableDeals[0];
      const topPrice = topPick.discount_price || Math.round(topPick.original_price * (1 - topPick.discount_pct / 100));
      const savings = topPick.original_price - topPrice;
      const bName = topPick.brand?.name || 'Brand';

      if (isExplicitShow) {
        return {
          reply: `Befikar rahein Janab! Aapke Rs. ${maxBudget.toLocaleString()} ke budget mein verified products available hain. Meri sab se bari recommendation ${bName} ka "${topPick.title}" hai jo sirf Rs. ${topPrice.toLocaleString()} mein mil raha hai (seedha Rs. ${savings.toLocaleString()} ki bachat!). Neechay diye gaye cards se foran claim karein:`,
          deals: affordableDeals.slice(0, 4),
          is_off_topic: false,
          suggested_chips: ['⚡ Claim Deal', '💰 Aur Sasta Dikhao'],
        };
      } else {
        return {
          reply: `Befikar rahein Janab! Aapke Rs. ${maxBudget.toLocaleString()} ke budget mein verified products available hain! Sab se behtareen option ${bName} ka "${topPick.title}" hai jo sirf Rs. ${topPrice.toLocaleString()} mein Rs. ${savings.toLocaleString()} ki direct bachat ke sath mil raha hai!\n\nKya main aapko is budget ki deals aur posts dikhaoon?`,
          deals: [],
          is_off_topic: false,
          suggested_chips: [`💰 Rs. ${maxBudget.toLocaleString()} Deals Dikhao`, '👗 Fashion in Budget'],
        };
      }
    } else {
      // Nothing under this budget! Sort ascending to find closest lowest options
      const sortedByPrice = [...deals].sort((a, b) => {
        const pA = a.discount_price || Math.round(a.original_price * (1 - a.discount_pct / 100));
        const pB = b.discount_price || Math.round(b.original_price * (1 - b.discount_pct / 100));
        return pA - pB;
      });

      const lowest = sortedByPrice[0];
      const secondLowest = sortedByPrice[1];
      const lowestP = lowest ? (lowest.discount_price || Math.round(lowest.original_price * (1 - lowest.discount_pct / 100))) : 0;
      const secondP = secondLowest ? (secondLowest.discount_price || Math.round(secondLowest.original_price * (1 - secondLowest.discount_pct / 100))) : 0;
      const lowestBrand = lowest?.brand?.name || 'Brand';
      const secondBrand = secondLowest?.brand?.name || 'Brand';
      const diff = lowestP > maxBudget ? lowestP - maxBudget : 0;

      return {
        reply: `Janab! Filhal hamare platform par Rs. ${maxBudget.toLocaleString()} se neechay koi product ya verified deal available nahi hai.\n\nHamare paas is waqt sab se sasti live verified offer ${lowestBrand} par hai jo sirf Rs. ${lowestP.toLocaleString()} mein mil rahi hai ("${lowest?.title || 'Offer'}" - ${lowest?.discount_pct || 0}% OFF!)` +
          (secondLowest ? `, aur doosra sasta option ${secondBrand} ki deal Rs. ${secondP.toLocaleString()} mein hai` : '') +
          (diff > 0 ? ` (sirf Rs. ${diff.toLocaleString()} ka farq hai)` : '') +
          `.\n\nKya main aapko in sab se sasti verified deals ki posts dikhaoon?`,
        deals: isExplicitShow ? [lowest, secondLowest].filter(Boolean) : [],
        is_off_topic: false,
        suggested_chips: [`⚡ Rs. ${lowestP.toLocaleString()} Deal Dikhao`, '💰 Sab Se Sasti Deals'],
      };
    }
  }

  // 7. Generic Fallback
  return {
    reply: isExplicitShow
      ? 'Janab! Hamare registered official brand partners par yeh garam offers chal rahi hain jahan aap ke hazaron rupay bach sakte hain. Neechay diye gaye cards dekhein:'
      : 'Janab! Hamare registered official brand partners par is waqt 30% se 70% tak zabardast discounts chal rahe hain. Batayein Janab, aapko kapray, jootay, mobile ya food ki posts dikhaoon?',
    deals: isExplicitShow ? deals.slice(0, 4) : [],
    is_off_topic: false,
    suggested_chips: ['👗 Khaadi Deals Dikhao', '🍕 Cheezious Pizza Dikhao', '👟 Bata Shoes Dikhao'],
  };
}
