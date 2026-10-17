import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Deal } from '@/types/database.types';

const LOCAL_DEALS_KEY = '@jumble_sale_brand_deals';

export const INITIAL_MOCK_DEALS: Deal[] = [];

export async function getLocalBrandDeals(brandId?: string): Promise<Deal[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_DEALS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    const deals: Deal[] = Array.isArray(parsed) ? parsed : [];
    // Purge any previously stored dummy deals
    const dummyIds = new Set([
      'deal-101', 'deal-102', 'deal-103',
      'post-1', 'post-2', 'post-3',
      'demo-1', 'demo-2', 'demo-3', 'demo-4', 'demo-5', 'demo-6',
      'rec-1', 'rec-2', 'rec-3', 'rec-4',
      'rd-1', 'rd-2', 'rd-3', 'rd-4'
    ]);
    const realDeals = deals.filter(
      (d) => !dummyIds.has(d.id)
    );
    if (realDeals.length !== deals.length) {
      await AsyncStorage.setItem(LOCAL_DEALS_KEY, JSON.stringify(realDeals));
    }
    return brandId ? realDeals.filter((d) => d.brand_id === brandId) : realDeals;
  } catch (err) {
    console.error('[DealStore] Error reading local deals:', err);
    return [];
  }
}

export async function saveLocalDeal(deal: Partial<Deal>): Promise<Deal> {
  const existing = await getLocalBrandDeals();
  const isExisting = deal.id && existing.some((d) => d.id === deal.id);

  let updated: Deal[];
  let savedDeal: Deal;

  if (isExisting) {
    savedDeal = {
      ...existing.find((d) => d.id === deal.id)!,
      ...deal,
      updated_at: new Date().toISOString(),
    } as Deal;
    updated = existing.map((d) => (d.id === deal.id ? savedDeal : d));
  } else {
    savedDeal = {
      id: deal.id || `deal-${Date.now()}`,
      brand_id:
        (deal.brand_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deal.brand_id) ? deal.brand_id : null) ||
        'b1111111-1111-1111-1111-111111111111',
      title: deal.title || 'Special Promotion',
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

  await AsyncStorage.setItem(LOCAL_DEALS_KEY, JSON.stringify(updated));
  return savedDeal;
}

export async function deleteLocalDeal(dealId: string): Promise<void> {
  const existing = await getLocalBrandDeals();
  const updated = existing.filter((d) => d.id !== dealId);
  await AsyncStorage.setItem(LOCAL_DEALS_KEY, JSON.stringify(updated));
}
