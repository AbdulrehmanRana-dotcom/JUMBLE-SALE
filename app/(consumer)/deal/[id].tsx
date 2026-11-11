import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
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
import { InAppBrandBrowserModal } from '@/components/browser/InAppBrandBrowserModal';
import { Button } from '@/components/ui/Button';
import { ReportModal } from '@/components/ui/ReportModal';
import { ShareDealModal } from '@/components/ui/ShareDealModal';
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
import { getLocalBrands, KHAADI_BRAND } from '@/lib/brandStore';
import { recordPostWebsiteClick } from '@/lib/clickTracker';
import { getDealRemainingDays, getLocalBrandDeals, isDealExpired } from '@/lib/dealStore';
import { interactionLogger } from '@/lib/interactionLogger';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { Deal } from '@/types/database.types';
import { colors, spacing, typography } from '@/theme';

export default function DealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const [storedDisplayName, setStoredDisplayName] = useState<string | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [inAppBrowserOpen, setInAppBrowserOpen] = useState(false);
  const [browserTargetUrl, setBrowserTargetUrl] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [fullscreenImageIndex, setFullscreenImageIndex] = useState<number | null>(null);

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

      // 1. Fast local cache lookup (instant 0ms response)
      const localDeals = await getLocalBrandDeals();
      const found = localDeals.find((d) => d.id === id);
      if (found) {
        const localBrands = await getLocalBrands();
        let brandMatch = (found as any).brand;
        if (!brandMatch || brandMatch.name === 'Featured Brand' || !brandMatch.logo_url) {
          brandMatch =
            localBrands.find((b) => b.id === found.brand_id) ||
            localBrands.find((b) => (b.name || '').toLowerCase() === ((found as any).brand_name || '').toLowerCase()) ||
            KHAADI_BRAND;
        }
        dealData = { ...found, brand: brandMatch, brand_name: brandMatch.name };
      }

      // 2. Query Supabase only if not found locally and live backend is configured
      if (!dealData && isSupabaseConfigured) {
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 1500)
          );
          const queryPromise = supabase
            .from('deals')
            .select('*, brand:brands(*), category:categories(*)')
            .eq('id', id)
            .maybeSingle();

          const res: any = await Promise.race([queryPromise, timeoutPromise]);
          if (res?.data) {
            dealData = res.data;
          }
        } catch (err) {
          console.warn('[DealDetail] Supabase query notice:', err);
        }
      }

      if (!dealData) {
        throw new Error('Deal not found');
      }

      // Check liked and saved status in parallel
      const effectiveUserId = user?.id || 'guest';
      const [likedIds, savedIds] = await Promise.all([
        getLikedDealIds(effectiveUserId),
        getSavedDealIds(effectiveUserId),
      ]);
      dealData.is_liked = likedIds.includes(id);
      dealData.is_saved = savedIds.includes(id);

      // Record in recently viewed deals (non-blocking)
      recordDealView(dealData).catch(() => {});

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
      queryClient.invalidateQueries({ queryKey: ['profile-saved-count'] });
      queryClient.invalidateQueries({ queryKey: ['saved-deals-list'] });
      queryClient.invalidateQueries({ queryKey: ['user-saved-deal-ids'] });
    } catch (err: any) {
      toast.show(err.message || 'Could not update saved status', 'error');
    }
  };

  const handleShare = () => {
    setShareModalOpen(true);
  };

  const handleVisitWebsite = async () => {
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

    // Deduplicated click tracking: Only 1st click on this post is counted. 2nd click on same post is ignored.
    await recordPostWebsiteClick(deal.id, user?.id);

    setBrowserTargetUrl(targetUrl);
    setInAppBrowserOpen(true);
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) {
      toast.show('Please fill in your review first', 'error');
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
      toast.show('Review posted successfully! 💬', 'success');
      refetchComments();
    } catch (err: any) {
      toast.show(err.message || 'Failed to submit review', 'error');
    } finally {
      setCommentSubmitting(false);
    }
  };

  // Amazon-style Multi-Image Gallery processing (Top-level hooks)
  const dealImages: string[] = React.useMemo(() => {
    if (!deal) return [];
    const list: string[] = [];
    if (deal.image_urls && Array.isArray(deal.image_urls)) {
      deal.image_urls.forEach((u) => {
        if (u && typeof u === 'string' && u.trim() && !list.includes(u.trim())) {
          list.push(u.trim());
        }
      });
    }
    if (deal.banner_url && typeof deal.banner_url === 'string' && !list.includes(deal.banner_url.trim())) {
      list.push(deal.banner_url.trim());
    }
    return list;
  }, [deal]);

  const activeImageUri = dealImages[selectedImageIndex] || dealImages[0] || null;

  const handlePrevImage = () => {
    if (dealImages.length <= 1) return;
    setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : dealImages.length - 1));
  };

  const handleNextImage = () => {
    if (dealImages.length <= 1) return;
    setSelectedImageIndex((prev) => (prev < dealImages.length - 1 ? prev + 1 : 0));
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

  const isEnded = isDealExpired(deal);
  const daysLeft = getDealRemainingDays(deal);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Deal Details</Text>
        <Pressable
          onPress={() => setShareModalOpen(true)}
          style={styles.shareHeaderBtn}
          hitSlop={8}
          accessibilityLabel="Share deal">
          <Ionicons name="share-social-outline" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Deal Expired Banner */}
        {isEnded && (
          <View style={styles.expiredBanner}>
            <View style={styles.expiredIconBox}>
              <Ionicons name="time" size={18} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.expiredBannerTitle}>Sale Ended</Text>
              <Text style={styles.expiredBannerDesc}>
                This promotion expired on {endDateStr} and is no longer active.
              </Text>
            </View>
          </View>
        )}

        {/* Amazon-Style Multi-Image Product Gallery */}
        <View style={styles.galleryWrap}>
          {/* Main Hero Image */}
          <View style={styles.heroImageCard}>
            {activeImageUri ? (
              <Pressable
                onPress={() => setFullscreenImageIndex(selectedImageIndex)}
                style={styles.heroImagePressable}
                accessibilityRole="button"
                accessibilityLabel="View full size image">
                <Image
                  source={{ uri: activeImageUri }}
                  style={styles.heroImage}
                  contentFit="cover"
                  transition={250}
                />
              </Pressable>
            ) : (
              <View style={styles.noImagePlaceholder}>
                <Ionicons name="image-outline" size={48} color="#64748B" />
                <Text style={styles.noImageText}>Product Photo</Text>
              </View>
            )}

            {/* Discount Badge Overlay (Top Left) */}
            {Boolean(deal.discount_pct) && (
              <View style={styles.galleryDiscountBadge}>
                <Text style={styles.galleryDiscountText}>{deal.discount_pct}% OFF</Text>
              </View>
            )}

            {/* Image Counter Pill (Top Right, Amazon-style) */}
            {dealImages.length > 1 && (
              <View style={styles.galleryCounterPill}>
                <Ionicons name="images-outline" size={13} color="#FFFFFF" />
                <Text style={styles.galleryCounterText}>
                  {selectedImageIndex + 1} / {dealImages.length}
                </Text>
              </View>
            )}

            {/* Tap to expand hint (Bottom Right) */}
            {activeImageUri && (
              <Pressable
                style={styles.expandIconBtn}
                onPress={() => setFullscreenImageIndex(selectedImageIndex)}
                hitSlop={8}>
                <Ionicons name="expand-outline" size={16} color="#FFFFFF" />
              </Pressable>
            )}

            {/* Left / Right Arrow Controls (Visible if multiple images) */}
            {dealImages.length > 1 && (
              <>
                <Pressable
                  style={[styles.arrowBtn, styles.arrowBtnLeft]}
                  onPress={handlePrevImage}
                  hitSlop={8}
                  accessibilityLabel="Previous image">
                  <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
                </Pressable>

                <Pressable
                  style={[styles.arrowBtn, styles.arrowBtnRight]}
                  onPress={handleNextImage}
                  hitSlop={8}
                  accessibilityLabel="Next image">
                  <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                </Pressable>
              </>
            )}
          </View>

          {/* Amazon-Style Horizontal Thumbnail Strip (Below Hero) */}
          {dealImages.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbnailRow}>
              {dealImages.map((uri, idx) => {
                const isSelected = selectedImageIndex === idx;
                return (
                  <Pressable
                    key={uri + idx}
                    onPress={() => setSelectedImageIndex(idx)}
                    style={[
                      styles.thumbnailBox,
                      isSelected && styles.thumbnailBoxSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Select photo ${idx + 1}`}>
                    <Image
                      source={{ uri }}
                      style={styles.thumbnailImg}
                      contentFit="cover"
                      transition={150}
                    />
                    {isSelected && (
                      <View style={styles.thumbnailActiveIndicator} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Deal Title */}
        <Text style={styles.dealTitle}>
          {(deal.title || '').replace(/\s*\((?:copy|nakal)\)/gi, '').trim()}
        </Text>

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
              <Ionicons
                name={deal.deal_type === 'in_store' ? 'storefront-outline' : 'globe-outline'}
                size={20}
                color="#00FF66"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoRowLabel}>LOCATION & AVAILABILITY</Text>
              <Text style={styles.infoRowValue}>
                {deal.city && deal.city !== 'All Pakistan'
                  ? `${deal.city} (${deal.deal_type === 'in_store' ? 'In-Store Outlets' : 'Online Delivery'})`
                  : `All Pakistan (${deal.deal_type === 'in_store' ? 'All Retail Branches' : 'Nationwide Online'})`}
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
        <Pressable
          style={[styles.visitBtn, isEnded && styles.visitBtnEnded]}
          onPress={handleVisitWebsite}>
          <Text style={[styles.visitBtnText, isEnded && styles.visitBtnTextEnded]}>
            {isEnded ? 'Sale Ended • Visit Site' : 'Buy on Brand Website'}
          </Text>
          <Ionicons
            name="open-outline"
            size={18}
            color={isEnded ? '#EF4444' : '#090A0E'}
          />
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

      {/* In-App Browser Companion & Purchase Claim */}
      <InAppBrandBrowserModal
        visible={inAppBrowserOpen}
        url={browserTargetUrl}
        dealId={deal.id}
        dealTitle={deal.title}
        brandId={deal.brand_id}
        brandName={(deal as any)?.brand?.name || (deal as any)?.brand_name || 'Khaadi'}
        brandLogo={(deal as any)?.brand?.logo_url}
        userId={user?.id}
        userName={storedDisplayName || profile?.display_name || user?.email?.split('@')[0] || 'Shopper'}
        estimatedPrice={deal.discount_price || deal.original_price}
        onClose={() => setInAppBrowserOpen(false)}
        onOrderClaimed={(order) => {
          toast.show(`Order saved! Rs. ${order.order_amount.toLocaleString()} added to your history`, 'success');
        }}
      />

      {/* Social Deal Share Modal */}
      <ShareDealModal
        visible={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        deal={
          deal
            ? {
                id: deal.id,
                title: deal.title,
                discount_pct: deal.discount_pct,
                promo_code: deal.promo_code,
                brand_name: (deal as any)?.brand?.name || (deal as any)?.brand_name || 'Khaadi',
                brand_logo: (deal as any)?.brand?.logo_url,
                image_url: (deal as any)?.image_url || (deal as any)?.image_urls?.[0],
                price: (deal as any)?.price || deal.discount_price,
                original_price: deal.original_price,
                brand_id: deal.brand_id,
              }
            : null
        }
      />

      {/* Fullscreen Image Lightbox Modal */}
      {fullscreenImageIndex !== null && Boolean(activeImageUri) && (
        <Modal
          visible={fullscreenImageIndex !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setFullscreenImageIndex(null)}>
          <View style={styles.lightboxBackdrop}>
            {/* Top Bar with Close & Counter */}
            <SafeAreaView style={styles.lightboxTopBar}>
              <View style={styles.lightboxCounter}>
                <Text style={styles.lightboxCounterText}>
                  {selectedImageIndex + 1} / {dealImages.length}
                </Text>
              </View>
              <Pressable
                style={styles.lightboxCloseBtn}
                onPress={() => setFullscreenImageIndex(null)}
                hitSlop={12}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </SafeAreaView>

            {/* Centered High-Res Image */}
            <View style={styles.lightboxImageWrap}>
              <Image
                source={{ uri: dealImages[selectedImageIndex] }}
                style={styles.lightboxImage}
                contentFit="contain"
              />
            </View>

            {/* Bottom Thumbnail Selector in Lightbox */}
            {dealImages.length > 1 && (
              <View style={styles.lightboxBottomBar}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.lightboxThumbRow}>
                  {dealImages.map((uri, idx) => (
                    <Pressable
                      key={uri + idx}
                      onPress={() => setSelectedImageIndex(idx)}
                      style={[
                        styles.lightboxThumb,
                        selectedImageIndex === idx && styles.lightboxThumbActive,
                      ]}>
                      <Image source={{ uri }} style={styles.lightboxThumbImg} contentFit="cover" />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </Modal>
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
    borderBottomColor: '#161922',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareHeaderBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
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
  expiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 14,
    padding: spacing[3],
  },
  expiredIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expiredBannerTitle: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '800',
    color: '#EF4444',
  },
  expiredBannerDesc: {
    ...typography.caption,
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 2,
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
  visitBtnEnded: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  visitBtnTextEnded: {
    color: '#EF4444',
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
  galleryWrap: {
    gap: spacing[2],
  },
  heroImageCard: {
    width: '100%',
    height: 330,
    backgroundColor: '#12141C',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#1F2433',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroImagePressable: {
    width: '100%',
    height: '100%',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0E1017',
  },
  noImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  noImageText: {
    ...typography.caption,
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  galleryDiscountBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#FF4500',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  galleryDiscountText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  galleryCounterPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(9, 10, 14, 0.75)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 10,
  },
  galleryCounterText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  expandIconBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(9, 10, 14, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 10,
  },
  arrowBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(9, 10, 14, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 15,
  },
  arrowBtnLeft: {
    left: 10,
  },
  arrowBtnRight: {
    right: 10,
  },
  thumbnailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  thumbnailBox: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#1F2433',
    backgroundColor: '#12141C',
    opacity: 0.6,
    position: 'relative',
  },
  thumbnailBoxSelected: {
    borderColor: '#00FF66',
    borderWidth: 2,
    opacity: 1,
    shadowColor: '#00FF66',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  thumbnailImg: {
    width: '100%',
    height: '100%',
  },
  thumbnailActiveIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#00FF66',
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
  },
  lightboxTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    zIndex: 10,
  },
  lightboxCounter: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  lightboxCounterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  lightboxCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImageWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  lightboxBottomBar: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(9, 10, 14, 0.9)',
    borderTopWidth: 1,
    borderTopColor: '#1F2433',
  },
  lightboxThumbRow: {
    gap: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxThumb: {
    width: 54,
    height: 54,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#334155',
    opacity: 0.5,
  },
  lightboxThumbActive: {
    borderColor: '#00FF66',
    borderWidth: 2,
    opacity: 1,
  },
  lightboxThumbImg: {
    width: '100%',
    height: '100%',
  },
});
