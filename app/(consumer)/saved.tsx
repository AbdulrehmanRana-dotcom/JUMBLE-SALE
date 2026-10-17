import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AuthRequiredModal } from '@/components/ui/AuthRequiredModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DealCard } from '@/components/ui/DealCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Header } from '@/components/ui/Header';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { Brand, Deal } from '@/types/database.types';
import { colors, radii, spacing, typography } from '@/theme';

export default function SavedDealsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user, isGuest } = useAuth();
  const [activeTab, setActiveTab] = useState<'deals' | 'brands'>('deals');
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Fetch Saved Deals
  const {
    data: savedDeals = [],
    isLoading: loadingDeals,
    refetch: refetchDeals,
  } = useQuery<Deal[]>({
    queryKey: ['saved-deals-list', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('saved_deals')
        .select('deal_id, deals:deals(*, brand:brands(*))')
        .eq('user_id', user.id);

      if (error) throw error;
      return (data?.map((item: any) => item.deals).filter(Boolean) as Deal[]) ?? [];
    },
    enabled: Boolean(user?.id && !isGuest),
  });

  // Fetch Followed Brands
  const {
    data: followedBrands = [],
    isLoading: loadingBrands,
    refetch: refetchBrands,
  } = useQuery<Brand[]>({
    queryKey: ['followed-brands-list', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('follows')
        .select('brand_id, brands:brands(*)')
        .eq('user_id', user.id);

      if (error) throw error;
      return (data?.map((item: any) => item.brands).filter(Boolean) as Brand[]) ?? [];
    },
    enabled: Boolean(user?.id && !isGuest),
  });

  const handleRemoveSaved = async (dealId: string) => {
    if (!user?.id) return;
    try {
      await supabase
        .from('saved_deals')
        .delete()
        .eq('user_id', user.id)
        .eq('deal_id', dealId);

      toast.show('Removed from saved collection', 'info');
      refetchDeals();
    } catch (err: any) {
      toast.show(err.message, 'error');
    }
  };

  const handleUnfollowBrand = async (brandId: string, name: string) => {
    if (!user?.id) return;
    try {
      await supabase
        .from('follows')
        .delete()
        .eq('user_id', user.id)
        .eq('brand_id', brandId);

      toast.show(`Unfollowed ${name}`, 'info');
      refetchBrands();
    } catch (err: any) {
      toast.show(err.message, 'error');
    }
  };

  if (isGuest || !user) {
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title="Saved Collection"
          subtitle="Bookmark deals and follow retail brands"
        />
        <View style={styles.guestCenter}>
          <EmptyState
            title="Sign in to View Saved Deals"
            description="Create an account or log in to keep track of your saved promotions and followed brands."
            icon="heart-outline"
            actionLabel="Sign In / Register"
            onAction={() => setAuthModalOpen(true)}
          />
        </View>
        <AuthRequiredModal
          visible={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Saved & Followed"
        subtitle="Manage your bookmarked promotions and brand alerts"
        onBack={() => router.back()}
      />

      {/* Tabs Switcher */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'deals' && styles.tabActive]}
          onPress={() => setActiveTab('deals')}>
          <Ionicons
            name={activeTab === 'deals' ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={activeTab === 'deals' ? colors.textInverse : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'deals' && styles.tabTextActive,
            ]}>
            Saved Deals ({savedDeals.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tab, activeTab === 'brands' && styles.tabActive]}
          onPress={() => setActiveTab('brands')}>
          <Ionicons
            name={activeTab === 'brands' ? 'people' : 'people-outline'}
            size={18}
            color={activeTab === 'brands' ? colors.textInverse : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'brands' && styles.tabTextActive,
            ]}>
            Followed Brands ({followedBrands.length})
          </Text>
        </Pressable>
      </View>

      {activeTab === 'deals' ? (
        loadingDeals ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={savedDeals}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={loadingDeals}
                onRefresh={refetchDeals}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <EmptyState
                title="No Saved Deals Yet"
                description="Tap the save icon on any promotion to add it here."
                icon="bookmark-outline"
                actionLabel="Explore Active Deals"
                onAction={() => router.push('/(consumer)' as any)}
              />
            }
            renderItem={({ item }) => (
              <View style={styles.cardWrap}>
                <DealCard
                  title={item.title}
                  brandName={item.brand?.name || 'Brand'}
                  discountLabel={`${item.discount_pct}% OFF`}
                  price={(item as any).price || (item as any).discount_price || null}
                  originalPrice={(item as any).original_price || null}
                  imageUri={item.image_urls?.[0]}
                  expiresLabel={`Ends ${new Date(item.end_date).toLocaleDateString()}`}
                  saved={true}
                  onPress={() => router.push(`/(consumer)/deal/${item.id}` as any)}
                  onToggleSave={() => handleRemoveSaved(item.id)}
                />
                <Button
                  label="Remove Bookmark"
                  variant="ghost"
                  size="sm"
                  onPress={() => handleRemoveSaved(item.id)}
                  style={styles.removeBtn}
                />
              </View>
            )}
          />
        )
      ) : loadingBrands ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={followedBrands}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loadingBrands}
              onRefresh={refetchBrands}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No Followed Brands Yet"
              description="Follow your favorite Pakistani retail stores to get instant alerts."
              icon="business-outline"
            />
          }
          renderItem={({ item }) => (
            <View style={styles.brandRow}>
              <View style={styles.brandLogoCircle}>
                {item.logo_url ? (
                  <Image source={{ uri: item.logo_url }} style={styles.logo} />
                ) : (
                  <Ionicons name="business" size={24} color={colors.primary} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.brandName}>{item.name}</Text>
                  {item.is_verified && <Badge label="VERIFIED" variant="success" />}
                </View>
                <Text style={styles.brandCategory}>{item.category || 'Retail Outlet'}</Text>
              </View>
              <Button
                label="Unfollow"
                variant="outline"
                size="sm"
                onPress={() => handleUnfollowBrand(item.id, item.name)}
              />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  guestCenter: {
    flex: 1,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    marginVertical: spacing[3],
    gap: spacing[2],
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    fontSize: 13,
  },
  tabTextActive: {
    color: colors.textInverse,
  },
  list: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
    gap: spacing[4],
  },
  cardWrap: {
    gap: spacing[1],
  },
  removeBtn: {
    alignSelf: 'flex-end',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[3],
  },
  brandLogoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  brandName: {
    ...typography.h3,
    color: colors.textPrimary,
    fontSize: 15,
  },
  brandCategory: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
