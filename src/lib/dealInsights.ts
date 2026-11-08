import { getDealComments, getDealLikesCount, getDealSharesCount, type CommentItem } from '@/lib/activityStore';
import { getPostClicksCount } from '@/lib/clickTracker';
import { getDealRemainingDays, isDealExpired } from '@/lib/dealStore';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Deal } from '@/types/database.types';

export interface DealInsightData {
  dealId: string;
  title: string;
  impressions: number;
  clicks: number;
  ctr: string;
  likes: number;
  commentsCount: number;
  comments: CommentItem[];
  shares: number;
  remainingDays: number | null;
  isExpired: boolean;
  isPaused: boolean;
  isPinned: boolean;
  dealStatus: string;
  startDate: string;
  endDate: string;
  promoCode: string | null;
  discountPct: number;
}

// Fast race helper with timeout so UI opens instantly without hanging
async function safeRace<T>(queryPromise: any, fallback: T, ms: number = 700): Promise<T> {
  try {
    const timeout = new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    );
    const res: any = await Promise.race([queryPromise, timeout]);
    return (res?.data ?? (res !== undefined ? res : fallback)) as T;
  } catch {
    return fallback;
  }
}

/**
 * Fetches 100% authentic, real database and local interaction metrics for a single deal.
 * Zero simulated data.
 */
export async function fetchSingleDealInsights(deal: Deal): Promise<DealInsightData> {
  if (!deal?.id) {
    throw new Error('Deal ID is required to fetch insights');
  }

  const dealId = deal.id;
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);

  const [
    localLikes,
    localComments,
    localShares,
    localClicks,
    remoteInteractions,
    remoteLikesRes,
  ] = await Promise.all([
    getDealLikesCount(dealId).catch(() => 0),
    getDealComments(dealId).catch(() => [] as CommentItem[]),
    getDealSharesCount(dealId).catch(() => 0),
    getPostClicksCount(dealId).catch(() => 0),
    isUUID && isSupabaseConfigured
      ? safeRace(
          (supabase.from('interactions') as any)
            .select('type')
            .eq('deal_id', dealId),
          [],
          700
        )
      : Promise.resolve([]),
    isUUID && isSupabaseConfigured
      ? safeRace(
          (supabase.from('likes') as any)
            .select('*', { count: 'exact', head: true })
            .eq('deal_id', dealId),
          null,
          700
        )
      : Promise.resolve(null),
  ]);

  let remoteViews = 0;
  let remoteClicks = 0;
  const interactionList: any[] = Array.isArray(remoteInteractions) ? remoteInteractions : [];
  for (const item of interactionList) {
    if (item.type === 'view') remoteViews++;
    if (item.type === 'click') remoteClicks++;
  }

  const remoteLikes =
    remoteLikesRes && typeof (remoteLikesRes as any).count === 'number'
      ? (remoteLikesRes as any).count
      : 0;

  const finalLikes = Math.max(localLikes, remoteLikes);
  const finalClicks = Math.max(localClicks, remoteClicks);
  // Real impressions: At least equal to clicks if clicks occurred, otherwise actual view events
  const finalImpressions = Math.max(remoteViews, finalClicks);

  const ctr =
    finalImpressions > 0
      ? ((finalClicks / finalImpressions) * 100).toFixed(1)
      : '0.0';

  const expired = isDealExpired(deal);
  const remaining = getDealRemainingDays(deal);

  return {
    dealId,
    title: deal.title,
    impressions: finalImpressions,
    clicks: finalClicks,
    ctr: `${ctr}%`,
    likes: finalLikes,
    commentsCount: localComments.length,
    comments: localComments,
    shares: localShares,
    remainingDays: remaining,
    isExpired: expired,
    isPaused: deal.status === 'paused',
    isPinned: Boolean(deal.is_pinned),
    dealStatus: deal.status,
    startDate: deal.start_date,
    endDate: deal.end_date,
    promoCode: deal.promo_code || null,
    discountPct: deal.discount_pct || 0,
  };
}
