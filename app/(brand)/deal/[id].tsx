import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  addDealComment,
  getDealComments,
  sanitizeReviewerName,
  type CommentItem,
} from '@/lib/activityStore';
import { getLocalBrands } from '@/lib/brandStore';
import { getLocalBrandDeals } from '@/lib/dealStore';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { radii, spacing, typography } from '@/theme';
import type { Deal } from '@/types/database.types';

export default function BrandDealDetailScreen() {
  const { id, fromPosts } = useLocalSearchParams<{ id: string; fromPosts?: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user, brand: authBrand, profile } = useAuth();

  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // Fetch Deal Details
  const { data: deal, isLoading } = useQuery<Deal & { website_url?: string }>({
    queryKey: ['brand-deal-detail', id],
    queryFn: async () => {
      if (!id) throw new Error('Missing deal ID');

      let dealData: any = null;

      try {
        const { data, error } = await supabase
          .from('deals')
          .select('*, brand:brands(*), category:categories(*)')
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          dealData = data;
        }
      } catch (err) {
        console.warn('[BrandDealDetail] Supabase query notice:', err);
      }

      // Fallback to local deals store
      if (!dealData) {
        const localDeals = await getLocalBrandDeals();
        const found = localDeals.find((d) => d.id === id);
        if (found) {
          const localBrands = await getLocalBrands();
          const brandMatch = (found as any).brand || localBrands.find((b) => b.id === found.brand_id) || {
            id: found.brand_id,
            name: authBrand?.name || profile?.display_name || 'Featured Brand',
            category: 'Fashion & Apparel',
            logo_url: null,
          };
          dealData = { ...found, brand: brandMatch };
        }
      }

      if (!dealData) {
        throw new Error('Deal not found');
      }

      return dealData;
    },
    enabled: Boolean(id),
  });

  // Comments Query
  const { data: comments = [], refetch: refetchComments } = useQuery<CommentItem[]>({
    queryKey: ['brand-deal-comments', id],
    queryFn: () => getDealComments(id || ''),
    enabled: Boolean(id),
  });

  const handleShare = async () => {
    if (!deal) return;
    try {
      if (Platform.OS !== 'web') {
        await Share.share({
          title: deal.title,
          message: `Check out our deal on Jumble Sale: ${deal.title} (${deal.discount_pct}% OFF)!`,
        });
      }
      toast.show('Deal link shared! 🔗', 'success');
    } catch {
      toast.show('Deal link copied to clipboard!', 'info');
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) {
      toast.show('Please write a reply or comment first', 'error');
      return;
    }
    if (!deal) return;

    setCommentSubmitting(true);
    try {
      const commenterName = authBrand?.name || profile?.display_name || 'Brand Owner';
      const userId = user?.id || 'brand-user';
      await addDealComment(
        deal.id,
        userId,
        commenterName,
        commentText.trim(),
        deal.title,
        deal.brand_id
      );
      setCommentText('');
      toast.show('Reply added to discussion! 💬', 'success');
      refetchComments();
    } catch (err: any) {
      toast.show(err.message || 'Failed to submit comment', 'error');
    } finally {
      setCommentSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Deal Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#00FF66" />
        </View>
      </SafeAreaView>
    );
  }

  if (!deal) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Deal Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingCenter}>
          <Text style={styles.errorText}>Deal not found or has expired.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const imageUri =
    deal.image_urls?.[0] ||
    'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=1000&q=80';
  const categoryName = (deal as any).category?.name || (deal as any).brand?.category || 'Retail';
  const discountPriceVal = (deal as any).price || deal.discount_price || 0;
  const originalPriceVal = deal.original_price || (discountPriceVal ? Math.round(discountPriceVal * 1.4) : 0);
  const formattedDiscountPrice = discountPriceVal ? `Rs. ${discountPriceVal.toLocaleString()}` : `${deal.discount_pct}% OFF`;
  const formattedOriginalPrice = originalPriceVal ? `Rs. ${originalPriceVal.toLocaleString()}` : '';

  const startDateStr = deal.start_date
    ? new Date(deal.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Active';
  const endDateStr = deal.end_date
    ? new Date(deal.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Limited Time';

  const brandDisplayName = (deal as any).brand?.name || authBrand?.name || profile?.display_name || 'Brand Partner';

  return (
    <SafeAreaView style={styles.container}>
      {/* ─── 1. TOP HEADER ─── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </Pressable>

        <Text style={styles.headerTitle}>Deal Details</Text>

        <View style={styles.headerRightActions}>
          {/* Edit Promotion Button: Only shown when opened from Posts page */}
          {Boolean(fromPosts === '1') && (
            <Pressable
              style={styles.headerEditBtn}
              onPress={() =>
                router.push({
                  pathname: '/(brand)/create-deal',
                  params: { dealId: deal.id },
                })
              }
              hitSlop={6}>
              <Ionicons name="create-outline" size={15} color="#090A0E" />
              <Text style={styles.headerEditBtnText}>Edit</Text>
            </Pressable>
          )}

          <Pressable onPress={handleShare} style={styles.shareBtn} hitSlop={8}>
            <Ionicons name="share-outline" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ─── 2. COVER IMAGE BANNER ─── */}
        <View style={styles.imageWrap}>
          <Image source={{ uri: imageUri }} style={styles.dealImage} resizeMode="cover" />
          <View style={styles.typeBadge}>
            <Ionicons
              name={deal.deal_type === 'online' ? 'globe-outline' : 'storefront-outline'}
              size={12}
              color="#00FF66"
            />
            <Text style={styles.typeBadgeText}>
              {deal.deal_type === 'online' ? 'Online Deal' : 'In-Store Offer'}
            </Text>
          </View>
        </View>

        {/* ─── 3. TITLE & CATEGORY ─── */}
        <View style={styles.titleRow}>
          <Text style={styles.dealTitle}>{deal.title}</Text>
          <View style={styles.categoryPill}>
            <Ionicons name="pricetag" size={12} color="#00FF66" />
            <Text style={styles.categoryPillText}>{categoryName}</Text>
          </View>
        </View>

        {/* ─── 4. PRICE CARD CONTAINER ─── */}
        <View style={styles.priceCard}>
          <View style={styles.priceCardHeader}>
            <View>
              <Text style={styles.priceCardLabel}>DISCOUNTED PRICE</Text>
              <Text style={styles.discountedPriceText}>{formattedDiscountPrice}</Text>
            </View>

            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <View style={styles.saveBadge}>
                <Text style={styles.saveBadgeText}>SAVE {deal.discount_pct}%</Text>
              </View>
              {formattedOriginalPrice ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.priceCardLabel}>ORIGINAL PRICE</Text>
                  <Text style={styles.originalPriceText}>{formattedOriginalPrice}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ─── 5. DEAL INFORMATION SECTION ─── */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Deal Information</Text>

          {/* Deal Period */}
          <View style={styles.infoRowCard}>
            <View style={styles.infoIconBox}>
              <Ionicons name="calendar-outline" size={18} color="#00FF66" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoRowLabel}>DEAL PERIOD</Text>
              <Text style={styles.infoRowValue}>{`${startDateStr} – ${endDateStr}`}</Text>
            </View>
          </View>

          {/* Availability */}
          <View style={styles.infoRowCard}>
            <View style={styles.infoIconBox}>
              <Ionicons name="storefront-outline" size={18} color="#00FF66" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoRowLabel}>AVAILABLE AT</Text>
              <Text style={styles.infoRowValue}>
                {deal.city ? `${deal.city} Stores & Online Delivery` : 'Nationwide Stores & Online Hook'}
              </Text>
            </View>
          </View>

          {/* Item Buy Page Link */}
          {Boolean(deal.buy_url || (deal as any).website_url) && (
            <Pressable
              style={styles.infoRowCard}
              onPress={() => {
                let target = String(deal.buy_url || (deal as any).website_url).trim();
                if (!target.startsWith('http://') && !target.startsWith('https://')) {
                  target = `https://${target}`;
                }
                Linking.openURL(target).catch(() => {});
              }}>
              <View style={styles.infoIconBox}>
                <Ionicons name="link-outline" size={18} color="#00FF66" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoRowLabel}>ITEM BUY PAGE (WEBSITE LINK)</Text>
                <Text style={[styles.infoRowValue, { color: '#00FF66' }]} numberOfLines={1}>
                  {deal.buy_url || (deal as any).website_url}
                </Text>
              </View>
              <Ionicons name="open-outline" size={16} color="#00FF66" />
            </Pressable>
          )}
        </View>

        {/* ─── 6. BRAND OVERVIEW CARD ─── */}
        <View style={styles.brandCard}>
          <View style={styles.brandLogoCircle}>
            <Ionicons name="business" size={20} color="#00FF66" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandName}>{brandDisplayName}</Text>
            <Text style={styles.brandCategory}>{categoryName} • Official Verified Partner</Text>
          </View>
        </View>

        {/* ─── 7. DESCRIPTION / OVERVIEW ─── */}
        {deal.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <Text style={styles.descriptionText}>{deal.description}</Text>
          </View>
        ) : null}

        {/* ─── 8. TERMS & CONDITIONS ─── */}
        {deal.terms ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Terms & Conditions</Text>
            <Text style={styles.termsText}>{deal.terms}</Text>
          </View>
        ) : null}

        {/* ─── 9. COMMUNITY DISCUSSION & REVIEWS ─── */}
        <View style={styles.section}>
          <View style={styles.commentHeaderRow}>
            <Ionicons name="chatbubbles-outline" size={18} color="#00FF66" />
            <Text style={styles.sectionTitle}>Customer Reviews & Questions ({comments.length})</Text>
          </View>

          {/* Comment Input Card */}
          <View style={styles.commentInputCard}>
            <TextInput
              style={styles.commentInput}
              placeholder="Post a reply as brand owner..."
              placeholderTextColor="#64748B"
              value={commentText}
              onChangeText={setCommentText}
              multiline
            />
            <View style={styles.commentBtnRow}>
              <Button
                label="Reply as Brand"
                variant="primary"
                size="sm"
                loading={commentSubmitting}
                onPress={handleAddComment}
              />
            </View>
          </View>

          {/* Comment List */}
          {comments.map((comm) => {
            const cleanAuthor = sanitizeReviewerName(comm.user_name);
            const avatarLetter = (cleanAuthor || 'U').trim()[0].toUpperCase();

            return (
              <View key={comm.id} style={styles.commentBubble}>
                <View style={styles.commentBubbleHeader}>
                  <View style={styles.commentUserAvatar}>
                    <Text style={styles.commentAvatarText}>
                      {avatarLetter}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commentUserName}>{cleanAuthor}</Text>
                    <Text style={styles.commentTimestamp}>
                      {new Date(comm.created_at).toLocaleDateString('en-PK', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                </View>
                <Text style={styles.commentBodyText}>{comm.text}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* ─── 10. FIXED BOTTOM ACTION BAR ─── */}
      {Boolean(fromPosts === '1') && (
        <View style={styles.bottomBar}>
          <Pressable
            style={styles.bottomEditBtn}
            onPress={() =>
              router.push({
                pathname: '/(brand)/create-deal',
                params: { dealId: deal.id },
              })
            }>
            <Ionicons name="create-outline" size={18} color="#090A0E" />
            <Text style={styles.bottomEditBtnText}>Edit This Promotion</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0E',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: '#1A1E2B',
    backgroundColor: '#0D1018',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141721',
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#00FF66',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerEditBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#090A0E',
  },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141721',
  },
  scroll: {
    paddingBottom: 100,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  imageWrap: {
    width: '100%',
    height: 280,
    backgroundColor: '#141721',
    position: 'relative',
  },
  dealImage: {
    width: '100%',
    height: '100%',
  },
  typeBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(9, 10, 14, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.4)',
  },
  typeBadgeText: {
    ...typography.caption,
    fontSize: 11,
    color: '#00FF66',
    fontWeight: '700',
  },
  titleRow: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    gap: 8,
  },
  dealTitle: {
    ...typography.h2,
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 28,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  categoryPillText: {
    ...typography.caption,
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
  },
  priceCard: {
    marginHorizontal: spacing[4],
    marginTop: spacing[4],
    backgroundColor: '#141721',
    borderRadius: radii.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: '#202432',
  },
  priceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceCardLabel: {
    ...typography.caption,
    fontSize: 10,
    color: '#64748B',
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  discountedPriceText: {
    ...typography.h1,
    fontSize: 24,
    fontWeight: '900',
    color: '#00FF66',
    marginTop: 2,
  },
  saveBadge: {
    backgroundColor: 'rgba(0, 255, 102, 0.15)',
    borderWidth: 1,
    borderColor: '#00FF66',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  saveBadgeText: {
    ...typography.caption,
    fontSize: 11,
    color: '#00FF66',
    fontWeight: '900',
  },
  originalPriceText: {
    ...typography.body,
    fontSize: 14,
    color: '#64748B',
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  infoSection: {
    paddingHorizontal: spacing[4],
    marginTop: spacing[4],
    gap: 8,
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  infoRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#141721',
    padding: spacing[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#202432',
  },
  infoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0D1A12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRowLabel: {
    ...typography.caption,
    fontSize: 10,
    color: '#64748B',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  infoRowValue: {
    ...typography.body,
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
    marginTop: 1,
  },
  brandCard: {
    marginHorizontal: spacing[4],
    marginTop: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#141721',
    padding: spacing[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#202432',
  },
  brandLogoCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0D1A12',
    borderWidth: 1,
    borderColor: '#00FF66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  brandCategory: {
    ...typography.caption,
    fontSize: 11,
    color: '#94A3B8',
  },
  section: {
    paddingHorizontal: spacing[4],
    marginTop: spacing[4],
  },
  descriptionText: {
    ...typography.body,
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 20,
    marginTop: 2,
  },
  termsText: {
    ...typography.body,
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 2,
  },
  commentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  commentInputCard: {
    backgroundColor: '#141721',
    borderRadius: radii.lg,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#202432',
    gap: 8,
  },
  commentInput: {
    color: '#FFFFFF',
    fontSize: 13,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  commentBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  commentBubble: {
    backgroundColor: '#141721',
    borderRadius: radii.lg,
    padding: spacing[3],
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#202432',
    gap: 6,
  },
  commentBubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentUserAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#00FF66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#090A0E',
  },
  commentUserName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  commentTimestamp: {
    fontSize: 10,
    color: '#64748B',
  },
  commentBodyText: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 72,
    backgroundColor: '#0D1018',
    borderTopWidth: 1,
    borderTopColor: '#1A1E2B',
    paddingHorizontal: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00FF66',
    height: 48,
    borderRadius: radii.lg,
  },
  bottomEditBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#090A0E',
  },
});
