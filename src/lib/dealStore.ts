import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  KHAADI_BRAND,
  OUTFITTERS_BRAND,
  GUL_AHMED_BRAND,
  BATA_BRAND,
  PRICEOYE_BRAND,
  CHEEZIOUS_BRAND,
  SAEED_GHANI_BRAND,
  IMTIAZ_BRAND,
  HABITT_BRAND,
  getLocalBrands,
} from '@/lib/brandStore';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Deal, DealStatus } from '@/types/database.types';

const LOCAL_DEALS_KEY = '@jumble_sale_brand_deals';

export const DEFAULT_SEED_DEALS: Deal[] = [
  {
    id: 'd1111111-1111-1111-1111-111111111111',
    brand_id: 'b1111111-1111-1111-1111-111111111111',
    brand: KHAADI_BRAND,
    brand_name: 'Khaadi',
    title: 'Flat 50% Off Summer Lawn Sale',
    description: 'Enjoy 50% discount across all unstitched 3-piece embroidered lawn suits online and in stores.',
    category_id: '11111111-1111-1111-1111-111111111111',
    discount_pct: 50,
    original_price: 9990,
    discount_price: 4995,
    promo_code: 'SUMMER50',
    deal_type: 'online',
    city: 'Lahore',
    image_urls: [
      'https://images.unsplash.com/photo-1544441893-675973e31985?w=1000&q=80',
      'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=1000&q=80',
      'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1000&q=80',
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1000&q=80',
    ],
    banner_url: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=1000&q=80',
    terms: 'Valid until stock lasts.',
    status: 'active',
    rejection_reason: null,
    embedding: null,
    start_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    end_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    updated_at: new Date().toISOString(),
    buy_url: 'https://pk.khaadi.com/sale',
    website_url: 'https://pk.khaadi.com/sale',
  },
  {
    id: 'd1111111-1111-1111-1111-222222222222',
    brand_id: 'b1111111-1111-1111-1111-111111111111',
    brand: KHAADI_BRAND,
    brand_name: 'Khaadi',
    title: 'Buy 1 Get 1 Free Ready-to-Wear Kurtis',
    description: 'Special weekend offer on pret wear. Applicable across Lahore, Karachi & Islamabad outlets.',
    category_id: '11111111-1111-1111-1111-111111111111',
    discount_pct: 50,
    original_price: 6500,
    discount_price: 3250,
    promo_code: 'BOGO',
    deal_type: 'in_store',
    city: 'Karachi',
    image_urls: [
      'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=1000&q=80',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1000&q=80',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=1000&q=80',
    ],
    banner_url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=1000&q=80',
    terms: 'In-store only.',
    status: 'active',
    rejection_reason: null,
    embedding: null,
    start_date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    end_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    updated_at: new Date().toISOString(),
    buy_url: 'https://pk.khaadi.com/ready-to-wear',
    website_url: 'https://pk.khaadi.com/ready-to-wear',
  },
  {
    id: 'd1111111-1111-1111-1111-333333333333',
    brand_id: 'b1111111-1111-1111-1111-111111111111',
    brand: KHAADI_BRAND,
    brand_name: 'Khaadi',
    title: 'Suit',
    description: 'Exclusive 3-piece formal suit collection at special discount price.',
    category_id: '11111111-1111-1111-1111-111111111111',
    discount_pct: 30,
    original_price: 14500,
    discount_price: 10150,
    promo_code: 'PROMO30',
    deal_type: 'online',
    city: 'All Pakistan',
    image_urls: ['https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?w=1000&q=80'],
    banner_url: 'https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?w=1000&q=80',
    terms: 'Valid until stock lasts.',
    status: 'expired',
    rejection_reason: null,
    embedding: null,
    start_date: new Date('2026-10-01T00:00:00.000Z').toISOString(),
    end_date: new Date('2026-10-06T23:59:59.999Z').toISOString(),
    created_at: new Date('2026-10-01T00:00:00.000Z').toISOString(),
    updated_at: new Date('2026-10-06T23:59:59.999Z').toISOString(),
    buy_url: 'https://pk.khaadi.com',
    website_url: 'https://pk.khaadi.com',
  },
  {
    id: 'd2222222-2222-2222-2222-111111111111',
    brand_id: 'b2222222-2222-2222-2222-222222222222',
    brand: OUTFITTERS_BRAND,
    brand_name: 'Outfitters',
    title: 'Up to 40% Off Streetwear Collection',
    description: 'Fresh hoodies, denim jackets, and oversized graphic tees at discount rates.',
    category_id: '11111111-1111-1111-1111-111111111111',
    discount_pct: 40,
    original_price: 4990,
    discount_price: 2994,
    promo_code: 'OUTFIT40',
    deal_type: 'online',
    city: 'All Pakistan',
    image_urls: [
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=1000&q=80',
      'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=1000&q=80',
      'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=1000&q=80',
    ],
    banner_url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=1000&q=80',
    terms: 'Online only.',
    status: 'active',
    rejection_reason: null,
    embedding: null,
    start_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    end_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    updated_at: new Date().toISOString(),
    buy_url: 'https://outfitters.com.pk/collections/sale',
    website_url: 'https://outfitters.com.pk/collections/sale',
  },
  {
    id: 'd3333333-3333-3333-3333-111111111111',
    brand_id: 'b3333333-3333-3333-3333-333333333333',
    brand: GUL_AHMED_BRAND,
    brand_name: 'Gul Ahmed',
    title: 'Great Summer Unstitched Gala - 30% Off',
    description: 'Premium jacquard and chiffon unstitched luxury collection with nationwide delivery.',
    category_id: '11111111-1111-1111-1111-111111111111',
    discount_pct: 30,
    original_price: 12500,
    discount_price: 8750,
    promo_code: 'GUL30',
    deal_type: 'online',
    city: 'All Pakistan',
    image_urls: [
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1000&q=80',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1000&q=80',
      'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=1000&q=80',
    ],
    banner_url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1000&q=80',
    terms: 'Free shipping on orders above Rs. 2,500.',
    status: 'active',
    rejection_reason: null,
    embedding: null,
    start_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    end_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 20).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    updated_at: new Date().toISOString(),
    buy_url: 'https://www.gulahmedshop.com/unstitched',
    website_url: 'https://www.gulahmedshop.com/unstitched',
  },
  {
    id: 'd4444444-4444-4444-4444-111111111111',
    brand_id: 'b4444444-4444-4444-4444-444444444444',
    brand: BATA_BRAND,
    brand_name: 'Bata Pakistan',
    title: "Flat 40% Off Men's & Women's Sneakers and Formal Shoes",
    description: 'Special seasonal discount on Bata Power sneakers, loafers, and leather formal shoes across Pakistan.',
    category_id: '77777777-7777-7777-7777-777777777777', // Footwear & Accessories
    discount_pct: 40,
    original_price: 5999,
    discount_price: 3599,
    promo_code: 'BATA40',
    deal_type: 'in_store',
    city: 'All Pakistan',
    image_urls: [
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=1000&q=80',
      'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=1000&q=80',
      'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=1000&q=80',
      'https://images.unsplash.com/photo-1525966228454-be3239a2b851?w=1000&q=80',
    ],
    banner_url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=1000&q=80',
    terms: 'Valid at all Bata company stores nationwide.',
    status: 'active',
    rejection_reason: null,
    embedding: null,
    start_date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    end_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 18).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    updated_at: new Date().toISOString(),
    buy_url: 'https://www.bata.com.pk/collections/sale',
    website_url: 'https://www.bata.com.pk/collections/sale',
  },
  {
    id: 'd5555555-5555-5555-5555-111111111111',
    brand_id: 'b5555555-5555-5555-5555-555555555555',
    brand: PRICEOYE_BRAND,
    brand_name: 'PriceOye',
    title: 'Save Rs. 15,000 on Xiaomi Redmi Note 13 & Wireless Earbuds',
    description: 'Official PTA-approved smartphones with 1-year brand warranty and free nationwide delivery.',
    category_id: '22222222-2222-2222-2222-222222222222', // Electronics & Mobiles
    discount_pct: 26,
    original_price: 57999,
    discount_price: 42999,
    promo_code: 'REDMI15',
    deal_type: 'online',
    city: 'All Pakistan',
    image_urls: [
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1000&q=80',
      'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=1000&q=80',
      'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=1000&q=80',
      'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=1000&q=80',
    ],
    banner_url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1000&q=80',
    terms: 'Limited stock. 1 unit per customer.',
    status: 'active',
    rejection_reason: null,
    embedding: null,
    start_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    end_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 12).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    updated_at: new Date().toISOString(),
    buy_url: 'https://priceoye.pk/mobiles',
    website_url: 'https://priceoye.pk/mobiles',
  },
  {
    id: 'd6666666-6666-6666-6666-111111111111',
    brand_id: 'b6666666-6666-6666-6666-666666666666',
    brand: CHEEZIOUS_BRAND,
    brand_name: 'Cheezious',
    title: 'Special 30% Off Crown Crust Pizza & Chicken Wings Combo',
    description: 'Treat yourself to a large Crown Crust stuffed pizza, spicy wings, and 1.5L drink at discounted price.',
    category_id: '33333333-3333-3333-3333-333333333333', // Food & Dining
    discount_pct: 30,
    original_price: 2050,
    discount_price: 1450,
    promo_code: 'CHEEZ30',
    deal_type: 'in_store',
    city: 'Islamabad',
    image_urls: [
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1000&q=80',
      'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=1000&q=80',
      'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=1000&q=80',
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1000&q=80',
    ],
    banner_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1000&q=80',
    terms: 'Valid on dine-in and takeaway.',
    status: 'active',
    rejection_reason: null,
    embedding: null,
    start_date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    end_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 25).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    updated_at: new Date().toISOString(),
    buy_url: 'https://cheezious.com',
    website_url: 'https://cheezious.com',
  },
  {
    id: 'd7777777-7777-7777-7777-111111111111',
    brand_id: 'b7777777-7777-7777-7777-777777777777',
    brand: SAEED_GHANI_BRAND,
    brand_name: 'Saeed Ghani',
    title: 'Buy 1 Get 1 Free Pure Rose Water & Organic Herbal Oils',
    description: 'Natural organic skincare and hair regrowth oils. Pure distillation with traditional heritage herbs.',
    category_id: '55555555-5555-5555-5555-555555555555', // Beauty & Cosmetics
    discount_pct: 50,
    original_price: 2500,
    discount_price: 1250,
    promo_code: 'ORGANIC',
    deal_type: 'online',
    city: 'Karachi',
    image_urls: [
      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1000&q=80',
      'https://images.unsplash.com/photo-1608248597359-22a49f5064e7?w=1000&q=80',
      'https://images.unsplash.com/photo-1617897903246-719242758050?w=1000&q=80',
    ],
    banner_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1000&q=80',
    terms: 'Applies automatically at checkout.',
    status: 'active',
    rejection_reason: null,
    embedding: null,
    start_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    end_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    updated_at: new Date().toISOString(),
    buy_url: 'https://saeedghani.pk',
    website_url: 'https://saeedghani.pk',
  },
  {
    id: 'd8888888-8888-8888-8888-111111111111',
    brand_id: 'b8888888-8888-8888-8888-888888888888',
    brand: IMTIAZ_BRAND,
    brand_name: 'Imtiaz Super Market',
    title: 'Monthly Mega Bachat - Up to 20% Off Groceries & Cooking Oil',
    description: 'Stock up on monthly kitchen staples, Dalda oil, Basmati rice, and everyday household items.',
    category_id: '44444444-4444-4444-4444-444444444444', // Grocery & Supermarket
    discount_pct: 20,
    original_price: 6000,
    discount_price: 4800,
    promo_code: 'IMTIAZ20',
    deal_type: 'in_store',
    city: 'Lahore',
    image_urls: [
      'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1000&q=80',
      'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=1000&q=80',
      'https://images.unsplash.com/photo-1583258292688-d0213dc5a3a8?w=1000&q=80',
    ],
    banner_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1000&q=80',
    terms: 'Valid at all branches across Karachi, Lahore & Islamabad.',
    status: 'active',
    rejection_reason: null,
    embedding: null,
    start_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    end_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    updated_at: new Date().toISOString(),
    buy_url: 'https://www.imtiaz.com.pk',
    website_url: 'https://www.imtiaz.com.pk',
  },
  {
    id: 'd9999999-9999-9999-9999-111111111111',
    brand_id: 'b9999999-9999-9999-9999-999999999999',
    brand: HABITT_BRAND,
    brand_name: 'Habitt',
    title: 'Summer Home Living - Flat 35% Off Luxury Bed Linens & Cushions',
    description: 'Modern bedroom aesthetics with 100% cotton percale bed sets, throws, and decorative lighting.',
    category_id: '66666666-6666-6666-6666-666666666666', // Home & Living
    discount_pct: 35,
    original_price: 8450,
    discount_price: 5490,
    promo_code: 'HABITT35',
    deal_type: 'online',
    city: 'Karachi',
    image_urls: [
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1000&q=80',
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=1000&q=80',
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1000&q=80',
    ],
    banner_url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1000&q=80',
    terms: 'Free delivery on orders over Rs. 3,000.',
    status: 'active',
    rejection_reason: null,
    embedding: null,
    start_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    end_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 22).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    updated_at: new Date().toISOString(),
    buy_url: 'https://habitt.com',
    website_url: 'https://habitt.com',
  },
];

export const INITIAL_MOCK_DEALS: Deal[] = DEFAULT_SEED_DEALS;

/**
 * Returns the exact millisecond timestamp when a deal expires.
 * For YYYY-MM-DD inputs, defaults to 23:59:59.999 so the sale remains valid until the end of that day.
 */
export function getDealExpiryTimestamp(endDateStr: string | null | undefined): number | null {
  if (!endDateStr) return null;
  const trimmed = String(endDateStr).trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    if (isNaN(date.getTime())) return null;
    date.setHours(23, 59, 59, 999);
    return date.getTime();
  }

  const parsed = new Date(trimmed).getTime();
  return isNaN(parsed) ? null : parsed;
}

/**
 * Checks whether a deal is currently live and active.
 * Excludes deals that are pending, rejected, explicitly expired, or past their end_date.
 */
export function isDealActive(deal: Partial<Deal> | null | undefined): boolean {
  if (!deal) return false;
  if (deal.status !== 'active') return false;

  const now = Date.now();

  if (deal.start_date) {
    const startTime = new Date(deal.start_date).getTime();
    if (!isNaN(startTime) && startTime > now) {
      return false; // Scheduled for future date
    }
  }

  if (deal.end_date) {
    const expiry = getDealExpiryTimestamp(deal.end_date);
    if (expiry !== null && expiry < now) {
      return false; // Expired
    }
  }

  return true;
}

/**
 * Checks whether a deal has ended either by status or because current time is past end_date.
 */
export function isDealExpired(deal: Partial<Deal> | null | undefined): boolean {
  if (!deal) return false;
  if (deal.status === 'expired') return true;
  if (!deal.end_date) return false;

  const expiry = getDealExpiryTimestamp(deal.end_date);
  if (expiry === null) return false;

  return expiry < Date.now();
}

/**
 * Returns remaining days for a deal, or 0 if ended, or null if no end date.
 */
export function getDealRemainingDays(deal: Partial<Deal> | null | undefined): number | null {
  if (!deal?.end_date) return null;
  const expiry = getDealExpiryTimestamp(deal.end_date);
  if (expiry === null) return null;
  const diffMs = expiry - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

let memoryDealsCache: Deal[] | null = null;
let lastDealsCacheTime = 0;
const DEALS_CACHE_TTL = 30 * 1000; // 30s fast RAM cache for 0ms tab switching
export const DELETED_DEALS_KEY = '@jumble_sale_deleted_deal_ids';

export async function getLocalBrandDeals(brandId?: string): Promise<Deal[]> {
  try {
    if (memoryDealsCache && memoryDealsCache.length > 0 && Date.now() - lastDealsCacheTime < DEALS_CACHE_TTL) {
      return brandId ? memoryDealsCache.filter((d) => d.brand_id === brandId) : memoryDealsCache;
    }

    let deals: Deal[] = [];
    const deletedRaw = await AsyncStorage.getItem(DELETED_DEALS_KEY);
    const deletedIds: Set<string> = new Set(deletedRaw ? JSON.parse(deletedRaw) : []);

    const raw = await AsyncStorage.getItem(LOCAL_DEALS_KEY);
    if (!raw) {
      deals = DEFAULT_SEED_DEALS.filter((s) => !deletedIds.has(s.id));
      AsyncStorage.setItem(LOCAL_DEALS_KEY, JSON.stringify(deals)).catch(() => {});
    } else {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const existingIds = new Set(parsed.map((d: Deal) => d.id));
        const existingTitles = new Set(
          parsed.map((d: Deal) => (d.title || '').trim().toLowerCase())
        );
        const missingSeeds = DEFAULT_SEED_DEALS.filter(
          (s) =>
            !deletedIds.has(s.id) &&
            !existingIds.has(s.id) &&
            !existingTitles.has((s.title || '').trim().toLowerCase())
        );
        // Exclude any deals previously recorded as deleted
        deals = [...parsed.filter((d: Deal) => !deletedIds.has(d.id)), ...missingSeeds];
      } else {
        deals = DEFAULT_SEED_DEALS.filter((s) => !deletedIds.has(s.id));
      }
    }

    const localBrands = await getLocalBrands();
    let hadCopyTitles = false;
    const enrichedDeals: Deal[] = deals.map((d) => {
      let matchedBrand = (d as any).brand;
      if (!matchedBrand || matchedBrand.name === 'Featured Brand' || !matchedBrand.logo_url) {
        matchedBrand =
          localBrands.find((b) => b.id === d.brand_id) ||
          localBrands.find((b) => (b.name || '').toLowerCase() === ((d as any).brand_name || '').toLowerCase()) ||
          (d.brand_id === KHAADI_BRAND.id || (d.title && /suit|lawn|kurti|khaadi/i.test(d.title)) ? KHAADI_BRAND : null) ||
          (d.brand_id === OUTFITTERS_BRAND.id || (d.title && /streetwear|outfitter/i.test(d.title)) ? OUTFITTERS_BRAND : null) ||
          (d.brand_id === GUL_AHMED_BRAND.id || (d.title && /gala|gul\s*ahmed/i.test(d.title)) ? GUL_AHMED_BRAND : null) ||
          (d.brand_id === BATA_BRAND.id || (d.title && /bata|sneaker|shoes/i.test(d.title)) ? BATA_BRAND : null) ||
          (d.brand_id === PRICEOYE_BRAND.id || (d.title && /priceoye|redmi|mobile|phone/i.test(d.title)) ? PRICEOYE_BRAND : null) ||
          (d.brand_id === CHEEZIOUS_BRAND.id || (d.title && /cheezious|pizza|burger/i.test(d.title)) ? CHEEZIOUS_BRAND : null) ||
          (d.brand_id === SAEED_GHANI_BRAND.id || (d.title && /saeed\s*ghani|rose\s*water|herbal/i.test(d.title)) ? SAEED_GHANI_BRAND : null) ||
          (d.brand_id === IMTIAZ_BRAND.id || (d.title && /imtiaz|grocery|ration/i.test(d.title)) ? IMTIAZ_BRAND : null) ||
          (d.brand_id === HABITT_BRAND.id || (d.title && /habitt|bed\s*linens|decor/i.test(d.title)) ? HABITT_BRAND : null) ||
          KHAADI_BRAND;
      }
      const rawTitle = d.title || '';
      const cleanTitle = rawTitle.replace(/\s*\(Copy\)/gi, '').trim();
      if (cleanTitle !== rawTitle) {
        hadCopyTitles = true;
      }

      let catId = d.category_id;
      if (d.brand_id === BATA_BRAND.id || /bata|sneaker|shoes|footwear/i.test(d.title)) {
        catId = '77777777-7777-7777-7777-777777777777'; // Footwear & Accessories
      } else if (d.brand_id === PRICEOYE_BRAND.id || /priceoye|redmi|mobile|phone/i.test(d.title)) {
        catId = '22222222-2222-2222-2222-222222222222'; // Electronics & Mobiles
      } else if (d.brand_id === CHEEZIOUS_BRAND.id || /cheezious|pizza|burger/i.test(d.title)) {
        catId = '33333333-3333-3333-3333-333333333333'; // Food & Dining
      } else if (d.brand_id === SAEED_GHANI_BRAND.id || /saeed\s*ghani|rose\s*water|herbal/i.test(d.title)) {
        catId = '55555555-5555-5555-5555-555555555555'; // Beauty & Cosmetics
      } else if (d.brand_id === IMTIAZ_BRAND.id || /imtiaz|grocery|ration/i.test(d.title)) {
        catId = '44444444-4444-4444-4444-444444444444'; // Grocery & Supermarket
      } else if (d.brand_id === HABITT_BRAND.id || /habitt|bed\s*linens|decor/i.test(d.title)) {
        catId = '66666666-6666-6666-6666-666666666666'; // Home & Living
      } else if (!catId) {
        catId = '11111111-1111-1111-1111-111111111111'; // Default Fashion & Apparel
      }

      const seedMatch = DEFAULT_SEED_DEALS.find(
        (s) => s.id === d.id || (s.title && s.title.toLowerCase() === (d.title || '').toLowerCase())
      );
      // Strictly respect genuine brand-provided image_urls without replacing them with seed deals
      let finalImageUrls = Array.isArray(d.image_urls) && d.image_urls.length > 0 ? d.image_urls : [];
      if (finalImageUrls.length === 0) {
        if (seedMatch?.image_urls && seedMatch.image_urls.length > 0) {
          finalImageUrls = seedMatch.image_urls;
        } else if (d.banner_url) {
          finalImageUrls = [d.banner_url];
        }
      }

      return {
        ...d,
        title: cleanTitle,
        category_id: catId || d.category_id,
        image_urls: finalImageUrls,
        banner_url: finalImageUrls[0] || d.banner_url,
        brand: matchedBrand,
        brand_name: matchedBrand?.name || 'Khaadi',
      };
    });

    if (hadCopyTitles) {
      AsyncStorage.setItem(LOCAL_DEALS_KEY, JSON.stringify(enrichedDeals)).catch(() => {});
    }

    memoryDealsCache = enrichedDeals;
    lastDealsCacheTime = Date.now();
    return brandId ? enrichedDeals.filter((d) => d.brand_id === brandId) : enrichedDeals;
  } catch (err) {
    console.error('[DealStore] Error reading local deals:', err);
    return DEFAULT_SEED_DEALS;
  }
}

export async function saveLocalDeal(deal: Partial<Deal>): Promise<Deal> {
  const existing = await getLocalBrandDeals();
  const isExisting = deal.id && existing.some((d) => d.id === deal.id);
  const localBrands = await getLocalBrands();
  const matchedBrand =
    (deal as any).brand ||
    localBrands.find((b) => b.id === deal.brand_id) ||
    KHAADI_BRAND;

  const cleanTitle = (deal.title || '').replace(/\s*\((?:copy|nakal)\)/gi, '').trim() || 'Special Promotion';

  let updated: Deal[];
  let savedDeal: Deal;

  if (isExisting) {
    savedDeal = {
      ...existing.find((d) => d.id === deal.id)!,
      ...deal,
      title: cleanTitle,
      brand: matchedBrand,
      brand_name: matchedBrand.name,
      updated_at: new Date().toISOString(),
    } as Deal;
    updated = existing.map((d) => (d.id === deal.id ? savedDeal : d));
  } else {
    savedDeal = {
      id: deal.id || `deal-${Date.now()}`,
      brand_id:
        (deal.brand_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deal.brand_id) ? deal.brand_id : null) ||
        matchedBrand.id ||
        'b1111111-1111-1111-1111-111111111111',
      brand: matchedBrand,
      brand_name: matchedBrand.name,
      title: cleanTitle,
      description: deal.description || '',
      category_id: deal.category_id || null,
      discount_pct: deal.discount_pct || 20,
      original_price: deal.original_price || null,
      discount_price: deal.discount_price || null,
      promo_code: deal.promo_code || null,
      deal_type: deal.deal_type || 'online',
      city: deal.city || 'All Pakistan',
      image_urls: deal.image_urls || ['https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800'],
      banner_url: deal.banner_url || deal.image_urls?.[0] || 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800',
      terms: deal.terms || null,
      status: deal.status || 'pending',
      rejection_reason: null,
      embedding: null,
      start_date: deal.start_date || new Date().toISOString(),
      end_date: deal.end_date || new Date(Date.now() + 86400000 * 30).toISOString(),
      created_at: deal.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      buy_url: deal.buy_url || deal.website_url || null,
      website_url: deal.website_url || deal.buy_url || null,
    };
    updated = [savedDeal, ...existing];
  }

  memoryDealsCache = updated;
  await AsyncStorage.setItem(LOCAL_DEALS_KEY, JSON.stringify(updated));

  if (isSupabaseConfigured) {
    try {
      const { brand, category, is_saved, is_liked, ...tablePayload } = savedDeal as any;
      await (supabase.from('deals') as any).upsert(tablePayload);
    } catch (err) {
      console.warn('[DealStore] Supabase saveLocalDeal error:', err);
    }
  }

  return savedDeal;
}

export async function deleteLocalDeal(dealId: string): Promise<void> {
  // 1. Record in persistent deleted deals set
  try {
    const deletedRaw = await AsyncStorage.getItem(DELETED_DEALS_KEY);
    const deletedList: string[] = deletedRaw ? JSON.parse(deletedRaw) : [];
    if (!deletedList.includes(dealId)) {
      deletedList.push(dealId);
      await AsyncStorage.setItem(DELETED_DEALS_KEY, JSON.stringify(deletedList));
    }
  } catch (err) {
    console.warn('[DealStore] Could not update deleted IDs list:', err);
  }

  // 2. Remove from active store
  const existing = await getLocalBrandDeals();
  const updated = existing.filter((d) => d.id !== dealId);
  memoryDealsCache = updated;
  lastDealsCacheTime = Date.now();
  await AsyncStorage.setItem(LOCAL_DEALS_KEY, JSON.stringify(updated));

  // 3. Remove from remote Supabase if connected
  if (isSupabaseConfigured) {
    try {
      await (supabase.from('deals') as any).delete().eq('id', dealId);
    } catch (err) {
      console.warn('[DealStore] Supabase deleteLocalDeal notice:', err);
    }
  }
}

/**
 * Removes duplicate deals that share the exact same title & brand, keeping only the single newest one.
 */
export async function deduplicateDeals(brandId?: string): Promise<Deal[]> {
  const allDeals = await getLocalBrandDeals();
  const seenKeys = new Set<string>();
  const keepDeals: Deal[] = [];
  const removedIds: string[] = [];

  for (const d of allDeals) {
    if (brandId && d.brand_id !== brandId) {
      keepDeals.push(d);
      continue;
    }
    const cleanTitle = (d.title || '').replace(/\s*\((?:copy|nakal)\)/gi, '').trim().toLowerCase();
    const key = `${d.brand_id || ''}_${cleanTitle}`;
    if (seenKeys.has(key)) {
      removedIds.push(d.id);
    } else {
      seenKeys.add(key);
      keepDeals.push(d);
    }
  }

  if (removedIds.length > 0) {
    memoryDealsCache = keepDeals;
    lastDealsCacheTime = Date.now();
    await AsyncStorage.setItem(LOCAL_DEALS_KEY, JSON.stringify(keepDeals));
  }
  return brandId ? keepDeals.filter((d) => d.brand_id === brandId) : keepDeals;
}

/**
 * Toggles a deal's pinned / featured status at the database and local level.
 */
export async function toggleDealPin(dealId: string): Promise<boolean> {
  const deals = await getLocalBrandDeals();
  const deal = deals.find((d) => d.id === dealId);
  if (!deal) return false;

  const newPinState = !deal.is_pinned;
  deal.is_pinned = newPinState;
  deal.updated_at = new Date().toISOString();

  memoryDealsCache = [...deals];
  await AsyncStorage.setItem(LOCAL_DEALS_KEY, JSON.stringify(deals));

  if (isSupabaseConfigured) {
    try {
      await (supabase.from('deals') as any)
        .update({ is_pinned: newPinState, updated_at: deal.updated_at })
        .eq('id', dealId);
    } catch (err) {
      console.warn('[DealStore] Supabase toggleDealPin notice:', err);
    }
  }

  return newPinState;
}

/**
 * Toggles a deal's status between 'paused' (temporary out of stock/hold) and 'active'.
 */
export async function toggleDealPause(dealId: string): Promise<DealStatus> {
  const deals = await getLocalBrandDeals();
  const deal = deals.find((d) => d.id === dealId);
  if (!deal) return 'active';

  const newStatus: DealStatus = deal.status === 'paused' ? 'active' : 'paused';
  deal.status = newStatus;
  deal.updated_at = new Date().toISOString();

  memoryDealsCache = [...deals];
  await AsyncStorage.setItem(LOCAL_DEALS_KEY, JSON.stringify(deals));

  if (isSupabaseConfigured) {
    try {
      await (supabase.from('deals') as any)
        .update({ status: newStatus, updated_at: deal.updated_at })
        .eq('id', dealId);
    } catch (err) {
      console.warn('[DealStore] Supabase toggleDealPause notice:', err);
    }
  }

  return newStatus;
}

/**
 * Extends a deal's expiry by adding the specified number of days, reactivating it if expired.
 */
export async function extendDealExpiry(dealId: string, daysToAdd: number): Promise<Deal | null> {
  const deals = await getLocalBrandDeals();
  const deal = deals.find((d) => d.id === dealId);
  if (!deal) return null;

  const currentExpiry = getDealExpiryTimestamp(deal.end_date) || Date.now();
  const baseTime = Math.max(currentExpiry, Date.now());
  const newExpiryTime = baseTime + daysToAdd * 24 * 60 * 60 * 1000;
  const newEndDate = new Date(newExpiryTime).toISOString();

  deal.end_date = newEndDate;
  deal.status = 'active';
  deal.updated_at = new Date().toISOString();

  memoryDealsCache = [...deals];
  await AsyncStorage.setItem(LOCAL_DEALS_KEY, JSON.stringify(deals));

  if (isSupabaseConfigured) {
    try {
      await (supabase.from('deals') as any)
        .update({
          end_date: newEndDate,
          status: 'active',
          updated_at: deal.updated_at,
        })
        .eq('id', dealId);
    } catch (err) {
      console.warn('[DealStore] Supabase extendDealExpiry notice:', err);
    }
  }

  return deal;
}

/**
 * Clones/Duplicates a deal into a brand-new active promotion with fresh dates and unique ID.
 */
export async function duplicateDeal(dealId: string): Promise<Deal | null> {
  const deals = await getLocalBrandDeals();
  const source = deals.find((d) => d.id === dealId);
  if (!source) return null;

  const now = new Date();
  const newId = `d-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const cleanTitle = (source.title || '').replace(/\s*\(Copy\)/gi, '').trim();
  const cloned: Deal = {
    ...source,
    id: newId,
    title: cleanTitle,
    is_pinned: false,
    status: 'active',
    start_date: now.toISOString(),
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const updated = [cloned, ...deals];
  memoryDealsCache = updated;
  await AsyncStorage.setItem(LOCAL_DEALS_KEY, JSON.stringify(updated));

  if (isSupabaseConfigured) {
    try {
      const { brand, category, is_saved, is_liked, ...tablePayload } = cloned as any;
      await (supabase.from('deals') as any).insert(tablePayload);
    } catch (err) {
      console.warn('[DealStore] Supabase duplicateDeal notice:', err);
    }
  }

  return cloned;
}
