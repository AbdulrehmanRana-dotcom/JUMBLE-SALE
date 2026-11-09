import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNotification } from '@/lib/notificationStore';
import { supabase } from '@/lib/supabase';

export interface AttributedOrder {
  id: string;
  user_id: string;
  user_name?: string;
  deal_id: string;
  deal_title: string;
  brand_id: string;
  brand_name: string;
  brand_logo?: string | null;
  order_reference?: string;
  order_amount: number;
  savings_amount?: number;
  currency: string;
  receipt_image_url?: string | null;
  status: 'confirmed' | 'pending_review' | 'cancelled';
  attribution_method: 'in_app_webview' | 'promo_code' | 'webhook';
  created_at: string;
}

const ORDERS_STORAGE_KEY = '@jumble_sale_attributed_orders';

/**
 * Generate a unique ID for local orders
 */
function generateOrderId(): string {
  return `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Record a new attributed purchase
 */
export async function recordAttributedPurchase(
  payload: Omit<AttributedOrder, 'id' | 'created_at'>
): Promise<AttributedOrder> {
  const newOrder: AttributedOrder = {
    ...payload,
    id: generateOrderId(),
    created_at: new Date().toISOString(),
  };

  // 1. Save to local AsyncStorage
  try {
    const raw = await AsyncStorage.getItem(ORDERS_STORAGE_KEY);
    const existing: AttributedOrder[] = raw ? JSON.parse(raw) : [];
    const updated = [newOrder, ...existing];
    await AsyncStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[OrderStore] Error saving order locally:', err);
  }

  // 2. Attempt sync with Supabase
  try {
    const isUUID = (v?: string | null) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');

    const { data, error } = await (supabase.from('attributed_orders') as any).insert([
      {
        user_id: isUUID(payload.user_id) ? payload.user_id : null,
        deal_id: isUUID(payload.deal_id) ? payload.deal_id : null,
        brand_id: isUUID(payload.brand_id) ? payload.brand_id : null,
        brand_name: payload.brand_name,
        deal_title: payload.deal_title,
        order_reference: payload.order_reference || null,
        order_amount: payload.order_amount || 0,
        savings_amount: payload.savings_amount || 0,
        currency: payload.currency || 'PKR',
        receipt_image_url: payload.receipt_image_url || null,
        status: payload.status || 'confirmed',
        attribution_method: payload.attribution_method || 'in_app_webview',
      },
    ]).select();

    if (!error && Array.isArray(data) && data[0]) {
      newOrder.id = data[0].id;
    }
  } catch (err) {
    // Offline or schema not yet deployed, safe to continue with local record
    console.warn('[OrderStore] Supabase insert notice:', err);
  }

  // 3. Dispatch authentic notifications to Consumer, Brand, and Admin
  try {
    const formattedAmount = `Rs. ${Number(newOrder.order_amount || 0).toLocaleString()}`;

    // A. Consumer Notification
    await createNotification({
      role: 'consumer',
      userId: newOrder.user_id,
      category: 'order',
      title: `Purchase Verified: ${formattedAmount} ✅`,
      body: `Aapka order claim at ${newOrder.brand_name} verify ho gaya hai aur aapke shopping profile record me add kar diya gaya hai.`,
      brand_id: newOrder.brand_id,
      deal_id: newOrder.deal_id,
      action_url: '/(consumer)/profile',
      is_read: false,
    });

    // B. Brand Notification
    if (newOrder.brand_id) {
      await createNotification({
        role: 'brand',
        userId: newOrder.brand_id,
        brand_id: newOrder.brand_id,
        deal_id: newOrder.deal_id,
        category: 'order',
        title: `New Verified Purchase! 🛒`,
        body: `${formattedAmount} purchase claim record hui hai aapke brand (${newOrder.brand_name}) ke liye.`,
        action_url: '/(brand)',
        is_read: false,
      });
    }

    // C. Admin Notification
    await createNotification({
      role: 'admin',
      userId: 'admin',
      category: 'order',
      title: `New Attributed Purchase Claim: ${formattedAmount} 💰`,
      body: `Shopper ne ${formattedAmount} order claim record kiya at ${newOrder.brand_name}.`,
      action_url: 'overview',
      is_read: false,
    });
  } catch (notifErr) {
    console.warn('[OrderStore] Notification dispatch notice:', notifErr);
  }

  return newOrder;
}

/**
 * Get all attributed purchases for a specific user
 */
export async function getUserPurchases(userId: string): Promise<AttributedOrder[]> {
  if (!userId) return [];

  let localList: AttributedOrder[] = [];
  try {
    const raw = await AsyncStorage.getItem(ORDERS_STORAGE_KEY);
    if (raw) {
      const all: AttributedOrder[] = JSON.parse(raw);
      localList = all.filter((o) => o.user_id === userId || o.user_id === 'guest');
    }
  } catch (err) {
    console.warn('[OrderStore] Error reading local orders:', err);
  }

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (isUUID) {
    try {
      const { data, error } = await (supabase.from('attributed_orders') as any)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        // Merge without duplicating
        const remoteIds = new Set(data.map((d: any) => d.id));
        const filteredLocal = localList.filter((l) => !remoteIds.has(l.id));
        return [...data, ...filteredLocal];
      }
    } catch {
      // offline fallback
    }
  }

  return localList;
}

/**
 * Get all attributed orders for Admin platform review
 */
export async function getAllOrdersForAdmin(): Promise<AttributedOrder[]> {
  let localList: AttributedOrder[] = [];
  try {
    const raw = await AsyncStorage.getItem(ORDERS_STORAGE_KEY);
    if (raw) {
      localList = JSON.parse(raw);
    }
  } catch {}

  try {
    const { data } = await (supabase.from('attributed_orders') as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (data && Array.isArray(data) && data.length > 0) return data;
  } catch {}

  return localList;
}

/**
 * Get all attributed purchases for a brand
 */
export async function getBrandAttributedPurchases(
  brandId?: string | null,
  brandName?: string
): Promise<AttributedOrder[]> {
  let list: AttributedOrder[] = [];

  // Local storage check
  try {
    const raw = await AsyncStorage.getItem(ORDERS_STORAGE_KEY);
    if (raw) {
      const all: AttributedOrder[] = JSON.parse(raw);
      const cleanTargetName = (brandName || '').toLowerCase().trim();

      list = all.filter((o) => {
        if (brandId && o.brand_id === brandId) return true;
        const bName = (o.brand_name || '').toLowerCase().trim();
        if (cleanTargetName && bName && (bName.includes(cleanTargetName) || cleanTargetName.includes(bName))) {
          return true;
        }
        return false;
      });
    }
  } catch (err) {
    console.warn('[OrderStore] Error reading local brand orders:', err);
  }

  const isUUID = brandId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brandId);
  if (isUUID) {
    try {
      const { data, error } = await (supabase.from('attributed_orders') as any)
        .select('*')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        const remoteIds = new Set(data.map((d: any) => d.id));
        const filteredLocal = list.filter((l) => !remoteIds.has(l.id));
        return [...data, ...filteredLocal];
      }
    } catch {
      // offline fallback
    }
  }

  return list;
}

/**
 * Computes sales KPI summary for a brand
 */
export async function getBrandSalesSummary(
  brandId?: string | null,
  brandName?: string
): Promise<{ totalOrders: number; totalRevenue: number; avgOrderValue: number }> {
  const orders = await getBrandAttributedPurchases(brandId, brandName);

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.order_amount) || 0), 0);
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  return {
    totalOrders,
    totalRevenue,
    avgOrderValue,
  };
}
