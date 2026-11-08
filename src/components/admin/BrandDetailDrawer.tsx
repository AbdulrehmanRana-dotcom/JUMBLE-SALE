import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { BrandDetailedIntelligence } from '@/lib/adminAnalytics';
import type { Deal } from '@/types/database.types';
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

interface BrandDetailDrawerProps {
  visible: boolean;
  data: BrandDetailedIntelligence | null;
  loading: boolean;
  onClose: () => void;
  onToggleDealStatus: (deal: Deal) => void;
  onDeleteDeal: (deal: Deal) => void;
  onToggleBrandSuspension: (brand: any) => void;
}

export function BrandDetailDrawer({
  visible,
  data,
  loading,
  onClose,
  onToggleDealStatus,
  onDeleteDeal,
  onToggleBrandSuspension,
}: BrandDetailDrawerProps) {
  const [activeSubTab, setActiveSubTab] = useState<'posts' | 'activities'>('posts');

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.brandAvatar}>
                {data?.brand?.logo_url ? (
                  <Image source={{ uri: data.brand.logo_url }} style={styles.brandAvatarImg} />
                ) : (
                  <Ionicons name="business" size={24} color={adminTheme.neon} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.brandTitle} numberOfLines={1}>
                    {data?.brand?.name || 'Brand Details'}
                  </Text>
                  {data?.brand?.status && (
                    <Badge
                      label={data.brand.status.toUpperCase()}
                      variant={
                        data.brand.status === 'active'
                          ? 'success'
                          : data.brand.status === 'pending'
                          ? 'warning'
                          : 'error'
                      }
                    />
                  )}
                </View>
                <Text style={styles.brandSub}>
                  {data?.brand?.business_email} • {data?.brand?.category || 'Retail'}
                </Text>
              </View>
            </View>

            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={adminTheme.textSecondary} />
            </Pressable>
          </View>

          {loading || !data ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={adminTheme.neon} />
              <Text style={styles.loadingText}>Loading real database intelligence...</Text>
            </View>
          ) : (
            <>
              {/* Quick Brand Controls */}
              <View style={styles.brandQuickActionRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="calendar-outline" size={14} color={adminTheme.textMuted} />
                  <Text style={styles.metaInfoText}>
                    Registered: {new Date(data.brand.created_at).toLocaleDateString('en-PK')}
                  </Text>
                </View>
                <Button
                  label={data.brand.status === 'suspended' ? 'Reactivate Brand ✅' : 'Suspend Brand 🚫'}
                  variant={data.brand.status === 'suspended' ? 'primary' : 'outline'}
                  size="sm"
                  onPress={() => onToggleBrandSuspension(data.brand)}
                />
              </View>

              {/* Sub-Tabs: Posts & Promotions vs Brand Activities */}
              <View style={styles.tabNavRow}>
                <Pressable
                  style={[styles.tabNavBtn, activeSubTab === 'posts' && styles.tabNavBtnActive]}
                  onPress={() => setActiveSubTab('posts')}>
                  <Ionicons
                    name="pricetags"
                    size={16}
                    color={activeSubTab === 'posts' ? adminTheme.neon : adminTheme.textSecondary}
                  />
                  <Text
                    style={[styles.tabNavText, activeSubTab === 'posts' && styles.tabNavTextActive]}>
                    Posts & Promotions ({data.posts.length})
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.tabNavBtn, activeSubTab === 'activities' && styles.tabNavBtnActive]}
                  onPress={() => setActiveSubTab('activities')}>
                  <Ionicons
                    name="stats-chart"
                    size={16}
                    color={activeSubTab === 'activities' ? adminTheme.neon : adminTheme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.tabNavText,
                      activeSubTab === 'activities' && styles.tabNavTextActive,
                    ]}>
                    Activities & Analytics
                  </Text>
                </Pressable>
              </View>

              {/* Body */}
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}>
                {activeSubTab === 'posts' ? (
                  /* ─── TAB 1: POSTS & PROMOTIONS ─── */
                  <View>
                    {data.posts.length === 0 ? (
                      <EmptyState
                        title="No Posts Uploaded"
                        description="This brand has not uploaded any promotions or deals yet."
                        icon="pricetag-outline"
                      />
                    ) : (
                      data.posts.map((deal) => (
                        <View key={deal.id} style={styles.postCard}>
                          <View style={styles.postCardTop}>
                            {deal.banner_url || deal.image_urls?.[0] ? (
                              <Image
                                source={{ uri: deal.banner_url || deal.image_urls?.[0] }}
                                style={styles.postThumb}
                              />
                            ) : (
                              <View style={styles.postThumbPlaceholder}>
                                <Ionicons name="pricetag" size={20} color={adminTheme.neon} />
                              </View>
                            )}

                            <View style={{ flex: 1 }}>
                              <Text style={styles.postTitle} numberOfLines={2}>
                                {deal.title}
                              </Text>
                              <View style={styles.postBadgeRow}>
                                <Badge
                                  label={`${deal.discount_pct}% OFF`}
                                  variant="primary"
                                />
                                <Badge
                                  label={deal.status.toUpperCase()}
                                  variant={
                                    deal.status === 'active'
                                      ? 'success'
                                      : deal.status === 'pending'
                                      ? 'warning'
                                      : 'error'
                                  }
                                />
                                {deal.promo_code && (
                                  <Text style={styles.promoCodePill}>Code: {deal.promo_code}</Text>
                                )}
                              </View>
                              <Text style={styles.postMeta}>
                                Validity: {new Date(deal.start_date).toLocaleDateString()} –{' '}
                                {new Date(deal.end_date).toLocaleDateString()} • {deal.city || 'Pakistan'}
                              </Text>
                            </View>
                          </View>

                          {deal.description ? (
                            <Text style={styles.postDesc} numberOfLines={2}>
                              {deal.description}
                            </Text>
                          ) : null}

                          {/* Post Moderation Controls */}
                          <View style={styles.postActionRow}>
                            <Button
                              label={
                                deal.status === 'suspended'
                                  ? 'Reactivate Post ✅'
                                  : 'Suspend Post 🚫'
                              }
                              variant={deal.status === 'suspended' ? 'primary' : 'outline'}
                              size="sm"
                              onPress={() => onToggleDealStatus(deal)}
                              style={{ flex: 1 }}
                            />
                            <Button
                              label="Delete 🗑️"
                              variant="ghost"
                              size="sm"
                              onPress={() => onDeleteDeal(deal)}
                              style={{ flex: 0.6 }}
                            />
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                ) : (
                  /* ─── TAB 2: ACTIVITIES & ANALYTICS ─── */
                  <View style={{ gap: spacing[4] }}>
                    {/* KPI Metric Grid */}
                    <View style={styles.metricGrid}>
                      <View style={styles.metricCard}>
                        <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                          <Ionicons name="people" size={18} color="#3B82F6" />
                        </View>
                        <Text style={styles.metricValue}>{data.metrics.followersCount}</Text>
                        <Text style={styles.metricLabel}>Followers</Text>
                      </View>

                      <View style={styles.metricCard}>
                        <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                          <Ionicons name="heart" size={18} color="#EF4444" />
                        </View>
                        <Text style={styles.metricValue}>{data.metrics.likesCount}</Text>
                        <Text style={styles.metricLabel}>Likes</Text>
                      </View>

                      <View style={styles.metricCard}>
                        <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                          <Ionicons name="share-social" size={18} color="#8B5CF6" />
                        </View>
                        <Text style={styles.metricValue}>{data.metrics.sharesCount}</Text>
                        <Text style={styles.metricLabel}>Shares</Text>
                      </View>

                      <View style={styles.metricCard}>
                        <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(0, 255, 102, 0.15)' }]}>
                          <Ionicons name="hand-left" size={18} color={adminTheme.neon} />
                        </View>
                        <Text style={styles.metricValue}>{data.metrics.clicksCount}</Text>
                        <Text style={styles.metricLabel}>Clicks</Text>
                      </View>

                      <View style={styles.metricCard}>
                        <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                          <Ionicons name="chatbubbles" size={18} color="#F59E0B" />
                        </View>
                        <Text style={styles.metricValue}>{data.metrics.reviewsCount}</Text>
                        <Text style={styles.metricLabel}>Reviews</Text>
                      </View>

                      <View style={styles.metricCard}>
                        <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(14, 165, 233, 0.15)' }]}>
                          <Ionicons name="pricetags" size={18} color="#0EA5E9" />
                        </View>
                        <Text style={styles.metricValue}>{data.metrics.totalPromotions}</Text>
                        <Text style={styles.metricLabel}>Total Posts</Text>
                      </View>
                    </View>

                    {/* Customer Reviews Section */}
                    <View style={styles.boxSection}>
                      <View style={styles.boxHeaderRow}>
                        <Text style={styles.boxSectionTitle}>Customer Reviews & Feedback</Text>
                        <Badge label={`${data.reviews.length} Reviews`} variant="info" />
                      </View>

                      {data.reviews.length === 0 ? (
                        <Text style={styles.emptyNotice}>No customer reviews received yet.</Text>
                      ) : (
                        data.reviews.map((rev) => (
                          <View key={rev.id} style={styles.reviewItem}>
                            <View style={styles.reviewItemTop}>
                              <Ionicons name="person-circle" size={18} color={adminTheme.neon} />
                              <Text style={styles.reviewerName}>{rev.user_name}</Text>
                              <Text style={styles.reviewDate}>
                                {new Date(rev.created_at).toLocaleDateString('en-PK')}
                              </Text>
                            </View>
                            <Text style={styles.reviewDealTitle}>Deal: {rev.deal_title}</Text>
                            <Text style={styles.reviewText}>&ldquo;{rev.text}&rdquo;</Text>
                          </View>
                        ))
                      )}
                    </View>

                    {/* Brand Recent Activity Stream */}
                    <View style={styles.boxSection}>
                      <View style={styles.boxHeaderRow}>
                        <Text style={styles.boxSectionTitle}>Brand Event Activity Stream</Text>
                        <Badge label="Live Stream" variant="success" />
                      </View>

                      {data.activities.length === 0 ? (
                        <Text style={styles.emptyNotice}>No recorded activity events yet.</Text>
                      ) : (
                        data.activities.map((act) => (
                          <View key={act.id} style={styles.activityRow}>
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
                            <View style={{ flex: 1 }}>
                              <Text style={styles.activityText}>
                                <Text style={{ fontWeight: 'bold', color: adminTheme.textPrimary }}>
                                  {act.user_name}
                                </Text>{' '}
                                {act.type === 'like'
                                  ? 'liked'
                                  : act.type === 'comment'
                                  ? 'commented on'
                                  : 'shared'}{' '}
                                &quot;{act.deal_title}&quot;
                              </Text>
                              <Text style={styles.activityTime}>
                                {new Date(act.created_at).toLocaleString('en-PK')}
                              </Text>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                )}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...(StyleSheet.absoluteFill as any),
  },
  sheetContainer: {
    height: '92%',
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    backgroundColor: adminTheme.bgApp,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: adminTheme.border,
    paddingTop: spacing[4],
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
  },
  brandAvatar: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: adminTheme.bgCard,
    borderWidth: 1,
    borderColor: adminTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandAvatarImg: {
    width: '100%',
    height: '100%',
  },
  brandTitle: {
    ...typography.h3,
    color: adminTheme.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  brandSub: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: spacing[2],
    backgroundColor: adminTheme.bgCard,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
  },
  loadingText: {
    ...typography.body,
    color: adminTheme.textSecondary,
  },
  brandQuickActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: adminTheme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
  },
  metaInfoText: {
    ...typography.caption,
    color: adminTheme.textMuted,
  },
  tabNavRow: {
    flexDirection: 'row',
    backgroundColor: adminTheme.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
  },
  tabNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing[3],
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabNavBtnActive: {
    borderBottomColor: adminTheme.neon,
    backgroundColor: adminTheme.neonLight,
  },
  tabNavText: {
    ...typography.bodyMedium,
    color: adminTheme.textSecondary,
    fontSize: 13,
  },
  tabNavTextActive: {
    color: adminTheme.neon,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: spacing[4],
    paddingBottom: spacing[10],
  },
  postCard: {
    backgroundColor: adminTheme.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: adminTheme.border,
    padding: spacing[3],
    marginBottom: spacing[3],
    gap: spacing[2],
  },
  postCardTop: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  postThumb: {
    width: 60,
    height: 60,
    borderRadius: radii.sm,
  },
  postThumbPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: radii.sm,
    backgroundColor: adminTheme.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postTitle: {
    ...typography.bodyMedium,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  postBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 4,
    flexWrap: 'wrap',
  },
  promoCodePill: {
    ...typography.caption,
    color: adminTheme.neon,
    backgroundColor: adminTheme.bgInput,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.xs,
    fontSize: 11,
  },
  postMeta: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
  },
  postDesc: {
    ...typography.caption,
    color: adminTheme.textSecondary,
  },
  postActionRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  metricCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: adminTheme.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: adminTheme.border,
    padding: spacing[3],
    alignItems: 'center',
    gap: 4,
  },
  metricIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  metricValue: {
    ...typography.h3,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 18,
  },
  metricLabel: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  boxSection: {
    backgroundColor: adminTheme.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: adminTheme.border,
    padding: spacing[4],
    gap: spacing[3],
  },
  boxHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
    paddingBottom: spacing[2],
  },
  boxSectionTitle: {
    ...typography.bodyMedium,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyNotice: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontStyle: 'italic',
    paddingVertical: spacing[2],
  },
  reviewItem: {
    backgroundColor: adminTheme.bgCardHover,
    borderRadius: radii.sm,
    padding: spacing[3],
    gap: 4,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  reviewItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reviewerName: {
    ...typography.caption,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    flex: 1,
  },
  reviewDate: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
  },
  reviewDealTitle: {
    ...typography.caption,
    color: adminTheme.neon,
    fontSize: 11,
  },
  reviewText: {
    ...typography.body,
    color: adminTheme.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  activityText: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 12,
  },
  activityTime: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
});
