import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AppActivityMetrics } from '@/lib/adminAnalytics';
import { radii, spacing, typography } from '@/theme';

const adminTheme = {
  bgApp: '#090A0D',
  bgCard: '#13151C',
  bgCardHover: '#181B24',
  bgInput: '#151821',
  border: '#1F2330',
  neon: '#00FF66',
  neonLight: 'rgba(0, 255, 102, 0.12)',
  textPrimary: '#FFFFFF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  warning: '#F59E0B',
  error: '#EF4444',
};

interface AdminAppActivitySectionProps {
  metrics: AppActivityMetrics | null;
  loading: boolean;
  onRefresh: () => void;
}

export function AdminAppActivitySection({
  metrics,
  loading,
  onRefresh,
}: AdminAppActivitySectionProps) {
  if (loading && !metrics) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={adminTheme.neon} />
        <Text style={styles.centerText}>Computing platform metrics from database...</Text>
      </View>
    );
  }

  const m = metrics || {
    totalUsers: 0,
    totalBrands: 0,
    activeBrands: 0,
    pendingBrands: 0,
    totalDeals: 0,
    activeDeals: 0,
    totalViews: 0,
    totalClicks: 0,
    totalShares: 0,
    totalLikes: 0,
    totalComments: 0,
    totalFollows: 0,
    clickThroughRate: 0,
    liveEvents: [],
    topBrands: [],
    topDeals: [],
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={onRefresh}
          tintColor={adminTheme.neon}
        />
      }>
      {/* Platform Health KPI Banner */}
      <View style={styles.sectionHeader}>
        <Text style={styles.heading}>App Usage & System Engagement</Text>
        <Text style={styles.subHeading}>
          Live data computed directly from Supabase tables
        </Text>
      </View>

      {/* KPI 4-Column Grid */}
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
            <Ionicons name="people" size={20} color="#3B82F6" />
          </View>
          <Text style={styles.kpiVal}>{m.totalUsers}</Text>
          <Text style={styles.kpiLbl}>Active Shoppers</Text>
        </View>

        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
            <Ionicons name="business" size={20} color="#10B981" />
          </View>
          <Text style={styles.kpiVal}>{m.totalBrands}</Text>
          <Text style={styles.kpiLbl}>Registered Brands</Text>
        </View>

        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
            <Ionicons name="pricetags" size={20} color="#F59E0B" />
          </View>
          <Text style={styles.kpiVal}>{m.totalDeals}</Text>
          <Text style={styles.kpiLbl}>Total Promotions</Text>
        </View>

        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: adminTheme.neonLight }]}>
            <Ionicons name="flash" size={20} color={adminTheme.neon} />
          </View>
          <Text style={styles.kpiVal}>{m.activeDeals}</Text>
          <Text style={styles.kpiLbl}>Live Active Deals</Text>
        </View>
      </View>

      {/* Engagement Stats Grid */}
      <View style={styles.panelCard}>
        <View style={styles.panelHeaderRow}>
          <Text style={styles.panelTitle}>Platform Engagement Breakdown</Text>
          <Badge label={`CTR: ${m.clickThroughRate}%`} variant="success" />
        </View>

        <View style={styles.statRowList}>
          <View style={styles.statItem}>
            <Ionicons name="eye-outline" size={18} color={adminTheme.neon} />
            <Text style={styles.statName}>Total Deal Views</Text>
            <Text style={styles.statNumber}>{m.totalViews}</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="hand-left-outline" size={18} color="#3B82F6" />
            <Text style={styles.statName}>Total Deal Clicks</Text>
            <Text style={styles.statNumber}>{m.totalClicks}</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="share-social-outline" size={18} color="#8B5CF6" />
            <Text style={styles.statName}>Total Deal Shares</Text>
            <Text style={styles.statNumber}>{m.totalShares}</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="heart-outline" size={18} color="#EF4444" />
            <Text style={styles.statName}>Total Likes Given</Text>
            <Text style={styles.statNumber}>{m.totalLikes}</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="chatbubbles-outline" size={18} color="#F59E0B" />
            <Text style={styles.statName}>Total Customer Reviews</Text>
            <Text style={styles.statNumber}>{m.totalComments}</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="person-add-outline" size={18} color="#00E5FF" />
            <Text style={styles.statName}>Total Brand Follows</Text>
            <Text style={styles.statNumber}>{m.totalFollows}</Text>
          </View>
        </View>
      </View>

      {/* Leaderboards Row */}
      <View style={styles.leaderboardRow}>
        {/* Top Brands */}
        <View style={[styles.panelCard, { flex: 1 }]}>
          <Text style={styles.panelTitle}>Top Brands by Followers</Text>
          {m.topBrands.length === 0 ? (
            <Text style={styles.emptyNotice}>No brand engagement records yet.</Text>
          ) : (
            m.topBrands.map((tb, idx) => (
              <View key={tb.brand_id} style={styles.leaderboardItem}>
                <Text style={styles.rankNum}>#{idx + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaderTitle}>{tb.brand_name}</Text>
                  <Text style={styles.leaderSub}>{tb.interactions} total interactions</Text>
                </View>
                <Badge label={`${tb.followers} Followers`} variant="info" />
              </View>
            ))
          )}
        </View>

        {/* Top Promotions */}
        <View style={[styles.panelCard, { flex: 1 }]}>
          <Text style={styles.panelTitle}>Top Deals by Clicks</Text>
          {m.topDeals.length === 0 ? (
            <Text style={styles.emptyNotice}>No deal clicks logged yet.</Text>
          ) : (
            m.topDeals.map((td, idx) => (
              <View key={td.deal_id} style={styles.leaderboardItem}>
                <Text style={styles.rankNum}>#{idx + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaderTitle} numberOfLines={1}>
                    {td.deal_title}
                  </Text>
                  <Text style={styles.leaderSub}>{td.brand_name}</Text>
                </View>
                <Badge label={`${td.clicks} Clicks`} variant="success" />
              </View>
            ))
          )}
        </View>
      </View>

      {/* Live Event Activity Feed */}
      <View style={styles.panelCard}>
        <View style={styles.panelHeaderRow}>
          <View>
            <Text style={styles.panelTitle}>App Live Event Stream</Text>
            <Text style={styles.panelSub}>Chronological interactions across all shoppers</Text>
          </View>
          <Badge label={`${m.liveEvents.length} Events`} variant="success" />
        </View>

        {m.liveEvents.length === 0 ? (
          <EmptyState
            title="No Events Tracked Yet"
            description="When users interact with deals or brands, events will stream here live."
            icon="pulse-outline"
          />
        ) : (
          m.liveEvents.slice(0, 30).map((act) => (
            <View key={act.id} style={styles.eventRow}>
              <View
                style={[
                  styles.eventIconWrap,
                  {
                    backgroundColor:
                      act.type === 'like'
                        ? 'rgba(239, 68, 68, 0.15)'
                        : act.type === 'comment'
                        ? adminTheme.neonLight
                        : 'rgba(139, 92, 246, 0.15)',
                  },
                ]}>
                <Ionicons
                  name={
                    act.type === 'like'
                      ? 'heart'
                      : act.type === 'comment'
                      ? 'chatbubble-ellipses'
                      : 'share-social'
                  }
                  size={15}
                  color={
                    act.type === 'like'
                      ? '#EF4444'
                      : act.type === 'comment'
                      ? adminTheme.neon
                      : '#8B5CF6'
                  }
                />
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.eventText}>
                  <Text style={{ fontWeight: 'bold', color: adminTheme.textPrimary }}>
                    {act.user_name}
                  </Text>{' '}
                  {act.type === 'like'
                    ? 'liked promotion'
                    : act.type === 'comment'
                    ? 'reviewed promotion'
                    : 'shared promotion'}{' '}
                  &quot;{act.deal_title}&quot;
                </Text>
                {act.brand_name && (
                  <Text style={styles.eventBrand}>Brand: {act.brand_name}</Text>
                )}
                {act.details && (
                  <Text style={styles.eventDetails}>&ldquo;{act.details}&rdquo;</Text>
                )}
                <Text style={styles.eventTime}>
                  {new Date(act.created_at).toLocaleString('en-PK')}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.bgApp,
  },
  scrollContent: {
    padding: spacing[4],
    gap: spacing[4],
    paddingBottom: spacing[12],
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    backgroundColor: adminTheme.bgApp,
  },
  centerText: {
    ...typography.body,
    color: adminTheme.textSecondary,
  },
  sectionHeader: {
    gap: 2,
  },
  heading: {
    ...typography.h3,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 20,
  },
  subHeading: {
    ...typography.caption,
    color: adminTheme.textMuted,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: adminTheme.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: adminTheme.border,
    padding: spacing[3],
    gap: 4,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  kpiVal: {
    ...typography.h3,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 20,
  },
  kpiLbl: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 11,
  },
  panelCard: {
    backgroundColor: adminTheme.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: adminTheme.border,
    padding: spacing[4],
    gap: spacing[3],
  },
  panelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
    paddingBottom: spacing[2],
  },
  panelTitle: {
    ...typography.bodyMedium,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 15,
  },
  panelSub: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
  },
  statRowList: {
    gap: spacing[2],
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminTheme.bgCardHover,
    borderRadius: radii.sm,
    padding: spacing[3],
    gap: spacing[3],
  },
  statName: {
    ...typography.body,
    color: adminTheme.textPrimary,
    flex: 1,
    fontSize: 13,
  },
  statNumber: {
    ...typography.bodyMedium,
    color: adminTheme.neon,
    fontWeight: 'bold',
    fontSize: 15,
  },
  leaderboardRow: {
    flexDirection: 'row',
    gap: spacing[3],
    flexWrap: 'wrap',
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: adminTheme.bgCardHover,
    borderRadius: radii.sm,
    padding: spacing[2],
  },
  rankNum: {
    ...typography.caption,
    color: adminTheme.neon,
    fontWeight: 'bold',
    fontSize: 12,
    width: 24,
  },
  leaderTitle: {
    ...typography.caption,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 12,
  },
  leaderSub: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 10,
  },
  emptyNotice: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontStyle: 'italic',
    paddingVertical: spacing[2],
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  eventIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventText: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  eventBrand: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
  },
  eventDetails: {
    ...typography.caption,
    color: adminTheme.textPrimary,
    backgroundColor: adminTheme.bgInput,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radii.xs,
    fontStyle: 'italic',
    marginTop: 2,
  },
  eventTime: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
});
