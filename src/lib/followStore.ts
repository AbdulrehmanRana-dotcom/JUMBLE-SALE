import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalBrands } from '@/lib/brandStore';
import { createNotification } from '@/lib/notificationStore';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Brand } from '@/types/database.types';

const FOLLOWS_STORAGE_KEY = '@jumble_sale_followed_brands';
const BRAND_FOLLOWERS_STORAGE_KEY = '@jumble_sale_brand_followers_';

export const DEFAULT_USER_FOLLOWS: Record<string, string[]> = {
  'usr-c2-ahmed': [
    'b1111111-1111-1111-1111-111111111111', // Khaadi
    'b2222222-2222-2222-2222-222222222222', // Outfitters
  ],
  'usr-c1-zara': [
    'b1111111-1111-1111-1111-111111111111', // Khaadi
    'b3333333-3333-3333-3333-333333333333', // Gul Ahmed
  ],
};

/**
 * Get all brand IDs currently followed by a user.
 * Supports offline local storage first with Supabase sync when available.
 */
export async function getFollowedBrandIds(userId?: string | null): Promise<string[]> {
  const safeUserId = userId || 'guest';
  let localFollowed: string[] = [];

  try {
    const raw = await AsyncStorage.getItem(`${FOLLOWS_STORAGE_KEY}_${safeUserId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        localFollowed = parsed;
      }
    }
    if (DEFAULT_USER_FOLLOWS[safeUserId]) {
      const seeds = DEFAULT_USER_FOLLOWS[safeUserId];
      const merged = Array.from(new Set([...seeds, ...localFollowed]));
      if (merged.length !== localFollowed.length) {
        localFollowed = merged;
        AsyncStorage.setItem(`${FOLLOWS_STORAGE_KEY}_${safeUserId}`, JSON.stringify(merged)).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[FollowStore] Error reading local followed brands:', err);
    localFollowed = DEFAULT_USER_FOLLOWS[safeUserId] || [];
  }

  // If Supabase live backend is configured and user is a valid UUID
  const isUserUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeUserId);
  if (isUserUUID && isSupabaseConfigured) {
    try {
      const { data, error } = await (supabase.from('follows') as any)
        .select('brand_id')
        .eq('user_id', safeUserId);

      if (!error && Array.isArray(data)) {
        const remoteIds = data.map((d: any) => d.brand_id).filter(Boolean);
        const merged = Array.from(new Set([...localFollowed, ...remoteIds]));
        await AsyncStorage.setItem(`${FOLLOWS_STORAGE_KEY}_${safeUserId}`, JSON.stringify(merged));
        return merged;
      }
    } catch (e) {
      console.warn('[FollowStore] Remote fetch notice:', e);
    }
  }

  return localFollowed;
}

/**
 * Get list of follower user IDs for a brand
 */
export async function getBrandFollowers(brandId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(`${BRAND_FOLLOWERS_STORAGE_KEY}${brandId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Check whether a user is following a specific brand
 */
export async function isBrandFollowed(brandId: string, userId?: string | null): Promise<boolean> {
  if (!brandId || !userId) return false;
  const followed = await getFollowedBrandIds(userId);
  return followed.includes(brandId);
}

/**
 * Toggle follow / unfollow for a brand (Instagram style).
 * Dispatches real notifications to both Brand and Consumer on follow.
 */
export async function toggleFollowBrand(
  brandId: string,
  userId: string,
  brandName?: string,
  userName?: string
): Promise<{ isFollowed: boolean }> {
  const safeUserId = userId || 'guest';
  const key = `${FOLLOWS_STORAGE_KEY}_${safeUserId}`;
  const followed = await getFollowedBrandIds(safeUserId);
  const isCurrentlyFollowed = followed.includes(brandId);

  let updated: string[];
  let isNowFollowed: boolean;

  if (isCurrentlyFollowed) {
    updated = followed.filter((id) => id !== brandId);
    isNowFollowed = false;
  } else {
    updated = Array.from(new Set([...followed, brandId]));
    isNowFollowed = true;
  }

  // 1. Immediately persist locally
  await AsyncStorage.setItem(key, JSON.stringify(updated));

  // Update reverse lookup (brand followers list)
  try {
    const followersKey = `${BRAND_FOLLOWERS_STORAGE_KEY}${brandId}`;
    const rawFollowers = await AsyncStorage.getItem(followersKey);
    const existingFollowers: string[] = rawFollowers ? JSON.parse(rawFollowers) : [];
    let updatedFollowers: string[];
    if (isNowFollowed) {
      updatedFollowers = Array.from(new Set([...existingFollowers, safeUserId]));
    } else {
      updatedFollowers = existingFollowers.filter((id) => id !== safeUserId);
    }
    await AsyncStorage.setItem(followersKey, JSON.stringify(updatedFollowers));
  } catch (err) {
    console.warn('[FollowStore] Brand followers update notice:', err);
  }

  // 2. Dispatch genuine notifications when followed
  if (isNowFollowed) {
    try {
      const allBrands = await getLocalBrands();
      const bObj = allBrands.find((b) => b.id === brandId);
      const resolvedBrandName = brandName || bObj?.name || 'Brand';
      const resolvedUserName = userName || 'A shopper';

      // Authentic notification to Brand: New Follower (Smart Rollup)
      await createNotification({
        role: 'brand',
        userId: brandId,
        brandId,
        category: 'brand',
        title: 'New Follower Alert! 👤',
        body: `${resolvedUserName} started following your brand.`,
        action_url: '/(brand)',
        aggregation_key: `follow_brand_${brandId}`,
        actor_name: resolvedUserName,
      });

      // Authentic notification to Consumer: Following confirmation
      await createNotification({
        role: 'consumer',
        userId: safeUserId,
        brandId,
        category: 'brand',
        title: `Following ${resolvedBrandName} 🔔`,
        body: `Aap ab ${resolvedBrandName} ko follow kar rahe hain. Inki har new promotion ka notification aapko milega.`,
        action_url: `/(consumer)/brand/${brandId}`,
      });
    } catch (notifErr) {
      console.warn('[FollowStore] Notification dispatch notice:', notifErr);
    }
  }

  // 3. Also sync to live Supabase if connected
  const isUserUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeUserId);
  const isBrandUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brandId);

  if (isUserUUID && isBrandUUID && isSupabaseConfigured) {
    try {
      if (isNowFollowed) {
        await (supabase.from('follows') as any).insert({
          user_id: safeUserId,
          brand_id: brandId,
        });
      } else {
        await (supabase.from('follows') as any)
          .delete()
          .eq('user_id', safeUserId)
          .eq('brand_id', brandId);
      }
    } catch (syncErr) {
      console.warn('[FollowStore] Supabase follows sync notice:', syncErr);
    }
  }

  return { isFollowed: isNowFollowed };
}

/**
 * Retrieve full Brand objects followed by the user
 */
export async function getFollowedBrandsList(userId?: string | null): Promise<Brand[]> {
  const followedIds = await getFollowedBrandIds(userId);
  if (!followedIds || followedIds.length === 0) return [];

  const allBrands = await getLocalBrands();
  return allBrands.filter((b) => followedIds.includes(b.id));
}
