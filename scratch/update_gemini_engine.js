const fs = require('fs');
const path = require('path');

const targetFilePath = path.join(__dirname, '..', 'src', 'lib', 'gemini.ts');
const originalContent = fs.readFileSync(targetFilePath, 'utf8');

const startMarker = 'export function normalizeDesiTypos';
const endMarker = '// 4. BHAI - BRAND MARKETING & RETAIL GROWTH COPILOT';

const startIndex = originalContent.indexOf(startMarker);
const endIndex = originalContent.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error('Markers not found! Start:', startIndex, 'End:', endIndex);
  process.exit(1);
}

// Find the line preceding the endMarker (the comment banner divider)
const beforeEnd = originalContent.lastIndexOf('// ==============================================================================', endIndex);
const sliceEnd = beforeEnd !== -1 ? beforeEnd : endIndex;

const newSection = `export function normalizeDesiTypos(text: string): string {
  let normalized = (text || '').toLowerCase();
  // Brand name common typos
  normalized = normalized.replace(/\\b(?:khadi|khaddi|khedi|kaddi)\\b/g, 'khaadi');
  normalized = normalized.replace(/\\b(?:otfiters|outfiter|outfitr|otfitr)\\b/g, 'outfitters');
  normalized = normalized.replace(/\\b(?:gulahmed|gul\\s*ahmd|gull\\s*ahmed)\\b/g, 'gul ahmed');
  normalized = normalized.replace(/\\b(?:cheezios|cheezus|chezious|cheezos|chezios)\\b/g, 'cheezious');
  normalized = normalized.replace(/\\b(?:batta)\\b/g, 'bata');
  normalized = normalized.replace(/\\b(?:pricoye|priceoi|price\\s*oi)\\b/g, 'priceoye');
  normalized = normalized.replace(/\\b(?:saeedgani|said\\s*ghani|saeed\\s*gani)\\b/g, 'saeed ghani');
  // Category common typos (preserve "diners"/"diner" for Pakistani brand handling, only fix dinnr)
  normalized = normalized.replace(/\\b(?:dinr|dinnr)\\b/g, 'dinner');
  normalized = normalized.replace(/\\b(?:shose|snekers|sneker|joty|chpal)\\b/g, 'shoes');
  normalized = normalized.replace(/\\b(?:kpry|kapray|korti|kurtiyan)\\b/g, 'kapray');
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
    /\\b(?:dikhao|dikhayein|dikha|dekhao|dekhein|show|posts|cards|post|card|dikha\\s*do|dikhao\\s*bhai|dikha\\s*de|dikha\\s*dein|dikhao\\s*deals)\\b/i.test(
      normalized
    );

  // 2. Budget Extraction
  let budgetConstraint: number | undefined;
  const budgetMatch =
    normalized.match(/(?:budget|range|under|andar|tak|mein)(?:[^\\d]{1,15})?(\\d{3,6})/i) ||
    normalized.match(/(\\d{3,6})(?:[^\\d]{1,15})?(?:budget|ke\\s*andar|tak)/i) ||
    normalized.match(/(?:rs\\.?|pkr)\\s*(\\d{3,6})/i);
  if (budgetMatch) {
    budgetConstraint = parseInt(budgetMatch[1], 10);
  } else if (state?.activeBudget) {
    budgetConstraint = state.activeBudget;
  }

  // 3. Demographic Extraction
  let demographic: 'ladies' | 'gents' | 'unisex' | undefined;
  if (/\\b(?:ladies|women|female|aurat|auraton|baji|girls)\\b/i.test(normalized)) {
    demographic = 'ladies';
  } else if (/\\b(?:gents|men|mens|male|mard|bhai|boys)\\b/i.test(normalized)) {
    demographic = 'gents';
  } else if (state?.targetAudience) {
    demographic = state.targetAudience;
  }

  // 4. Primary Brand Extraction
  let primaryBrand: string | undefined;
  if (/khaadi/i.test(normalized)) primaryBrand = 'Khaadi';
  else if (/outfitter/i.test(normalized)) primaryBrand = 'Outfitters';
  else if (/gul\\s*ahmed|gulahmed/i.test(normalized)) primaryBrand = 'Gul Ahmed';
  else if (/bata/i.test(normalized)) primaryBrand = 'Bata Pakistan';
  else if (/cheezious/i.test(normalized)) primaryBrand = 'Cheezious';
  else if (/price\\s*oye|priceoye/i.test(normalized)) primaryBrand = 'PriceOye';
  else if (/saeed\\s*ghani|saeedghani/i.test(normalized)) primaryBrand = 'Saeed Ghani';
  else if (/imtiaz/i.test(normalized)) primaryBrand = 'Imtiaz Super Market';
  else if (/habitt/i.test(normalized)) primaryBrand = 'Habitt';
  else if (
    /\\b(?:diners|diner|dinners)\\b/i.test(normalized) &&
    !/\\b(?:pizza|burger|fast\\s*food|khana|dine)\\b/i.test(normalized)
  ) {
    primaryBrand = 'Diners';
  }

  // 5. Primary Category Extraction
  let primaryCategory: string | undefined;
  if (/\\b(?:shoe|shoes|joot|jootay|jooton|sneaker|sneakers|boot|boots|jogger|joggers|chappal|sandal|sandals|cleats|studs)\\b/i.test(normalized)) {
    primaryCategory = 'footwear';
  } else if (/\\b(?:kapr|kapray|kapron|lawn|kurti|kurtis|suit|suits|dress|dresses|pret|streetwear|fashion|clothes|cloth|shirt|shirts|pant|pants)\\b/i.test(normalized)) {
    primaryCategory = 'fashion';
  } else if (/\\b(?:food|pizza|burger|burgers|wings|khana|dinner|fast\\s*food|shawarma|karahi|roll|meal|restaurant)\\b/i.test(normalized)) {
    primaryCategory = 'food';
  } else if (/\\b(?:mobile|mobiles|phone|phones|smartphone|gadget|gadgets|earbud|earbuds|airpod|airpods|laptop|electronics|redmi)\\b/i.test(normalized)) {
    primaryCategory = 'electronics';
  } else if (/\\b(?:beauty|makeup|skin|skincare|serum|hair\\s*oil|cream|cosmetics|rose\\s*water)\\b/i.test(normalized)) {
    primaryCategory = 'beauty';
  } else if (/\\b(?:grocery|groceries|rashan|supermarket|oil|ghee|atta|sugar|rice|daal)\\b/i.test(normalized)) {
    primaryCategory = 'grocery';
  } else if (/\\b(?:furniture|bed|beds|bedsheet|bedsheets|sofa|sofas|cushion|decor|curtain|home)\\b/i.test(normalized)) {
    primaryCategory = 'home';
  } else if (primaryBrand) {
    if (['Khaadi', 'Outfitters', 'Gul Ahmed', 'Diners'].includes(primaryBrand)) primaryCategory = 'fashion';
    else if (primaryBrand === 'Bata Pakistan') primaryCategory = 'footwear';
    else if (primaryBrand === 'Cheezious') primaryCategory = 'food';
    else if (primaryBrand === 'PriceOye') primaryCategory = 'electronics';
    else if (primaryBrand === 'Saeed Ghani') primaryCategory = 'beauty';
    else if (primaryBrand === 'Imtiaz Super Market') primaryCategory = 'grocery';
    else if (primaryBrand === 'Habitt') primaryCategory = 'home';
  } else if (state?.activeCategory) {
    primaryCategory = state.activeCategory;
  }

  // 6. Has Retail/Shopping Intent Check
  const hasShoppingIntent =
    Boolean(primaryCategory || primaryBrand) ||
    /\\b(?:deal|deals|sale|sales|discount|discounts|bachat|offer|offers|coupon|voucher|sasta|sasti|saste|mehnga|mehngi|budget|price|qimat|rate|khareed|buy|shopping|order|claim|mil\\s*jaye|milega|milenge|available|chahiye|dekhna|dikhao|dikhayein|brand|brands|products|product|shop|store|collection|pret|lawn|unstitched|suit|jootay|sneakers|phone|delivery|exchange|return|cost)\\b/i.test(
      normalized
    );

  // 7. Core Entity & Modifiers extraction
  const modifiers: string[] = [];
  let coreEntity = primaryCategory || 'general';

  if (/\\b(?:football|soccer|cricket|tennis|hockey|running|gym|workout|sports)\\b/i.test(normalized)) {
    modifiers.push('sports');
    if (/\\bfootball\\b/i.test(normalized)) modifiers.push('football');
  }
  if (/\\b(?:formal|casual|party|shaadi|wedding|pret|unstitched)\\b/i.test(normalized)) {
    modifiers.push('formal_pret');
  }
  if (/\\b(?:sasta|cheapest|low\\s*price|kam\\s*qimat|bachat)\\b/i.test(normalized)) {
    modifiers.push('cheapest');
  }

  // 8. Intent Classification
  const isSalam = /\\b(?:salam|asalam|assalam|aslamu|assalamu|aoa)\\b/i.test(normalized);
  const isHey = /^(?:hey|hi|hello|heya)\\b/i.test(normalized);
  const isCasualGreeting = /^(?:kya haal|kese ho|kaise ho)\\b/i.test(normalized);
  const isPureGreeting = (isSalam || isHey || isCasualGreeting) && !hasShoppingIntent;

  const isPlatformInquiry =
    /\\b(?:kis\\s*trah\\s*ki|kis\\s*tarah\\s*ki|kis\\s*qism\\s*ki|kya\\s*milta|kya\\s*bechte|kya\\s*kya\\s*hai|kaun\\s*se\\s*brand|konse\\s*brand|brands\\s*hain|brands\\s*han|products\\s*hain|products\\s*han|jumble\\s*sale\\s*kya|about\\s*jumble|what\\s*products|what\\s*brands)\\b/i.test(
      normalized
    ) ||
    /kis\\s*trah\\s*ki\\s*products|kis\\s*tarah\\s*ki\\s*products|brand\\s*mai\\s*kis|brand\\s*mein\\s*kis|products\\s*han|products\\s*hain|app\\s*mai\\s*kya|app\\s*mein\\s*kya/i.test(
      normalized
    );

  const isGuidance =
    /\\b(?:madad|help|guide|guidance|mashwara|mashwarah|suggest|suggestion|recommend|recommendation|samajh\\s*nahi\\s*aa\\s*raha|kya\\s*khareedon|kya\\s*loon|kuch\\s*batao|kahan\\s*se\\s*shuru)\\b/i.test(
      normalized
    ) ||
    /madad\\s*kro|madad\\s*karo|shopping\\s*krnay\\s*mai|shopping\\s*karne\\s*mein|shopping\\s*guide/i.test(normalized);

  const isCoreference =
    /\\b(?:in\\s*mai\\s*se|in\\s*mein\\s*se|in\\s*me\\s*se|in\\s*se|un\\s*mai\\s*se|un\\s*mein\\s*se|unke\\s*hi|unhi\\s*ke|wohi\\s*dikha|unke\\s*dikhao)\\b/i.test(
      normalized
    ) ||
    (/\\b(?:sab\\s*se\\s*sasta|sab\\s*se\\s*sasti|sab\\s*se\\s*kam|cheapest|lowest)\\b/i.test(normalized) &&
      Boolean(state?.activeBrand || (state?.lastPitchedDeals && state.lastPitchedDeals.length > 0)));

  const isPolicySupport =
    /\\b(?:delivery\\s*time|kitne\\s*din|delivery\\s*charges|delivery\\s*fees|return\\s*policy|exchange\\s*policy|cod|cash\\s*on\\s*delivery|shipping|order\\s*track)\\b/i.test(
      normalized
    );

  const isSportsTrivia =
    /\\b(?:match|score|player|ronaldo|messi|babar|virat|fifa|pes|pubg|free\\s*fire|who\\s*won|kaun\\s*jeeta|score\\s*kya|tournament)\\b/i.test(
      normalized
    ) ||
    (/\\b(?:football|soccer|cricket|hockey|tennis)\\b/i.test(normalized) &&
      !/\\b(?:shoe|shoes|joot|jootay|boot|boots|sneaker|sneakers|spikes|studs|chappal|sandal|jogger|kit|jersey|shirt|bat|ball|equipment|khareed|buy|available|mil\\s*jaye|chahiye|dikhao|price|rate|deal)\\b/i.test(
        normalized
      ));

  const otherOffTopic = [
    /\\b(?:dekhtay\\s*ho|dekhte\\s*ho|khelte\\s*ho|kheltay\\s*ho|kya\\s*kar\\s*rahe\\s*ho|kya\\s*karte\\s*ho|kahan\\s*rehte\\s*ho|kahan\\s*se\\s*ho|shadi\\s*karoge|shadi\\s*hui|girlfriend|boyfriend|love\\s*you|pyar|dost\\s*banoge|friendship|bore\\s*ho\\s*raha|baat\\s*karo|kuch\\s*sunao|latifa|joke|jokes|shayari|ghazal|poetry|song|songs|gaana|movie|movies|film|drama|dramas|netflix|tiktok|youtube)\\b/i,
    /\\b(?:politics|siasat|prime\\s*minister|president|imran|nawaz|shehbaz|army|weather|mausam|barish|barsaat|python|javascript|coding|code|homework|essay|capital\\s*of|math\\s*problem|science|physics|chemistry|biology|history|who\\s*is|who\\s*created|tell\\s*me\\s*a\\s*story)\\b/i,
  ];
  const isGeneralOffTopic = otherOffTopic.some((rgx) => rgx.test(normalized));

  let intent: SalesmanIntent = 'product_inquiry';

  if (isPureGreeting) {
    intent = 'greeting';
  } else if (isGeneralOffTopic || (isSportsTrivia && !hasShoppingIntent)) {
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
  } else if (budgetConstraint && !primaryBrand && !primaryCategory) {
    intent = 'budget_constrained';
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
  clean = clean.replace(/\\blive database\\b/gi, 'hamare platform');
  clean = clean.replace(/\\bdatabase mein\\b/gi, 'hamare paas');
  clean = clean.replace(/\\bdatabase\\b/gi, 'verified brand partners');
  clean = clean.replace(/\\bsystem\\b/gi, 'platform');
  clean = clean.replace(/\\brecords\\b/gi, 'brand offers');
  clean = clean.replace(/\\bquery\\b/gi, 'sawal');
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
    /\\b(?:sasta|sasti|kam|unke|unhi|wohi)\\b/i.test(parsed.normalized);

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
    const isSalam = /\\b(?:salam|asalam|assalam|aslamu|assalamu|aoa)\\b/i.test(lower);
    const reply = isSalam
      ? 'Walaikum Assalam Janab! Main aap ki kya madad kar sakta hoon? 🛍️\\n\\nBatayein aaj Pakistan ke kis brand ya category par shopping ka irada hai — kapray, branded shoes, naya smartphone ya shaam ka khana? Aur budget kitna zehan mein hai?\\n\\nAap batayein, main foran behtareen verified deals nikaal deta hoon!'
      : 'Hello Janab! Main aap ki kya madad kar sakta hoon? 🛍️\\n\\nBatayein aaj kis cheez ki shopping ka irada hai — naye kapray, jootay, budget smartphone ya shaam ka dinner? Aur kitna budget zehan mein hai?\\n\\nAap batayein, main foran behtareen verified deals dikha deta hoon!';

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
      'Janab, Jumble Sale par Pakistan ke registered official brands ki verified discounted products aur exclusive sales milti hain!\\n\\nHamare registered partners par in categories mein 30% se 70% tak direct bachat hoti hai:\\n• 👗 Fashion & Kapray (Khaadi, Outfitters, Gul Ahmed)\\n• 👟 Footwear & Jootay (Bata Pakistan)\\n• 📱 Mobiles & Electronics (PriceOye)\\n• 🍕 Dinners & Fast Food (Cheezious)\\n• 🛒 Grocery & Supermarket (Imtiaz Super Market)\\n• 🏠 Home & Decor (Habitt)\\n\\nBatayein Janab, aapko kis brand ya category ki deals dekhni hain?';

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
      'Hukam karein Janab! Main aapki shopping mein madad karne aur aapke hazaron rupay bachane ke liye hi hazir hoon! 🛍️\\n\\nSir, aap aaj kis tarah ke product mein dilchaspi rakhte hain?\\n• 👗 Fashion & Kapray (Khaadi, Outfitters, Gul Ahmed)\\n• 👟 Footwear & Jootay (Bata Pakistan)\\n• 📱 Mobiles & Electronics (PriceOye)\\n• 🍕 Dinners & Fast Food (Cheezious)\\n\\nAur shopping ke liye aap ka target budget kitna zehan mein hai? Aap batayein main foran best verified deals nikaal deta hoon!';

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
      'Janab, Jumble Sale ke tamam registered official brand partners nationwide delivery provide karte hain (aam tor par 2 se 4 working days mein). Tamam deals 100% verified aur direct brand outlets aur websites se hoti hain.\\n\\nAapko kis specific brand ya product ki delivery ya order details maloom karni hain?';

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
      "Janab, football ke specific professional studs/cleats filhal hamare platform par registered nahi hain, magar sports, running aur workout ke liye Bata ke Power sneakers aur shoes par flat 40% discount chal raha hai!\\n\\nKya main aapko Bata ke verified sports sneakers aur shoes ki deals dikhaoon?";

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
      "Janab, agar aap Diners (menswear brand) ki baat kar rahe hain to filhal Diners hamare platform par registered nahi hai, magar men's fashion aur kapron par hamare registered brands Khaadi aur Outfitters par 40% se 50% tak flat discount available hai!\\n\\nAur agar aap shaam ke Dinner (fast food ya pizza) ki deal dhoondh rahe hain to Cheezious par 30% OFF pizza combos live hain.\\n\\nBatayein Janab, aapko men's fashion deals dekhni hain ya dinner fast food ki posts dikhaoon?";

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
        '👕 Men\\'s Fashion Deals Dikhao',
        '🍕 Cheezious Pizza Dikhao',
        '👗 Khaadi Deals Dikhao',
      ],
    };
  }

  // BRANCH 8: Coreference Resolution Engine (Multi-Turn Pronouns)
  // 8A: "in mai se sasta kaun sa hai?" / "sab se sasta"
  const isCheapestQuery =
    /\\b(?:in\\s*mai\\s*se|in\\s*mein\\s*se|in\\s*me\\s*se|in\\s*se|un\\s*mai\\s*se|un\\s*mein\\s*se)\\b/i.test(lower) ||
    (/\\b(?:sab\\s*se\\s*sasta|sab\\s*se\\s*sasti|sab\\s*se\\s*kam|cheapest|lowest|is\\s*se\\s*sasta)\\b/i.test(lower) &&
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
        savings > 0 ? \` (aur seedha Rs. \${savings.toLocaleString()} ki bachat ho rahi hai!)\` : '';

      const brandText = state?.activeBrand ? \`\${state.activeBrand} ki\` : 'In';
      const reply = \`Janab! \${brandText} deals mein se sab se sasta option "\${topPick.title}" hai jo sirf Rs. \${discPrice.toLocaleString()} mein mil raha hai\${savingsNote}. Limited stock hai, aap neechay diye gaye card se direct claim kar sakte hain:\`;

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
    /\\b(?:unke\\s*hi|unhi\\s*ke|unke\\s*dikha|unka\\s*dikha|un\\s*ke\\s*posts|unke\\s*deals|wohi\\s*dikha|unhi\\s*par|unke\\s*hi\\s*dikha\\s*do|acha\\s*unke)\\b/i.test(
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

    const reply = \`Beshak Janab! \${brandNames.join(
      ' aur '
    )} par is waqt yeh top verified deals active hain jahan 40% se 50% tak flat discount chal raha hai. Aap direct card se claim kar sakte hain:\`;

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
  const isMatchingQuery = /\\b(?:match|matching|sath\\s*ke|sath\\s*wali)\\b/i.test(lower);
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
      const brandContext = state?.activeBrand ? \`\${state.activeBrand} ke dresses\` : 'aapke outfits';
      const reply = \`Zabardast choice Janab! \${brandContext} ke sath match karne ke liye Bata par yeh footwear deals live hain jahan flat discount mil raha hai:\`;

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
        savings > 0 ? \` (aur seedha Rs. \${savings.toLocaleString()} ki bachat mil rahi hai!)\` : '';

      if (parsed.isExplicitShow) {
        const reply = \`Janab! \${brandName} par is waqt zabardast verified deals active hain! Sab se top deal "\${topDeal.title}" par \${topDeal.discount_pct}% discount chal raha hai\${savingsNote}. Limited stock hai, aap direct card se claim kar sakte hain:\`;
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
        const reply = \`Janab! \${brandName} par is waqt zabardast verified offers chal rahi hain jahan \${topDeal.discount_pct}% tak flat discount mil raha hai\${savingsNote}!\\n\\nKya main aapko \${brandName} ki deals aur posts dikhaoon?\`;
        return {
          reply,
          deals: [],
          is_off_topic: false,
          language: 'roman_urdu',
          suggested_chips: [
            \`👗 \${brandName} Deals Dikhao\`,
            '💰 Is se sasta alternative',
            '🔥 50%+ OFF Flash Deals',
          ],
        };
      }
    }
  }

  // BRANCH 10: Budget Range Search
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
      affordableDeals = affordableDeals.filter((d) => {
        const cat = ((d as any).category_name || (d as any).category?.name || '').toLowerCase();
        return cat.includes(parsed.primaryCategory!);
      });
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
        const reply = \`Befikar rahein Janab! Aapke Rs. \${maxBudget.toLocaleString()} ke budget mein top verified deals yeh hain. Meri sab se bari recommendation \${brandName} ka "\${topPick.title}" hai jo sirf Rs. \${topPrice.toLocaleString()} mein mil raha hai (seedha Rs. \${savings.toLocaleString()} ki bachat!). Neechay diye gaye cards se foran claim karein:\`;
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
        const reply = \`Befikar rahein Janab! Aapke Rs. \${maxBudget.toLocaleString()} ke budget mein \${brandName} aur hamare verified brand partners par behtareen options mojood hain jahan sirf Rs. \${topPrice.toLocaleString()} mein Rs. \${savings.toLocaleString()} ki direct bachat mil rahi hai!\\n\\nKya main aapko is budget ki deals aur posts dikhaoon?\`;
        return {
          reply,
          deals: [],
          is_off_topic: false,
          language: 'roman_urdu',
          suggested_chips: [
            \`💰 Rs. \${maxBudget.toLocaleString()} Deals Dikhao\`,
            '👗 Fashion in Budget',
            '👟 Shoes in Budget',
          ],
        };
      }
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
        savings > 0 ? \` (aur seedha Rs. \${savings.toLocaleString()} ki bachat mil rahi hai!)\` : '';

      if (parsed.isExplicitShow) {
        const reply = \`Janab! Yeh dekhein active verified deals jahan top deal par \${topDeal.discount_pct || 0}% discount chal raha hai\${savingsNote}. Limited stock hai, foran claim karein:\`;
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
        const reply = \`Janab! Is category mein hamare verified registered brands par \${topDeal.discount_pct || 0}% tak direct discount chal raha hai\${savingsNote}.\\n\\nKya main aapko iski active deals aur posts dikhaoon?\`;
        return {
          reply,
          deals: [],
          is_off_topic: false,
          language: 'roman_urdu',
          suggested_chips: [
            '👗 Deals Dikhao',
            '💰 Under Rs. 3,000',
            '🔥 Flash Sale Dikhao',
          ],
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
  const isRomanUrdu = urduMarkers.some((w) => new RegExp(\`\\\\b\${w}\\\\b\`, 'i').test(parsed.normalized));
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
      const origPrice = d.original_price ? \`Rs. \${d.original_price.toLocaleString()}\` : 'N/A';
      const finalPrice = discPrice ? \`Rs. \${discPrice.toLocaleString()}\` : origPrice;
      return \`[\${idx + 1}] ID: "\${d.id}" | Brand: "\${brandName}" | Title: "\${d.title}" | Category: "\${catName}" | Discount: \${d.discount_pct || 0}% OFF | Price: \${finalPrice} (Orig: \${origPrice}) | City: "\${d.city || 'All Pakistan'}"\`;
    })
    .join('\\n');

  const apiKey = await getEffectiveGeminiKey();

  // 6. If Gemini API Key is available, prompt Gemini with Chain-of-Thought
  if (apiKey) {
    try {
      const systemPrompt = \`You are "Jumble Master Salesman & Bachat Advisor", the elite personal shopping salesman for the Jumble Sale platform in Pakistan.

YOUR MISSION AS A CUSTOMER-CENTRIC SALESMAN:
You are NOT a software tester, robotic search engine, or developer. You are a respectful, energetic, trustworthy Pakistani personal shopping salesman (like an expert, honest shopkeeper in Liberty / Anarkali / Dolmen Mall who knows every sale in town and treats customers with deep respect).

ACTIVE SHOPPING CONVERSATION MEMORY:
• Active Brand: \${state.activeBrand || 'None yet'}
• Active Category: \${state.activeCategory || 'None yet'}
• Active Budget: \${state.activeBudget ? 'Rs. ' + state.activeBudget.toLocaleString() : 'Not yet set'}
• Target Demographic: \${state.targetAudience || 'General'}
• Recently Shown Deal IDs: \${state.lastPitchedDealIds?.join(', ') || 'None'}
• Recently Discussed Alternative Brands: \${state.lastDiscussedBrands?.join(', ') || 'None'}

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

LIVE REGISTERED BRANDS & DEALS CATALOG:
\${catalogContext || 'No deals currently active.'}

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
}\`;

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
        \`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=\${apiKey}\`,
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

`;

const updatedContent = originalContent.slice(0, startIndex) + newSection + originalContent.slice(sliceEnd);

fs.writeFileSync(targetFilePath, updatedContent, 'utf8');
console.log('Successfully updated src/lib/gemini.ts! New length:', updatedContent.length);
