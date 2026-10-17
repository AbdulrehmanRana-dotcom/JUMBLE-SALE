import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { DealCard } from '@/components/ui/DealCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { DealCardSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import {
  getLikedDealIds,
  getSavedDealIds,
  recordDealShare,
  recordDealView,
  toggleDealLike,
  toggleDealSave,
} from '@/lib/activityStore';
import { getLocalBrands } from '@/lib/brandStore';
import { getLocalBrandDeals } from '@/lib/dealStore';
import { interactionLogger } from '@/lib/interactionLogger';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { typography } from '@/theme';
import type { Brand, Deal } from '@/types/database.types';

const CATEGORIES = [
  'All',
  'Fashion',
  'Shoes',
  'Electronics',
  'Beauty',
  'Accessories',
  'Food',
];

export default function BrandDashboardScreen() {
  const router = useRouter();
  const { user, profile, brand: authBrand } = useAuth();
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // 1. Fetch Current Brand Profile (for header branding)
  const { data: brand, refetch: refetchBrand } = useQuery<Brand | null>({
    queryKey: ['my-brand-profile', user?.id],
    queryFn: async () => {
      const localBrands = await getLocalBrands();
      const localMatch =
        localBrands.find(
          (b) =>
            (user?.id && b.owner_id === user?.id) ||
            (user?.email &&
              b.business_email?.toLowerCase() === user.email.toLowerCase())
        ) || localBrands[0] || null;
      try {
        if (!user?.id) return localMatch || authBrand;
        const { data, error } = await supabase
          .from('brands')
          .select('*')
          .eq('owner_id', user.id)
          .maybeSingle();
        if (error || !data) return localMatch || authBrand;
        return (data as unknown as Brand) ?? localMatch ?? authBrand;
      } catch {
        return localMatch || authBrand;
      }
    },
  });


  // 2. Fetch User's Liked & Saved Deals
  const { data: likedDealIds = [], refetch: refetchLikedIds } = useQuery<string[]>({
    queryKey: ['brand-user-likes', user?.id || 'guest'],
    queryFn: () => getLikedDealIds(user?.id || 'guest'),
    staleTime: 5000,
  });

  const { data: savedDealIds = [], refetch: refetchSavedIds } = useQuery<string[]>({
    queryKey: ['brand-user-saved', user?.id || 'guest'],
    queryFn: () => getSavedDealIds(user?.id || 'guest'),
    staleTime: 5000,
  });

  // 3. Fetch All Active Deals Across All Brands (just like User Portal)
  const {
    data: allDeals = [],
    isLoading: dealsLoading,
    isRefetching: dealsRefetching,
    refetch: refetchDeals,
  } = useQuery<Deal[]>({
    queryKey: ['brand-home-all-deals'],
    queryFn: async () => {
      const localDeals = await getLocalBrandDeals();
      const localBrands = await getLocalBrands();

      const activeLocal: Deal[] = localDeals
        .filter((d) => d.status === 'active')
        .map((d) => {
          const brandMatch = localBrands.find((b) => b.id === d.brand_id);
          return {
            ...d,
            brand: (d as any).brand || brandMatch || {
              id: d.brand_id,
              name: 'Featured Brand',
              category: 'Fashion & Apparel',
              logo_url: null,
            },
          } as Deal;
        });

      try {
        const { data, error } = await supabase
          .from('deals')
          .select('*, category:categories(*), brand:brands(*)')
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (error || !data || data.length === 0) {
          return activeLocal;
        }

        const serverDeals = (data as Deal[]) ?? [];
        const merged = [...activeLocal];
        for (const sd of serverDeals) {
          if (!merged.some((m) => m.id === sd.id)) {
            merged.push(sd);
          }
        }
        return merged;
      } catch {
        return activeLocal;
      }
    },
  });

  // Refetch when tab becomes focused
  useFocusEffect(
    useCallback(() => {
      refetchBrand();
      refetchDeals();
      refetchLikedIds();
      refetchSavedIds();
    }, [refetchBrand, refetchDeals, refetchLikedIds, refetchSavedIds])
  );

  // Filter deals based on search and category
  const filteredDeals = useMemo(() => {
    return allDeals.filter((item) => {
      const bName = ((item as any).brand?.name || '').toLowerCase();
      const title = (item.title || '').toLowerCase();
      const category = (
        (item as any).category?.name ||
        (item as any).brand?.category ||
        ''
      ).toLowerCase();
      const q = searchQuery.toLowerCase().trim();

      const matchesSearch =
        !q || title.includes(q) || bName.includes(q) || category.includes(q);
      const matchesCategory =
        selectedCategory === 'All' ||
        category.includes(selectedCategory.toLowerCase());

      return matchesSearch && matchesCategory;
    });
  }, [allDeals, searchQuery, selectedCategory]);

  const handleCardPress = (deal: Deal | any) => {
    interactionLogger.logInteraction(deal.id, 'click', user?.id);
    recordDealView(deal);
    router.push({
      pathname: '/(brand)/deal/[id]',
      params: { id: deal.id },
    });
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
      if (res.isLiked) {
        toast.show('Liked deal! ❤️', 'success');
      } else {
        toast.show('Removed like', 'info');
      }
      refetchLikedIds();
      refetchDeals();
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
    } catch {
      toast.show('Could not update saved status', 'error');
    }
  };

  const handleShare = async (deal: Deal | any) => {
    try {
      const commenterName = user?.email ? user.email.split('@')[0] : 'Shopper';
      const userId = user?.id || 'guest';
      await recordDealShare(
        deal.id,
        userId,
        commenterName,
        deal.title,
        deal.brand_id || deal.brand?.id
      );

      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          const shareUrl =
            typeof window !== 'undefined'
              ? `${window.location.origin}/deal/${deal.id}`
              : `https://jumblesale.app/deal/${deal.id}`;
          await navigator.clipboard.writeText(shareUrl);
          toast.show('Deal link copied to clipboard! 🔗', 'success');
        } else {
          toast.show('Deal shared! 🔗', 'success');
        }
      } else {
        await Share.share({
          title: deal.title,
          message: `Check out this promotion on Jumble Sale: ${deal.title} (${deal.discount_pct}% OFF)!`,
        });
        toast.show('Deal shared! 🔗', 'success');
      }
    } catch {
      toast.show('Deal link copied! 🔗', 'info');
    }
  };

  const formatExpiryLabel = (dateStr?: string) => {
    if (!dateStr) return 'Until Ongoing';
    try {
      const date = new Date(dateStr);
      return `Until ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } catch {
      return 'Until Ongoing';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ─── 1. TOP SEARCH & LOGO HEADER ─── */}
      <View style={styles.topBar}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>Jsale</Text>
        </View>

        <View style={styles.searchBarWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search all brands and products..."
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <Pressable style={styles.searchBtn} hitSlop={6}>
            <Ionicons name="search" size={18} color="#090A0E" />
          </Pressable>
        </View>
      </View>

      {/* ─── 2. CATEGORY HORIZONTAL CHIPS ─── */}
      <View style={styles.categoryContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}>
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <Pressable
                key={cat}
                style={[
                  styles.categoryChip,
                  isSelected && styles.categoryChipSelected,
                ]}
                onPress={() => setSelectedCategory(cat)}>
                <Text
                  style={[
                    styles.categoryText,
                    isSelected && styles.categoryTextSelected,
                  ]}>
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>



      {/* ─── 4. FEED OF ALL PROMOTIONS (Consumer Style with DealCard) ─── */}
      {dealsLoading ? (
        <View style={styles.loadingWrap}>
          <DealCardSkeleton />
          <DealCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={filteredDeals}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={dealsRefetching}
              onRefresh={refetchDeals}
              tintColor="#00FF66"
            />
          }
          ListHeaderComponent={
            <View style={styles.feedHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={15} color="#00FF66" />
                <Text style={styles.feedHeading}>
                  {selectedCategory === 'All'
                    ? 'All Live Promotions'
                    : `${selectedCategory} Deals`}
                </Text>
              </View>
              <Text style={styles.feedCountText}>
                {filteredDeals.length} active
              </Text>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              title="No Promotions Found"
              description={
                searchQuery || selectedCategory !== 'All'
                  ? `No active deals found for "${searchQuery || selectedCategory}".`
                  : 'No active promotions available across brands right now.'
              }
              icon="pricetag-outline"
              actionLabel={searchQuery || selectedCategory !== 'All' ? 'Reset Filters' : undefined}
              onAction={() => {
                setSearchQuery('');
                setSelectedCategory('All');
              }}
            />
          }
          renderItem={({ item }) => {
            const brandObj = (item as any).brand;
            const itemBrandName = brandObj?.name || 'Featured Brand';
            const itemBrandLogo = brandObj?.logo_url || null;

            return (
              <View style={styles.dealCardContainer}>
                <DealCard
                  title={item.title}
                  brandName={itemBrandName}
                  brandLogo={itemBrandLogo}
                  discountLabel={`${item.discount_pct}% OFF`}
                  price={(item as any).price || (item as any).discount_price || null}
                  originalPrice={(item as any).original_price || null}
                  imageUri={item.image_urls?.[0]}
                  expiresLabel={formatExpiryLabel(item.end_date)}
                  liked={likedDealIds.includes(item.id)}
                  saved={savedDealIds.includes(item.id)}
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0E',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 12,
  },
  logoBox: {
    width: 48,
    height: 44,
    backgroundColor: '#000000',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E2330',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#00FF66',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  searchBarWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121622',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E2330',
    paddingLeft: 14,
    paddingRight: 6,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: typography.bodyMedium.fontFamily,
    height: '100%',
  },
  searchBtn: {
    width: 32,
    height: 32,
    backgroundColor: '#00FF66',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryContainer: {
    paddingVertical: 4,
    backgroundColor: '#090A0E',
    borderBottomWidth: 1,
    borderBottomColor: '#121622',
  },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#121622',
    borderWidth: 1,
    borderColor: '#1E2330',
  },
  categoryChipSelected: {
    backgroundColor: '#00FF66',
    borderColor: '#00FF66',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  categoryTextSelected: {
    color: '#090A0E',
    fontWeight: '800',
  },
  partnerControlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0D1017',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1F2C',
  },
  partnerBrandName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  partnerBadge: {
    backgroundColor: 'rgba(0, 255, 102, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.3)',
  },
  partnerBadgeText: {
    color: '#00FF66',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  partnerSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  managePostsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#00FF66',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  managePostsBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 16,
  },
  feedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  feedHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E2E8F0',
    letterSpacing: -0.2,
  },
  feedCountText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  dealCardContainer: {
    marginBottom: 4,
  },
  loadingWrap: {
    padding: 16,
    gap: 16,
  },
});
