import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthRequiredModal } from '@/components/ui/AuthRequiredModal';
import { Button } from '@/components/ui/Button';
import { ReportModal } from '@/components/ui/ReportModal';
import { useToast } from '@/components/ui/Toast';
import {
  addDealComment,
  getDealComments,
  getDealLikesCount,
  getLikedDealIds,
  getSavedDealIds,
  recordDealShare,
  recordDealView,
  sanitizeReviewerName,
  toggleDealLike,
  toggleDealSave,
  type CommentItem,
} from '@/lib/activityStore';
import { getLocalBrands } from '@/lib/brandStore';
import { getLocalBrandDeals } from '@/lib/dealStore';
import { interactionLogger } from '@/lib/interactionLogger';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { Deal } from '@/types/database.types';
import { colors, spacing, typography } from '@/theme';

export default function DealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user, profile } = useAuth();
  const [storedDisplayName, setStoredDisplayName] = useState<string | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('@user_display_name');
        if (stored && stored.trim()) {
          setStoredDisplayName(stored.trim());
        }
      } catch {}
    })();
  }, []);

  // Fetch Deal Details + Likes / Saves state for current user
  const {
    data: deal,
    isLoading,
    refetch,
  } = useQuery<Deal & { is_liked?: boolean; is_saved?: boolean; website_url?: string }>({
    queryKey: ['deal-detail', id, user?.id],
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
        console.warn('[DealDetail] Supabase query notice:', err);
      }

      // Fallback to local deals if offline
      if (!dealData) {
        const localDeals = await getLocalBrandDeals();
        const found = localDeals.find((d) => d.id === id);
        if (found) {
          const localBrands = await getLocalBrands();
          const brandMatch = localBrands.find((b) => b.id === found.brand_id) || {
            id: found.brand_id,
            name: 'KHAADI',
            category: 'Fashion',
            logo_url: null,
          };
          dealData = { ...found, brand: brandMatch };
        }
      }

      if (!dealData) {
        throw new Error('Deal not found');
      }

      // Check liked status via activityStore and Supabase
      const effectiveUserId = user?.id || 'guest';
      const likedIds = await getLikedDealIds(effectiveUserId);
      dealData.is_liked = likedIds.includes(id);

      const savedIds = await getSavedDealIds(effectiveUserId);
      dealData.is_saved = savedIds.includes(id);

      // Record in recently viewed deals
      recordDealView(dealData);

      return dealData;
    },
    enabled: Boolean(id),
  });

  // Real Likes Count Query (Starts at 0, reflects database count)
  const { data: likesCount = 0, refetch: refetchLikesCount } = useQuery<number>({
    queryKey: ['deal-likes-count', id],
    queryFn: () => getDealLikesCount(id || ''),
    enabled: Boolean(id),
  });

  // Real Comments Query
  const { data: comments = [], refetch: refetchComments } = useQuery<CommentItem[]>({
    queryKey: ['deal-comments', id],
    queryFn: () => getDealComments(id || ''),
    enabled: Boolean(id),
  });

  const handleToggleLike = async () => {
    if (!deal) return;

    try {
      const effectiveUserId = user?.id || 'guest';
      const commenterName = user?.email ? user.email.split('@')[0] : 'Shopper';
      const res = await toggleDealLike(
        deal.id,
        effectiveUserId,
        commenterName,
        deal.title,
        deal.brand_id
      );

      interactionLogger.logInteraction(deal.id, 'like', effectiveUserId);
      if (res.isLiked) {
        toast.show('Liked deal! ❤️', 'success');
      } else {
        toast.show('Removed like', 'info');
      }
      refetch();
      refetchLikesCount();
    } catch (err: any) {
      toast.show(err.message || 'Action failed', 'error');
    }
  };

  const handleToggleSave = async () => {
    if (!deal) return;

    try {
      const effectiveUserId = user?.id || 'guest';
      const res = await toggleDealSave(deal.id, effectiveUserId);
      if (res.isSaved) {
        toast.show('Saved to your collection 📌', 'success');
      } else {
        toast.show('Removed from saved deals', 'info');
      }
      refetch();
    } catch (err: any) {
      toast.show(err.message || 'Could not update saved status', 'error');
    }
  };

  const handleShare = async () => {
    if (!deal) return;
    try {
      const commenterName = user?.email ? user.email.split('@')[0] : 'Shopper';
      const userId = user?.id || 'guest';
      await recordDealShare(
        deal.id,
        userId,
        commenterName,
        deal.title,
        deal.brand_id
      );

      if (Platform.OS !== 'web') {
        await Share.share({
          title: deal.title,
          message: `Check out this discount on Jumble Sale: ${deal.title} (${deal.discount_pct}% OFF)!`,
        });
      }
      toast.show('Post link shared successfully! 🔗', 'success');
    } catch {
      toast.show('Post link copied!', 'info');
    }
  };

  const handleVisitWebsite = () => {
    if (!deal) return;

    const rawUrl =
      (deal as any)?.buy_url ||
      (deal as any)?.website_url ||
      (deal as any)?.brand?.website_url ||
      (deal as any)?.brand?.brand_website ||
      (deal as any)?.brand?.website;

    if (!rawUrl) {
      toast.show('Direct buy link is not specified for this deal', 'info');
      return;
    }

    let targetUrl = String(rawUrl).trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    interactionLogger.logInteraction(deal.id, 'click', user?.id);

    Linking.openURL(targetUrl).catch(() => {
      toast.show('Could not open store link', 'error');
    });
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) {
      toast.show('Please fill in your comment first', 'error');
      return;
    }
    if (!deal) return;

    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    setCommentSubmitting(true);
    try {
      const storedName = await AsyncStorage.getItem('@user_display_name');
      const resolvedName =
        storedName?.trim() ||
        profile?.display_name?.trim() ||
        profile?.full_name?.trim() ||
        user?.user_metadata?.display_name?.trim() ||
        user?.user_metadata?.full_name?.trim() ||
        user?.user_metadata?.name?.trim() ||
        (user?.email ? user.email.split('@')[0] : null) ||
        'Customer';

      const commenterName = sanitizeReviewerName(resolvedName);
      await addDealComment(
        deal.id,
        user.id,
        commenterName,
        commentText.trim(),
        deal.title,
        deal.brand_id
      );
      setCommentText('');
      toast.show('Comment posted successfully! 💬', 'success');
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
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
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
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
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

  const categoryName = (deal as any).category?.name || (deal as any).brand?.category || 'Fashion & Retail';
  
  const discountPriceVal =
    (deal as any).price ||
    (deal as any).discount_price ||
    ((deal as any).original_price && deal.discount_pct
      ? Math.round((deal as any).original_price * (1 - deal.discount_pct / 100))
      : null);

  const originalPriceVal = (deal as any).original_price || null;

  const formattedDiscountPrice = discountPriceVal ? `Rs. ${discountPriceVal.toLocaleString()}` : null;
  const formattedOriginalPrice = originalPriceVal ? `Rs. ${originalPriceVal.toLocaleString()}` : null;

  const startDateStr = deal.start_date
    ? new Date(deal.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Ongoing';
  const endDateStr = deal.end_date
    ? new Date(deal.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Limited Time';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Deal Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Deal Title */}
        <Text style={styles.dealTitle}>{deal.title}</Text>

        {/* Category Badge Pill */}
        <View style={styles.categoryPill}>
          <Ionicons name="pricetag" size={13} color="#00FF66" />
          <Text style={styles.categoryPillText}>{categoryName}</Text>
        </View>

        {/* Price Card Container */}
        <View style={styles.priceCard}>
          <View style={styles.priceCardHeader}>
            <View>
              <Text style={styles.priceCardLabel}>
                {formattedDiscountPrice ? 'DISCOUNTED PRICE' : 'SPECIAL OFFER'}
              </Text>
              <Text style={styles.discountedPriceText}>
                {formattedDiscountPrice || `${deal.discount_pct}% OFF`}
              </Text>
            </View>

            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <View style={styles.saveBadge}>
                <Text style={styles.saveBadgeText}>SAVE {deal.discount_pct}%</Text>
              </View>
              {formattedOriginalPrice && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.priceCardLabel}>ORIGINAL PRICE</Text>
                  <Text style={styles.originalPriceText}>{formattedOriginalPrice}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Engagement Row: Real Likes Count & Real Comments Count */}
        <View style={styles.engagementBar}>
          <Pressable
            style={[styles.engagementBtn, deal.is_liked && styles.engagementBtnLiked]}
            onPress={handleToggleLike}
            accessibilityRole="button"
            accessibilityLabel="Like deal">
            <Ionicons
              name={deal.is_liked ? 'heart' : 'heart-outline'}
              size={20}
              color={deal.is_liked ? '#FF4500' : '#FFFFFF'}
            />
            <Text style={[styles.engagementBtnText, deal.is_liked && styles.engagementBtnTextLiked]}>
              {likesCount} {likesCount === 1 ? 'Like' : 'Likes'}
            </Text>
          </Pressable>

          <View style={styles.engagementDivider} />

          <View style={styles.engagementBtn}>
            <Ionicons name="chatbubbles-outline" size={18} color="#00FF66" />
            <Text style={styles.engagementBtnText}>
              {comments.length} {comments.length === 1 ? 'Review' : 'Reviews'}
            </Text>
          </View>

          <View style={styles.engagementDivider} />

          <Pressable
            style={styles.engagementBtn}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Share deal">
            <Ionicons name="share-social-outline" size={18} color="#94A3B8" />
            <Text style={styles.engagementBtnText}>Share</Text>
          </Pressable>
        </View>

        {/* Deal Information Section */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Deal Information</Text>

          {/* Item 1: Deal Period */}
          <View style={styles.infoRowCard}>
            <View style={styles.infoIconBox}>
              <Ionicons name="calendar-outline" size={20} color="#00FF66" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoRowLabel}>DEAL PERIOD</Text>
              <Text style={styles.infoRowValue}>{`${startDateStr} – ${endDateStr}`}</Text>
            </View>
          </View>

          {/* Item 2: Payment Methods */}
          <View style={styles.infoRowCard}>
            <View style={styles.infoIconBox}>
              <Ionicons name="card-outline" size={20} color="#00FF66" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoRowLabel}>PAYMENT METHODS</Text>
              <Text style={styles.infoRowValue}>Card • Cash on Delivery • Bank Transfer</Text>
            </View>
          </View>

          {/* Item 3: Available At */}
          <View style={styles.infoRowCard}>
            <View style={styles.infoIconBox}>
              <Ionicons name="storefront-outline" size={20} color="#00FF66" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoRowLabel}>AVAILABLE AT</Text>
              <Text style={styles.infoRowValue}>
                {deal.city ? `${deal.city} Stores & Online` : 'All Nationwide Stores & Online'}
              </Text>
            </View>
          </View>
        </View>

        {/* Brand Overview Card */}
        {deal.brand && (
          <Pressable
            style={styles.brandCard}
            onPress={() => router.push(`/(consumer)/brand/${deal.brand?.id}` as any)}>
            <View style={styles.brandLogoCircle}>
              {deal.brand.logo_url ? (
                <Image source={{ uri: deal.brand.logo_url }} style={styles.brandLogo} />
              ) : (
                <Ionicons name="business" size={22} color="#00FF66" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.brandName}>{deal.brand.name}</Text>
              <Text style={styles.brandCategory}>{deal.brand.category || 'Retail Brand'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </Pressable>
        )}

        {/* Description / Overview */}
        {deal.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <Text style={styles.descriptionText}>{deal.description}</Text>
          </View>
        ) : null}

        {/* Direct Item Buy Link Banner */}
        {Boolean((deal as any)?.buy_url || (deal as any)?.website_url) && (
          <Pressable
            style={styles.directBuyCard}
            onPress={handleVisitWebsite}
            accessibilityRole="button">
            <View style={styles.directBuyIconWrap}>
              <Ionicons name="cart" size={20} color="#090A0E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.directBuyTitle}>Buy on Brand Website</Text>
              <Text style={styles.directBuySubtitle} numberOfLines={1}>
                {(deal as any)?.buy_url || (deal as any)?.website_url}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color="#00FF66" />
          </Pressable>
        )}

        {/* Terms & Conditions */}
        {deal.terms ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Terms & Conditions</Text>
            <Text style={styles.termsText}>{deal.terms}</Text>
          </View>
        ) : null}

        {/* Community Discussion & Reviews */}
        <View style={styles.section}>
          <View style={styles.commentHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="chatbubbles-outline" size={18} color="#00FF66" />
              <Text style={styles.sectionTitle}>Customer Reviews ({comments.length})</Text>
            </View>
          </View>

          {/* Comment Input Card */}
          <View style={styles.commentInputCard}>
            <TextInput
              style={styles.commentInput}
              placeholder="Ask about this deal or write a review..."
              placeholderTextColor="#64748B"
              value={commentText}
              onChangeText={setCommentText}
              multiline
            />
            <View style={styles.commentBtnRow}>
              <Button
                label="Post Review"
                variant="primary"
                size="sm"
                loading={commentSubmitting}
                onPress={handleAddComment}
              />
            </View>
          </View>

          {/* Comment List with Zero Dummy Fallbacks */}
          {comments.length === 0 ? (
            <View style={styles.emptyCommentsCard}>
              <Ionicons name="chatbubble-ellipses-outline" size={28} color="#64748B" />
              <Text style={styles.emptyCommentsTitle}>No reviews yet</Text>
              <Text style={styles.emptyCommentsSubtitle}>
                Be the first to share your thoughts or ask a question about this deal!
              </Text>
            </View>
          ) : (
            comments.map((comm) => {
              const isCurrentUser =
                user &&
                (comm.user_id === user.id ||
                  comm.user_id === 'guest' ||
                  comm.user_id === 'shopper');

              let authorName = comm.user_name || 'Shopper';

              if (isCurrentUser) {
                const currentName =
                  storedDisplayName ||
                  profile?.display_name ||
                  profile?.full_name ||
                  user?.user_metadata?.display_name ||
                  user?.user_metadata?.full_name ||
                  user?.user_metadata?.name;
                if (currentName && currentName.trim()) {
                  authorName = currentName.trim();
                }
              }

              authorName = sanitizeReviewerName(authorName);
              const avatarLetter = (authorName || 'S').trim()[0].toUpperCase();

              return (
                <View key={comm.id} style={styles.commentBubble}>
                  <View style={styles.commentBubbleHeader}>
                    <View style={styles.commentUserAvatar}>
                      <Text style={styles.commentAvatarText}>
                        {avatarLetter}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.commentUserName}>{authorName}</Text>
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
            })
          )}
        </View>
      </ScrollView>

      {/* Fixed Bottom Action Bar */}
      <View style={styles.bottomBar}>
        {/* Save Deal Button */}
        <Pressable
          style={[styles.saveBtn, deal.is_saved && styles.saveBtnActive]}
          onPress={handleToggleSave}>
          <Ionicons
            name={deal.is_saved ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color="#FFFFFF"
          />
          <Text style={styles.saveBtnText}>{deal.is_saved ? 'Saved' : 'Save Deal'}</Text>
        </Pressable>

        {/* Buy on Brand Website Button */}
        <Pressable style={styles.visitBtn} onPress={handleVisitWebsite}>
          <Text style={styles.visitBtnText}>Buy on Brand Website</Text>
          <Ionicons name="open-outline" size={18} color="#090A0E" />
        </Pressable>
      </View>

      {/* Guest Modal & Report Modal */}
      <AuthRequiredModal
        visible={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
      <ReportModal
        visible={reportModalOpen}
        dealId={deal.id}
        onClose={() => setReportModalOpen(false)}
      />
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
    borderBottomColor: '#161922',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scroll: {
    padding: spacing[4],
    paddingBottom: 110,
    gap: spacing[4],
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  dealTitle: {
    ...typography.h2,
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 30,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#12251A',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  categoryPillText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
    color: '#00FF66',
  },
  priceCard: {
    backgroundColor: '#141721',
    borderRadius: 16,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: '#202432',
  },
  priceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  priceCardLabel: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  discountedPriceText: {
    ...typography.h1,
    fontSize: 30,
    fontWeight: '900',
    color: '#00FF66',
  },
  saveBadge: {
    backgroundColor: '#FF4500',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  saveBadgeText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  originalPriceText: {
    ...typography.bodyMedium,
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  infoSection: {
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  infoRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: '#141721',
    padding: spacing[3],
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#202432',
  },
  infoIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1C2333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRowLabel: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  infoRowValue: {
    ...typography.bodyMedium,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  brandCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141721',
    borderRadius: 16,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#202432',
    gap: spacing[3],
  },
  brandLogoCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E2230',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandLogo: {
    width: '100%',
    height: '100%',
  },
  brandName: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  brandCategory: {
    ...typography.caption,
    fontSize: 12,
    color: '#94A3B8',
  },
  section: {
    gap: spacing[2],
  },
  descriptionText: {
    ...typography.body,
    fontSize: 14,
    color: '#CBD5E1',
    lineHeight: 22,
  },
  termsText: {
    ...typography.caption,
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 20,
  },
  commentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentInputCard: {
    backgroundColor: '#141721',
    borderRadius: 14,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#202432',
    gap: spacing[2],
  },
  commentInput: {
    ...typography.body,
    color: '#FFFFFF',
    minHeight: 56,
    textAlignVertical: 'top',
  },
  commentBtnRow: {
    alignItems: 'flex-end',
  },
  commentBubble: {
    backgroundColor: '#141721',
    borderRadius: 14,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#202432',
    gap: spacing[2],
  },
  commentBubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  commentUserAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1C2333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    ...typography.caption,
    color: '#00FF66',
    fontWeight: 'bold',
  },
  commentUserName: {
    ...typography.bodyMedium,
    color: '#FFFFFF',
    fontSize: 13,
  },
  commentTimestamp: {
    ...typography.caption,
    color: '#64748B',
    fontSize: 11,
  },
  commentBodyText: {
    ...typography.body,
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: '#090A0E',
    borderTopWidth: 1,
    borderTopColor: '#161922',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#262936',
  },
  saveBtnActive: {
    borderColor: '#00FF66',
    backgroundColor: '#12251A',
  },
  saveBtnText: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  visitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#00FF66',
  },
  visitBtnText: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '800',
    color: '#090A0E',
  },
  directBuyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0D1A12',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 255, 102, 0.4)',
    borderRadius: 14,
    padding: spacing[3],
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
  },
  directBuyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00FF66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directBuyTitle: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '800',
    color: '#00FF66',
  },
  directBuySubtitle: {
    ...typography.caption,
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  engagementBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141721',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#202432',
    justifyContent: 'space-around',
  },
  engagementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  engagementBtnLiked: {
    backgroundColor: 'rgba(255, 69, 0, 0.12)',
  },
  engagementBtnText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  engagementBtnTextLiked: {
    color: '#FF4500',
    fontWeight: '800',
  },
  engagementDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#202432',
  },
  emptyCommentsCard: {
    backgroundColor: '#141721',
    borderRadius: 14,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: '#202432',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyCommentsTitle: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  emptyCommentsSubtitle: {
    ...typography.caption,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});
