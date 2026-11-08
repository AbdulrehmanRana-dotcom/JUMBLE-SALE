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
import type { UserDetailedIntelligence } from '@/lib/adminAnalytics';
import type { Profile } from '@/types/database.types';
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

interface UserDetailDrawerProps {
  visible: boolean;
  data: UserDetailedIntelligence | null;
  loading: boolean;
  onClose: () => void;
  onToggleUserSuspension: (user: Profile) => void;
}

export function UserDetailDrawer({
  visible,
  data,
  loading,
  onClose,
  onToggleUserSuspension,
}: UserDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'followed' | 'clicks' | 'shares' | 'engagement'>('followed');

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <View style={styles.userAvatar}>
                {data?.user?.avatar_url ? (
                  <Image source={{ uri: data.user.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <Ionicons name="person" size={24} color={adminTheme.neon} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {data?.user?.display_name || data?.user?.full_name || 'Shopper'}
                  </Text>
                  {data?.user && (
                    <Badge
                      label={data.user.is_active ? 'ACTIVE' : 'SUSPENDED'}
                      variant={data.user.is_active ? 'success' : 'error'}
                    />
                  )}
                </View>
                <Text style={styles.userSub}>{data?.user?.email}</Text>
              </View>
            </View>

            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={adminTheme.textSecondary} />
            </Pressable>
          </View>

          {loading || !data ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={adminTheme.neon} />
              <Text style={styles.loadingText}>Fetching shopper database activity...</Text>
            </View>
          ) : (
            <>
              {/* Account Actions Bar */}
              <View style={styles.userActionBar}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="time-outline" size={14} color={adminTheme.textMuted} />
                  <Text style={styles.metaInfoText}>
                    Joined: {new Date(data.user.created_at).toLocaleDateString('en-PK')}
                  </Text>
                </View>
                <Button
                  label={data.user.is_active ? 'Suspend User 🚫' : 'Reactivate User ✅'}
                  variant={data.user.is_active ? 'outline' : 'primary'}
                  size="sm"
                  onPress={() => onToggleUserSuspension(data.user)}
                />
              </View>

              {/* Metric Highlights */}
              <View style={styles.metricHighlightsRow}>
                <View style={styles.metricMiniCard}>
                  <Text style={styles.metricMiniVal}>{data.metrics.followedBrandsCount}</Text>
                  <Text style={styles.metricMiniLbl}>Followed Brands</Text>
                </View>
                <View style={styles.metricMiniCard}>
                  <Text style={[styles.metricMiniVal, { color: adminTheme.neon }]}>
                    {data.metrics.totalClicks}
                  </Text>
                  <Text style={styles.metricMiniLbl}>Post Clicks</Text>
                </View>
                <View style={styles.metricMiniCard}>
                  <Text style={[styles.metricMiniVal, { color: '#8B5CF6' }]}>
                    {data.metrics.totalShares}
                  </Text>
                  <Text style={styles.metricMiniLbl}>Shares</Text>
                </View>
                <View style={styles.metricMiniCard}>
                  <Text style={[styles.metricMiniVal, { color: '#EF4444' }]}>
                    {data.metrics.totalLikes}
                  </Text>
                  <Text style={styles.metricMiniLbl}>Likes</Text>
                </View>
              </View>

              {/* Sub-Tab Navigation */}
              <View style={styles.tabNavRow}>
                <Pressable
                  style={[styles.tabNavBtn, activeTab === 'followed' && styles.tabNavBtnActive]}
                  onPress={() => setActiveTab('followed')}>
                  <Ionicons
                    name="heart"
                    size={15}
                    color={activeTab === 'followed' ? adminTheme.neon : adminTheme.textSecondary}
                  />
                  <Text
                    style={[styles.tabNavText, activeTab === 'followed' && styles.tabNavTextActive]}>
                    Follows ({data.followedBrands.length})
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.tabNavBtn, activeTab === 'clicks' && styles.tabNavBtnActive]}
                  onPress={() => setActiveTab('clicks')}>
                  <Ionicons
                    name="hand-left"
                    size={15}
                    color={activeTab === 'clicks' ? adminTheme.neon : adminTheme.textSecondary}
                  />
                  <Text
                    style={[styles.tabNavText, activeTab === 'clicks' && styles.tabNavTextActive]}>
                    Clicks ({data.postClicks.length})
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.tabNavBtn, activeTab === 'shares' && styles.tabNavBtnActive]}
                  onPress={() => setActiveTab('shares')}>
                  <Ionicons
                    name="share-social"
                    size={15}
                    color={activeTab === 'shares' ? adminTheme.neon : adminTheme.textSecondary}
                  />
                  <Text
                    style={[styles.tabNavText, activeTab === 'shares' && styles.tabNavTextActive]}>
                    Shares ({data.sharedDeals.length})
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.tabNavBtn, activeTab === 'engagement' && styles.tabNavBtnActive]}
                  onPress={() => setActiveTab('engagement')}>
                  <Ionicons
                    name="chatbubble-ellipses"
                    size={15}
                    color={activeTab === 'engagement' ? adminTheme.neon : adminTheme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.tabNavText,
                      activeTab === 'engagement' && styles.tabNavTextActive,
                    ]}>
                    Reviews ({data.reviewsGiven.length})
                  </Text>
                </Pressable>
              </View>

              {/* Scrollable Tab Content */}
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}>
                {/* ─── TAB: FOLLOWED BRANDS ─── */}
                {activeTab === 'followed' && (
                  <View>
                    {data.followedBrands.length === 0 ? (
                      <EmptyState
                        title="No Followed Brands"
                        description="This shopper has not followed any brands yet."
                        icon="heart-outline"
                      />
                    ) : (
                      data.followedBrands.map((fb) => (
                        <View key={fb.brand_id} style={styles.itemCard}>
                          <View style={styles.brandThumbWrap}>
                            {fb.brand_logo ? (
                              <Image source={{ uri: fb.brand_logo }} style={styles.brandThumb} />
                            ) : (
                              <Ionicons name="business" size={18} color={adminTheme.neon} />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>{fb.brand_name}</Text>
                            <Text style={styles.itemSub}>{fb.category || 'Retail Partner'}</Text>
                          </View>
                          <Text style={styles.itemDate}>
                            Followed: {new Date(fb.created_at).toLocaleDateString('en-PK')}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {/* ─── TAB: POST CLICKS ─── */}
                {activeTab === 'clicks' && (
                  <View>
                    {data.postClicks.length === 0 ? (
                      <EmptyState
                        title="No Post Clicks Yet"
                        description="This shopper has not clicked on any promotion links or deal cards."
                        icon="hand-left-outline"
                      />
                    ) : (
                      data.postClicks.map((click) => (
                        <View key={click.id} style={styles.itemCard}>
                          <View style={[styles.brandThumbWrap, { backgroundColor: adminTheme.neonLight }]}>
                            <Ionicons name="open-outline" size={18} color={adminTheme.neon} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>{click.deal_title}</Text>
                            <Text style={styles.itemSub}>
                              Brand: {click.brand_name || 'Retail Partner'}{' '}
                              {click.discount_pct ? `• ${click.discount_pct}% OFF` : ''}
                            </Text>
                          </View>
                          <Text style={styles.itemDate}>
                            {new Date(click.created_at).toLocaleString('en-PK', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {/* ─── TAB: SHARED DEALS ─── */}
                {activeTab === 'shares' && (
                  <View>
                    {data.sharedDeals.length === 0 ? (
                      <EmptyState
                        title="No Shares Recorded"
                        description="This shopper has not used the share button on any promotions."
                        icon="share-social-outline"
                      />
                    ) : (
                      data.sharedDeals.map((share) => (
                        <View key={share.id} style={styles.itemCard}>
                          <View
                            style={[
                              styles.brandThumbWrap,
                              { backgroundColor: 'rgba(139, 92, 246, 0.15)' },
                            ]}>
                            <Ionicons name="share-social" size={18} color="#8B5CF6" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>{share.deal_title}</Text>
                            <Text style={styles.itemSub}>
                              Brand: {share.brand_name || 'Retail Partner'}{' '}
                              {share.discount_pct ? `• ${share.discount_pct}% OFF` : ''}
                            </Text>
                          </View>
                          <Text style={styles.itemDate}>
                            {new Date(share.created_at).toLocaleString('en-PK', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {/* ─── TAB: REVIEWS & ENGAGEMENT ─── */}
                {activeTab === 'engagement' && (
                  <View style={{ gap: spacing[3] }}>
                    {/* Reviews */}
                    <Text style={styles.subHeading}>
                      Reviews / Comments Submitted ({data.reviewsGiven.length})
                    </Text>
                    {data.reviewsGiven.length === 0 ? (
                      <Text style={styles.emptyNotice}>No reviews posted by this user.</Text>
                    ) : (
                      data.reviewsGiven.map((rev) => (
                        <View key={rev.id} style={styles.itemCard}>
                          <View
                            style={[
                              styles.brandThumbWrap,
                              { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
                            ]}>
                            <Ionicons name="chatbubble" size={18} color="#F59E0B" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>Deal: {rev.deal_title}</Text>
                            <Text style={[styles.itemSub, { fontStyle: 'italic', color: adminTheme.textPrimary }]}>
                              &ldquo;{rev.text}&rdquo;
                            </Text>
                            <Text style={styles.itemDate}>
                              {new Date(rev.created_at).toLocaleDateString('en-PK')}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}

                    {/* Liked Deals */}
                    <Text style={[styles.subHeading, { marginTop: spacing[3] }]}>
                      Liked Promotions ({data.likedDeals.length})
                    </Text>
                    {data.likedDeals.length === 0 ? (
                      <Text style={styles.emptyNotice}>No promotions liked by this user.</Text>
                    ) : (
                      data.likedDeals.map((ld) => (
                        <View key={ld.id} style={styles.itemCard}>
                          <View
                            style={[
                              styles.brandThumbWrap,
                              { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
                            ]}>
                            <Ionicons name="heart" size={18} color="#EF4444" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>{ld.deal_title}</Text>
                            <Text style={styles.itemSub}>Brand: {ld.brand_name}</Text>
                          </View>
                          <Text style={styles.itemDate}>
                            {new Date(ld.created_at).toLocaleDateString('en-PK')}
                          </Text>
                        </View>
                      ))
                    )}
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
    height: '90%',
    width: '100%',
    maxWidth: 840,
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
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: adminTheme.bgCard,
    borderWidth: 1,
    borderColor: adminTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  userName: {
    ...typography.h3,
    color: adminTheme.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  userSub: {
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
  userActionBar: {
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
  metricHighlightsRow: {
    flexDirection: 'row',
    backgroundColor: adminTheme.bgCardHover,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.border,
    gap: spacing[2],
  },
  metricMiniCard: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricMiniVal: {
    ...typography.h3,
    color: adminTheme.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  metricMiniLbl: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
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
    gap: 6,
    paddingVertical: spacing[3],
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabNavBtnActive: {
    borderBottomColor: adminTheme.neon,
    backgroundColor: adminTheme.neonLight,
  },
  tabNavText: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 11,
  },
  tabNavTextActive: {
    color: adminTheme.neon,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: spacing[4],
    paddingBottom: spacing[8],
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminTheme.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: adminTheme.border,
    padding: spacing[3],
    marginBottom: spacing[2],
    gap: spacing[3],
  },
  brandThumbWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: adminTheme.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandThumb: {
    width: '100%',
    height: '100%',
  },
  itemTitle: {
    ...typography.bodyMedium,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 13,
  },
  itemSub: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  itemDate: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 10,
  },
  subHeading: {
    ...typography.bodyMedium,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: spacing[2],
  },
  emptyNotice: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontStyle: 'italic',
    paddingVertical: spacing[2],
  },
});
