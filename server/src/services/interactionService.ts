import { supabase } from '../config/supabase.js';

export interface CommentRecord {
  id: string;
  deal_id: string;
  user_id?: string | null;
  user_name: string;
  user_avatar?: string | null;
  text: string;
  created_at: string;
}

export interface DealInteractions {
  deal_id: string;
  likes_count: number;
  comments_count: number;
  is_liked?: boolean;
}

// Baseline organic social proof for verified partner deals (Facebook style)
export const SEED_ENGAGEMENT_MAP: Record<string, { likes: number; comments: number }> = {
  // Khaadi Summer Lawn
  'd1111111-1111-1111-1111-111111111111': { likes: 124, comments: 18 },
  // Khaadi Ready-to-Wear Kurtis
  'd1111111-1111-1111-1111-222222222222': { likes: 89, comments: 14 },
  // Khaadi Suit
  'd1111111-1111-1111-1111-333333333333': { likes: 45, comments: 6 },
  // Outfitters Streetwear
  'd2222222-2222-2222-2222-111111111111': { likes: 142, comments: 26 },
  // Gul Ahmed Summer Gala
  'd3333333-3333-3333-3333-111111111111': { likes: 64, comments: 9 },
  // Bata Pakistan Shoes
  'd4444444-4444-4444-4444-111111111111': { likes: 96, comments: 15 },
  // PriceOye Xiaomi
  'd5555555-5555-5555-5555-111111111111': { likes: 185, comments: 34 },
  // Cheezious Pizza
  'd6666666-6666-6666-6666-111111111111': { likes: 210, comments: 42 },
  // Saeed Ghani Rose Water
  'd7777777-7777-7777-7777-111111111111': { likes: 75, comments: 11 },
  // Imtiaz Grocery
  'd8888888-8888-8888-8888-111111111111': { likes: 110, comments: 19 },
  // Habitt Furniture
  'd9999999-9999-9999-9999-111111111111': { likes: 52, comments: 7 },
};

// In-memory dynamic interaction stores for instant real-time sync across sessions
const dynamicLikes = new Map<string, Set<string>>(); // dealId -> Set of userIds
const dynamicComments = new Map<string, CommentRecord[]>(); // dealId -> array of comments

export async function getDealEngagement(dealId: string, userId?: string): Promise<DealInteractions> {
  const seed = SEED_ENGAGEMENT_MAP[dealId] || { likes: 12, comments: 2 };
  let baseLikes = seed.likes;
  let baseComments = seed.comments;

  // 1. Check Supabase DB for live counts if available
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);
  if (isUUID) {
    try {
      const [likesRes, commentsRes] = await Promise.all([
        supabase.from('likes').select('*', { count: 'exact', head: true }).eq('deal_id', dealId),
        supabase.from('comments').select('*', { count: 'exact', head: true }).eq('deal_id', dealId),
      ]);

      if (typeof likesRes.count === 'number' && likesRes.count > 0) {
        baseLikes = Math.max(baseLikes, likesRes.count);
      }
      if (typeof commentsRes.count === 'number' && commentsRes.count > 0) {
        baseComments = Math.max(baseComments, commentsRes.count);
      }
    } catch {}
  }

  // 2. Add local dynamic memory interactions
  const activeLikesSet = dynamicLikes.get(dealId);
  const dynamicLikesCount = activeLikesSet ? activeLikesSet.size : 0;
  const isLikedByCurrentUser = Boolean(userId && activeLikesSet && activeLikesSet.has(userId));

  const extraComments = dynamicComments.get(dealId) || [];

  return {
    deal_id: dealId,
    likes_count: baseLikes + dynamicLikesCount,
    comments_count: baseComments + extraComments.length,
    is_liked: isLikedByCurrentUser,
  };
}

export async function toggleDealLike(
  dealId: string,
  userId: string = 'guest',
  userName: string = 'Shopper'
): Promise<{ isLiked: boolean; likesCount: number }> {
  let activeLikesSet = dynamicLikes.get(dealId);
  if (!activeLikesSet) {
    activeLikesSet = new Set<string>();
    dynamicLikes.set(dealId, activeLikesSet);
  }

  const isCurrentlyLiked = activeLikesSet.has(userId);
  let isNowLiked = false;

  if (isCurrentlyLiked) {
    activeLikesSet.delete(userId);
    isNowLiked = false;
  } else {
    activeLikesSet.add(userId);
    isNowLiked = true;
  }

  // Attempt Supabase sync
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);
  const isUserUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

  if (isUUID && isUserUUID) {
    try {
      if (isNowLiked) {
        await supabase.from('likes').insert({ user_id: userId, deal_id: dealId });
      } else {
        await supabase.from('likes').delete().eq('user_id', userId).eq('deal_id', dealId);
      }
    } catch {}
  }

  const seed = SEED_ENGAGEMENT_MAP[dealId] || { likes: 12, comments: 2 };
  const totalLikes = seed.likes + activeLikesSet.size;

  return {
    isLiked: isNowLiked,
    likesCount: totalLikes,
  };
}

export async function getDealComments(dealId: string): Promise<CommentRecord[]> {
  const memoryComments = dynamicComments.get(dealId) || [];

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);
  if (isUUID) {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        const merged = [...memoryComments, ...data];
        return merged;
      }
    } catch {}
  }

  return memoryComments;
}

export async function addDealComment(
  dealId: string,
  userId: string,
  userName: string,
  text: string
): Promise<{ comment: CommentRecord; totalComments: number }> {
  const newComment: CommentRecord = {
    id: `comm-${Date.now()}`,
    deal_id: dealId,
    user_id: userId,
    user_name: userName || 'Shopper',
    text: text.trim(),
    created_at: new Date().toISOString(),
  };

  let list = dynamicComments.get(dealId);
  if (!list) {
    list = [];
    dynamicComments.set(dealId, list);
  }
  list.unshift(newComment);

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);
  const isUserUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

  if (isUUID) {
    try {
      const payload: any = {
        deal_id: dealId,
        user_name: userName,
        text: text.trim(),
      };
      if (isUserUUID) {
        payload.user_id = userId;
      }
      await supabase.from('comments').insert(payload);
    } catch {}
  }

  const seed = SEED_ENGAGEMENT_MAP[dealId] || { likes: 12, comments: 2 };
  const totalComments = seed.comments + list.length;

  return {
    comment: newComment,
    totalComments,
  };
}
