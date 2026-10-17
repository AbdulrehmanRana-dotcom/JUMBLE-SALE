import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { getTopEngagedBrands, type EngagedBrand } from '@/lib/brandStore';
import { getLocalBrandDeals } from '@/lib/dealStore';
import { supabase } from '@/lib/supabase';
import { spacing, typography } from '@/theme';
import type { Deal } from '@/types/database.types';

export default function BrandExploreScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string | null>(null);

  // Fetch real brands ranked by engagement for Top Brands bar
  const { data: topBrands = [] } = useQuery<EngagedBrand[]>({
    queryKey: ['brand-explore-top-brands'],
    queryFn: async () => {
      return getTopEngagedBrands();
    },
    staleTime: 5 * 1000,
  });

  // Fetch Real Deals
  const {
    data: deals = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<Deal[]>({
    queryKey: ['brand-explore-deals'],
    queryFn: async () => {
      const fallback = await getLocalBrandDeals();
      try {
        const { data, error } = await supabase
          .from('deals')
          .select('*, brand:brands(*)')
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          return data as Deal[];
        }
        return fallback;
      } catch {
        return fallback;
      }
    },
  });

  // Real deals only (no demo deals)
  const allDeals = useMemo(() => {
    return deals;
  }, [deals]);

  const filteredDeals = useMemo(() => {
    return allDeals.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const title = (item.title || '').toLowerCase();
      const brandName = ((item as any).brand?.name || '').toLowerCase();

      const matchesSearch = !q || title.includes(q) || brandName.includes(q);
      const matchesBrand =
        !selectedBrandFilter ||
        brandName.includes(selectedBrandFilter.toLowerCase());

      return matchesSearch && matchesBrand;
    });
  }, [allDeals, searchQuery, selectedBrandFilter]);

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* ─── 1. TOP BAR matching screenshot ─── */}
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

      {/* ─── 2. TRENDING NOW HERO BANNER ─── */}
      <Text style={styles.sectionTitle}>Trending Now</Text>
      <Pressable
        style={styles.heroBannerWrap}
        onPress={() => setSearchQuery('50% Off')}>
        <ImageBackground
          source={{
            uri: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&q=80',
          }}
          style={styles.heroBannerImage}
          imageStyle={{ borderRadius: 16 }}>
          <View style={styles.heroOverlay}>
            <View style={styles.exclusiveBadge}>
              <Text style={styles.exclusiveBadgeText}>EXCLUSIVE</Text>
            </View>
            <Text style={styles.heroTitle}>50% Off Top Brands</Text>
          </View>
        </ImageBackground>
      </Pressable>

      {/* ─── 3. TOP BRANDS SCROLL ROW ─── */}
      {topBrands.length > 0 ? (
        <View style={{ marginBottom: spacing[2] }}>
          <View style={styles.topBrandsHeaderRow}>
            <Text style={styles.sectionTitle}>Top Brands</Text>
            <Pressable onPress={() => setSelectedBrandFilter(null)}>
              <Text style={styles.seeAllText}>
                {selectedBrandFilter ? 'Clear Filter' : 'See All'}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topBrandsScroll}>
            {topBrands.map((item) => {
              const isSelected = selectedBrandFilter?.toLowerCase() === item.name.toLowerCase();
              const avatarUri = item.logo_url;
              const initial = (item.name || 'B')[0].toUpperCase();
              return (
                <Pressable
                  key={item.id}
                  style={styles.brandCircleWrap}
                  onPress={() =>
                    setSelectedBrandFilter(isSelected ? null : item.name)
                  }>
                  <View
                    style={[
                      styles.brandCircleRing,
                      isSelected && styles.brandCircleRingActive,
                    ]}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.brandAvatar} />
                    ) : (
                      <View style={styles.brandAvatarFallback}>
                        <Text style={styles.brandAvatarFallbackText}>{initial}</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.brandNameLabel,
                      isSelected && styles.brandNameLabelActive,
                    ]}
                    numberOfLines={1}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* ─── 4. RECOMMENDED FOR YOU TITLE ─── */}
      <Text style={styles.recommendedTitle}>Recommended For You</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#00FF66" />
        </View>
      ) : (
        <FlatList
          data={filteredDeals}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.gridColumnWrapper}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#00FF66"
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No Deals Found"
              description={
                searchQuery || selectedBrandFilter
                  ? `No promotions match "${searchQuery || selectedBrandFilter}".`
                  : 'No active promotions available right now.'
              }
              icon="search-outline"
            />
          }
          renderItem={({ item }) => {
            const imageUri =
              item.image_urls?.[0] ||
              'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800&q=80';
            const brandName = (item as any).brand?.name || 'Brand Partner';
            const itemPrice = (item as any).price || item.discount_price;
            const formattedPrice = itemPrice
              ? `Rs. ${itemPrice.toLocaleString()}`
              : `${item.discount_pct}% OFF`;

            return (
              <View style={styles.cardWrap}>
                <Pressable
                  style={styles.productCard}
                  onPress={() =>
                    router.push({
                      pathname: '/(brand)/deal/[id]',
                      params: { id: item.id },
                    })
                  }>
                  <Image source={{ uri: imageUri }} style={styles.cardImage} />

                  <View style={styles.cardBody}>
                    <Text style={styles.brandNameText}>{brandName.toUpperCase()}</Text>
                    <Text style={styles.productTitleText} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.priceText}>{formattedPrice}</Text>
                  </View>
                </Pressable>
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
  headerContainer: {
    paddingBottom: spacing[2],
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    gap: spacing[3],
  },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1C202E',
  },
  logoText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '900',
    color: '#00FF66',
  },
  searchBarWrap: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141721',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#202432',
    paddingLeft: spacing[3],
    paddingRight: 4,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    fontSize: 13,
    color: '#FFFFFF',
  },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#00FF66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    paddingHorizontal: spacing[4],
    marginTop: spacing[3],
    marginBottom: spacing[2],
  },
  heroBannerWrap: {
    paddingHorizontal: spacing[4],
    marginBottom: spacing[2],
  },
  heroBannerImage: {
    width: '100%',
    height: 160,
    justifyContent: 'flex-end',
    borderRadius: 16,
    overflow: 'hidden',
  },
  heroOverlay: {
    padding: spacing[4],
    backgroundColor: 'rgba(9, 10, 14, 0.45)',
    gap: 6,
  },
  exclusiveBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#00FF66',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  exclusiveBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '900',
    color: '#090A0E',
  },
  heroTitle: {
    ...typography.h2,
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  topBrandsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing[4],
  },
  seeAllText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
    color: '#00FF66',
  },
  topBrandsScroll: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
    paddingVertical: spacing[1],
  },
  brandCircleWrap: {
    alignItems: 'center',
    gap: 6,
  },
  brandCircleRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#00FF66',
    padding: 2,
    backgroundColor: '#090A0E',
  },
  brandCircleRingActive: {
    borderColor: '#00FF66',
    borderWidth: 3,
  },
  brandAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
  },
  brandNameLabel: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  brandNameLabelActive: {
    color: '#00FF66',
  },
  brandAvatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    backgroundColor: '#1E2330',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandAvatarFallbackText: {
    ...typography.caption,
    fontSize: 18,
    fontWeight: '900',
    color: '#00FF66',
  },
  recommendedTitle: {
    ...typography.h3,
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    paddingHorizontal: spacing[4],
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingBottom: spacing[10],
  },
  gridColumnWrapper: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  cardWrap: {
    flex: 1,
    maxWidth: '48.5%',
  },
  productCard: {
    backgroundColor: '#141721',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#202432',
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 140,
    resizeMode: 'cover',
  },
  cardBody: {
    padding: spacing[3],
    gap: 4,
  },
  brandNameText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  productTitleText: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 18,
    minHeight: 36,
  },
  priceText: {
    ...typography.h3,
    fontSize: 15,
    fontWeight: '900',
    color: '#00FF66',
    marginTop: 2,
  },
});
