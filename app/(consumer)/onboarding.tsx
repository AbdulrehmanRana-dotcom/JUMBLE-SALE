import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { Category } from '@/types/database.types';
import { colors, radii, spacing, typography } from '@/theme';

export default function OnboardingCategoriesScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user, isGuest } = useAuth();

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Fetch available categories
  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Pre-load existing preferences if any
  useEffect(() => {
    async function loadCurrentPreferences() {
      if (!user) return;
      try {
        const { data } = await (supabase.from('user_preferences') as any)
          .select('favorite_categories')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data?.favorite_categories && Array.isArray(data.favorite_categories)) {
          setSelectedCategoryIds(data.favorite_categories);
        }
      } catch (err) {
        console.warn('Could not pre-load preferences:', err);
      }
    }
    loadCurrentPreferences();
  }, [user]);

  const toggleCategory = (categoryId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (user && !isGuest) {
        const { error } = await (supabase.from('user_preferences') as any)
          .upsert({
            user_id: user.id,
            favorite_categories: selectedCategoryIds,
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      // Invalidate queries so recommendations refresh immediately
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] });

      toast.show(
        selectedCategoryIds.length > 0
          ? 'Preferences updated! Your feed is personalized.'
          : 'Welcome to Jumble Sale!',
        'success'
      );

      router.replace('/(consumer)');
    } catch (err: any) {
      toast.show(err.message || 'Failed to save preferences', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <View style={styles.sparkleBadge}>
              <Ionicons name="sparkles" size={16} color={colors.primary} />
              <Text style={styles.sparkleBadgeText}>AI Deal Matching</Text>
            </View>
            <Pressable
              hitSlop={8}
              onPress={() => router.replace('/(consumer)')}>
              <Text style={styles.skipBtnText}>Skip for now</Text>
            </Pressable>
          </View>

          <Text style={styles.title}>What deals are you looking for?</Text>
          <Text style={styles.subtitle}>
            Select your favorite shopping categories so our hybrid AI recommender
            can curate active promotions tailored to you.
          </Text>
        </View>

        {/* Categories Grid */}
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading categories...</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
              {categories.map((cat) => {
                const isSelected = selectedCategoryIds.includes(cat.id);
                return (
                  <Pressable
                    key={cat.id}
                    style={[
                      styles.card,
                      isSelected && styles.cardSelected,
                    ]}
                    onPress={() => toggleCategory(cat.id)}>
                    <View
                      style={[
                        styles.iconWrap,
                        isSelected && styles.iconWrapSelected,
                      ]}>
                      <Ionicons
                        name={(cat.icon as any) || 'pricetag-outline'}
                        size={28}
                        color={isSelected ? colors.primary : colors.textPrimary}
                      />
                    </View>

                    <Text
                      style={[
                        styles.cardLabel,
                        isSelected && styles.cardLabelSelected,
                      ]}>
                      {cat.name}
                    </Text>

                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxSelected,
                      ]}>
                      {isSelected && (
                        <Ionicons
                          name="checkmark"
                          size={14}
                          color={colors.textInverse}
                        />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Footer Actions */}
        <View style={styles.footer}>
          <Text style={styles.selectionCount}>
            {selectedCategoryIds.length === 0
              ? 'Select at least 1 category for best AI results'
              : `${selectedCategoryIds.length} categories selected`}
          </Text>
          <Button
            label={saving ? 'Personalizing...' : 'Save & Continue'}
            onPress={handleSave}
            disabled={saving}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
  },
  sparkleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: spacing[1],
    borderRadius: radii.full,
  },
  sparkleBadgeText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  skipBtnText: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
  },
  title: {
    fontFamily: typography.h1.fontFamily,
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing[2],
  },
  subtitle: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[6],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
    justifyContent: 'space-between',
  },
  card: {
    width: '47.5%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing[4],
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    position: 'relative',
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  iconWrapSelected: {
    backgroundColor: colors.primaryLight,
  },

  cardLabel: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    minHeight: 34,
  },
  cardLabelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  checkbox: {
    position: 'absolute',
    top: spacing[2],
    right: spacing[2],
    width: 20,
    height: 20,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing[3],
    fontFamily: typography.caption.fontFamily,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing[4],
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selectionCount: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
});
