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
    .replace(/\blive database\b/gi, 'our marketplace')
    .replace(/\bdatabase mein\b/gi, 'in our platform')
    .replace(/\bdatabase\b/gi, 'verified brand partners')
    .replace(/\bsystem\b/gi, 'platform')
    .replace(/\brecords\b/gi, 'brand offers')
    .replace(/\bquery\b/gi, 'question');
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
      reply: "Sorry, I can only help with shopping deals, discounts, and verified brand promotions on Jumble Sale! 🛍️ Which brand or category are you looking for today?",
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
  if (/\b(?:salam|assalam|aoa|aslamu|hello|hi|hey)\b/i.test(lower) && !isShoppingWord) {
    return {
      reply: 'Hello! How can I assist you with your shopping today? 🛍️\n\nTell me which brand or category you are exploring — apparel, footwear, smartphones, or food deals? And what budget do you have in mind?\n\nLet me know and I will instantly bring up the best verified discounts for you!',
      deals: [],
      is_off_topic: false,
      suggested_chips: ['👗 Show Khaadi Deals', '👟 Show Bata Shoes', '🍕 Show Cheezious Pizza', '🎯 Rs. 3,000 Budget Deals'],
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
        reply: "Here are the top active promotions for trousers and bottoms from our verified brand partners **Outfitters** (streetwear denim and pants up to 40% OFF) and **Khaadi** (matching pret trousers with up to 50% savings):",
        deals: trouserDeals.slice(0, 4),
        is_off_topic: false,
        suggested_chips: ['👖 Outfitters Trousers', '👗 Khaadi Pret Bottoms', '👟 Matching Bata Shoes'],
      };
    } else {
      return {
        reply: "Yes, trousers and bottoms are actively available! Our verified partner **Outfitters** currently offers up to 40% flat discount on streetwear cargo and denim pants (starting at Rs. 2,994), and **Khaadi** has up to 50% savings on pret trousers!\n\nWould you like me to display these verified trousers and pants deals for you?",
        deals: [],
        is_off_topic: false,
        suggested_chips: ['👖 Show Trousers Deals', '👕 View Outfitters Sale', '👗 View Khaadi Bottoms'],
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
      const origPrice = topPick.original_price || topPick.discount_price || 0;
      const topPrice = topPick.discount_price || (origPrice && topPick.discount_pct ? Math.round(origPrice * (1 - topPick.discount_pct / 100)) : origPrice);
      const savings = Math.max(0, origPrice - topPrice);
      const bName = topPick.brand?.name || 'Brand';

      if (isExplicitShow) {
        return {
          reply: `Great news! Verified products are available within your budget of Rs. ${maxBudget.toLocaleString()}. Our top recommendation is "${topPick.title}" by ${bName} at just Rs. ${topPrice.toLocaleString()} (saving Rs. ${savings.toLocaleString()}!). Check out the deals below:`,
          deals: affordableDeals.slice(0, 4),
          is_off_topic: false,
          suggested_chips: ['⚡ Claim Deal', '💰 Show Cheaper Deals'],
        };
      } else {
        return {
          reply: `Great news! Verified products are available within your budget of Rs. ${maxBudget.toLocaleString()}! The top deal is "${topPick.title}" by ${bName} for just Rs. ${topPrice.toLocaleString()} with Rs. ${savings.toLocaleString()} in direct savings.\n\nWould you like me to show you the promotions for this budget?`,
          deals: [],
          is_off_topic: false,
          suggested_chips: [`💰 Show Rs. ${maxBudget.toLocaleString()} Deals`, '👗 Fashion in Budget'],
        };
      }
    } else {
      // Nothing under this budget! Sort ascending to find closest lowest options
      const sortedByPrice = [...deals].sort((a, b) => {
        const origA = a.original_price || a.discount_price || 0;
        const origB = b.original_price || b.discount_price || 0;
        const pA = a.discount_price || (origA && a.discount_pct ? Math.round(origA * (1 - a.discount_pct / 100)) : origA);
        const pB = b.discount_price || (origB && b.discount_pct ? Math.round(origB * (1 - b.discount_pct / 100)) : origB);
        return pA - pB;
      });

      const lowest = sortedByPrice[0];
      const secondLowest = sortedByPrice[1];
      const lowestOrig = lowest?.original_price || lowest?.discount_price || 0;
      const secondOrig = secondLowest?.original_price || secondLowest?.discount_price || 0;
      const lowestP = lowest ? (lowest.discount_price || (lowestOrig && lowest.discount_pct ? Math.round(lowestOrig * (1 - lowest.discount_pct / 100)) : lowestOrig)) : 0;
      const secondP = secondLowest ? (secondLowest.discount_price || (secondOrig && secondLowest.discount_pct ? Math.round(secondOrig * (1 - secondLowest.discount_pct / 100)) : secondOrig)) : 0;
      const lowestBrand = lowest?.brand?.name || 'Brand';
      const secondBrand = secondLowest?.brand?.name || 'Brand';
      const diff = lowestP > maxBudget ? lowestP - maxBudget : 0;

      return {
        reply: `Currently, there are no live products under Rs. ${maxBudget.toLocaleString()} on our platform.\n\nOur lowest priced verified deal right now is from ${lowestBrand} at Rs. ${lowestP.toLocaleString()} ("${lowest?.title || 'Offer'}" - ${lowest?.discount_pct || 0}% OFF!)` +
          (secondLowest ? `, followed by ${secondBrand} at Rs. ${secondP.toLocaleString()}` : '') +
          (diff > 0 ? ` (just Rs. ${diff.toLocaleString()} difference)` : '') +
          `.\n\nWould you like me to display these lowest-priced verified deals?`,
        deals: isExplicitShow ? [lowest, secondLowest].filter(Boolean) : [],
        is_off_topic: false,
        suggested_chips: [`⚡ Show Rs. ${lowestP.toLocaleString()} Deal`, '💰 Best Value Deals'],
      };
    }
  }

  // 7. Generic Fallback
  return {
    reply: isExplicitShow
      ? 'Here are the hottest verified promotions from our official brand partners where you can save significantly. Check out the cards below:'
      : 'Our official brand partners currently feature exclusive discounts ranging from 30% to 70% OFF! Which category would you like to explore — apparel, footwear, electronics, or food?',
    deals: isExplicitShow ? deals.slice(0, 4) : [],
    is_off_topic: false,
    suggested_chips: ['👗 Show Khaadi Deals', '🍕 Show Pizza Deals', '👟 Show Shoes Deals'],
  };
}
