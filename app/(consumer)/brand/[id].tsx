import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { getLocalBrands } from '@/lib/brandStore';
import { getLocalBrandDeals } from '@/lib/dealStore';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { Brand, Deal } from '@/types/database.types';
import { colors, radii, spacing, typography } from '@/theme';

export default function BrandProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user, isGuest } = useAuth();

  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Fetch Brand Info & Follow Status
  const {
    data: brand,
    isLoading: loadingBrand,
    refetch: refetchBrand,
  } = useQuery<Brand & { is_followed?: boolean }>({
    queryKey: ['brand-profile', id, user?.id],
    queryFn: async () => {
      if (!id) throw new Error('Missing brand ID');

      let brandData: any = null;

      try {
        const { data, error } = await supabase
          .from('brands')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          brandData = data;
        }
      } catch (err) {
        console.warn('[BrandProfile] Supabase query notice:', err);
      }

      // Local store fallback
      if (!brandData) {
        const localBrands = await getLocalBrands();
        brandData = localBrands.find((b) => b.id === id);
      }

      if (!brandData) {
        throw new Error('Brand not found');
      }

      if (user?.id) {
        try {
          const { data: followData } = await supabase
            .from('follows')
            .select('user_id')
            .eq('user_id', user.id)
            .eq('brand_id', id)
            .maybeSingle();

          brandData.is_followed = Boolean(followData);
        } catch {}
      }

      return brandData;
    },
    enabled: Boolean(id),
  });

  // Fetch Active Deals for this Brand
  const { data: brandDeals = [], isLoading: loadingDeals } = useQuery<Deal[]>({
    queryKey: ['brand-active-deals', id],
    queryFn: async () => {
      if (!id) return [];
      let dealsList: Deal[] = [];

      try {
        const { data, error } = await supabase
          .from('deals')
          .select('*')
          .eq('brand_id', id)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (!error && data) {
          dealsList = data as Deal[];
        }
      } catch {}

      // Fallback & merge local deals
      const localDeals = await getLocalBrandDeals(id);
      const activeLocal = localDeals.filter((d) => d.status === 'active');
      const merged = [...dealsList];
      for (const ld of activeLocal) {
        if (!merged.some((m) => m.id === ld.id)) {
          merged.push(ld);
        }
      }

      return merged;
    },
    enabled: Boolean(id),
  });

  const handleToggleFollow = async () => {
    if (isGuest || !user?.id) {
      setAuthModalOpen(true);
      return;
    }

    if (!brand) return;

    try {
      if (brand.is_followed) {
        await supabase
          .from('follows')
          .delete()
          .eq('user_id', user.id)
          .eq('brand_id', brand.id);
        toast.show(`Unfollowed ${brand.name}`, 'info');
      } else {
        await (supabase.from('follows') as any).insert({
          user_id: user.id,
          brand_id: brand.id,
        });
        toast.show(`Now following ${brand.name}! Notifications enabled.`, 'success');
      }
      refetchBrand();
    } catch (err: any) {
      toast.show(err.message, 'error');
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

              <Button
                label={brand.is_followed ? 'Following' : '+ Follow Brand'}
                variant={brand.is_followed ? 'outline' : 'primary'}
                fullWidth
                onPress={handleToggleFollow}
                style={{ marginTop: spacing[2] }}
              />
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
              discountLabel={`${item.discount_pct}% OFF`}
              price={(item as any).price || (item as any).discount_price || null}
              originalPrice={(item as any).original_price || null}
              imageUri={item.image_urls?.[0]}
              expiresLabel={`Ends ${new Date(item.end_date).toLocaleDateString()}`}
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
});
