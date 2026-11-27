import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000');

export interface ServerHealth {
  status: 'ok' | 'degraded' | 'offline';
  databaseConnected: boolean;
  latencyMs?: number;
}

/**
 * Checks if the Node.js backend server is reachable and reports Supabase DB health.
 */
export async function checkServerHealth(): Promise<ServerHealth> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const res = await fetch(`${SERVER_URL}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        status: data.status || 'ok',
        databaseConnected: Boolean(data.database?.connected),
        latencyMs: data.database?.latencyMs,
      };
    }
  } catch {}

  return {
    status: 'offline',
    databaseConnected: false,
  };
}

/**
 * Fetch deals enriched with live likes & comments from Node.js server.
 */
export async function callServerGetDeals(limit: number = 30, userId?: string): Promise<any[] | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const url = `${SERVER_URL}/api/deals?limit=${limit}${userId ? `&userId=${userId}` : ''}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.deals)) {
        return data.deals;
      }
    }
  } catch {}

  return null;
}

/**
 * Get total likes and comments count for a deal from Node.js server.
 */
export async function callServerGetInteractions(
  dealId: string,
  userId?: string
): Promise<{ likes_count: number; comments_count: number; is_liked?: boolean } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const url = `${SERVER_URL}/api/deals/${dealId}/interactions${userId ? `?userId=${userId}` : ''}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return {
          likes_count: data.likes_count,
          comments_count: data.comments_count,
          is_liked: data.is_liked,
        };
      }
    }
  } catch {}

  // Fallback: Query Supabase & AsyncStorage directly when Node.js server is unreachable
  try {
    let likesCount = 0;
    let commentsCount = 0;
    let isLiked = false;

    if (isSupabaseConfigured) {
      const [likesRes, commentsRes] = await Promise.all([
        (supabase.from('likes') as any).select('*', { count: 'exact', head: true }).eq('deal_id', dealId),
        (supabase.from('comments') as any).select('*', { count: 'exact', head: true }).eq('deal_id', dealId),
      ]);
      if (typeof likesRes.count === 'number') likesCount = likesRes.count;
      if (typeof commentsRes.count === 'number') commentsCount = commentsRes.count;

      if (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
        const { data: userLike } = await (supabase.from('likes') as any)
          .select('id')
          .eq('deal_id', dealId)
          .eq('user_id', userId)
          .maybeSingle();
        if (userLike) isLiked = true;
      }
    }

    // Check local storage for current user like
    const safeUid = userId || 'guest';
    const rawLiked = await AsyncStorage.getItem(`@jumble_sale_likes_${safeUid}`);
    if (rawLiked) {
      const list = JSON.parse(rawLiked);
      if (Array.isArray(list) && list.includes(dealId)) {
        isLiked = true;
        likesCount = Math.max(likesCount, 1);
      }
    }

    return { likes_count: likesCount, comments_count: commentsCount, is_liked: isLiked };
  } catch {}

  return null;
}

/**
 * Toggle like for a deal on Node.js server.
 */
export async function callServerToggleLike(
  dealId: string,
  userId: string = 'guest',
  userName: string = 'Shopper'
): Promise<{ isLiked: boolean; likesCount: number } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${SERVER_URL}/api/deals/${dealId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, userName }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return {
          isLiked: data.isLiked,
          likesCount: data.likesCount,
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Fetch comments for a deal from Node.js server.
 */
export async function callServerGetComments(dealId: string): Promise<any[] | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(`${SERVER_URL}/api/deals/${dealId}/comments`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.comments)) {
        return data.comments;
      }
    }
  } catch {}

  return null;
}

/**
 * Post comment to a deal on Node.js server.
 */
export async function callServerAddComment(
  dealId: string,
  userId: string,
  userName: string,
  text: string
): Promise<{ comment: any; totalComments: number } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${SERVER_URL}/api/deals/${dealId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, userName, text }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return {
          comment: data.comment,
          totalComments: data.totalComments,
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Call Node.js backend Shopper AI endpoint with automatic fallback.
 */
export async function callServerShopperAI(
  query: string,
  chatHistory: { role: string; content: string }[] = []
): Promise<{ reply: string; deals: any[]; is_off_topic: boolean; suggested_chips: string[] } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${SERVER_URL}/api/ai/shopper`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, history: chatHistory }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return {
          reply: data.reply,
          deals: data.deals || [],
          is_off_topic: Boolean(data.is_off_topic),
          suggested_chips: data.suggested_chips || [],
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Call Node.js backend Brand Copilot endpoint with automatic fallback.
 */
export async function callServerBrandAI(
  brandId: string,
  query: string,
  chatHistory: { role: string; content: string }[] = []
): Promise<{ reply: string; hasPostAction: boolean; actions: any[]; suggested_prompts: string[] } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${SERVER_URL}/api/ai/brand-copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, query, history: chatHistory }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return {
          reply: data.reply,
          hasPostAction: Boolean(data.hasPostAction),
          actions: data.actions || [],
          suggested_prompts: data.suggested_prompts || [],
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Get batch interaction counts for all deals from Node.js server.
 */
export async function callServerGetBatchInteractions(): Promise<Record<string, { likes_count: number; comments_count: number }> | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(`${SERVER_URL}/api/deals/interactions/batch`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.interactions) {
        return data.interactions;
      }
    }
  } catch {}

  // Fallback: Aggregate interaction counts directly from Supabase & AsyncStorage
  try {
    const fallback: Record<string, { likes_count: number; comments_count: number }> = {};
    if (isSupabaseConfigured) {
      const [likesRes, commentsRes] = await Promise.all([
        (supabase.from('likes') as any).select('deal_id'),
        (supabase.from('comments') as any).select('deal_id'),
      ]);

      if (Array.isArray(likesRes.data)) {
        for (const row of likesRes.data) {
          if (!row.deal_id) continue;
          if (!fallback[row.deal_id]) fallback[row.deal_id] = { likes_count: 0, comments_count: 0 };
          fallback[row.deal_id].likes_count++;
        }
      }
      if (Array.isArray(commentsRes.data)) {
        for (const row of commentsRes.data) {
          if (!row.deal_id) continue;
          if (!fallback[row.deal_id]) fallback[row.deal_id] = { likes_count: 0, comments_count: 0 };
          fallback[row.deal_id].comments_count++;
        }
      }
    }

    // Merge locally cached liked deals from all local users
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const likeKeys = allKeys.filter((k) => k.startsWith('@jumble_sale_likes'));
      for (const k of likeKeys) {
        const raw = await AsyncStorage.getItem(k);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            for (const dealId of list) {
              if (!fallback[dealId]) fallback[dealId] = { likes_count: 0, comments_count: 0 };
              fallback[dealId].likes_count = Math.max(fallback[dealId].likes_count, 1);
            }
          }
        }
      }
    } catch {}

    return Object.keys(fallback).length > 0 ? fallback : null;
  } catch {}

  return null;
}

/**
 * Connect to Node.js server SSE stream for real-time interaction updates.
 */
export function connectInteractionsSSE(
  onUpdate: (event: { type: string; deal_id?: string; likes_count?: number; comments_count?: number }) => void
): () => void {
  if (typeof EventSource === 'undefined') {
    return () => {};
  }

  try {
    const sse = new EventSource(`${SERVER_URL}/api/deals/interactions/stream`);
    sse.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        onUpdate(parsed);
      } catch {}
    };

    return () => {
      sse.close();
    };
  } catch {
    return () => {};
  }
}

