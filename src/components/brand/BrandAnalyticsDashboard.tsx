import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import {
  fetchBrandLiveAnalytics,
  type BrandAnalyticsData,
  type DailyActivityPoint,
} from '@/lib/brandAnalytics';
import { spacing, typography } from '@/theme';

type ChartMetric = 'all' | 'views' | 'clicks' | 'likes' | 'comments';

interface Props {
  brandId?: string | null;
  brandName?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function BrandAnalyticsDashboard({
  brandId,
  brandName,
  containerStyle,
}: Props) {
  const [selectedMetric, setSelectedMetric] = useState<ChartMetric>('all');

  const {
    data: analytics,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<BrandAnalyticsData>({
    queryKey: ['brand-live-analytics', brandId, brandName],
    queryFn: () => fetchBrandLiveAnalytics(brandId, brandName),
    enabled: Boolean(brandId || brandName),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const metrics = analytics?.metrics || {
    totalActivePosts: 0,
    totalImpressions: 0,
    totalLikes: 0,
    totalComments: 0,
    totalClicks: 0,
    ctr: '0.0%',
    totalAttributedOrders: 0,
    totalSalesRevenue: 0,
  };

  const days: DailyActivityPoint[] = analytics?.last7Days || [];

  // Helper to extract metric value for a day
  const getDayValue = (d: DailyActivityPoint, metric: ChartMetric): number => {
    switch (metric) {
      case 'views':
        return d.views;
      case 'clicks':
        return d.clicks;
      case 'likes':
        return d.likes;
      case 'comments':
        return d.comments;
      case 'all':
      default:
        return d.total;
    }
  };

  const currentValues = days.map((d) => getDayValue(d, selectedMetric));
  const maxDayVal = Math.max(...currentValues, 1);
  const total7DayCount = currentValues.reduce((acc, v) => acc + v, 0);

  const getMetricColor = (metric: ChartMetric) => {
    switch (metric) {
      case 'views':
        return '#38BDF8';
      case 'clicks':
        return '#F59E0B';
      case 'likes':
        return '#FF4500';
      case 'comments':
        return '#A855F7';
      case 'all':
      default:
        return '#00FF66';
    }
  };

  const activeColor = getMetricColor(selectedMetric);

  return (
    <View style={[styles.container, containerStyle]}>
      {/* ─── 1. HEADER ROW with Live Indicator ─── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.livePulseDot} />
          <Text style={styles.headerTitle}>Live Performance Analytics</Text>
        </View>

        <Pressable
          style={styles.refreshBtn}
          onPress={() => refetch()}
          hitSlop={8}
          disabled={isRefetching}>
          {isRefetching ? (
            <ActivityIndicator size="small" color="#00FF66" />
          ) : (
            <View style={styles.refreshInner}>
              <Ionicons name="refresh" size={14} color="#00FF66" />
              <Text style={styles.refreshText}>Sync</Text>
            </View>
          )}
        </Pressable>
      </View>

      <Text style={styles.headerSubtitle}>
        Real database metrics for {brandName || 'your brand'} with zero simulated stats.
      </Text>

      {/* ─── 2. FIVE REAL KPI METRICS GRID ─── */}
      <View style={styles.kpiGrid}>
        {/* Metric 1: Total Active Posts */}
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(0, 255, 102, 0.12)' }]}>
            <Ionicons name="pricetag" size={18} color="#00FF66" />
          </View>
          <Text style={styles.kpiVal}>{metrics.totalActivePosts.toLocaleString()}</Text>
          <Text style={styles.kpiLabel}>ACTIVE POSTS</Text>
          <Text style={styles.kpiSub}>Live on catalog</Text>
        </View>

        {/* Metric 2: Total Real Impressions */}
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
            <Ionicons name="eye" size={18} color="#38BDF8" />
          </View>
          <Text style={styles.kpiVal}>{metrics.totalImpressions.toLocaleString()}</Text>
          <Text style={styles.kpiLabel}>IMPRESSIONS</Text>
          <Text style={styles.kpiSub}>Real feed views</Text>
        </View>

        {/* Metric 3: Total Likes */}
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(255, 69, 0, 0.12)' }]}>
            <Ionicons name="heart" size={18} color="#FF4500" />
          </View>
          <Text style={styles.kpiVal}>{metrics.totalLikes.toLocaleString()}</Text>
          <Text style={styles.kpiLabel}>TOTAL LIKES</Text>
          <Text style={styles.kpiSub}>Real user hearts</Text>
        </View>

        {/* Metric 4: Total Comments */}
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.12)' }]}>
            <Ionicons name="chatbubbles" size={18} color="#A855F7" />
          </View>
          <Text style={styles.kpiVal}>{metrics.totalComments.toLocaleString()}</Text>
          <Text style={styles.kpiLabel}>COMMENTS</Text>
          <Text style={styles.kpiSub}>User reviews</Text>
        </View>

        {/* Metric 5: Website Link Clicks */}
        <View style={[styles.kpiCard, styles.kpiCardWide]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
              <Ionicons name="open-outline" size={18} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={styles.kpiVal}>{metrics.totalClicks.toLocaleString()}</Text>
                <Text style={styles.kpiCtrBadge}>CTR: {metrics.ctr}</Text>
              </View>
              <Text style={styles.kpiLabel}>WEBSITE LINK CLICKS</Text>
            </View>
          </View>
          <Text style={styles.kpiSubWide}>Direct brand item buy link visits</Text>
        </View>

        {/* Metric 6: Attributed Orders */}
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(0, 255, 102, 0.12)' }]}>
            <Ionicons name="bag-check" size={18} color="#00FF66" />
          </View>
          <Text style={styles.kpiVal}>{(metrics.totalAttributedOrders || 0).toLocaleString()}</Text>
          <Text style={styles.kpiLabel}>ATTRIBUTED ORDERS</Text>
          <Text style={styles.kpiSub}>Purchases completed</Text>
        </View>

        {/* Metric 7: Total Sales Revenue */}
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
            <Ionicons name="cash" size={18} color="#38BDF8" />
          </View>
          <Text style={styles.kpiVal}>Rs. {(metrics.totalSalesRevenue || 0).toLocaleString()}</Text>
          <Text style={styles.kpiLabel}>SALES REVENUE</Text>
          <Text style={styles.kpiSub}>GMV via Jumble Sale</Text>
        </View>
      </View>

      {/* ─── 3. 7-DAY REAL ACTIVITY GRAPH ─── */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="bar-chart" size={16} color={activeColor} />
            <Text style={styles.chartTitle}>Past 7 Days Activity</Text>
          </View>
          <Text style={styles.chartTotalBadge}>
            {total7DayCount} {selectedMetric === 'all' ? 'Events' : selectedMetric}
          </Text>
        </View>

        {/* Metric Switcher Pills */}
        <View style={styles.filterPillsRow}>
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'views', label: 'Views' },
              { id: 'clicks', label: 'Clicks' },
              { id: 'likes', label: 'Likes' },
              { id: 'comments', label: 'Comments' },
            ] as { id: ChartMetric; label: string }[]
          ).map((item) => {
            const isSelected = selectedMetric === item.id;
            return (
              <Pressable
                key={item.id}
                style={[
                  styles.filterPill,
                  isSelected && {
                    backgroundColor: getMetricColor(item.id),
                    borderColor: getMetricColor(item.id),
                  },
                ]}
                onPress={() => setSelectedMetric(item.id)}>
                <Text
                  style={[
                    styles.filterPillText,
                    isSelected && { color: '#090A0E', fontWeight: '800' },
                  ]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Bar Chart Columns */}
        {isLoading ? (
          <View style={styles.chartLoadingWrap}>
            <ActivityIndicator size="small" color="#00FF66" />
          </View>
        ) : (
          <View style={styles.barChartContainer}>
            {days.map((day, idx) => {
              const val = getDayValue(day, selectedMetric);
              // Calculate dynamic height between 6px and 90px
              const barHeight = val > 0 ? Math.max(10, Math.round((val / maxDayVal) * 85)) : 5;
              const isToday = idx === days.length - 1;

              return (
                <View key={day.date} style={styles.barColumn}>
                  {/* Exact count on top */}
                  <Text style={[styles.barValueText, val > 0 && { color: '#FFFFFF', fontWeight: '700' }]}>
                    {val > 0 ? val : '0'}
                  </Text>

                  {/* Vertical bar slot */}
                  <View style={styles.barSlot}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: barHeight,
                          backgroundColor: val > 0 ? activeColor : '#222838',
                        },
                        isToday && val > 0 && styles.barFillToday,
                      ]}
                    />
                  </View>

                  {/* Day label */}
                  <Text style={[styles.dayLabelText, isToday && styles.dayLabelToday]}>
                    {isToday ? 'Today' : day.dayLabel}
                  </Text>
                  <Text style={styles.dateLabelSub}>{day.formattedDate.split(' ')[1]}</Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.chartFooter}>
          <Ionicons name="shield-checkmark-outline" size={13} color="#00FF66" />
          <Text style={styles.chartFooterText}>
            Verified Supabase stream • No arbitrary or simulated numbers
          </Text>
        </View>
      </View>

      {/* ─── 4. ATTRIBUTED ORDERS FROM JUMBLE SALE ─── */}
      <View style={styles.ordersSectionCard}>
        <View style={styles.chartHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="bag-check" size={16} color="#00FF66" />
            <Text style={styles.chartTitle}>
              Shoppers From Jumble Sale ({analytics?.attributedOrders?.length || 0})
            </Text>
          </View>
          <Text style={styles.chartTotalBadge}>
            Rs. {(metrics.totalSalesRevenue || 0).toLocaleString()} Total Sales
          </Text>
        </View>

        {(!analytics?.attributedOrders || analytics.attributedOrders.length === 0) ? (
          <View style={styles.emptyOrdersBox}>
            <Ionicons name="cart-outline" size={24} color="#64748B" />
            <Text style={styles.emptyOrdersText}>
              No confirmed purchases yet. When users shop by clicking your post links, their orders and revenue will appear here.
            </Text>
          </View>
        ) : (
          analytics.attributedOrders.map((ord) => (
            <View key={ord.id} style={styles.brandOrderRow}>
              <View style={styles.brandOrderLeft}>
                <View style={styles.orderIconWrap}>
                  <Ionicons name="person" size={14} color="#00FF66" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderCustomerName} numberOfLines={1}>
                    {ord.user_name || 'Jumble Sale Shopper'}
                  </Text>
                  <Text style={styles.orderDealName} numberOfLines={1}>
                    {ord.deal_title}
                  </Text>
                  <Text style={styles.orderTimeText}>
                    {new Date(ord.created_at).toLocaleDateString('en-PK', {
                      day: 'numeric',
                      month: 'short',
                    })} {ord.order_reference ? `• Ref #${ord.order_reference}` : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.brandOrderRight}>
                <Text style={styles.brandOrderAmount}>
                  Rs. {Number(ord.order_amount).toLocaleString()}
                </Text>
                <View style={styles.verifiedAttributionPill}>
                  <Text style={styles.verifiedAttributionText}>Confirmed</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F121A',
    borderRadius: 20,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: '#202432',
    marginBottom: spacing[4],
    gap: spacing[3],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  livePulseDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#00FF66',
    ...Platform.select({
      web: { boxShadow: '0px 0px 6px #00FF66' },
      default: {
        shadowColor: '#00FF66',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
        elevation: 3,
      },
    }),
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    ...typography.caption,
    fontSize: 12,
    color: '#94A3B8',
    marginTop: -4,
  },
  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 255, 102, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.25)',
  },
  refreshInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  refreshText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: '#00FF66',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  kpiCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: '#141721',
    borderRadius: 14,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#222838',
    gap: 2,
  },
  kpiCardWide: {
    flexBasis: '100%',
    flexGrow: 1,
    marginTop: 2,
  },
  kpiIconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  kpiVal: {
    ...typography.h2,
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  kpiCtrBadge: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '800',
    color: '#00FF66',
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  kpiLabel: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  kpiSub: {
    ...typography.caption,
    fontSize: 11,
    color: '#64748B',
  },
  kpiSubWide: {
    ...typography.caption,
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: '#141721',
    borderRadius: 16,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#222838',
    gap: spacing[3],
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartTitle: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  chartTotalBadge: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    backgroundColor: '#1E2333',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#1C2130',
    borderWidth: 1,
    borderColor: '#262D40',
  },
  filterPillText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  chartLoadingWrap: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barChartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 135,
    paddingTop: 16,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
  },
  barValueText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  barSlot: {
    height: 90,
    width: 22,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: '100%',
    borderRadius: 5,
    minHeight: 5,
  },
  barFillToday: {
    ...Platform.select({
      web: { boxShadow: '0px 0px 5px rgba(0, 255, 102, 0.6)' },
      default: {
        shadowColor: '#00FF66',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 5,
        elevation: 2,
      },
    }),
  },
  dayLabelText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 6,
  },
  dayLabelToday: {
    color: '#00FF66',
    fontWeight: '800',
  },
  dateLabelSub: {
    ...typography.caption,
    fontSize: 9,
    color: '#475569',
  },
  chartFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 255, 102, 0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  chartFooterText: {
    ...typography.caption,
    fontSize: 11,
    color: '#00FF66',
    fontWeight: '600',
  },
  ordersSectionCard: {
    backgroundColor: '#141722',
    borderRadius: 16,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#202432',
    gap: 12,
  },
  emptyOrdersBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F121C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E2333',
    gap: 8,
  },
  emptyOrdersText: {
    ...typography.caption,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 340,
  },
  brandOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0D1018',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E2333',
    gap: 12,
  },
  brandOrderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  orderIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 255, 102, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderCustomerName: {
    ...typography.body,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  orderDealName: {
    ...typography.caption,
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  orderTimeText: {
    ...typography.caption,
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  brandOrderRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  brandOrderAmount: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '800',
    color: '#00FF66',
  },
  verifiedAttributionPill: {
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedAttributionText: {
    color: '#00FF66',
    fontSize: 10,
    fontWeight: '700',
  },
});
