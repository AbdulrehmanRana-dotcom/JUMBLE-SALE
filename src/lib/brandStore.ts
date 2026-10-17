import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAllActivities,
  getDealCommentsCount,
  getDealLikesCount,
  getDealSharesCount,
  getRecentlyViewedDeals,
} from '@/lib/activityStore';
import { getLocalBrandDeals } from '@/lib/dealStore';
import { supabase } from '@/lib/supabase';
import type { Brand, Deal } from '@/types/database.types';

const PENDING_BRANDS_KEY = '@jumble_sale_pending_brands';
export const BRAND_IDENTITY_STORAGE_KEY = '@jumble_sale_brand_identity';
export const BRAND_NAME_STORAGE_KEY = '@jumble_sale_brand_name';
export const DELETED_BRANDS_KEY = '@jumble_sale_deleted_brands';

export const KHAADI_BRAND: Brand = {
  id: 'b1111111-1111-1111-1111-111111111111',
  owner_id: 'b0000000-0000-0000-0000-000000000001',
  name: 'Khaadi',
  business_email: 'contact@khaadi.com',
  contact_number: '+92 42 111 542 234',
  category: 'Fashion & Apparel',
  status: 'active',
  is_verified: true,
  logo_url: 'https://images.unsplash.com/photo-1544441893-675973e31985',
  social_links: { website: 'https://pk.khaadi.com' },
  verification_doc_urls: ['NTN_Verified.pdf'],
  rejection_reason: null,
  created_at: new Date().toISOString(),
};

export const OUTFITTERS_BRAND: Brand = {
  id: 'b2222222-2222-2222-2222-222222222222',
  owner_id: 'b0000000-0000-0000-0000-000000000002',
  name: 'Outfitters',
  business_email: 'info@outfitters.com.pk',
  contact_number: '+92 42 111 688 348',
  category: 'Fashion & Apparel',
  status: 'active',
  is_verified: true,
  logo_url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518',
  social_links: { website: 'https://outfitters.com.pk' },
  verification_doc_urls: ['NTN_Verified.pdf'],
  rejection_reason: null,
  created_at: new Date().toISOString(),
};

export const GUL_AHMED_BRAND: Brand = {
  id: 'b3333333-3333-3333-3333-333333333333',
  owner_id: 'b0000000-0000-0000-0000-000000000003',
  name: 'Gul Ahmed',
  business_email: 'customercare@gulahmed.com',
  contact_number: '+92 21 111 485 485',
  category: 'Fashion & Apparel',
  status: 'active',
  is_verified: true,
  logo_url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d',
  social_links: { website: 'https://www.gulahmedshop.com' },
  verification_doc_urls: ['NTN_Verified.pdf'],
  rejection_reason: null,
  created_at: new Date().toISOString(),
};

export const DEFAULT_PARTNER_BRAND: Brand = KHAADI_BRAND;

export const INITIAL_MOCK_BRANDS: Brand[] = [KHAADI_BRAND, OUTFITTERS_BRAND, GUL_AHMED_BRAND];

/**
 * Get IDs of brands permanently removed by admin
 */
export async function getDeletedBrandIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DELETED_BRANDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Permanently delete a brand locally and blacklist from re-seeding
 */
export async function deleteLocalBrand(brandId: string): Promise<void> {
  try {
    const deletedIds = await getDeletedBrandIds();
    if (!deletedIds.includes(brandId)) {
      deletedIds.push(brandId);
      await AsyncStorage.setItem(DELETED_BRANDS_KEY, JSON.stringify(deletedIds));
    }

    const raw = await AsyncStorage.getItem(PENDING_BRANDS_KEY);
    if (raw) {
      const parsed: Brand[] = JSON.parse(raw);
      const remaining = parsed.filter((b) => b.id !== brandId);
      await AsyncStorage.setItem(PENDING_BRANDS_KEY, JSON.stringify(remaining));
    }
  } catch (err) {
    console.error('[BrandStore] Error deleting local brand:', err);
  }
}

/**
 * Get all brands stored locally (both submitted and pre-seeded, excluding deleted)
 */
export async function getLocalBrands(): Promise<Brand[]> {
  try {
    const deletedIds = await getDeletedBrandIds();
    const raw = await AsyncStorage.getItem(PENDING_BRANDS_KEY);
    let brands: Brand[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      brands = Array.isArray(parsed) ? parsed : [];
    }

    // Filter out old non-UUID brands and deleted brands
    let realBrands = brands.filter(
      (b) =>
        b.id &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id) &&
        !deletedIds.includes(b.id)
    );

    // Only ensure Khaadi, Outfitters, Gul Ahmed are present if not deleted
    for (const seedBrand of [KHAADI_BRAND, OUTFITTERS_BRAND, GUL_AHMED_BRAND]) {
      if (!deletedIds.includes(seedBrand.id) && !realBrands.some((b) => b.id === seedBrand.id)) {
        realBrands.push(seedBrand);
      }
    }

    await AsyncStorage.setItem(PENDING_BRANDS_KEY, JSON.stringify(realBrands));
    return realBrands;
  } catch (err) {
    console.error('[BrandStore] Error loading local brands:', err);
    return [];
  }
}

/**
 * Save a newly submitted brand registration
 */
export async function saveBrandRegistrationLocally(brand: Partial<Brand>): Promise<Brand> {
  try {
    const existing = await getLocalBrands();
    const newBrand: Brand = {
      id: brand.id || `brand-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      owner_id: brand.owner_id || `owner-${Date.now()}`,
      name: brand.name || 'Unnamed Brand',
      business_email: brand.business_email || '',
      contact_number: brand.contact_number || '',
      category: brand.category || 'Fashion & Apparel',
      status: 'pending',
      is_verified: false,
      logo_url: brand.logo_url || null,
      social_links: brand.social_links || {},
      verification_doc_urls: brand.verification_doc_urls || [],
      rejection_reason: null,
      created_at: new Date().toISOString(),
    };

    const updated = [newBrand, ...existing.filter((b) => b.id !== newBrand.id && b.name.toLowerCase() !== newBrand.name.toLowerCase())];
    await AsyncStorage.setItem(PENDING_BRANDS_KEY, JSON.stringify(updated));
    return newBrand;
  } catch (err) {
    console.error('[BrandStore] Error saving brand registration:', err);
    throw err;
  }
}

/**
 * Update local brand status (approve / reject / suspend / reactivate)
 */
export async function updateLocalBrandStatus(
  brandId: string,
  updates: Partial<Brand>,
  brandName?: string
): Promise<void> {
  try {
    const brands = await getLocalBrands();
    let matched = false;
    const updated = brands.map((b) => {
      const isMatch =
        b.id === brandId ||
        (brandName && b.name.toLowerCase() === brandName.toLowerCase()) ||
        (b.name && updates.name && b.name.toLowerCase() === updates.name.toLowerCase()) ||
        (b.business_email && updates.business_email && b.business_email.toLowerCase() === updates.business_email.toLowerCase());
      if (isMatch) {
        matched = true;
        return {
          ...b,
          ...updates,
        };
      }
      return b;
    });

    if (!matched) {
      const seed = [KHAADI_BRAND, OUTFITTERS_BRAND, GUL_AHMED_BRAND].find(
        (s) => s.id === brandId || (brandName && s.name.toLowerCase() === brandName.toLowerCase())
      );
      if (seed) {
        updated.push({ ...seed, ...updates });
      }
    }

    // Update in-memory seeds if relevant
    for (const seed of [KHAADI_BRAND, OUTFITTERS_BRAND, GUL_AHMED_BRAND]) {
      if (seed.id === brandId || (brandName && seed.name.toLowerCase() === brandName.toLowerCase())) {
        Object.assign(seed, updates);
      }
    }

    await AsyncStorage.setItem(PENDING_BRANDS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('[BrandStore] Error updating local brand status:', err);
  }
}

/**
 * Update brand identity (name, tagline, description, website, contact_number) locally and across store
 */
export async function updateLocalBrandIdentity(updates: {
  brandId?: string;
  ownerId?: string;
  email?: string;
  name: string;
  contact_number?: string;
  website?: string;
  tagline?: string;
  description?: string;
  logo_url?: string;
}): Promise<Brand> {
  try {
    const brands = await getLocalBrands();
    let updatedBrand: Brand | null = null;

    const updated = brands.map((b) => {
      const isMatch =
        (updates.brandId && b.id === updates.brandId) ||
        (updates.ownerId && b.owner_id === updates.ownerId) ||
        (updates.email && b.business_email?.toLowerCase() === updates.email.toLowerCase()) ||
        b.id === DEFAULT_PARTNER_BRAND.id ||
        b.business_email?.toLowerCase() === DEFAULT_PARTNER_BRAND.business_email?.toLowerCase();

      if (isMatch) {
        const merged: Brand = {
          ...b,
          name: updates.name || b.name,
          contact_number: updates.contact_number !== undefined ? updates.contact_number : b.contact_number,
          logo_url: updates.logo_url !== undefined ? updates.logo_url : b.logo_url,
          social_links: {
            ...(typeof b.social_links === 'object' && b.social_links ? b.social_links : {}),
            website: updates.website !== undefined ? updates.website : (b.social_links as any)?.website,
            tagline: updates.tagline !== undefined ? updates.tagline : (b.social_links as any)?.tagline,
            description: updates.description !== undefined ? updates.description : (b.social_links as any)?.description,
          },
        };
        updatedBrand = merged;
        return merged;
      }
      return b;
    });

    if (!updatedBrand) {
      updatedBrand = {
        ...DEFAULT_PARTNER_BRAND,
        id: updates.brandId || DEFAULT_PARTNER_BRAND.id,
        owner_id: updates.ownerId || DEFAULT_PARTNER_BRAND.owner_id,
        name: updates.name,
        business_email: updates.email || DEFAULT_PARTNER_BRAND.business_email,
        contact_number: updates.contact_number || DEFAULT_PARTNER_BRAND.contact_number,
        social_links: {
          website: updates.website || 'https://brand.pk',
          tagline: updates.tagline || '',
          description: updates.description || '',
        },
      };
      updated.unshift(updatedBrand);
    }

    DEFAULT_PARTNER_BRAND.name = updates.name;
    if (updates.contact_number) DEFAULT_PARTNER_BRAND.contact_number = updates.contact_number;
    if (updates.website) (DEFAULT_PARTNER_BRAND.social_links as any).website = updates.website;

    await AsyncStorage.setItem(PENDING_BRANDS_KEY, JSON.stringify(updated));
    return updatedBrand;
  } catch (err) {
    console.error('[BrandStore] Error updating local brand identity:', err);
    throw err;
  }
}

/**
 * Retrieve saved brand identity from persistent storage
 */
export async function getSavedBrandIdentity(userKey?: string): Promise<Partial<Brand> | null> {
  try {
    if (userKey) {
      const perUserRaw = await AsyncStorage.getItem(`${BRAND_IDENTITY_STORAGE_KEY}_${userKey}`);
      if (perUserRaw) {
        const parsed = JSON.parse(perUserRaw);
        if (parsed && parsed.name && parsed.name !== 'Official Brand Partner') return parsed;
      }
    }
    const globalRaw = await AsyncStorage.getItem(BRAND_IDENTITY_STORAGE_KEY);
    if (globalRaw) {
      const parsed = JSON.parse(globalRaw);
      if (parsed && parsed.name && parsed.name !== 'Official Brand Partner') return parsed;
    }
    const nameOnly = await AsyncStorage.getItem(BRAND_NAME_STORAGE_KEY);
    if (nameOnly && nameOnly.trim() && nameOnly.trim() !== 'Official Brand Partner') {
      return { name: nameOnly.trim() };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persistently save brand identity across all local storage keys, Supabase DB, profiles table, and Auth metadata
 */
export async function saveBrandIdentityGlobally(brandData: {
  id?: string;
  owner_id?: string;
  email?: string;
  name: string;
  contact_number?: string;
  website?: string;
  tagline?: string;
  description?: string;
  logo_url?: string;
  category?: string;
}): Promise<Brand> {
  const cleanName = brandData.name.trim();
  const userKey = brandData.owner_id || brandData.email || 'active';

  const identityPayload: Partial<Brand> = {
    id: brandData.id,
    owner_id: brandData.owner_id,
    name: cleanName,
    business_email: brandData.email,
    contact_number: brandData.contact_number,
    category: brandData.category || 'Fashion & Apparel',
    logo_url: brandData.logo_url,
    social_links: {
      website: brandData.website || '',
      tagline: brandData.tagline || '',
      description: brandData.description || '',
    },
  };

  // 1. Direct AsyncStorage persistent keys (Guaranteed across project restarts)
  try {
    await AsyncStorage.setItem(BRAND_IDENTITY_STORAGE_KEY, JSON.stringify(identityPayload));
    await AsyncStorage.setItem(`${BRAND_IDENTITY_STORAGE_KEY}_${userKey}`, JSON.stringify(identityPayload));
    if (brandData.email) {
      await AsyncStorage.setItem(`${BRAND_IDENTITY_STORAGE_KEY}_${brandData.email}`, JSON.stringify(identityPayload));
    }
    if (brandData.owner_id) {
      await AsyncStorage.setItem(`${BRAND_IDENTITY_STORAGE_KEY}_${brandData.owner_id}`, JSON.stringify(identityPayload));
    }
    await AsyncStorage.setItem(BRAND_NAME_STORAGE_KEY, cleanName);
    await AsyncStorage.setItem('@user_display_name', cleanName);
  } catch (storageErr) {
    console.warn('[BrandStore] AsyncStorage save notice:', storageErr);
  }

  // 2. Update local brands list
  const updatedBrand = await updateLocalBrandIdentity({
    brandId: brandData.id,
    ownerId: brandData.owner_id,
    email: brandData.email,
    name: cleanName,
    contact_number: brandData.contact_number,
    website: brandData.website,
    tagline: brandData.tagline,
    description: brandData.description,
    logo_url: brandData.logo_url,
  });

  // 3. Database Upsert: public.brands table
  const isUuid = (str?: string | null) =>
    Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

  if (brandData.id || brandData.owner_id) {
    try {
      const dbPayload = {
        name: cleanName,
        contact_number: brandData.contact_number || '',
        category: brandData.category || 'Fashion & Apparel',
        status: 'active',
        is_verified: true,
        social_links: identityPayload.social_links,
        updated_at: new Date().toISOString(),
      };

      if (brandData.id && isUuid(brandData.id)) {
        await (supabase.from('brands') as any).upsert({
          id: brandData.id,
          owner_id: brandData.owner_id,
          business_email: brandData.email,
          ...dbPayload,
        }, { onConflict: 'id' });
      } else if (brandData.owner_id && isUuid(brandData.owner_id)) {
        await (supabase.from('brands') as any).upsert({
          owner_id: brandData.owner_id,
          business_email: brandData.email,
          ...dbPayload,
        }, { onConflict: 'owner_id' });
      }
    } catch (dbErr) {
      console.warn('[BrandStore] Supabase brand upsert note:', dbErr);
    }
  }

  // 4. Database Upsert: public.profiles table
  if (brandData.owner_id && isUuid(brandData.owner_id)) {
    try {
      await (supabase.from('profiles') as any).upsert({
        id: brandData.owner_id,
        display_name: cleanName,
        role: 'brand',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    } catch (pErr) {
      console.warn('[BrandStore] Supabase profile upsert note:', pErr);
    }
  }

  // 5. Supabase Auth: updateUser user_metadata
  try {
    await supabase.auth.updateUser({
      data: {
        brand_name: cleanName,
        display_name: cleanName,
        full_name: cleanName,
      },
    });
  } catch (authErr) {
    console.warn('[BrandStore] Supabase auth updateUser note:', authErr);
  }

  return updatedBrand;
}

export interface EngagedBrand extends Brand {
  totalViews: number;
  totalClicks: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalScore: number;
}

export const MOCK_BRAND_NAMES = new Set([
  'khaadi',
  'gul ahmed',
  'outfitters',
  'dinners',
  'zenith',
  'aura',
  'stride',
  'lumen',
]);

export const MOCK_BRAND_IDS = new Set([
  'b1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'b3333333-3333-3333-3333-333333333333',
  'b-1',
  'b-2',
  'b-3',
  'b-4',
  'b-5',
]);

export function isDummyBrand(b?: Partial<Brand> | null): boolean {
  if (!b) return true;
  if (b.id && MOCK_BRAND_IDS.has(b.id)) return true;
  const name = (b.name || '').trim().toLowerCase();
  if (name && MOCK_BRAND_NAMES.has(name)) return true;
  return false;
}

/**
 * Calculates real engagement (clicks, views, likes, comments, shares)
 * for registered active brands and returns them ranked in descending order.
 * Strictly excludes any dummy/mock brands and requires real engagement.
 */
export async function getTopEngagedBrands(): Promise<EngagedBrand[]> {
  try {
    // 1. Fetch registered active brands from Supabase and local store
    let registeredBrands: Brand[] = [];
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .in('status', ['active', 'approved']);
      if (!error && Array.isArray(data) && data.length > 0) {
        registeredBrands = data as Brand[];
      }
    } catch (err) {
      console.warn('[BrandStore] Supabase brands query notice:', err);
    }

    const localBrands = await getLocalBrands();
    const activeLocal = localBrands.filter(
      (b) => b.status === 'active' || b.is_verified === true
    );

    // Merge registered brands uniquely (strictly exclude all dummy mock brands)
    const brandMap = new Map<string, Brand>();

    for (const b of [...registeredBrands, ...activeLocal]) {
      if (isDummyBrand(b)) continue;
      const normName = (b.name || '').trim().toLowerCase();
      if (!normName) continue;
      if (!brandMap.has(normName)) {
        brandMap.set(normName, b);
      }
    }

    const brands = Array.from(brandMap.values());
    if (brands.length === 0) return [];

    // 2. Fetch all deals (both Supabase and Local)
    let dbDeals: Deal[] = [];
    try {
      const { data: dealsData } = await supabase
        .from('deals')
        .select('*, brand:brands(*)');
      if (dealsData && Array.isArray(dealsData)) {
        dbDeals = dealsData as Deal[];
      }
    } catch {}

    const localDeals = await getLocalBrandDeals();
    const dealMap = new Map<string, Deal>();
    for (const d of [...dbDeals, ...localDeals]) {
      if (d && d.id && !dealMap.has(d.id)) {
        dealMap.set(d.id, d);
      }
    }
    const allDeals = Array.from(dealMap.values());

    // 3. Fetch interaction records (views, clicks)
    let dbInteractions: { deal_id: string; type: string }[] = [];
    try {
      const { data: inters } = await supabase
        .from('interactions')
        .select('deal_id, type');
      if (inters && Array.isArray(inters)) {
        dbInteractions = inters;
      }
    } catch {}

    const localActivities = await getAllActivities();
    const viewedDeals = await getRecentlyViewedDeals();

    // 4. Calculate real engagement for each registered brand
    const engagedList: EngagedBrand[] = await Promise.all(
      brands.map(async (brand) => {
        const brandNameLower = (brand.name || '').trim().toLowerCase();
        const brandDeals = allDeals.filter(
          (d) =>
            d.brand_id === brand.id ||
            (d as any).brand?.id === brand.id ||
            ((d as any).brand?.name || '').trim().toLowerCase() === brandNameLower ||
            (d.title || '').toLowerCase().includes(brandNameLower)
        );

        const dealIds = new Set(brandDeals.map((d) => d.id));

        // Real Likes
        let likes = 0;
        for (const d of brandDeals) {
          likes += await getDealLikesCount(d.id);
        }

        // Real Comments
        let comments = 0;
        for (const d of brandDeals) {
          comments += await getDealCommentsCount(d.id);
        }

        // Real Shares
        let shares = 0;
        for (const d of brandDeals) {
          shares += await getDealSharesCount(d.id);
        }

        // Real Views & Clicks
        let views = 0;
        let clicks = 0;

        for (const inter of dbInteractions) {
          if (dealIds.has(inter.deal_id)) {
            if (inter.type === 'view') views++;
            if (inter.type === 'click') clicks++;
          }
        }

        for (const v of viewedDeals) {
          if (
            dealIds.has(v.id) ||
            (v.brand_name && v.brand_name.trim().toLowerCase() === brandNameLower)
          ) {
            views++;
          }
        }

        for (const act of localActivities) {
          const isBrandMatch =
            act.brand_id === brand.id ||
            (act.brand_name && act.brand_name.trim().toLowerCase() === brandNameLower) ||
            (act.deal_id && dealIds.has(act.deal_id));
          if (isBrandMatch) {
            if (act.type === 'like') likes++;
            else if (act.type === 'comment') comments++;
            else if (act.type === 'share') shares++;
          }
        }

        // Total engagement: clicks, views, likes, comments, shares
        const totalScore = clicks + views + likes + comments + shares;

        return {
          ...brand,
          totalViews: views,
          totalClicks: clicks,
          totalLikes: likes,
          totalComments: comments,
          totalShares: shares,
          totalScore,
        };
      })
    );

    // 5. Only include brands that have actual engagement (> 0) and are not dummy brands
    const finalTopBrands = engagedList.filter(
      (b) => !isDummyBrand(b) && b.totalScore > 0
    );

    // Rank by highest engagement score (descending)
    finalTopBrands.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      return a.name.localeCompare(b.name);
    });

    return finalTopBrands;
  } catch (err) {
    console.error('[BrandStore] Error calculating top engaged brands:', err);
    return [];
  }
}
