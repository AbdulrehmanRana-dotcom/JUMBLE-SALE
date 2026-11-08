import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
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
import {
  getLikedDealIds,
  getSavedDealIds,
  toggleDealLike,
  toggleDealSave,
} from '@/lib/activityStore';
import { getLocalBrands, KHAADI_BRAND, OUTFITTERS_BRAND, GUL_AHMED_BRAND } from '@/lib/brandStore';
import { getLocalBrandDeals, isDealActive } from '@/lib/dealStore';
import { isBrandFollowed, toggleFollowBrand } from '@/lib/followStore';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { Brand, Deal } from '@/types/database.types';
import { colors, radii, spacing, typography } from '@/theme';

export default function BrandProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user, isGuest } = useAuth();

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isFollowed, setIsFollowed] = useState<boolean>(false);

  // Fetch Brand Info & Follow Status
  const {
    data: brand,
    isLoading: loadingBrand,
    refetch: refetchBrand,
  } = useQuery<Brand & { is_followed?: boolean }>({
    queryKey: ['brand-profile', id, user?.id],
    queryFn: async () => {
      if (!id) throw new Error('Missing brand ID');

      const localBrands = await getLocalBrands();
      const localMatch =
        localBrands.find((b) => b.id === id) ||
        localBrands.find((b) => (b.name || '').toLowerCase() === (id || '').toLowerCase()) ||
        (id === KHAADI_BRAND.id || id?.toLowerCase().includes('khaadi') ? KHAADI_BRAND : null) ||
        (id === OUTFITTERS_BRAND.id || id?.toLowerCase().includes('outfit') ? OUTFITTERS_BRAND : null) ||
        (id === GUL_AHMED_BRAND.id || id?.toLowerCase().includes('ahmed') ? GUL_AHMED_BRAND : null) ||
        localBrands[0] ||
        KHAADI_BRAND;

      let brandData: any = localMatch;

      if (isSupabaseConfigured) {
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 800)
          );
          const queryPromise = supabase
            .from('brands')
            .select('*')
            .eq('id', id)
            .maybeSingle();

          const res: any = await Promise.race([queryPromise, timeoutPromise]);
          if (res?.data) {
            brandData = res.data;
          }
        } catch (err) {
          console.warn('[BrandProfile] Supabase query notice:', err);
        }
      }

      if (!brandData) {
        brandData = KHAADI_BRAND;
      }

      if (user?.id) {
        try {
          const followed = await isBrandFollowed(brandData.id || id, user.id);
          brandData.is_followed = followed;
        } catch {
          brandData.is_followed = false;
        }
      }

      return brandData;
    },
    enabled: Boolean(id),
    staleTime: 2 * 60 * 1000,
  });

  // Keep isFollowed state synchronized with brand query
  useEffect(() => {
    if (brand && typeof brand.is_followed === 'boolean') {
      setIsFollowed(brand.is_followed);
    }
  }, [brand]);

  // Fetch Active Deals for this Brand (Fast local-first with 800ms race timeout)
  const { data: brandDeals = [], isLoading: loadingDeals } = useQuery<Deal[]>({
    queryKey: ['brand-active-deals', id],
    queryFn: async () => {
      if (!id) return [];
      const localDeals = await getLocalBrandDeals(id);
      const activeLocal = localDeals.filter(isDealActive);

      if (!isSupabaseConfigured) {
        return activeLocal;
      }

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 800)
        );
        const queryPromise = supabase
          .from('deals')
          .select('*')
          .eq('brand_id', id)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        const res: any = await Promise.race([queryPromise, timeoutPromise]);
        if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
          const liveDeals = (res.data as Deal[]).filter(isDealActive);
          return liveDeals;
        }
      } catch {}

      return activeLocal;
    },
    enabled: Boolean(id),
    staleTime: 2 * 60 * 1000,
  });

  // Fetch Saved Deal IDs
  const { data: savedDealIds = [], refetch: refetchSavedIds } = useQuery<string[]>({
    queryKey: ['user-saved-deal-ids', user?.id || 'guest'],
    queryFn: () => getSavedDealIds(user?.id || 'guest'),
    staleTime: 0,
  });

  // Fetch Liked Deal IDs
  const { data: likedDealIds = [], refetch: refetchLikedIds } = useQuery<string[]>({
    queryKey: ['user-liked-deal-ids', user?.id || 'guest'],
    queryFn: () => getLikedDealIds(user?.id || 'guest'),
    staleTime: 0,
  });

  const handleToggleSaveDeal = async (deal: Deal) => {
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

  const handleToggleLikeDeal = async (deal: Deal) => {
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
      queryClient.invalidateQueries({ queryKey: ['user-liked-deal-ids'] });
    } catch {
      toast.show('Could not update like', 'error');
    }
  };

  const handleToggleFollow = async () => {
    if (isGuest || !user?.id) {
      setAuthModalOpen(true);
      return;
    }

    if (!brand) return;

    // Optimistic instant toggle (0ms latency Instagram feel)
    const prev = isFollowed;
    const nextState = !prev;
    setIsFollowed(nextState);

    if (nextState) {
      toast.show(`Now following ${brand.name}!`, 'success');
    } else {
      toast.show(`Unfollowed ${brand.name}`, 'info');
    }

    try {
      await toggleFollowBrand(brand.id, user.id);
      queryClient.invalidateQueries({ queryKey: ['followed-brands-list'] });
      queryClient.invalidateQueries({ queryKey: ['profile-brands-count'] });
      queryClient.invalidateQueries({ queryKey: ['brand-profile', id] });
    } catch (err: any) {
      // Revert if persistent failure
      setIsFollowed(prev);
      toast.show(err.message || 'Action failed', 'error');
    }
  };

  if (loadingBrand) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Brand Profile" onBack={() => router.back()} />
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!brand) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Brand Profile" onBack={() => router.back()} />
        <View style={styles.loadingCenter}>
          <Text style={styles.errorText}>Brand profile not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header title={brand.name} onBack={() => router.back()} />

      <FlatList
        data={brandDeals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            {/* Brand Header Banner & Card */}
            <View style={styles.profileCard}>
              <View style={styles.avatarCircle}>
                {brand.logo_url ? (
                  <Image source={{ uri: brand.logo_url }} style={styles.logo} />
                ) : (
                  <Ionicons name="business" size={36} color={colors.primary} />
                )}
              </View>

              <View style={styles.titleRow}>
                <Text style={styles.brandTitle}>{brand.name}</Text>
                {brand.is_verified && <Badge label="VERIFIED" variant="success" />}
              </View>

              <Text style={styles.categoryText}>{brand.category || 'Retail Outlet'}</Text>

              {brand.contact_number && (
                <View style={styles.metaRow}>
                  <Ionicons name="call-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.metaText}>{brand.contact_number}</Text>
                </View>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isFollowed ? 'Unfollow brand' : 'Follow brand'}
                style={({ pressed }) => [
                  styles.followBtn,
                  isFollowed ? styles.followingBtn : styles.followBtnActive,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                ]}
                onPress={handleToggleFollow}>
                <Ionicons
                  name={isFollowed ? 'checkmark-sharp' : 'person-add'}
                  size={16}
                  color={isFollowed ? colors.primary : '#0D1117'}
                />
                <Text style={isFollowed ? styles.followingBtnText : styles.followBtnActiveText}>
                  {isFollowed ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.sectionHeader}>
              Active Sales & Promotions ({brandDeals.length})
            </Text>
          </View>
        }
        ListEmptyComponent={
          loadingDeals ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <EmptyState
              title="No Active Deals"
              description={`${brand.name} has no active promotions at the moment.`}
              icon="pricetag-outline"
            />
          )
        }
        renderItem={({ item }) => (
          <View style={{ marginBottom: spacing[3] }}>
            <DealCard
              title={item.title}
              brandName={brand.name}
              brandLogo={brand.logo_url}
              discountLabel={`${item.discount_pct}% OFF`}
              price={(item as any).price || (item as any).discount_price || null}
              originalPrice={(item as any).original_price || null}
              imageUri={item.image_urls?.[0]}
              expiresLabel={`Ends ${new Date(item.end_date).toLocaleDateString()}`}
              saved={savedDealIds.includes(item.id)}
              liked={likedDealIds.includes(item.id)}
              onToggleSave={() => handleToggleSaveDeal(item)}
              onToggleLike={() => handleToggleLikeDeal(item)}
              onPress={() => router.push(`/(consumer)/deal/${item.id}` as any)}
            />
          </View>
        )}
      />

      <AuthRequiredModal
        visible={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  list: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
  },
  headerWrap: {
    gap: spacing[4],
    marginVertical: spacing[4],
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[6],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[2],
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing[2],
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  brandTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  categoryText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  metaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  sectionHeader: {
    ...typography.label,
    color: colors.textPrimary,
    marginTop: spacing[2],
  },
  followBtn: {
    width: '100%',
    height: 46,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing[2],
  },
  followBtnActive: {
    backgroundColor: colors.primary,
    borderWidth: 0,
  },
  followBtnActiveText: {
    ...typography.button,
    color: '#0D1117',
    fontWeight: '700',
    fontSize: 15,
  },
  followingBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  followingBtnText: {
    ...typography.button,
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 15,
  },
});
