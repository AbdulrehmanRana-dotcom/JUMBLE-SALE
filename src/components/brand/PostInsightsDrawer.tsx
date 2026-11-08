import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DealLiveTimer } from '@/components/brand/DealLiveTimer';
import { fetchSingleDealInsights, type DealInsightData } from '@/lib/dealInsights';
import { fontFamily, radii, spacing } from '@/theme';
import type { Deal } from '@/types/database.types';

interface PostInsightsDrawerProps {
  deal: Deal | null;
  visible: boolean;
  onClose: () => void;
  onExtend?: (dealId: string, days: number) => void;
  onTogglePause?: (dealId: string) => void;
  onDuplicate?: (dealId: string) => void;
}

export function PostInsightsDrawer({
  deal,
  visible,
  onClose,
  onExtend,
  onTogglePause,
  onDuplicate,
}: PostInsightsDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DealInsightData | null>(null);

  const loadInsights = async () => {
    if (!deal) return;
    setLoading(true);
    try {
      const res = await fetchSingleDealInsights(deal);
      setData(res);
    } catch (err) {
      console.error('[PostInsightsDrawer] Error fetching insights:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && deal) {
      loadInsights();
    } else {
      setData(null);
    }
  }, [visible, deal]);

  if (!visible || !deal) {
    return null;
  }

  const bannerUri =
    deal.image_urls?.[0] ||
    deal.banner_url ||
    'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=1000&q=80';

  const isPaused = deal.status === 'paused';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.backdropPressable} onPress={onClose} />

        <View style={styles.sheetContainer}>
          {/* Top Grab Bar Handle */}
          <View style={styles.handleBar} />

          {/* Drawer Top Navigation Bar */}
          <View style={styles.navBar}>
            <View style={styles.navTitleRow}>
              <Ionicons name="bar-chart" size={18} color="#00FF66" />
              <Text style={styles.navTitle}>Post Insights & Analytics</Text>
            </View>

            <View style={styles.navActionsRow}>
              <Pressable
                style={styles.navIconBtn}
                onPress={loadInsights}
                hitSlop={8}>
                <Ionicons name="refresh" size={18} color="#94A3B8" />
              </Pressable>
              <Pressable
                style={[styles.navIconBtn, styles.closeBtn]}
                onPress={onClose}
                hitSlop={8}>
                <Ionicons name="close" size={20} color="#F1F5F9" />
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            {/* Deal Summary Card */}
            <View style={styles.summaryCard}>
              <Image source={{ uri: bannerUri }} style={styles.summaryThumb} />
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryTitle} numberOfLines={2}>
                  {deal.title}
                </Text>
                <View style={styles.summaryMetaRow}>
                  {Boolean(deal.discount_pct) && (
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountBadgeText}>
                        {deal.discount_pct}% OFF
                      </Text>
                    </View>
                  )}
                  {Boolean(deal.promo_code) && (
                    <View style={styles.promoBadge}>
                      <Ionicons name="pricetag" size={10} color="#38BDF8" />
                      <Text style={styles.promoBadgeText}>{deal.promo_code}</Text>
                    </View>
                  )}
                  {Boolean(deal.is_pinned) && (
                    <View style={styles.pinnedBadge}>
                      <Ionicons name="pin" size={10} color="#090A0E" />
                      <Text style={styles.pinnedBadgeText}>PINNED</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Live Countdown & Urgency Status */}
            <View style={styles.timerContainer}>
              <View style={styles.timerHeader}>
                <Ionicons name="stopwatch-outline" size={16} color="#00FF66" />
                <Text style={styles.timerSectionTitle}>Live Countdown Urgency</Text>
              </View>
              <View style={styles.timerWidgetWrapper}>
                <DealLiveTimer
                  dealId={deal.id}
                  endDate={deal.end_date}
                  status={deal.status}
                />
              </View>
              <View style={styles.datesRow}>
                <Text style={styles.dateLabel}>
                  Ends: {new Date(deal.end_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
                <Text style={styles.dateLabel}>
                  Type: {deal.deal_type === 'in_store' ? 'In-Store Outlets' : 'Online Store'}
                </Text>
              </View>
            </View>

            {/* Real Database 2x2 Metric Grid */}
            {loading && !data ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#00FF66" />
                <Text style={styles.loadingText}>Fetching database metrics...</Text>
              </View>
            ) : (
              <View style={styles.metricsGrid}>
                {/* 1. Impressions (Views) */}
                <View style={styles.metricCard}>
                  <View style={[styles.metricIconWrap, { backgroundColor: '#0284C720' }]}>
                    <Ionicons name="eye" size={20} color="#38BDF8" />
                  </View>
                  <Text style={styles.metricValue}>{data?.impressions ?? 0}</Text>
                  <Text style={styles.metricTitle}>IMPRESSIONS</Text>
                  <Text style={styles.metricSubtitle}>Real customer views</Text>
                </View>

                {/* 2. Clicks (Store visits) */}
                <View style={styles.metricCard}>
                  <View style={[styles.metricIconWrap, { backgroundColor: '#10B98120' }]}>
                    <Ionicons name="open-outline" size={20} color="#00FF66" />
                  </View>
                  <Text style={styles.metricValue}>{data?.clicks ?? 0}</Text>
                  <Text style={styles.metricTitle}>CLICKS</Text>
                  <Text style={styles.metricSubtitle}>Website redirects</Text>
                </View>

                {/* 3. CTR % */}
                <View style={styles.metricCard}>
                  <View style={[styles.metricIconWrap, { backgroundColor: '#8B5CF620' }]}>
                    <Ionicons name="trending-up" size={20} color="#A78BFA" />
                  </View>
                  <Text style={styles.metricValue}>{data?.ctr ?? '0.0%'}</Text>
                  <Text style={styles.metricTitle}>CTR</Text>
                  <Text style={styles.metricSubtitle}>Click-through-rate</Text>
                </View>

                {/* 4. Total Hearts & Comments */}
                <View style={styles.metricCard}>
                  <View style={[styles.metricIconWrap, { backgroundColor: '#EC489920' }]}>
                    <Ionicons name="heart" size={20} color="#F43F5E" />
                  </View>
                  <Text style={styles.metricValue}>
                    {data?.likes ?? 0}
                    <Text style={{ fontSize: 13, color: '#94A3B8' }}> ❤️ / </Text>
                    {data?.commentsCount ?? 0}
                    <Text style={{ fontSize: 13, color: '#94A3B8' }}> 💬</Text>
                  </Text>
                  <Text style={styles.metricTitle}>ENGAGEMENT</Text>
                  <Text style={styles.metricSubtitle}>Likes & customer reviews</Text>
                </View>
              </View>
            )}

            {/* Quick Actions Bar */}
            <View style={styles.actionsSection}>
              <Text style={styles.sectionHeaderTitle}>QUICK MANAGEMENT CONTROLS</Text>
              <View style={styles.actionButtonsRow}>
                {/* Extend +3 Days */}
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => onExtend && onExtend(deal.id, 3)}>
                  <Ionicons name="add-circle-outline" size={16} color="#00FF66" />
                  <Text style={styles.actionBtnText}>+3 Days</Text>
                </Pressable>

                {/* Extend +7 Days */}
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => onExtend && onExtend(deal.id, 7)}>
                  <Ionicons name="calendar-outline" size={16} color="#00FF66" />
                  <Text style={styles.actionBtnText}>+7 Days</Text>
                </Pressable>

                {/* Pause / Resume */}
                <Pressable
                  style={[
                    styles.actionBtn,
                    isPaused && { borderColor: '#00FF6640', backgroundColor: '#00FF6615' },
                  ]}
                  onPress={() => onTogglePause && onTogglePause(deal.id)}>
                  <Ionicons
                    name={isPaused ? 'play-outline' : 'pause-outline'}
                    size={16}
                    color={isPaused ? '#00FF66' : '#F59E0B'}
                  />
                  <Text
                    style={[
                      styles.actionBtnText,
                      { color: isPaused ? '#00FF66' : '#F59E0B' },
                    ]}>
                    {isPaused ? 'Resume' : 'Pause'}
                  </Text>
                </Pressable>

                {/* Duplicate */}
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => onDuplicate && onDuplicate(deal.id)}>
                  <Ionicons name="copy-outline" size={16} color="#38BDF8" />
                  <Text style={[styles.actionBtnText, { color: '#38BDF8' }]}>Clone</Text>
                </Pressable>
              </View>
            </View>

            {/* Customer Reviews Section */}
            <View style={styles.reviewsSection}>
              <View style={styles.reviewsHeaderRow}>
                <Text style={styles.sectionHeaderTitle}>
                  CUSTOMER REVIEWS ({data?.comments.length ?? 0})
                </Text>
              </View>

              {data?.comments && data.comments.length > 0 ? (
                data.comments.map((c) => (
                  <View key={c.id} style={styles.commentItem}>
                    <View style={styles.commentAvatar}>
                      <Text style={styles.commentAvatarText}>
                        {(c.user_name || 'C').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.commentBody}>
                      <View style={styles.commentHeader}>
                        <Text style={styles.commentAuthor}>{c.user_name}</Text>
                        <Text style={styles.commentDate}>
                          {c.created_at
                            ? new Date(c.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })
                            : 'Recently'}
                        </Text>
                      </View>
                      <Text style={styles.commentText}>{c.text}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.noCommentsBox}>
                  <Ionicons name="chatbubbles-outline" size={28} color="#475569" />
                  <Text style={styles.noCommentsText}>
                    No customer reviews yet on this promotion.
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  backdropPressable: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheetContainer: {
    backgroundColor: '#090A0E',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: '#1E293B',
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 24,
  },
  handleBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  navTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navTitle: {
    fontSize: 16,
    fontFamily: fontFamily.bold,
    color: '#F8FAFC',
  },
  navActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#141721',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    backgroundColor: '#1E293B',
  },
  scrollArea: {
    maxHeight: 650,
  },
  scrollContent: {
    padding: spacing[4],
    gap: spacing[3],
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#141721',
    borderRadius: radii.md,
    padding: spacing[2],
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
    gap: spacing[2],
  },
  summaryThumb: {
    width: 58,
    height: 58,
    borderRadius: radii.sm,
    backgroundColor: '#1E293B',
  },
  summaryInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 14,
    fontFamily: fontFamily.bold,
    color: '#F8FAFC',
    lineHeight: 18,
  },
  summaryMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  discountBadge: {
    backgroundColor: '#00FF6615',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#00FF6640',
  },
  discountBadgeText: {
    fontSize: 10,
    fontFamily: fontFamily.bold,
    color: '#00FF66',
  },
  promoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284C720',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#38BDF840',
  },
  promoBadgeText: {
    fontSize: 10,
    fontFamily: fontFamily.bold,
    color: '#38BDF8',
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#00FF66',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pinnedBadgeText: {
    fontSize: 9,
    fontFamily: fontFamily.bold,
    color: '#090A0E',
  },
  timerContainer: {
    backgroundColor: '#141721',
    borderRadius: radii.md,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: spacing[1],
  },
  timerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  timerSectionTitle: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timerWidgetWrapper: {
    alignItems: 'flex-start',
    marginVertical: 4,
  },
  datesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 6,
  },
  dateLabel: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: fontFamily.medium,
  },
  loadingBox: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#94A3B8',
    fontFamily: fontFamily.medium,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  metricCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#141721',
    borderRadius: radii.md,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  metricIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  metricValue: {
    fontSize: 22,
    fontFamily: fontFamily.bold,
    color: '#F8FAFC',
    lineHeight: 26,
  },
  metricTitle: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    color: '#94A3B8',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  metricSubtitle: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  actionsSection: {
    backgroundColor: '#141721',
    borderRadius: radii.md,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: spacing[2],
  },
  sectionHeaderTitle: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    color: '#94A3B8',
    letterSpacing: 0.6,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#0F121C',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  actionBtnText: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    color: '#00FF66',
  },
  reviewsSection: {
    backgroundColor: '#141721',
    borderRadius: radii.md,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: spacing[2],
  },
  reviewsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commentItem: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00FF6625',
    borderWidth: 1,
    borderColor: '#00FF6650',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    color: '#00FF66',
  },
  commentBody: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commentAuthor: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    color: '#F1F5F9',
  },
  commentDate: {
    fontSize: 10,
    color: '#64748B',
  },
  commentText: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 2,
    lineHeight: 16,
  },
  noCommentsBox: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 6,
  },
  noCommentsText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});
