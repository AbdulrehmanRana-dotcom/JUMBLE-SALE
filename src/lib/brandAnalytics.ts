import { getAllActivities, getDealComments, getDealLikesCount } from '@/lib/activityStore';
import { getPostClicksCount } from '@/lib/clickTracker';
import { getLocalBrandDeals } from '@/lib/dealStore';
import {
  getBrandAttributedPurchases,
  getBrandSalesSummary,
  type AttributedOrder,
} from '@/lib/orderStore';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { AnalyticsDaily, Deal } from '@/types/database.types';

export interface BrandMetrics {
  totalActivePosts: number;
  totalImpressions: number;
  totalLikes: number;
  totalComments: number;
  totalClicks: number;
  ctr: string;
  totalAttributedOrders: number;
  totalSalesRevenue: number;
}

export interface DailyActivityPoint {
  date: string; // 'YYYY-MM-DD'
  dayLabel: string; // 'Mon', 'Tue', etc.
  formattedDate: string; // 'Oct 16'
  views: number;
  clicks: number;
  likes: number;
  comments: number;
  total: number;
}

export interface BrandAnalyticsData {
  metrics: BrandMetrics;
  last7Days: DailyActivityPoint[];
  attributedOrders?: AttributedOrder[];
}

// In-memory RAM cache for 0ms re-renders
const memoryBrandAnalyticsCache = new Map<string, { data: BrandAnalyticsData; ts: number }>();

// Fast race timeout helper so Supabase never blocks UI
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

export async function fetchBrandLiveAnalytics(
  brandId?: string | null,
  brandName?: string
): Promise<BrandAnalyticsData> {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();

  const emptyDays: DailyActivityPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    emptyDays.push({
      date: dateStr,
      dayLabel: dayNames[d.getDay()],
      formattedDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      views: 0,
      clicks: 0,
      likes: 0,
      comments: 0,
      total: 0,
    });
  }

  if (!brandId && !brandName) {
    return {
      metrics: {
        totalActivePosts: 0,
        totalImpressions: 0,
        totalLikes: 0,
        totalComments: 0,
        totalClicks: 0,
        ctr: '0.0%',
        totalAttributedOrders: 0,
        totalSalesRevenue: 0,
      },
      last7Days: emptyDays,
    };
  }

  const cacheKey = `${brandId || ''}_${brandName || ''}`;
  const cached = memoryBrandAnalyticsCache.get(cacheKey);
  // Return within 0ms if cached within last 45 seconds
  if (cached && Date.now() - cached.ts < 45000) {
    return cached.data;
  }

  try {
    const cleanBrandName = (brandName || '').toLowerCase().trim();

    // 1. Concurrently run all root data sources in parallel with 700ms timeout
    const [
      supabaseDeals,
      localDeals,
      allActivities,
      salesSummary,
      attributedOrders,
      dailyRowsData,
    ] = await Promise.all([
      brandId && isSupabaseConfigured
        ? safeRace(supabase.from('deals').select('*').eq('brand_id', brandId), [], 700)
        : Promise.resolve([]),
      getLocalBrandDeals(),
      getAllActivities(),
      getBrandSalesSummary(brandId, brandName),
      getBrandAttributedPurchases(brandId, brandName),
      brandId && isSupabaseConfigured
        ? safeRace(supabase.from('analytics_daily').select('*').eq('brand_id', brandId), [], 700)
        : Promise.resolve([]),
    ]);

    // 2. Fast merge brand deals
    let brandDeals: Deal[] = Array.isArray(supabaseDeals) ? [...supabaseDeals] : [];
    for (const ld of localDeals) {
      const matchesId = brandId && ld.brand_id === brandId;
      const bName = ((ld as any).brand?.name || (ld as any).brand_name || '').toLowerCase().trim();
      const matchesName =
        cleanBrandName &&
        bName &&
        (bName.includes(cleanBrandName) || cleanBrandName.includes(bName));

      if (matchesId || matchesName) {
        if (!brandDeals.some((bd) => bd.id === ld.id)) {
          brandDeals.push(ld);
        }
      }
    }

    if (brandDeals.length === 0 && localDeals.length > 0) {
      brandDeals = [...localDeals];
    }

    const dealIds = brandDeals.map((d) => d.id);
    const totalActivePosts = brandDeals.filter((d) => d.status === 'active').length;

    // 3. Parallel fetch of deal-level metrics (Likes, Comments, Interactions, Clicks)
    const [
      supabaseLikesRes,
      supabaseCommentsRes,
      supabaseInteractionsRes,
      localLikesCounts,
      localCommentsLists,
      localClicksCounts,
    ] = await Promise.all([
      // Supabase likes count
      dealIds.length > 0 && isSupabaseConfigured
        ? safeRace(
            (supabase.from('likes') as any)
              .select('*', { count: 'exact', head: true })
              .in('deal_id', dealIds),
            null,
            700
          )
        : Promise.resolve(null),
      // Supabase comments count
      dealIds.length > 0 && isSupabaseConfigured
        ? safeRace(
            (supabase.from('comments') as any)
              .select('*', { count: 'exact', head: true })
              .in('deal_id', dealIds),
            null,
            700
          )
        : Promise.resolve(null),
      // Supabase interactions
      dealIds.length > 0 && isSupabaseConfigured
        ? safeRace(
            (supabase.from('interactions') as any)
              .select('type, deal_id, created_at')
              .in('deal_id', dealIds),
            [],
            700
          )
        : Promise.resolve([]),
      // Local deal likes
      Promise.all(brandDeals.map((d) => getDealLikesCount(d.id))),
      // Local deal comments
      Promise.all(brandDeals.map((d) => getDealComments(d.id))),
      // Local deal clicks
      Promise.all(brandDeals.map((d) => getPostClicksCount(d.id))),
    ]);

    const totalLikesRemote =
      supabaseLikesRes && typeof (supabaseLikesRes as any).count === 'number'
        ? (supabaseLikesRes as any).count
        : 0;
    const totalCommentsRemote =
      supabaseCommentsRes && typeof (supabaseCommentsRes as any).count === 'number'
        ? (supabaseCommentsRes as any).count
        : 0;

    const localDealLikesSum = localLikesCounts.reduce((acc, c) => acc + c, 0);
    const localDealCommentsSum = localCommentsLists.reduce((acc, c) => acc + c.length, 0);
    const localDealClicksSum = localClicksCounts.reduce((acc, c) => acc + c, 0);

    let interactionViews = 0;
    let interactionClicks = 0;
    const rawInteractions: any[] = Array.isArray(supabaseInteractionsRes) ? supabaseInteractionsRes : [];
    for (const item of rawInteractions) {
      if (item.type === 'view') interactionViews++;
      if (item.type === 'click') interactionClicks++;
    }

    const dailyRows: AnalyticsDaily[] = Array.isArray(dailyRowsData) ? dailyRowsData : [];
    let rolledViews = 0;
    let rolledClicks = 0;
    for (const r of dailyRows) {
      rolledViews += r.views_count || 0;
      rolledClicks += r.clicks_count || 0;
    }

    // Filter local activities
    const brandActivities = allActivities.filter((a) => {
      if (brandId && a.brand_id === brandId) return true;
      if (dealIds.includes(a.deal_id)) return true;
      const bName = (a.brand_name || '').toLowerCase().trim();
      if (cleanBrandName && bName && (bName.includes(cleanBrandName) || cleanBrandName.includes(bName)))
        return true;
      return false;
    });

    const finalLikes = Math.max(totalLikesRemote, localDealLikesSum);
    const finalComments = Math.max(totalCommentsRemote, localDealCommentsSum);
    const finalImpressions = Math.max(interactionViews, rolledViews);
    const finalClicks = Math.max(interactionClicks, rolledClicks, localDealClicksSum);

    const ctrVal =
      finalImpressions > 0 ? ((finalClicks / finalImpressions) * 100).toFixed(1) : '0.0';

    // 4. Compute 7 Days Real Activity Distribution
    const last7Days: DailyActivityPoint[] = emptyDays.map((day) => {
      let v = 0;
      let c = 0;
      let l = 0;
      let comm = 0;

      for (const r of dailyRows) {
        if (r.date === day.date) {
          v += r.views_count || 0;
          c += r.clicks_count || 0;
          l += r.likes_count || 0;
        }
      }

      for (const it of rawInteractions) {
        if (it.created_at && it.created_at.startsWith(day.date)) {
          if (it.type === 'view') v++;
          if (it.type === 'click') c++;
          if (it.type === 'like') l++;
        }
      }

      for (const act of brandActivities) {
        if (act.created_at && act.created_at.startsWith(day.date)) {
          if (act.type === 'like') l++;
          if (act.type === 'comment') comm++;
        }
      }

      if (day.date === today.toISOString().split('T')[0] && c < localDealClicksSum) {
        c = Math.max(c, localDealClicksSum);
      }

      const total = v + c + l + comm;
      return {
        ...day,
        views: v,
        clicks: c,
        likes: l,
        comments: comm,
        total,
      };
    });

    const result: BrandAnalyticsData = {
      metrics: {
        totalActivePosts,
        totalImpressions: finalImpressions,
        totalLikes: finalLikes,
        totalComments: finalComments,
        totalClicks: finalClicks,
        ctr: `${ctrVal}%`,
        totalAttributedOrders: salesSummary.totalOrders,
        totalSalesRevenue: salesSummary.totalRevenue,
      },
      last7Days,
      attributedOrders,
    };

    // Store in RAM cache
    memoryBrandAnalyticsCache.set(cacheKey, { data: result, ts: Date.now() });

    return result;
  } catch (err) {
    console.error('[BrandAnalytics] Error computing live analytics:', err);
    return {
      metrics: {
        totalActivePosts: 0,
        totalImpressions: 0,
        totalLikes: 0,
        totalComments: 0,
        totalClicks: 0,
        ctr: '0.0%',
        totalAttributedOrders: 0,
        totalSalesRevenue: 0,
      },
      last7Days: emptyDays,
    };
  }
}
