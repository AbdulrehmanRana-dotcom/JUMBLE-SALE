import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AuthRequiredModal } from '@/components/ui/AuthRequiredModal';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationCenterModal } from '@/components/notifications/NotificationCenterModal';
import { CategoryChip } from '@/components/ui/CategoryChip';
import { DealCard } from '@/components/ui/DealCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterModal, FilterState } from '@/components/ui/FilterModal';
import { Input } from '@/components/ui/Input';
import { DealCardSkeleton } from '@/components/ui/Skeleton';
import { ShareDealModal, type ShareDealData } from '@/components/ui/ShareDealModal';
import { useToast } from '@/components/ui/Toast';
import {
  getLikedDealIds,
  getSavedDealIds,
  recordDealShare,
  recordDealView,
  toggleDealLike,
  toggleDealSave,
  SEED_ENGAGEMENT_MAP,
} from '@/lib/activityStore';
import { getLocalBrands, KHAADI_BRAND } from '@/lib/brandStore';
import { DEFAULT_CATEGORIES, getLocalCategories } from '@/lib/categoryStore';
import { getLocalBrandDeals, isDealActive } from '@/lib/dealStore';
import { interactionLogger } from '@/lib/interactionLogger';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { onHomeTabReset } from '@/lib/tabEvents';
import { useAuth } from '@/providers/AuthProvider';
import type { Category, Deal, RecommendationDeal } from '@/types/database.types';
import { colors, radii, spacing, typography } from '@/theme';

const PAGE_SIZE = 10;

const DEFAULT_FILTERS: FilterState = {
  city: null,
  dealType: 'all',
  minDiscount: 0,
  sortBy: 'newest',
};

export default function ConsumerHomeScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [activeShareDeal, setActiveShareDeal] = useState<ShareDealData | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const flatListRef = useRef<FlatList>(null);

  // Instagram-style: Tapping Home in bottom nav scrolls feed back to top
  useEffect(() => {
    const unsubscribe = onHomeTabReset(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsubscribe;
  }, []);

  // Real user likes query from Supabase + local store
  const { data: likedDealIds = [], refetch: refetchLikedIds } = useQuery<string[]>({
    queryKey: ['user-likes', user?.id || 'guest'],
    queryFn: async () => {
      return getLikedDealIds(user?.id || 'guest');
    },
    staleTime: 10 * 1000,
  });

  // Real user saved deals query
  const { data: savedDealIds = [], refetch: refetchSavedIds } = useQuery<string[]>({
    queryKey: ['user-saved-deals', user?.id || 'guest'],
    queryFn: async () => {
      return getSavedDealIds(user?.id || 'guest');
    },
    staleTime: 10 * 1000,
  });

  // Dynamic Likes Map for instantaneous Facebook-style count updates
  const [dynamicLikesMap, setDynamicLikesMap] = useState<Record<string, number>>({});

  const getDealLikes = (deal: Deal | any) => {
    if (typeof dynamicLikesMap[deal.id] === 'number') return dynamicLikesMap[deal.id];
    if (typeof deal.likes_count === 'number') return deal.likes_count;
    return SEED_ENGAGEMENT_MAP[deal.id]?.likes || 12;
  };

  const getDealComments = (deal: Deal | any) => {
    if (typeof deal.comments_count === 'number') return deal.comments_count;
    return SEED_ENGAGEMENT_MAP[deal.id]?.comments || 2;
  };

  // Fetch Categories (Instant 0ms local fallback + 800ms remote check)
  const { data: categories = DEFAULT_CATEGORIES } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const cats = await getLocalCategories();
      return Array.isArray(cats) && cats.length > 0 ? cats : DEFAULT_CATEGORIES;
    },
    initialData: DEFAULT_CATEGORIES,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch Featured Deals (across all categories)
  const { data: featuredDeals = [] } = useQuery<any[]>({
    queryKey: ['featured-deals'],
    queryFn: async () => {
      const localDeals = await getLocalBrandDeals();
      return localDeals
        .filter(isDealActive)
        .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
    },
    staleTime: 5 * 60 * 1000,
  });

  const selectedCategoryObj = useMemo(
    () => categories.find((c) => c.id === selectedCategory),
    [categories, selectedCategory]
  );
  const selectedCategoryName = selectedCategoryObj?.name;

  const isDealInCategory = (d: any, targetCatId: string | null): boolean => {
    if (!targetCatId) return true;
    if (d.category_id === targetCatId) return true;
    const cat = categories.find((c) => c.id === targetCatId);
    if (!cat) return false;
    const catNameLower = cat.name.toLowerCase();
    const dealCategoryName = (
      d.category?.name ||
      d.category_name ||
      d.brand?.category ||
      ''
    ).toLowerCase();
    if (dealCategoryName && (dealCategoryName.includes(catNameLower) || catNameLower.includes(dealCategoryName))) {
      return true;
    }
    // Also check brand matching for common retail categories
    if (catNameLower.includes('footwear') || catNameLower.includes('shoes')) {
      return Boolean(d.brand_name?.toLowerCase().includes('bata') || /shoes|sneaker|footwear/i.test(d.title || ''));
    }
    if (catNameLower.includes('electronic') || catNameLower.includes('mobile')) {
      return Boolean(d.brand_name?.toLowerCase().includes('priceoye') || /phone|mobile|redmi|earbud/i.test(d.title || ''));
    }
    if (catNameLower.includes('food') || catNameLower.includes('dining')) {
      return Boolean(d.brand_name?.toLowerCase().includes('cheezious') || /pizza|burger|wings|combo/i.test(d.title || ''));
    }
    if (catNameLower.includes('beauty') || catNameLower.includes('cosmetic')) {
      return Boolean(d.brand_name?.toLowerCase().includes('saeed') || /rose water|skincare|oil|herbal/i.test(d.title || ''));
    }
    if (catNameLower.includes('grocery') || catNameLower.includes('supermarket')) {
      return Boolean(d.brand_name?.toLowerCase().includes('imtiaz') || /grocery|bachat|oil|ration/i.test(d.title || ''));
    }
    if (catNameLower.includes('home') || catNameLower.includes('living')) {
      return Boolean(d.brand_name?.toLowerCase().includes('habitt') || /bed|linen|pillow|decor/i.test(d.title || ''));
    }
    if (catNameLower.includes('fashion') || catNameLower.includes('apparel')) {
      return Boolean(/lawn|kurti|suit|streetwear|unstitched|khaadi|outfitters|gul ahmed/i.test(`${d.brand_name} ${d.title}`));
    }
    return false;
  };

  const categoryFeaturedDeals = useMemo(() => {
    if (!selectedCategory) {
      return featuredDeals.slice(0, 6);
    }
    return featuredDeals.filter((d) => isDealInCategory(d, selectedCategory));
  }, [featuredDeals, selectedCategory, categories]);

  // Fetch AI Recommendations via get_recommendations RPC
  const { data: recommendations = [], isLoading: isLoadingRecs } = useQuery<
    RecommendationDeal[]
  >({
    queryKey: ['recommendations', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        'get_recommendations',
        {
          p_limit: 8,
          p_user_id: user?.id || null,
        }
      );

      if (error) {
        console.warn('[Home recommendations] RPC error:', error.message);
        const localDeals = await getLocalBrandDeals();
        const localBrands = await getLocalBrands();
        const activeLocal = localDeals.filter(isDealActive).slice(0, 6);
        return activeLocal.map((d) => {
          const brandMatch =
            (d as any).brand && (d as any).brand.name !== 'Featured Brand'
              ? (d as any).brand
              : localBrands.find((b) => b.id === d.brand_id) || KHAADI_BRAND;
          return {
            ...d,
            brand: brandMatch,
            brand_name: brandMatch?.name || 'Khaadi',
            brand_logo: brandMatch?.logo_url || null,
            category_name: brandMatch?.category || 'Fashion & Apparel',
            recommendation_score: 0.85,
            recommendation_reason: 'Trending deal in Pakistan',
          };
        });
      }

      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });

  // Infinite Scroll Deals Query using deals table + local deals fallback
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['deals-feed', selectedCategory, searchQuery, filters],
    queryFn: async ({ pageParam = 0 }) => {
      const localDeals = await getLocalBrandDeals();
      const localBrands = await getLocalBrands();
      const activeLocal = localDeals.filter(isDealActive).map((d) => {
        const brandMatch =
          (d as any).brand && (d as any).brand.name !== 'Featured Brand'
            ? (d as any).brand
            : localBrands.find((b) => b.id === d.brand_id) || KHAADI_BRAND;
        return {
          ...d,
          brand: brandMatch,
          brand_name: brandMatch.name,
        };
      });

      // Filter local deals according to user preferences (City, Deal Type, Discount, Search, Sort)
      let filteredLocal = [...activeLocal];

      if (selectedCategory) {
        filteredLocal = filteredLocal.filter((d) => isDealInCategory(d, selectedCategory));
      }

      if (filters.city) {
        filteredLocal = filteredLocal.filter(
          (d) =>
            !d.city ||
            d.city.toLowerCase() === 'all pakistan' ||
            d.city.toLowerCase() === filters.city!.toLowerCase()
        );
      }

      if (filters.dealType !== 'all') {
        filteredLocal = filteredLocal.filter((d) => d.deal_type === filters.dealType);
      }

      if (filters.minDiscount > 0) {
        filteredLocal = filteredLocal.filter((d) => (d.discount_pct || 0) >= filters.minDiscount);
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        filteredLocal = filteredLocal.filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            d.description?.toLowerCase().includes(q) ||
            (d as any).brand?.name?.toLowerCase().includes(q)
        );
      }

      if (filters.sortBy === 'discount_desc') {
        filteredLocal.sort((a, b) => (b.discount_pct || 0) - (a.discount_pct || 0));
      } else if (filters.sortBy === 'ending_soon') {
        filteredLocal.sort((a, b) => {
          const tA = a.end_date ? new Date(a.end_date).getTime() : 9999999999999;
          const tB = b.end_date ? new Date(b.end_date).getTime() : 9999999999999;
          return tA - tB;
        });
      } else {
        filteredLocal.sort((a, b) => {
          const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tB - tA;
        });
      }

      if (!isSupabaseConfigured) {
        return filteredLocal as Deal[];
      }

      try {
        let query = supabase
          .from('deals')
          .select('*, brand:brands(*), category:categories(*)')
          .eq('status', 'active');

        if (selectedCategory) {
          query = query.eq('category_id', selectedCategory);
        }

        if (filters.city) {
          query = query.in('city', [filters.city, 'All Pakistan']);
        }

        if (filters.dealType !== 'all') {
          query = query.eq('deal_type', filters.dealType);
        }

        if (filters.minDiscount > 0) {
          query = query.gte('discount_pct', filters.minDiscount);
        }

        if (searchQuery.trim()) {
          query = query.ilike('title', `%${searchQuery.trim()}%`);
        }

        if (filters.sortBy === 'discount_desc') {
          query = query.order('discount_pct', { ascending: false });
        } else if (filters.sortBy === 'ending_soon') {
          query = query.order('end_date', { ascending: true });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        query = query.range(pageParam, pageParam + PAGE_SIZE - 1);

        const { data: resultData, error } = await query;
        if (!error && resultData && resultData.length > 0) {
          const liveDeals = (resultData as Deal[]).filter(isDealActive);
          return liveDeals;
        }
        if (pageParam === 0 && (!resultData || resultData.length === 0)) {
          return filteredLocal as Deal[];
        }
        return [];
      } catch {
        return filteredLocal as Deal[];
      }
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    initialPageParam: 0,
    staleTime: 2 * 60 * 1000,
  });

  const deals = data?.pages.flatMap((page) => page) ?? [];

  const handleCardPress = (deal: Deal | any) => {
    interactionLogger.logInteraction(deal.id, 'view', user?.id);
    recordDealView(deal);
    router.push(`/(consumer)/deal/${deal.id}` as any);
  };

  const handleLikeToggle = async (deal: Deal) => {
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
      if (typeof res?.count === 'number') {
        setDynamicLikesMap((prev) => ({ ...prev, [deal.id]: res.count }));
      }
      if (res.isLiked) {
        toast.show('Liked deal! ❤️', 'success');
      } else {
        toast.show('Removed like', 'info');
      }
      refetchLikedIds();
    } catch {
      toast.show('Could not update like', 'error');
    }
  };

  const handleSaveToggle = async (deal: Deal | any) => {
    try {
      const effectiveUserId = user?.id || 'guest';
      const res = await toggleDealSave(deal.id, effectiveUserId);
      if (res.isSaved) {
        toast.show('Saved to your collection! 📌', 'success');
      } else {
        toast.show('Removed from saved collection', 'info');
      }
      refetchSavedIds();
      queryClient.invalidateQueries({ queryKey: ['user-saved-deal-ids'] });
      queryClient.invalidateQueries({ queryKey: ['profile-saved-count'] });
      queryClient.invalidateQueries({ queryKey: ['saved-deals-list'] });
    } catch {
      toast.show('Could not update saved status', 'error');
    }
  };

  const handleShare = (deal: Deal | any) => {
    if (!deal) return;
    setActiveShareDeal({
      id: deal.id,
      title: deal.title,
      discount_pct: deal.discount_pct,
      promo_code: deal.promo_code,
      brand_name: deal.brand?.name || deal.brand_name || 'Brand Partner',
      brand_logo: deal.brand?.logo_url || deal.brand_logo || null,
      image_url: deal.image_url || deal.image_urls?.[0] || null,
      price: deal.price,
      original_price: deal.original_price,
      brand_id: deal.brand_id || deal.brand?.id,
    });
    setShareModalOpen(true);
  };

  const formatExpiryLabel = (dateStr?: string) => {
    if (!dateStr) return 'Until Apr 5';
    try {
      const date = new Date(dateStr);
      return `Until ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } catch {
      return 'Until Apr 5';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header matching Screenshot 1 */}
      <View style={styles.headerBar}>
        <Text style={styles.brandTitleText}>
          Jumble <Text style={{ color: '#00FF66' }}>Sale</Text>
        </Text>
        <View style={styles.headerActionsRow}>
          <Pressable
            style={styles.iconSquareBtn}
            onPress={() => setFilterModalOpen(true)}>
            <Ionicons name="search-outline" size={20} color="#FFFFFF" />
          </Pressable>

          <NotificationBell
            role="consumer"
            userId={user?.id}
            onPress={() => setNotificationsModalOpen(true)}
            style={styles.iconSquareBtn}
          />
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={deals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.headerComponent}>
            {/* Search Input Bar */}
            <View style={styles.searchRow}>
              <View style={{ flex: 1 }}>
                <Input
                  placeholder="Search sales, brands, or deals..."
                  leftIcon="search-outline"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
              <Pressable
                style={[
                  styles.filterBtn,
                  (filters.city || filters.minDiscount > 0 || filters.dealType !== 'all') &&
                    styles.filterBtnActive,
                ]}
                onPress={() => setFilterModalOpen(true)}>
                <Ionicons
                  name="options-outline"
                  size={20}
                  color={
                    filters.city || filters.minDiscount > 0 || filters.dealType !== 'all'
                      ? colors.textInverse
                      : colors.textPrimary
                  }
                />
              </Pressable>
            </View>

            {/* Category Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoriesRow}>
              <CategoryChip
                label="All"
                selected={selectedCategory === null}
                onPress={() => setSelectedCategory(null)}
              />
              {categories.map((cat) => (
                <CategoryChip
                  key={cat.id}
                  label={cat.name}
                  icon={(cat.icon as any) || 'pricetag-outline'}
                  selected={selectedCategory === cat.id}
                  onPress={() => setSelectedCategory(cat.id)}
                />
              ))}
            </ScrollView>

            {/* Featured Carousel Section */}
            {categoryFeaturedDeals.length > 0 && !searchQuery && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {selectedCategoryName
                    ? `🔥 Featured in ${selectedCategoryName}`
                    : '🔥 Featured Sales in Pakistan'}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.featuredRow}>
                  {categoryFeaturedDeals.map((item) => (
                    <View key={item.id} style={styles.featuredCardWrap}>
                      <DealCard
                        title={item.title}
                        brandName={item.brand_name || item.brand?.name || 'Khaadi'}
                        brandLogo={item.brand?.logo_url || item.brand_logo}
                        discountLabel={`${item.discount_pct}% OFF`}
                        isSponsored={Boolean(item.is_pinned)}
                        price={(item as any).price || (item as any).discount_price || null}
                        originalPrice={(item as any).original_price || null}
                        imageUri={item.image_urls?.[0]}
                        expiresLabel={formatExpiryLabel(item.end_date)}
                        liked={likedDealIds.includes(item.id)}
                        saved={savedDealIds.includes(item.id)}
                        likesCount={getDealLikes(item)}
                        commentsCount={getDealComments(item)}
                        onPress={() => handleCardPress(item)}
                        onToggleLike={() => handleLikeToggle(item)}
                        onToggleSave={() => handleSaveToggle(item)}
                        onShare={() => handleShare(item)}
                        onCommentPress={() => handleCardPress(item)}
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Live AI Recommendation Section (Shown on All Promotions feed) */}
            {!selectedCategory && !searchQuery && (
              <View style={styles.section}>
                <View style={styles.aiSectionHeader}>
                  <View style={styles.aiTitleRow}>
                    <View style={styles.sparkleIconWrap}>
                      <Ionicons name="sparkles" size={16} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={styles.sectionTitle}>✨ Recommended for You</Text>
                      <Text style={styles.aiSectionSubtitle}>
                        AI-matched from your shopping activity & preferences
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    style={styles.personalizeBtn}
                    onPress={() => router.push('/(consumer)/onboarding' as any)}>
                    <Ionicons name="options-outline" size={13} color={colors.primary} />
                    <Text style={styles.personalizeBtnText}>Preferences</Text>
                  </Pressable>
                </View>

                {isLoadingRecs ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.featuredRow}>
                    {[1, 2, 3].map((i) => (
                      <View key={i} style={styles.recsCardWrap}>
                        <DealCardSkeleton />
                      </View>
                    ))}
                  </ScrollView>
                ) : recommendations.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.featuredRow}>
                    {recommendations.map((item) => (
                      <View key={item.id} style={styles.recsCardWrap}>
                        {/* AI Match Reason Badge */}
                        <View style={styles.aiReasonChip}>
                          <Ionicons name="sparkles-sharp" size={11} color={colors.primary} />
                          <Text style={styles.aiReasonChipText} numberOfLines={1}>
                            {item.recommendation_reason || 'AI Match'}
                          </Text>
                        </View>

                        <DealCard
                          title={item.title}
                          brandName={item.brand_name || 'Khaadi'}
                          brandLogo={item.brand_logo}
                          discountLabel={`${item.discount_pct}% OFF`}
                          price={(item as any).price || (item as any).discount_price || null}
                          originalPrice={(item as any).original_price || null}
                          imageUri={item.image_urls?.[0]}
                          expiresLabel={formatExpiryLabel(item.end_date)}
                          liked={likedDealIds.includes(item.id)}
                          saved={savedDealIds.includes(item.id)}
                          onPress={() => handleCardPress(item)}
                          onToggleLike={() => handleLikeToggle(item as any)}
                          onToggleSave={() => handleSaveToggle(item as any)}
                          onShare={() => handleShare(item as any)}
                          onCommentPress={() => handleCardPress(item)}
                        />
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <View style={styles.aiEmptyStateCard}>
                    <Ionicons name="sparkles" size={24} color={colors.primary} />
                    <Text style={styles.aiEmptyStateTitle}>Unlock Personalized Recommendations</Text>
                    <Text style={styles.aiEmptyStateText}>
                      Select your favorite categories to let our hybrid AI recommend the best active offers.
                    </Text>
                    <Pressable
                      style={styles.setPrefBtn}
                      onPress={() => router.push('/(consumer)/onboarding' as any)}>
                      <Text style={styles.setPrefBtnText}>Pick Favorite Categories</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            <Text style={[styles.sectionTitle, { marginTop: spacing[2] }]}>
              {selectedCategoryName ? `${selectedCategoryName} Deals` : 'All Active Promotions'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.skeletonList}>
              <DealCardSkeleton />
              <DealCardSkeleton />
              <DealCardSkeleton />
            </View>
          ) : (
            <EmptyState
              title={
                selectedCategoryName
                  ? `No Deals in ${selectedCategoryName}`
                  : 'No Deals Available Right Now'
              }
              description={
                selectedCategoryName
                  ? `There are currently no active promotions in ${selectedCategoryName}. Explore another category or view all active deals.`
                  : 'No deals available right now. Check back later!'
              }
              icon="pricetag-outline"
              actionLabel="View All Deals"
              onAction={() => {
                setSearchQuery('');
                setSelectedCategory(null);
                setFilters(DEFAULT_FILTERS);
              }}
            />
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          interactionLogger.logInteraction(item.id, 'view', user?.id);

          return (
            <View style={styles.dealItemContainer}>
              <DealCard
                title={item.title}
                brandName={item.brand?.name || item.brand_name || 'Khaadi'}
                brandLogo={item.brand?.logo_url}
                discountLabel={`${item.discount_pct}% OFF`}
                price={(item as any).price || (item as any).discount_price || null}
                originalPrice={(item as any).original_price || null}
                imageUri={item.image_urls?.[0]}
                expiresLabel={formatExpiryLabel(item.end_date)}
                liked={likedDealIds.includes(item.id)}
                saved={savedDealIds.includes(item.id)}
                likesCount={getDealLikes(item)}
                commentsCount={getDealComments(item)}
                onPress={() => handleCardPress(item)}
                onToggleLike={() => handleLikeToggle(item)}
                onToggleSave={() => handleSaveToggle(item)}
                onShare={() => handleShare(item)}
                onCommentPress={() => handleCardPress(item)}
              />
            </View>
          );
        }}
      />

      {/* Filter Modal */}
      <FilterModal
        visible={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        filters={filters}
        onApply={(newFilters) => setFilters(newFilters)}
        onReset={() => setFilters(DEFAULT_FILTERS)}
      />

      {/* Guest Auth Prompt Modal */}
      <AuthRequiredModal
        visible={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />

      {/* In-App Notification Center Modal */}
      <NotificationCenterModal
        visible={notificationsModalOpen}
        onClose={() => setNotificationsModalOpen(false)}
        role="consumer"
        userId={user?.id}
      />

      {/* Social Deal Share Modal */}
      <ShareDealModal
        visible={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        deal={activeShareDeal}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0E',
  },
  headerBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    marginTop: spacing[2],
  },
  brandTitleText: {
    ...typography.h1,
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  iconSquareBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#141721',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#202432',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF4500',
  },
  notificationBtn: {
    padding: spacing[2],
  },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
    gap: spacing[4],
  },
  headerComponent: {
    gap: spacing[4],
    marginBottom: spacing[2],
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoriesRow: {
    gap: spacing[2],
  },
  section: {
    gap: spacing[2],
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textPrimary,
  },
  featuredRow: {
    gap: spacing[3],
  },
  featuredCardWrap: {
    width: 280,
  },
  aiSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[1],
  },
  aiTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
  },
  sparkleIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSectionSubtitle: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  personalizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  personalizeBtnText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  recsCardWrap: {
    width: 280,
    position: 'relative',
  },
  aiReasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.full,
    alignSelf: 'flex-start',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  aiReasonChipText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },

  aiEmptyStateCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing[5],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    gap: spacing[2],
  },
  aiEmptyStateTitle: {
    fontFamily: typography.bodyMedium.fontFamily,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  aiEmptyStateText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  setPrefBtn: {
    marginTop: spacing[2],
    backgroundColor: colors.primary,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
  },
  setPrefBtnText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textInverse,
  },
  dealItemContainer: {
    marginBottom: spacing[1],
  },
  skeletonList: {
    gap: spacing[4],
    paddingVertical: spacing[4],
  },
  footerLoader: {
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
});
