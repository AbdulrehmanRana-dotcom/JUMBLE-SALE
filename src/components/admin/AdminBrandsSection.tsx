import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import type { AdminBrandItem } from '@/lib/adminAnalytics';
import type { Brand } from '@/types/database.types';
import { radii, spacing, typography } from '@/theme';

const adminTheme = {
  bgApp: '#090A0D',
  bgCard: '#13151C',
  bgCardHover: '#181B24',
  bgInput: '#151821',
  border: '#1F2330',
  neon: '#00FF66',
  neonLight: 'rgba(0, 255, 102, 0.12)',
  textPrimary: '#FFFFFF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  warning: '#F59E0B',
  error: '#EF4444',
};

interface AdminBrandsSectionProps {
  brands: AdminBrandItem[];
  loading: boolean;
  onRefresh: () => void;
  onSelectBrand: (brand: AdminBrandItem) => void;
  onToggleBrandSuspension: (brand: Brand) => void;
  onDeleteBrand: (brand: Brand) => void;
}

export function AdminBrandsSection({
  brands,
  loading,
  onRefresh,
  onSelectBrand,
  onToggleBrandSuspension,
  onDeleteBrand,
}: AdminBrandsSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'suspended'>('all');

  const filteredBrands = useMemo(() => {
    return brands.filter((b) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        b.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.business_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.category?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' ? true : b.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [brands, searchQuery, statusFilter]);

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={styles.headerControls}>
        <Input
          placeholder="Search registered brands by name, category, email..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon="search-outline"
        />

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {(['all', 'active', 'pending', 'suspended'] as const).map((filter) => (
            <Pressable
              key={filter}
              style={[
                styles.filterPill,
                statusFilter === filter && styles.filterPillActive,
              ]}
              onPress={() => setStatusFilter(filter)}>
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === filter && styles.filterPillTextActive,
                ]}>
                {filter.toUpperCase()} ({brands.filter((b) => filter === 'all' || b.status === filter).length})
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Brands List */}
      <FlatList
        data={filteredBrands}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={onRefresh}
            tintColor={adminTheme.neon}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="No Brands Found"
            description="No registered brands match your search or filter."
            icon="business-outline"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.brandCard}>
            <View style={styles.brandCardTop}>
              <View style={styles.brandLogoWrap}>
                {item.logo_url ? (
                  <Image source={{ uri: item.logo_url }} style={styles.brandLogoImg} />
                ) : (
                  <Ionicons name="business" size={24} color={adminTheme.neon} />
                )}
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.brandName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Badge
                    label={item.status.toUpperCase()}
                    variant={
                      item.status === 'active'
                        ? 'success'
                        : item.status === 'pending'
                        ? 'warning'
                        : 'error'
                    }
                  />
                </View>
                <Text style={styles.brandEmail}>{item.business_email}</Text>
                {item.category && (
                  <Text style={styles.brandCategory}>Category: {item.category}</Text>
                )}
              </View>
            </View>

            {/* Quick Metrics Bar */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiChip}>
                <Ionicons name="pricetags-outline" size={13} color={adminTheme.neon} />
                <Text style={styles.kpiChipText}>{item.deals_count} Posts</Text>
              </View>
              <View style={styles.kpiChip}>
                <Ionicons name="people-outline" size={13} color="#3B82F6" />
                <Text style={styles.kpiChipText}>{item.followers_count} Followers</Text>
              </View>
              {item.contact_number && (
                <View style={styles.kpiChip}>
                  <Ionicons name="call-outline" size={13} color={adminTheme.textMuted} />
                  <Text style={styles.kpiChipText}>{item.contact_number}</Text>
                </View>
              )}
            </View>

            {/* Action Row */}
            <View style={styles.actionRow}>
              <Button
                label="Inspect Brand & Posts 🔍"
                variant="primary"
                size="sm"
                onPress={() => onSelectBrand(item)}
                style={{ flex: 1.5 }}
              />
              <Button
                label={item.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                variant="outline"
                size="sm"
                onPress={() => onToggleBrandSuspension(item)}
                style={{ flex: 1 }}
              />
              <Button
                label="Remove"
                variant="ghost"
                size="sm"
                onPress={() => onDeleteBrand(item)}
                style={{ flex: 0.6 }}
              />
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.bgApp,
  },
  headerControls: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    gap: spacing[2],
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: adminTheme.bgCard,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  filterPillActive: {
    backgroundColor: adminTheme.neonLight,
    borderColor: adminTheme.neon,
  },
  filterPillText: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: adminTheme.neon,
    fontWeight: 'bold',
  },
  listContent: {
    padding: spacing[4],
    gap: spacing[3],
    paddingBottom: spacing[10],
  },
  brandCard: {
    backgroundColor: adminTheme.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: adminTheme.border,
    padding: spacing[4],
    gap: spacing[3],
  },
  brandCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  brandLogoWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: adminTheme.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  brandLogoImg: {
    width: '100%',
    height: '100%',
  },
  brandName: {
    ...typography.bodyMedium,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 16,
  },
  brandEmail: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    marginTop: 2,
  },
  brandCategory: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  kpiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: adminTheme.bgInput,
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  kpiChipText: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderTopWidth: 1,
    borderTopColor: adminTheme.border,
    paddingTop: spacing[3],
  },
});
