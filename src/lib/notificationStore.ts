import AsyncStorage from '@react-native-async-storage/async-storage';
import { emitInFlightNotification } from '@/lib/inFlightEvents';
import {
  evaluateDeliveryChannels,
  getNotificationSettings,
} from '@/lib/notificationSettingsStore';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Deal } from '@/types/database.types';

export type NotificationRole = 'consumer' | 'brand' | 'admin';

export type NotificationCategory =
  | 'deal'
  | 'brand'
  | 'order'
  | 'system'
  | 'milestone'
  | 'moderation'
  | 'report';

export interface AppNotification {
  id: string;
  user_id: string;
  role: NotificationRole;
  category: NotificationCategory;
  title: string;
  body: string;
  deal_id?: string | null;
  brand_id?: string | null;
  order_id?: string | null;
  action_url?: string | null;
  is_read: boolean;
  created_at: string;
  // Social media smart rollup fields
  aggregation_key?: string | null;
  actor_name?: string | null;
  actors?: string[];
  actor_count?: number;
}

// v3 prefix ensures all previous dummy/mock seed notifications are cleared
const STORAGE_PREFIX = '@jumble_sale_notifications_v3_';

function getStorageKey(role: NotificationRole, userId?: string | null): string {
  const safeId = userId || 'default';
  return `${STORAGE_PREFIX}${role}_${safeId}`;
}

/**
 * Fetch all authentic notifications for a specific user and role.
 * Starts with an empty list - notifications are ONLY created when genuine events happen.
 */
export async function getNotifications(
  role: NotificationRole,
  userId?: string | null
): Promise<AppNotification[]> {
  const storageKey = getStorageKey(role, userId);
  let localList: AppNotification[] = [];

  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        localList = parsed;
      }
    }
  } catch (err) {
    console.warn('[NotificationStore] Local read error:', err);
    localList = [];
  }

  // Cross-key fallback merge for brand / admin / guest
  try {
    if (role === 'brand' && userId && userId !== 'default') {
      const defaultRaw = await AsyncStorage.getItem(`${STORAGE_PREFIX}brand_default`);
      if (defaultRaw) {
        const extra: AppNotification[] = JSON.parse(defaultRaw);
        if (Array.isArray(extra) && extra.length > 0) {
          const map = new Map<string, AppNotification>();
          for (const item of [...localList, ...extra]) {
            map.set(item.id, item);
          }
          localList = Array.from(map.values());
        }
      }
    } else if (role === 'admin') {
      const extraRaw = await AsyncStorage.getItem(`${STORAGE_PREFIX}admin_default`);
      if (extraRaw) {
        const extra: AppNotification[] = JSON.parse(extraRaw);
        if (Array.isArray(extra) && extra.length > 0) {
          const map = new Map<string, AppNotification>();
          for (const item of [...localList, ...extra]) {
            map.set(item.id, item);
          }
          localList = Array.from(map.values());
        }
      }
    }
  } catch {}

  // Attempt Supabase sync if live backend configured
  if (isSupabaseConfigured && userId && /^[0-9a-f-]{36}$/i.test(userId)) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 1500)
      );
      const queryPromise = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      const res: any = await Promise.race([queryPromise, timeoutPromise]);
      if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
        const remoteList: AppNotification[] = res.data.map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          role,
          category: (r.deal_id ? 'deal' : 'system') as NotificationCategory,
          title: r.title,
          body: r.body,
          deal_id: r.deal_id,
          brand_id: null,
          action_url: r.deal_id ? `/(consumer)/deal/${r.deal_id}` : null,
          is_read: r.is_read,
          created_at: r.created_at,
        }));

        // Merge remote and local without duplicate IDs
        const mergedMap = new Map<string, AppNotification>();
        for (const item of [...localList, ...remoteList]) {
          mergedMap.set(item.id, item);
        }
        const merged = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
        return merged;
      }
    } catch (err) {
      console.warn('[NotificationStore] Remote fetch notice:', err);
    }
  }

  return localList.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Get count of unread notifications for a user/role
 */
export async function getUnreadNotificationCount(
  role: NotificationRole,
  userId?: string | null
): Promise<number> {
  const list = await getNotifications(role, userId);
  return list.filter((n) => !n.is_read).length;
}

/**
 * Mark a single notification as read
 */
export async function markNotificationAsRead(
  notificationId: string,
  role: NotificationRole,
  userId?: string | null
): Promise<void> {
  const storageKey = getStorageKey(role, userId);
  const list = await getNotifications(role, userId);
  const updated = list.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n));
  await AsyncStorage.setItem(storageKey, JSON.stringify(updated));

  // Also update default key if brand or admin
  if (role === 'brand') {
    try {
      const defKey = `${STORAGE_PREFIX}brand_default`;
      const raw = await AsyncStorage.getItem(defKey);
      if (raw) {
        const arr: AppNotification[] = JSON.parse(raw);
        await AsyncStorage.setItem(
          defKey,
          JSON.stringify(arr.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)))
        );
      }
    } catch {}
  } else if (role === 'admin') {
    try {
      const defKey = `${STORAGE_PREFIX}admin_default`;
      const raw = await AsyncStorage.getItem(defKey);
      if (raw) {
        const arr: AppNotification[] = JSON.parse(raw);
        await AsyncStorage.setItem(
          defKey,
          JSON.stringify(arr.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)))
        );
      }
    } catch {}
  }

  if (isSupabaseConfigured && /^[0-9a-f-]{36}$/i.test(notificationId)) {
    try {
      await (supabase.from('notifications') as any)
        .update({ is_read: true })
        .eq('id', notificationId);
    } catch {}
  }
}

/**
 * Mark all notifications as read for a user/role
 */
export async function markAllNotificationsAsRead(
  role: NotificationRole,
  userId?: string | null
): Promise<void> {
  const storageKey = getStorageKey(role, userId);
  const list = await getNotifications(role, userId);
  const updated = list.map((n) => ({ ...n, is_read: true }));
  await AsyncStorage.setItem(storageKey, JSON.stringify(updated));

  if (role === 'brand') {
    try {
      const defKey = `${STORAGE_PREFIX}brand_default`;
      const raw = await AsyncStorage.getItem(defKey);
      if (raw) {
        const arr: AppNotification[] = JSON.parse(raw);
        await AsyncStorage.setItem(
          defKey,
          JSON.stringify(arr.map((n) => ({ ...n, is_read: true })))
        );
      }
    } catch {}
  } else if (role === 'admin') {
    try {
      const defKey = `${STORAGE_PREFIX}admin_default`;
      const raw = await AsyncStorage.getItem(defKey);
      if (raw) {
        const arr: AppNotification[] = JSON.parse(raw);
        await AsyncStorage.setItem(
          defKey,
          JSON.stringify(arr.map((n) => ({ ...n, is_read: true })))
        );
      }
    } catch {}
  }

  if (isSupabaseConfigured && userId && /^[0-9a-f-]{36}$/i.test(userId)) {
    try {
      await (supabase.from('notifications') as any)
        .update({ is_read: true })
        .eq('user_id', userId);
    } catch {}
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(
  notificationId: string,
  role: NotificationRole,
  userId?: string | null
): Promise<void> {
  const storageKey = getStorageKey(role, userId);
  const list = await getNotifications(role, userId);
  const updated = list.filter((n) => n.id !== notificationId);
  await AsyncStorage.setItem(storageKey, JSON.stringify(updated));

  if (role === 'brand') {
    try {
      const defKey = `${STORAGE_PREFIX}brand_default`;
      const raw = await AsyncStorage.getItem(defKey);
      if (raw) {
        const arr: AppNotification[] = JSON.parse(raw);
        await AsyncStorage.setItem(
          defKey,
          JSON.stringify(arr.filter((n) => n.id !== notificationId))
        );
      }
    } catch {}
  } else if (role === 'admin') {
    try {
      const defKey = `${STORAGE_PREFIX}admin_default`;
      const raw = await AsyncStorage.getItem(defKey);
      if (raw) {
        const arr: AppNotification[] = JSON.parse(raw);
        await AsyncStorage.setItem(
          defKey,
          JSON.stringify(arr.filter((n) => n.id !== notificationId))
        );
      }
    } catch {}
  }

  if (isSupabaseConfigured && /^[0-9a-f-]{36}$/i.test(notificationId)) {
    try {
      await (supabase.from('notifications') as any)
        .delete()
        .eq('id', notificationId);
    } catch {}
  }
}

export type CreateNotificationPayload = {
  user_id?: string | null;
  userId?: string | null;
  role: NotificationRole;
  category: NotificationCategory;
  title: string;
  body: string;
  deal_id?: string | null;
  dealId?: string | null;
  brand_id?: string | null;
  brandId?: string | null;
  order_id?: string | null;
  orderId?: string | null;
  action_url?: string | null;
  is_read?: boolean;
  aggregation_key?: string | null;
  actor_name?: string | null;
};

/**
 * Create and dispatch an authentic notification with Smart Rollup aggregation,
 * user preference checks, and real-time in-flight banner broadcasting.
 */
export async function createNotification(
  payload: CreateNotificationPayload
): Promise<AppNotification> {
  const targetUserId = payload.user_id || payload.userId || 'default';
  const targetDealId = payload.deal_id || payload.dealId || null;
  const targetBrandId = payload.brand_id || payload.brandId || null;
  const targetOrderId = payload.order_id || payload.orderId || null;

  // 1. Evaluate against user preferences and Quiet Hours
  let delivery = { canSave: true, canShowBanner: true, canShowPush: true, isQuietHour: false };
  try {
    const settings = await getNotificationSettings(targetUserId);
    const isLike = Boolean(
      payload.aggregation_key?.startsWith('like_') || payload.title.includes('Like')
    );
    delivery = evaluateDeliveryChannels(payload.category, settings, isLike);
  } catch {}

  if (!delivery.canSave) {
    return {
      id: `suppressed-${Date.now()}`,
      user_id: targetUserId,
      role: payload.role,
      category: payload.category,
      title: payload.title,
      body: payload.body,
      is_read: true,
      created_at: new Date().toISOString(),
    };
  }

  const primaryKey = getStorageKey(payload.role, targetUserId);

  // 2. Pillar 1: Smart Aggregation (Rollup)
  if (payload.aggregation_key) {
    try {
      const raw = await AsyncStorage.getItem(primaryKey);
      const list: AppNotification[] = raw ? JSON.parse(raw) : [];

      const existingUnreadIdx = list.findIndex(
        (item) => !item.is_read && item.aggregation_key === payload.aggregation_key
      );

      if (existingUnreadIdx !== -1) {
        const existing = list[existingUnreadIdx];
        const newActor = payload.actor_name || 'Shopper';
        const prevActors = existing.actors || (existing.actor_name ? [existing.actor_name] : []);
        const combinedActors = Array.from(new Set([newActor, ...prevActors]));
        const newCount = (existing.actor_count || 1) + 1;

        let aggregatedTitle = existing.title;
        let aggregatedBody = existing.body;

        if (payload.aggregation_key.startsWith('like_')) {
          aggregatedTitle = 'New Likes on Your Promotion! ❤️';
          if (newCount === 2) {
            aggregatedBody = `${combinedActors[0]} aur ${combinedActors[1]} ne aapki promotion ko like kiya hai.`;
          } else {
            aggregatedBody = `${combinedActors[0]} aur ${newCount - 1} doosron ne aapki promotion ko like kiya hai.`;
          }
        } else if (payload.aggregation_key.startsWith('follow_')) {
          aggregatedTitle = 'New Followers Alert! 👤';
          if (newCount === 2) {
            aggregatedBody = `${combinedActors[0]} aur ${combinedActors[1]} ne aapke brand ko follow karna shuru kiya hai.`;
          } else {
            aggregatedBody = `${combinedActors[0]} aur ${newCount - 1} doosron ne aapke brand ko follow karna shuru kiya hai.`;
          }
        } else if (payload.aggregation_key.startsWith('comment_')) {
          aggregatedTitle = 'New Reviews on Promotion 💬';
          if (newCount === 2) {
            aggregatedBody = `${combinedActors[0]} aur ${combinedActors[1]} ne reviews post kiye hain.`;
          } else {
            aggregatedBody = `${combinedActors[0]} aur ${newCount - 1} doosron ne reviews post kiye hain.`;
          }
        }

        const updatedNotif: AppNotification = {
          ...existing,
          title: aggregatedTitle,
          body: aggregatedBody,
          actors: combinedActors,
          actor_name: combinedActors[0],
          actor_count: newCount,
          created_at: new Date().toISOString(),
          is_read: false,
        };

        list.splice(existingUnreadIdx, 1);
        list.unshift(updatedNotif);
        await AsyncStorage.setItem(primaryKey, JSON.stringify(list));

        // Sync default key for brand
        if (payload.role === 'brand') {
          try {
            await AsyncStorage.setItem(
              `${STORAGE_PREFIX}brand_default`,
              JSON.stringify(list.slice(0, 50))
            );
          } catch {}
        }

        if (delivery.canShowBanner) {
          emitInFlightNotification(updatedNotif);
        }

        return updatedNotif;
      }
    } catch (aggErr) {
      console.warn('[NotificationStore] Aggregation rollup error, falling back:', aggErr);
    }
  }

  // 3. New Notification Creation
  const newNotif: AppNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    user_id: targetUserId,
    role: payload.role,
    category: payload.category,
    title: payload.title,
    body: payload.body,
    deal_id: targetDealId,
    brand_id: targetBrandId,
    order_id: targetOrderId,
    action_url: payload.action_url || null,
    is_read: payload.is_read ?? false,
    created_at: new Date().toISOString(),
    aggregation_key: payload.aggregation_key || null,
    actor_name: payload.actor_name || null,
    actors: payload.actor_name ? [payload.actor_name] : [],
    actor_count: 1,
  };

  const keysToUpdate = new Set<string>();
  keysToUpdate.add(primaryKey);

  // If role is brand, also save to brandId key & default key so it's always accessible
  if (payload.role === 'brand') {
    keysToUpdate.add(`${STORAGE_PREFIX}brand_default`);
    if (targetBrandId) {
      keysToUpdate.add(getStorageKey('brand', targetBrandId));
    }
  }

  // If role is admin, also save to admin default & admin_admin key
  if (payload.role === 'admin') {
    keysToUpdate.add(`${STORAGE_PREFIX}admin_default`);
    keysToUpdate.add(`${STORAGE_PREFIX}admin_admin`);
  }

  for (const k of keysToUpdate) {
    try {
      const raw = await AsyncStorage.getItem(k);
      const existing: AppNotification[] = raw ? JSON.parse(raw) : [];
      if (!existing.some((e) => e.title === newNotif.title && e.body === newNotif.body)) {
        existing.unshift(newNotif);
        await AsyncStorage.setItem(k, JSON.stringify(existing.slice(0, 100)));
      }
    } catch (saveErr) {
      console.warn('[NotificationStore] Key save notice:', saveErr);
    }
  }

  // Remote Supabase sync if user is UUID
  if (isSupabaseConfigured && targetUserId && /^[0-9a-f-]{36}$/i.test(targetUserId)) {
    try {
      const isDealUUID = targetDealId && /^[0-9a-f-]{36}$/i.test(targetDealId);
      await (supabase.from('notifications') as any).insert({
        user_id: targetUserId,
        title: payload.title,
        body: payload.body,
        deal_id: isDealUUID ? targetDealId : null,
        is_read: false,
      });
    } catch {}
  }

  // Broadcast in-flight top banner if enabled & not quiet hours
  if (delivery.canShowBanner) {
    emitInFlightNotification(newNotif);
  }

  return newNotif;
}

/**
 * Check if any saved deals are expiring within 48 hours and dispatch real alerts.
 * Avoids duplicate notifications for the same deal.
 */
export async function checkExpiringSavedDeals(
  userId: string,
  deals: Deal[]
): Promise<void> {
  if (!userId || !deals || deals.length === 0) return;
  const now = Date.now();
  const twoDaysMs = 48 * 60 * 60 * 1000;

  try {
    const existingNotifs = await getNotifications('consumer', userId);
    const existingDealNotifIds = new Set(
      existingNotifs
        .filter((n) => n.category === 'deal' && n.title.includes('Expiring Soon'))
        .map((n) => n.deal_id)
        .filter(Boolean)
    );

    for (const deal of deals) {
      if (!deal.end_date) continue;
      const endTime = new Date(deal.end_date).getTime();
      const diff = endTime - now;

      // Between 0 and 48 hours remaining
      if (diff > 0 && diff <= twoDaysMs) {
        if (!existingDealNotifIds.has(deal.id)) {
          await createNotification({
            role: 'consumer',
            userId,
            category: 'deal',
            title: `Deal Expiring Soon: ${deal.title} ⏳`,
            body: `Aapki saved promotion "${deal.title}" agle 48 ghanton me expire hone wali hai. Grab it before it ends!`,
            deal_id: deal.id,
            brand_id: deal.brand_id,
            action_url: `/(consumer)/deal/${deal.id}`,
            is_read: false,
          });
          existingDealNotifIds.add(deal.id);
        }
      }
    }
  } catch (err) {
    console.warn('[NotificationStore] Expiring deals check notice:', err);
  }
}
