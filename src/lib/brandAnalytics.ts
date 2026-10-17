import { getAllActivities, getDealComments, getDealLikesCount } from '@/lib/activityStore';
import { getLocalBrandDeals } from '@/lib/dealStore';
import { supabase } from '@/lib/supabase';
import type { AnalyticsDaily, Deal } from '@/types/database.types';

export interface BrandMetrics {
  totalActivePosts: number;
  totalImpressions: number;
  totalLikes: number;
  totalComments: number;
  totalClicks: number;
  ctr: string;
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
}

export async function fetchBrandLiveAnalytics(
  brandId?: string | null,
  brandName?: string
): Promise<BrandAnalyticsData> {
  // Default empty structure (zero fake numbers)
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
      },
      last7Days: emptyDays,
    };
  }

  try {
    // 1. Fetch brand's deals from Supabase and local store
    let brandDeals: Deal[] = [];
    if (brandId) {
      try {
        const { data, error } = await supabase
          .from('deals')
          .select('*')
          .eq('brand_id', brandId);

        if (!error && Array.isArray(data) && data.length > 0) {
          brandDeals = data as Deal[];
        }
      } catch {
        // offline
      }
    }

    const localDeals = await getLocalBrandDeals();
    const cleanBrandName = (brandName || '').toLowerCase().trim();

    // Match local deals by brand_id OR brand_name
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

    // Fallback if localDeals has single deal during testing
    if (brandDeals.length === 0 && localDeals.length === 1) {
      brandDeals = localDeals;
    }

    const dealIds = brandDeals.map((d) => d.id);
    const totalActivePosts = brandDeals.filter((d) => d.status === 'active').length;

    // 2. Fetch Real Likes Count from Supabase
    let totalLikes = 0;
    if (dealIds.length > 0) {
      try {
        const { count, error } = await (supabase.from('likes') as any)
          .select('*', { count: 'exact', head: true })
          .in('deal_id', dealIds);

        if (!error && typeof count === 'number') {
          totalLikes = count;
        }
      } catch {
        // offline
      }
    }

    // 2b. Sum local deal likes for each brand deal from getDealLikesCount
    let localDealLikesSum = 0;
    for (const d of brandDeals) {
      try {
        const c = await getDealLikesCount(d.id);
        localDealLikesSum += c;
      } catch {
        // ignore
      }
    }

    // 3. Fetch Real Comments Count from Supabase
    let totalComments = 0;
    if (dealIds.length > 0) {
      try {
        const { count, error } = await (supabase.from('comments') as any)
          .select('*', { count: 'exact', head: true })
          .in('deal_id', dealIds);

        if (!error && typeof count === 'number') {
          totalComments = count;
        }
      } catch {
        // offline
      }
    }

    // 3b. Sum local comments count for each brand deal
    let localDealCommentsSum = 0;
    for (const d of brandDeals) {
      try {
        const comms = await getDealComments(d.id);
        localDealCommentsSum += comms.length;
      } catch {
        // ignore
      }
    }

    // 4. Fetch Real Interactions (Impressions, Clicks, etc.)
    let interactionViews = 0;
    let interactionClicks = 0;
    let rawInteractions: any[] = [];

    if (dealIds.length > 0) {
      try {
        const { data, error } = await (supabase.from('interactions') as any)
          .select('type, deal_id, created_at')
          .in('deal_id', dealIds);

        if (!error && Array.isArray(data)) {
          rawInteractions = data;
          for (const item of data) {
            if (item.type === 'view') interactionViews++;
            if (item.type === 'click') interactionClicks++;
          }
        }
      } catch {
        // offline
      }
    }

    // 5. Fetch Daily Analytics Rollups from analytics_daily
    let dailyRows: AnalyticsDaily[] = [];
    if (brandId) {
      try {
        const { data, error } = await supabase
          .from('analytics_daily')
          .select('*')
          .eq('brand_id', brandId);

        if (!error && Array.isArray(data)) {
          dailyRows = data as AnalyticsDaily[];
        }
      } catch {
        // offline
      }
    }

    // Aggregate daily rows
    let rolledViews = 0;
    let rolledClicks = 0;
    for (const r of dailyRows) {
      rolledViews += r.views_count || 0;
      rolledClicks += r.clicks_count || 0;
    }

    // Also factor in local activities
    const allActivities = await getAllActivities();
    const brandActivities = allActivities.filter((a) => {
      if (brandId && a.brand_id === brandId) return true;
      if (dealIds.includes(a.deal_id)) return true;
      const bName = (a.brand_name || '').toLowerCase().trim();
      if (cleanBrandName && bName && (bName.includes(cleanBrandName) || cleanBrandName.includes(bName))) return true;
      return false;
    });

    const finalLikes = Math.max(totalLikes, localDealLikesSum);
    const finalComments = Math.max(totalComments, localDealCommentsSum);
    const finalImpressions = Math.max(interactionViews, rolledViews);
    const finalClicks = Math.max(interactionClicks, rolledClicks);

    const ctrVal = finalImpressions > 0 ? ((finalClicks / finalImpressions) * 100).toFixed(1) : '0.0';

    // 6. Compute 7 Days Real Activity Distribution
    const last7Days: DailyActivityPoint[] = emptyDays.map((day) => {
      let v = 0;
      let c = 0;
      let l = 0;
      let comm = 0;

      // Check daily rows
      for (const r of dailyRows) {
        if (r.date === day.date) {
          v += r.views_count || 0;
          c += r.clicks_count || 0;
          l += r.likes_count || 0;
        }
      }

      // Check raw interactions
      for (const it of rawInteractions) {
        if (it.created_at && it.created_at.startsWith(day.date)) {
          if (it.type === 'view') v++;
          if (it.type === 'click') c++;
          if (it.type === 'like') l++;
        }
      }

      // Check local activities
      for (const act of brandActivities) {
        if (act.created_at && act.created_at.startsWith(day.date)) {
          if (act.type === 'like') l++;
          if (act.type === 'comment') comm++;
        }
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

    return {
      metrics: {
        totalActivePosts,
        totalImpressions: finalImpressions,
        totalLikes: finalLikes,
        totalComments: finalComments,
        totalClicks: finalClicks,
        ctr: `${ctrVal}%`,
      },
      last7Days,
    };
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
      },
      last7Days: emptyDays,
    };
  }
}
