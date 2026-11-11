import AsyncStorage from '@react-native-async-storage/async-storage';
import { interactionLogger } from '@/lib/interactionLogger';
import { createNotification } from '@/lib/notificationStore';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  callServerGetInteractions,
  callServerToggleLike,
  callServerGetComments,
  callServerAddComment,
} from '@/lib/serverApi';
import type { Deal } from '@/types/database.types';

export const SEED_ENGAGEMENT_MAP: Record<string, { likes: number; comments: number }> = {
  'd1111111-1111-1111-1111-111111111111': { likes: 124, comments: 18 },
  'd1111111-1111-1111-1111-222222222222': { likes: 89, comments: 14 },
  'd1111111-1111-1111-1111-333333333333': { likes: 45, comments: 6 },
  'd2222222-2222-2222-2222-111111111111': { likes: 142, comments: 26 },
  'd3333333-3333-3333-3333-111111111111': { likes: 64, comments: 9 },
  'd4444444-4444-4444-4444-111111111111': { likes: 96, comments: 15 },
  'd5555555-5555-5555-5555-111111111111': { likes: 185, comments: 34 },
  'd6666666-6666-6666-6666-111111111111': { likes: 210, comments: 42 },
  'd7777777-7777-7777-7777-111111111111': { likes: 75, comments: 11 },
  'd8888888-8888-8888-8888-111111111111': { likes: 110, comments: 19 },
  'd9999999-9999-9999-9999-111111111111': { likes: 52, comments: 7 },
};

export interface CommentItem {
  id: string;
  deal_id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string | null;
  text: string;
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  type: 'like' | 'comment' | 'share';
  deal_id: string;
  deal_title: string;
  brand_id?: string;
  brand_name?: string;
  user_id: string;
  user_name: string;
  details?: string;
  created_at: string;
}

const COMMENTS_STORAGE_KEY = '@jumble_sale_comments';
const LIKES_STORAGE_KEY = '@jumble_sale_likes';
const SAVED_STORAGE_KEY = '@jumble_sale_saved';
const SHARES_STORAGE_KEY = '@jumble_sale_shares';
const DEAL_LIKES_COUNT_KEY = '@jumble_sale_deal_likes_count';
const RECENT_VIEWED_KEY = '@jumble_sale_recent_viewed_deals';
const ACTIVITIES_STORAGE_KEY = '@jumble_sale_activities';

const INITIAL_ACTIVITIES: ActivityEvent[] = [];

export function sanitizeReviewerName(rawName?: string | null): string {
  let name = (rawName || '').trim();
  if (!name || name.toLowerCase() === 'shopper') {
    return 'Customer';
  }

  // Strip email domain if present (e.g. user@gmail.com -> user)
  if (name.includes('@')) {
    name = name.split('@')[0].trim();
  }

  // If format is like "first.last" or "first_last" (e.g. zara.khan -> Zara Khan)
  if (name.includes('.') || name.includes('_')) {
    const parts = name.split(/[._]/).filter(Boolean);
    if (parts.length > 0) {
      return parts
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
    }
  }

  // If handle contains trailing digits (e.g. lilolam582 -> Lilolam)
  if (/^[a-zA-Z]+[0-9]+$/.test(name)) {
    const letters = name.replace(/[0-9]/g, '');
    if (letters.length >= 3) {
      return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
    }
  }

  // Capitalize first letter if lowercase single word
  if (name.length > 0 && /^[a-z]/.test(name)) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  return name;
}

// ─── COMMENTS ────────────────────────────────────────────────────────
export async function getDealComments(dealId: string): Promise<CommentItem[]> {
  try {
    // 0. Try Node.js Backend Server API first
    try {
      const serverComments = await callServerGetComments(dealId);
      if (serverComments && serverComments.length > 0) {
        return serverComments;
      }
    } catch {}

    let rawList: any[] = [];

    // 1. Fetch from Supabase comments table only if live backend configured
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await (supabase.from('comments') as any)
          .select('*')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
          rawList = data;
        }
      } catch {
        // ignore
      }
    }

    if (rawList.length === 0) {
      // 2. Local AsyncStorage fallback (offline safety)
      const raw = await AsyncStorage.getItem(COMMENTS_STORAGE_KEY);
      if (raw) {
        const all: CommentItem[] = JSON.parse(raw);
        rawList = Array.isArray(all)
          ? all.filter((c) => !['comm-1', 'comm-2', 'comm-3'].includes(c.id) && c.deal_id === dealId)
          : [];
      }
    }

    // Resolve user's actual registered / display name if comment author is generic 'Shopper'
    let fallbackUserName: string | null = null;
    try {
      const storedName = await AsyncStorage.getItem('@user_display_name');
      if (storedName && storedName.trim() && storedName.trim().toLowerCase() !== 'shopper') {
        fallbackUserName = sanitizeReviewerName(storedName.trim());
      } else if (isSupabaseConfigured) {
        const { data: authData } = await supabase.auth.getUser();
        const u = authData?.user;
        if (u) {
          const metaName =
            u.user_metadata?.display_name ||
            u.user_metadata?.full_name ||
            u.user_metadata?.name ||
            (u.email ? u.email.split('@')[0] : null);
          if (metaName && metaName.trim()) {
            fallbackUserName = sanitizeReviewerName(metaName.trim());
          }
        }
      }
    } catch {
      // ignore
    }

    let changed = false;
    const sanitizedComments: CommentItem[] = rawList.map((c: any) => {
      let currentName = c.user_name || '';
      if (!currentName || currentName.toLowerCase() === 'shopper') {
        if (fallbackUserName) {
          currentName = fallbackUserName;
          changed = true;
        }
      }
      const cleanName = sanitizeReviewerName(currentName);
      if (cleanName !== c.user_name) {
        changed = true;
      }
      return {
        id: c.id,
        deal_id: c.deal_id,
        user_id: c.user_id || 'customer',
        user_name: cleanName,
        user_avatar: c.user_avatar || null,
        text: c.text || c.content || '',
        created_at: c.created_at || new Date().toISOString(),
      };
    });

    if (changed || sanitizedComments.length !== rawList.length) {
      await AsyncStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(sanitizedComments));
    }

    return sanitizedComments.filter((c) => c.deal_id === dealId);
  } catch {
    return [];
  }
}

export async function addDealComment(
  dealId: string,
  userId: string,
  userName: string,
  text: string,
  dealTitle: string = 'Promotion',
  brandId?: string
): Promise<CommentItem> {
  const safeUserName = sanitizeReviewerName(userName);

  // 0. Try Node.js Backend Server API first
  try {
    const serverRes = await callServerAddComment(dealId, userId, safeUserName, text);
    if (serverRes?.comment) {
      await recordActivityEvent({
        id: `act-${Date.now()}`,
        type: 'comment',
        deal_id: dealId,
        deal_title: dealTitle,
        brand_id: brandId,
        user_id: userId,
        user_name: safeUserName,
        details: text.trim(),
        created_at: serverRes.comment.created_at || new Date().toISOString(),
      });
      return serverRes.comment;
    }
  } catch {}

  const isUUID = (val?: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val || '');

  let newComm: CommentItem = {
    id: `comm-${Date.now()}`,
    deal_id: dealId,
    user_id: userId,
    user_name: safeUserName,
    text: text.trim(),
    created_at: new Date().toISOString(),
  };

  try {
    // Attempt Supabase insert
    const payload: any = {
      deal_id: dealId,
      user_name: safeUserName,
      text: text.trim(),
    };
    if (isUUID(userId)) {
      payload.user_id = userId;
    }

    const { data, error } = await (supabase.from('comments') as any)
      .insert(payload)
      .select()
      .maybeSingle();

    if (!error && data) {
      newComm = {
        id: data.id,
        deal_id: data.deal_id,
        user_id: data.user_id || userId,
        user_name: sanitizeReviewerName(data.user_name || safeUserName),
        user_avatar: data.user_avatar || null,
        text: data.text || text.trim(),
        created_at: data.created_at || newComm.created_at,
      };
    }

    // Cache locally in AsyncStorage
    const raw = await AsyncStorage.getItem(COMMENTS_STORAGE_KEY);
    const all: CommentItem[] = raw ? JSON.parse(raw) : [];
    all.unshift(newComm);
    await AsyncStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(all));

    // Record activity
    await recordActivityEvent({
      id: `act-${Date.now()}`,
      type: 'comment',
      deal_id: dealId,
      deal_title: dealTitle,
      brand_id: brandId,
      user_id: userId,
      user_name: safeUserName,
      details: text.trim(),
      created_at: newComm.created_at,
    });

    // Authentic Notification to Brand for real review/comment (Smart Rollup)
    if (brandId) {
      try {
        await createNotification({
          role: 'brand',
          userId: brandId,
          brandId,
          dealId,
          category: 'deal',
          title: `New Review on "${dealTitle}" 💬`,
          body: `${safeUserName}: "${text.trim().substring(0, 60)}"`,
          action_url: '/(brand)/posts',
          aggregation_key: `comment_deal_${dealId}`,
          actor_name: safeUserName,
        });
      } catch (err) {
        console.warn('[ActivityStore] Comment notification notice:', err);
      }
    }
  } catch (err) {
    console.error('[ActivityStore] Error saving comment:', err);
  }

  return newComm;
}

// ─── LIKES ───────────────────────────────────────────────────────────
export async function getLikedDealIds(userId?: string | null): Promise<string[]> {
  const safeUserId = userId || 'guest';
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeUserId);

  let localLikes: string[] = [];
  try {
    const raw = await AsyncStorage.getItem(`${LIKES_STORAGE_KEY}_${safeUserId}`);
    localLikes = raw ? JSON.parse(raw) : [];
  } catch {
    localLikes = [];
  }

  // Also merge guest likes if user is logged in
  if (safeUserId !== 'guest') {
    try {
      const guestRaw = await AsyncStorage.getItem(`${LIKES_STORAGE_KEY}_guest`);
      const guestLikes: string[] = guestRaw ? JSON.parse(guestRaw) : [];
      if (guestLikes.length > 0) {
        localLikes = Array.from(new Set([...localLikes, ...guestLikes]));
      }
    } catch {
      // ignore
    }
  }

  if (isUUID && isSupabaseConfigured) {
    try {
      const { data, error } = await (supabase.from('likes') as any)
        .select('deal_id')
        .eq('user_id', safeUserId);

      if (!error && Array.isArray(data)) {
        const remoteIds = data.map((d: any) => d.deal_id);
        const merged = Array.from(new Set([...localLikes, ...remoteIds]));
        await AsyncStorage.setItem(`${LIKES_STORAGE_KEY}_${safeUserId}`, JSON.stringify(merged));
        return merged;
      }
    } catch {
      // ignore
    }
  }

  return localLikes;
}

export async function toggleDealLike(
  dealId: string,
  userId: string = 'guest',
  userName: string = 'Shopper',
  dealTitle: string = 'Promotion',
  brandId?: string
): Promise<{ isLiked: boolean; count: number }> {
  try {
    const safeUserId = userId || 'guest';

    // 1. Try Node.js Backend Server API first
    try {
      const serverRes = await callServerToggleLike(dealId, safeUserId, userName);
      if (serverRes) {
        const userKey = `${LIKES_STORAGE_KEY}_${safeUserId}`;
        const liked = await getLikedDealIds(safeUserId);
        const updated = serverRes.isLiked
          ? Array.from(new Set([...liked, dealId]))
          : liked.filter((id) => id !== dealId);
        await AsyncStorage.setItem(userKey, JSON.stringify(updated));
        const countKey = `${DEAL_LIKES_COUNT_KEY}_${dealId}`;
        await AsyncStorage.setItem(countKey, serverRes.likesCount.toString());
        return { isLiked: serverRes.isLiked, count: serverRes.likesCount };
      }
    } catch {}

    const isUserUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeUserId);
    const isDealUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);

    const userKey = `${LIKES_STORAGE_KEY}_${safeUserId}`;
    const liked = await getLikedDealIds(safeUserId);
    const isCurrentlyLiked = liked.includes(dealId);

    let updated: string[];
    let isNowLiked: boolean;

    if (isCurrentlyLiked) {
      updated = liked.filter((id) => id !== dealId);
      isNowLiked = false;

      if (isUserUUID && isDealUUID) {
        try {
          await (supabase.from('likes') as any)
            .delete()
            .eq('user_id', safeUserId)
            .eq('deal_id', dealId);
        } catch {
          // ignore
        }
      }
    } else {
      updated = Array.from(new Set([...liked, dealId]));
      isNowLiked = true;

      if (isDealUUID) {
        try {
          if (isUserUUID) {
            await (supabase.from('likes') as any)
              .insert({ user_id: safeUserId, deal_id: dealId });
          }

          await (supabase.from('interactions') as any).insert({
            user_id: isUserUUID ? safeUserId : null,
            deal_id: dealId,
            type: 'like',
          });
        } catch {
          // ignore
        }
      }

      // Log like activity
      await recordActivityEvent({
        id: `act-${Date.now()}`,
        type: 'like',
        deal_id: dealId,
        deal_title: dealTitle,
        brand_id: brandId,
        user_id: safeUserId,
        user_name: userName,
        created_at: new Date().toISOString(),
      });

      // Authentic Notification to Brand for real like (Smart Rollup)
      if (brandId) {
        try {
          await createNotification({
            role: 'brand',
            userId: brandId,
            brandId,
            dealId,
            category: 'deal',
            title: 'New Like on Your Promotion! ❤️',
            body: `${userName || 'A shopper'} ne aapki promotion "${dealTitle}" ko like kiya hai.`,
            action_url: '/(brand)/posts',
            aggregation_key: `like_deal_${dealId}`,
            actor_name: userName || 'A shopper',
          });
        } catch (err) {
          console.warn('[ActivityStore] Like notification notice:', err);
        }
      }
    }

    await AsyncStorage.setItem(userKey, JSON.stringify(updated));
    const newCount = await getDealLikesCount(dealId);

    return { isLiked: isNowLiked, count: newCount };
  } catch (err) {
    console.error('[ActivityStore] Toggle like error:', err);
    return { isLiked: false, count: 0 };
  }
}

// ─── SAVED DEALS ─────────────────────────────────────────────────────
export const DEFAULT_USER_SAVED_DEALS: Record<string, string[]> = {
  'usr-c2-ahmed': ['d1111111-1111-1111-1111-222222222222'], // Buy 1 Get 1 Free Ready-to-Wear Kurtis
  'usr-c1-zara': ['d1111111-1111-1111-1111-111111111111'], // Flat 50% Off Summer Lawn Sale
};

export async function getSavedDealIds(userId?: string | null): Promise<string[]> {
  const safeUserId = userId || 'guest';
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeUserId);

  let localSaved: string[] = [];
  try {
    const raw = await AsyncStorage.getItem(`${SAVED_STORAGE_KEY}_${safeUserId}`);
    localSaved = raw ? JSON.parse(raw) : [];
    if (DEFAULT_USER_SAVED_DEALS[safeUserId]) {
      const seeds = DEFAULT_USER_SAVED_DEALS[safeUserId];
      const merged = Array.from(new Set([...seeds, ...localSaved]));
      if (merged.length !== localSaved.length) {
        localSaved = merged;
        AsyncStorage.setItem(`${SAVED_STORAGE_KEY}_${safeUserId}`, JSON.stringify(merged)).catch(() => {});
      }
    }
  } catch {
    localSaved = DEFAULT_USER_SAVED_DEALS[safeUserId] || [];
  }

  if (safeUserId !== 'guest') {
    try {
      const guestRaw = await AsyncStorage.getItem(`${SAVED_STORAGE_KEY}_guest`);
      const guestSaved: string[] = guestRaw ? JSON.parse(guestRaw) : [];
      if (guestSaved.length > 0) {
        localSaved = Array.from(new Set([...localSaved, ...guestSaved]));
        // Migrate guest items into user account & clear guest cache
        await AsyncStorage.setItem(`${SAVED_STORAGE_KEY}_${safeUserId}`, JSON.stringify(localSaved));
        await AsyncStorage.removeItem(`${SAVED_STORAGE_KEY}_guest`);
      }
    } catch {
      // ignore
    }
  }

  if (isUUID && isSupabaseConfigured) {
    try {
      const { data, error } = await (supabase.from('saved_deals') as any)
        .select('deal_id')
        .eq('user_id', safeUserId);

      if (!error && Array.isArray(data)) {
        const remoteIds = data.map((d: any) => d.deal_id);
        const merged = Array.from(new Set([...localSaved, ...remoteIds]));
        await AsyncStorage.setItem(`${SAVED_STORAGE_KEY}_${safeUserId}`, JSON.stringify(merged));
        return merged;
      }
    } catch {
      // ignore
    }
  }

  return localSaved;
}

export async function toggleDealSave(
  dealId: string,
  userId: string = 'guest'
): Promise<{ isSaved: boolean }> {
  try {
    const safeUserId = userId || 'guest';
    const isUserUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeUserId);
    const isDealUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);

    const key = `${SAVED_STORAGE_KEY}_${safeUserId}`;
    const saved = await getSavedDealIds(safeUserId);
    const isCurrentlySaved = saved.includes(dealId);

    let updated: string[];
    let isNowSaved: boolean;

    if (isCurrentlySaved) {
      updated = saved.filter((id) => id !== dealId);
      isNowSaved = false;

      // Also clean from guest if logged in
      if (safeUserId !== 'guest') {
        try {
          const guestRaw = await AsyncStorage.getItem(`${SAVED_STORAGE_KEY}_guest`);
          if (guestRaw) {
            const guestArr = JSON.parse(guestRaw).filter((id: string) => id !== dealId);
            await AsyncStorage.setItem(`${SAVED_STORAGE_KEY}_guest`, JSON.stringify(guestArr));
          }
        } catch {}
      }

      if (isUserUUID && isDealUUID) {
        try {
          await (supabase.from('saved_deals') as any)
            .delete()
            .eq('user_id', safeUserId)
            .eq('deal_id', dealId);
        } catch {
          // ignore
        }
      }
    } else {
      updated = Array.from(new Set([...saved, dealId]));
      isNowSaved = true;

      if (isUserUUID && isDealUUID) {
        try {
          await (supabase.from('saved_deals') as any)
            .insert({ user_id: safeUserId, deal_id: dealId });

          await (supabase.from('interactions') as any).insert({
            user_id: safeUserId,
            deal_id: dealId,
            type: 'save',
          });
        } catch {
          // ignore
        }
      }
    }

    await AsyncStorage.setItem(key, JSON.stringify(updated));
    return { isSaved: isNowSaved };
  } catch (err) {
    console.error('[ActivityStore] Toggle save error:', err);
    return { isSaved: false };
  }
}

export async function getSavedDealsList(userId?: string | null): Promise<Deal[]> {
  try {
    const savedIds = await getSavedDealIds(userId);
    if (!savedIds || savedIds.length === 0) {
      return [];
    }

    const { getLocalBrandDeals } = await import('@/lib/dealStore');
    const localDeals = await getLocalBrandDeals();
    const { getLocalBrands } = await import('@/lib/brandStore');
    const localBrands = await getLocalBrands();

    let remoteDeals: Deal[] = [];
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('deals')
          .select('*, brand:brands(*), category:categories(*)')
          .in('id', savedIds);

        if (!error && Array.isArray(data)) {
          remoteDeals = data as Deal[];
        }
      } catch (err) {
        console.warn('[ActivityStore] Remote saved deals fetch notice:', err);
      }
    }

    const dealsMap = new Map<string, Deal>();

    // Add local matches first
    for (const d of localDeals) {
      if (savedIds.includes(d.id)) {
        const brandMatch =
          (d as any).brand ||
          localBrands.find((b) => b.id === d.brand_id) ||
          localBrands[0] || {
            id: d.brand_id,
            name: (d as any).brand_name || 'Khaadi',
            category: 'Fashion & Apparel',
            logo_url: 'https://images.unsplash.com/photo-1544441893-675973e31985',
          };
        dealsMap.set(d.id, { ...d, brand: brandMatch });
      }
    }

    // Add remote matches (overwriting or supplementing)
    for (const rd of remoteDeals) {
      dealsMap.set(rd.id, rd);
    }

    // Return in order of savedIds (most recent first)
    const result: Deal[] = [];
    for (const id of savedIds) {
      const match = dealsMap.get(id);
      if (match) {
        result.push(match);
      }
    }

    return result;
  } catch (err) {
    console.error('[ActivityStore] getSavedDealsList error:', err);
    return [];
  }
}

export async function getDealLikesCount(dealId: string): Promise<number> {
  // 1. Try Node.js Backend Server API first
  try {
    const serverInteractions = await callServerGetInteractions(dealId);
    if (serverInteractions && typeof serverInteractions.likes_count === 'number') {
      return serverInteractions.likes_count;
    }
  } catch {}

  const seed = SEED_ENGAGEMENT_MAP[dealId];
  const seedLikes = seed ? seed.likes : 0;

  const isDealUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);
  let baseCount = seedLikes;

  if (isDealUUID && isSupabaseConfigured) {
    try {
      const { count, error } = await (supabase.from('likes') as any)
        .select('*', { count: 'exact', head: true })
        .eq('deal_id', dealId);

      if (!error && typeof count === 'number' && count > 0) {
        baseCount = Math.max(seedLikes, count);
      }
    } catch {
      // ignore
    }
  }

  // Count distinct users who actually have this dealId in their liked list
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const likeKeys = allKeys.filter((k) => k.startsWith(LIKES_STORAGE_KEY));
    let distinctUsersCount = 0;

    for (const k of likeKeys) {
      try {
        const raw = await AsyncStorage.getItem(k);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list) && list.includes(dealId)) {
            distinctUsersCount++;
          }
        }
      } catch {
        // ignore
      }
    }

    const finalCount = baseCount + distinctUsersCount;
    // Overwrite the single-deal cache so stale numbers are cleaned
    const countKey = `${DEAL_LIKES_COUNT_KEY}_${dealId}`;
    await AsyncStorage.setItem(countKey, finalCount.toString());
    return finalCount;
  } catch {
    // ignore
  }

  return baseCount;
}

export async function getDealCommentsCount(dealId: string): Promise<number> {
  // 1. Try Node.js Backend Server API first
  try {
    const serverInteractions = await callServerGetInteractions(dealId);
    if (serverInteractions && typeof serverInteractions.comments_count === 'number') {
      return serverInteractions.comments_count;
    }
  } catch {}

  const seed = SEED_ENGAGEMENT_MAP[dealId];
  const seedComments = seed ? seed.comments : 0;

  try {
    const comments = await getDealComments(dealId);
    return seedComments + comments.length;
  } catch {
    return seedComments;
  }
}

export async function getDealSharesCount(dealId: string): Promise<number> {
  try {
    const key = `${SHARES_STORAGE_KEY}_${dealId}`;
    const raw = await AsyncStorage.getItem(key);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function getDealInteractions(dealId: string): Promise<{ likes: number; comments: number; shares: number }> {
  const [likes, comments, shares] = await Promise.all([
    getDealLikesCount(dealId),
    getDealCommentsCount(dealId),
    getDealSharesCount(dealId),
  ]);
  return { likes, comments, shares };
}

// ─── SHARES ──────────────────────────────────────────────────────────
export async function recordDealShare(
  dealId: string,
  userId: string,
  userName: string = 'Shopper',
  dealTitle: string = 'Promotion',
  brandId?: string,
  platform: string = 'Direct Link'
): Promise<number> {
  try {
    const key = `${SHARES_STORAGE_KEY}_${dealId}`;
    const raw = await AsyncStorage.getItem(key);
    const count = (raw ? parseInt(raw, 10) : 0) + 1;
    await AsyncStorage.setItem(key, count.toString());

    await recordActivityEvent({
      id: `act-${Date.now()}`,
      type: 'share',
      deal_id: dealId,
      deal_title: dealTitle,
      brand_id: brandId,
      user_id: userId,
      user_name: userName,
      details: `Shared via ${platform}`,
      created_at: new Date().toISOString(),
    });

    if (dealId) {
      interactionLogger.logInteraction(dealId, 'share', userId);
    }

    return count;
  } catch {
    return 1;
  }
}

// ─── ACTIVITIES ──────────────────────────────────────────────────────
export async function recordActivityEvent(event: ActivityEvent): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVITIES_STORAGE_KEY);
    const all: ActivityEvent[] = raw ? JSON.parse(raw) : INITIAL_ACTIVITIES;

    // Strict 1 Like Per (User, Deal) rule:
    // If user already liked this deal, remove previous like activity so count is not inflated
    let filtered = all;
    if (event.type === 'like') {
      filtered = all.filter(
        (a) =>
          !(
            a.type === 'like' &&
            (a.deal_id === event.deal_id || a.deal_title?.toLowerCase() === event.deal_title?.toLowerCase()) &&
            (a.user_id === event.user_id || a.user_name?.toLowerCase() === event.user_name?.toLowerCase())
          )
      );
    }

    filtered.unshift(event);
    await AsyncStorage.setItem(ACTIVITIES_STORAGE_KEY, JSON.stringify(filtered.slice(0, 100)));
  } catch (e) {
    console.error('[ActivityStore] Error recording activity:', e);
  }
}

export async function getAllActivities(): Promise<ActivityEvent[]> {
  const merged: ActivityEvent[] = [];

  // 1. Fetch from Local AsyncStorage
  try {
    const raw = await AsyncStorage.getItem(ACTIVITIES_STORAGE_KEY);
    if (raw) {
      const all: ActivityEvent[] = JSON.parse(raw);
      const clean = Array.isArray(all)
        ? all.filter((a) => !['act-1', 'act-2', 'act-3'].includes(a.id))
        : [];
      merged.push(...clean);
    }
  } catch {
    // ignore
  }

  if (!isSupabaseConfigured) {
    return merged;
  }

  // 2. Query Live Supabase Comments Table
  try {
    const { data: dbComments, error: commErr } = await (supabase.from('comments') as any)
      .select('id, text, deal_id, user_id, user_name, created_at, deal:deals(title, brand_id, brand:brands(name))')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!commErr && Array.isArray(dbComments)) {
      for (const c of dbComments) {
        const actId = `db-comm-${c.id}`;
        if (!merged.some((m) => m.id === actId || m.id === c.id)) {
          merged.push({
            id: actId,
            type: 'comment',
            deal_id: c.deal_id,
            deal_title: c.deal?.title || 'Promotion Deal',
            brand_id: c.deal?.brand_id,
            brand_name: c.deal?.brand?.name || 'Brand Partner',
            user_id: c.user_id,
            user_name: sanitizeReviewerName(c.user_name || 'Shopper'),
            details: c.text,
            created_at: c.created_at || new Date().toISOString(),
          });
        }
      }
    }
  } catch (err) {
    console.warn('[ActivityStore] DB comments activity note:', err);
  }

  // 3. Query Live Supabase Likes Table
  try {
    const { data: dbLikes, error: likeErr } = await (supabase.from('likes') as any)
      .select('id, deal_id, user_id, created_at, deal:deals(title, brand_id, brand:brands(name)), profile:profiles(display_name)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!likeErr && Array.isArray(dbLikes)) {
      for (const l of dbLikes) {
        const actId = `db-like-${l.id || l.deal_id + '-' + l.user_id}`;
        if (!merged.some((m) => m.id === actId)) {
          merged.push({
            id: actId,
            type: 'like',
            deal_id: l.deal_id,
            deal_title: l.deal?.title || 'Promotion Deal',
            brand_id: l.deal?.brand_id,
            brand_name: l.deal?.brand?.name || 'Brand Partner',
            user_id: l.user_id,
            user_name: sanitizeReviewerName(l.profile?.display_name || 'Shopper'),
            details: 'Liked this promotion',
            created_at: l.created_at || new Date().toISOString(),
          });
        }
      }
    }
  } catch (err) {
    console.warn('[ActivityStore] DB likes activity note:', err);
  }

  // 4. Query Live Supabase Interactions Table (shares, views)
  try {
    const { data: dbInteractions, error: intErr } = await (supabase.from('interactions') as any)
      .select('id, type, deal_id, user_id, created_at, deal:deals(title, brand_id, brand:brands(name)), profile:profiles(display_name)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (!intErr && Array.isArray(dbInteractions)) {
      for (const inact of dbInteractions) {
        const actId = `db-int-${inact.id}`;
        if (!merged.some((m) => m.id === actId)) {
          const iType: 'like' | 'comment' | 'share' =
            inact.type === 'comment'
              ? 'comment'
              : inact.type === 'share'
              ? 'share'
              : 'like';

          merged.push({
            id: actId,
            type: iType,
            deal_id: inact.deal_id,
            deal_title: inact.deal?.title || 'Promotion Deal',
            brand_id: inact.deal?.brand_id,
            brand_name: inact.deal?.brand?.name || 'Brand Partner',
            user_id: inact.user_id,
            user_name: sanitizeReviewerName(inact.profile?.display_name || 'Shopper'),
            details: inact.type === 'share' ? 'Shared this promotion' : `Interacted with deal`,
            created_at: inact.created_at || new Date().toISOString(),
          });
        }
      }
    }
  } catch (err) {
    console.warn('[ActivityStore] DB interactions note:', err);
  }

  // 5. Strict Database & Integrity Deduplication:
  //    A user can only have 1 active like per deal!
  const deduplicated: ActivityEvent[] = [];
  const seenUserDealLikes = new Set<string>();

  for (const act of merged) {
    if (act.type === 'like') {
      const userKey = (act.user_id || act.user_name || '').trim().toLowerCase();
      const dealKey = (act.deal_id || act.deal_title || '').trim().toLowerCase();
      const pair = `${userKey}::${dealKey}`;
      if (seenUserDealLikes.has(pair)) {
        continue; // Drop duplicate likes by the same user on the same deal
      }
      seenUserDealLikes.add(pair);
    }
    deduplicated.push(act);
  }

  // Sort latest first
  deduplicated.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Save back purged array so storage is permanently cleaned
  try {
    await AsyncStorage.setItem(ACTIVITIES_STORAGE_KEY, JSON.stringify(deduplicated.slice(0, 100)));
  } catch {
    // ignore
  }

  return deduplicated;
}

export async function getBrandActivities(brandId?: string): Promise<ActivityEvent[]> {
  const all = await getAllActivities();
  if (!brandId) return all;
  return all.filter((a) => a.brand_id === brandId || !a.brand_id);
}

// ─── RECENTLY VIEWED DEALS ───────────────────────────────────────────
export interface RecentlyViewedDeal {
  id: string;
  title: string;
  price?: number | string | null;
  original_price?: number | string | null;
  discount_pct?: number;
  image_url?: string | null;
  brand_name?: string;
  brand_logo?: string | null;
  viewed_at: string;
}

export async function recordDealView(deal: {
  id: string;
  title: string;
  price?: number | string | null;
  original_price?: number | string | null;
  discount_pct?: number;
  image_urls?: string[];
  image_url?: string | null;
  brand?: { name?: string; logo_url?: string | null };
  brand_name?: string;
  brand_logo?: string | null;
}): Promise<void> {
  if (!deal?.id) return;
  try {
    const raw = await AsyncStorage.getItem(RECENT_VIEWED_KEY);
    const existing: RecentlyViewedDeal[] = raw ? JSON.parse(raw) : [];

    const newEntry: RecentlyViewedDeal = {
      id: deal.id,
      title: deal.title,
      price: deal.price,
      original_price: deal.original_price,
      discount_pct: deal.discount_pct,
      image_url: deal.image_url || deal.image_urls?.[0] || null,
      brand_name: deal.brand?.name || deal.brand_name || 'Khaadi',
      brand_logo: deal.brand?.logo_url || deal.brand_logo || null,
      viewed_at: new Date().toISOString(),
    };

    // Filter out previous entry of the same deal, insert new at beginning, keep up to 20
    const filtered = existing.filter((d) => d.id !== deal.id);
    filtered.unshift(newEntry);
    const capped = filtered.slice(0, 20);

    await AsyncStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(capped));
  } catch (err) {
    console.warn('[ActivityStore] Error recording deal view:', err);
  }
}

export async function getRecentlyViewedDeals(): Promise<RecentlyViewedDeal[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_VIEWED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter out dummy IDs
        const clean = parsed.filter((d) => !['rd-1', 'rd-2', 'rd-3', 'rd-4'].includes(d.id));
        return clean;
      }
    }
    return [];
  } catch {
    return [];
  }
}

export async function clearRecentlyViewedDeals(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENT_VIEWED_KEY);
  } catch (err) {
    console.warn('[ActivityStore] Error clearing viewed deals:', err);
  }
}

export async function deleteRecentlyViewedDeal(dealId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_VIEWED_KEY);
    if (!raw) return;
    const existing: RecentlyViewedDeal[] = JSON.parse(raw);
    const filtered = existing.filter((d) => d.id !== dealId);
    await AsyncStorage.setItem(RECENT_VIEWED_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('[ActivityStore] Error deleting viewed deal:', err);
  }
}
