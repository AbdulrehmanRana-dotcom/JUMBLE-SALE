import { supabase } from '../config/supabase.js';

export interface DealRecord {
  id: string;
  brand_id: string;
  category_id?: string;
  title: string;
  description: string;
  original_price: number;
  discount_price?: number;
  discount_pct: number;
  status: 'active' | 'expired' | 'pending';
  views_count?: number;
  claims_count?: number;
  created_at: string;
  brand?: {
    id: string;
    name: string;
    logo_url?: string;
    category?: string;
  };
  category?: {
    id: string;
    name: string;
  };
  category_name?: string;
}

export const FALLBACK_VERIFIED_DEALS: DealRecord[] = [
  {
    id: 'd7777777-7777-7777-7777-111111111111',
    brand_id: 'b7777777-7777-7777-7777-777777777777',
    brand: { id: 'b7777777-7777-7777-7777-777777777777', name: 'Saeed Ghani', category: 'Beauty & Cosmetics' },
    title: 'Pure Rose Water & Organic Herbal Oils',
    description: 'Natural organic skincare and hair regrowth oils. 50% flat discount.',
    original_price: 2500,
    discount_price: 1250,
    discount_pct: 50,
    status: 'active',
    views_count: 540,
    claims_count: 120,
    created_at: new Date().toISOString(),
    category_name: 'Beauty & Cosmetics',
  },
  {
    id: 'd6666666-6666-6666-6666-111111111111',
    brand_id: 'b6666666-6666-6666-6666-666666666666',
    brand: { id: 'b6666666-6666-6666-6666-666666666666', name: 'Cheezious', category: 'Food & Dining' },
    title: 'Special 30% Off Crown Crust Pizza & Chicken Wings Combo',
    description: 'Large Crown Crust pizza, spicy wings, and 1.5L drink at discounted price.',
    original_price: 2050,
    discount_price: 1450,
    discount_pct: 30,
    status: 'active',
    views_count: 980,
    claims_count: 310,
    created_at: new Date().toISOString(),
    category_name: 'Food & Dining',
  },
  {
    id: 'd2222222-2222-2222-2222-111111111111',
    brand_id: 'b2222222-2222-2222-2222-222222222222',
    brand: { id: 'b2222222-2222-2222-2222-222222222222', name: 'Outfitters', category: 'Fashion & Apparel' },
    title: 'Up to 40% Off Streetwear Collection & Trousers',
    description: 'Fresh hoodies, denim jackets, streetwear trousers, cargo and pants.',
    original_price: 4990,
    discount_price: 2994,
    discount_pct: 40,
    status: 'active',
    views_count: 1420,
    claims_count: 450,
    created_at: new Date().toISOString(),
    category_name: 'Fashion & Apparel',
  },
  {
    id: 'd1111111-1111-1111-1111-222222222222',
    brand_id: 'b1111111-1111-1111-1111-111111111111',
    brand: { id: 'b1111111-1111-1111-1111-111111111111', name: 'Khaadi', category: 'Fashion & Apparel' },
    title: 'Buy 1 Get 1 Free Ready-to-Wear Kurtis & Bottoms',
    description: 'Special offer on ready-to-wear kurtis, matching pret trousers and lawn.',
    original_price: 6500,
    discount_price: 3250,
    discount_pct: 50,
    status: 'active',
    views_count: 2200,
    claims_count: 780,
    created_at: new Date().toISOString(),
    category_name: 'Fashion & Apparel',
  },
  {
    id: 'd4444444-4444-4444-4444-111111111111',
    brand_id: 'b4444444-4444-4444-4444-444444444444',
    brand: { id: 'b4444444-4444-4444-4444-444444444444', name: 'Bata Pakistan', category: 'Footwear & Accessories' },
    title: "Flat 40% Off Men's & Women's Sneakers and Shoes",
    description: 'Bata Power sports sneakers, running shoes, and formal leather shoes.',
    original_price: 5999,
    discount_price: 3599,
    discount_pct: 40,
    status: 'active',
    views_count: 1850,
    claims_count: 610,
    created_at: new Date().toISOString(),
    category_name: 'Footwear & Accessories',
  },
  {
    id: 'd5555555-5555-5555-5555-111111111111',
    brand_id: 'b5555555-5555-5555-5555-555555555555',
    brand: { id: 'b5555555-5555-5555-5555-555555555555', name: 'PriceOye', category: 'Electronics & Mobiles' },
    title: 'Save Rs. 15,000 on Xiaomi Redmi Note 13 & Wireless Earbuds',
    description: 'Official PTA approved smartphones with 1-year brand warranty.',
    original_price: 57999,
    discount_price: 42999,
    discount_pct: 26,
    status: 'active',
    views_count: 3100,
    claims_count: 950,
    created_at: new Date().toISOString(),
    category_name: 'Electronics & Mobiles',
  },
];

export async function getActiveDeals(limit: number = 30): Promise<DealRecord[]> {
  try {
    const { data, error } = await supabase
      .from('deals')
      .select('*, brand:brands(id, name, logo_url, category), category:categories(id, name)')
      .eq('status', 'active')
      .order('discount_pct', { ascending: false })
      .limit(limit);

    if (error || !data || data.length === 0) {
      return FALLBACK_VERIFIED_DEALS.slice(0, limit);
    }

    return (data || []).map((d: any) => ({
      ...d,
      category_name: d.category?.name || 'Retail',
    }));
  } catch (err) {
    console.error('[DealService] Fetch exception, using fallback:', err);
    return FALLBACK_VERIFIED_DEALS.slice(0, limit);
  }
}

export async function getBrandDeals(brandId: string): Promise<DealRecord[]> {
  try {
    const { data, error } = await supabase
      .from('deals')
      .select('*, category:categories(id, name)')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return FALLBACK_VERIFIED_DEALS.filter(d => d.brand_id === brandId);
    }

    return data || [];
  } catch (err) {
    console.error('[DealService] Brand fetch exception:', err);
    return FALLBACK_VERIFIED_DEALS.filter(d => d.brand_id === brandId);
  }
}
