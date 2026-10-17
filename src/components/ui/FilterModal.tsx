import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { colors, radii, spacing, typography } from '@/theme';

export type FilterState = {
  city: string | null;
  dealType: 'all' | 'online' | 'in_store';
  minDiscount: number;
  sortBy: 'newest' | 'discount_desc' | 'ending_soon';
};

export type FilterModalProps = {
  visible: boolean;
  onClose: () => void;
  filters: FilterState;
  onApply: (newFilters: FilterState) => void;
  onReset: () => void;
};

const PAKISTAN_CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar'];

export function FilterModal({
  visible,
  onClose,
  filters,
  onApply,
  onReset,
}: FilterModalProps) {
  const [prevFilters, setPrevFilters] = React.useState<FilterState>(filters);
  const [localFilters, setLocalFilters] = React.useState<FilterState>(filters);

  if (filters !== prevFilters) {
    setPrevFilters(filters);
    setLocalFilters(filters);
  }

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Filter & Sort Deals">
      <ScrollView contentContainerStyle={styles.container}>
        {/* Sort Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sort By</Text>
          <View style={styles.chipGrid}>
            {[
              { id: 'newest', label: 'Newest First', icon: 'time-outline' },
              { id: 'discount_desc', label: 'Biggest Discount', icon: 'trending-down-outline' },
              { id: 'ending_soon', label: 'Ending Soon', icon: 'hourglass-outline' },
            ].map((item) => (
              <Pressable
                key={item.id}
                style={[
                  styles.chip,
                  localFilters.sortBy === item.id && styles.chipActive,
                ]}
                onPress={() =>
                  setLocalFilters({ ...localFilters, sortBy: item.id as any })
                }>
                <Ionicons
                  name={item.icon as any}
                  size={16}
                  color={
                    localFilters.sortBy === item.id
                      ? colors.textInverse
                      : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.chipText,
                    localFilters.sortBy === item.id && styles.chipTextActive,
                  ]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* City Filter */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>City Location</Text>
          <View style={styles.chipGrid}>
            <Pressable
              style={[
                styles.chip,
                localFilters.city === null && styles.chipActive,
              ]}
              onPress={() => setLocalFilters({ ...localFilters, city: null })}>
              <Text
                style={[
                  styles.chipText,
                  localFilters.city === null && styles.chipTextActive,
                ]}>
                All Pakistan
              </Text>
            </Pressable>
            {PAKISTAN_CITIES.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.chip,
                  localFilters.city === c && styles.chipActive,
                ]}
                onPress={() => setLocalFilters({ ...localFilters, city: c })}>
                <Text
                  style={[
                    styles.chipText,
                    localFilters.city === c && styles.chipTextActive,
                  ]}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Deal Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Deal Type</Text>
          <View style={styles.chipGrid}>
            {[
              { id: 'all', label: 'All Deals' },
              { id: 'online', label: 'Online Only' },
              { id: 'in_store', label: 'In-Store Outlets' },
            ].map((item) => (
              <Pressable
                key={item.id}
                style={[
                  styles.chip,
                  localFilters.dealType === item.id && styles.chipActive,
                ]}
                onPress={() =>
                  setLocalFilters({ ...localFilters, dealType: item.id as any })
                }>
                <Text
                  style={[
                    styles.chipText,
                    localFilters.dealType === item.id && styles.chipTextActive,
                  ]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Minimum Discount % */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Minimum Discount</Text>
          <View style={styles.chipGrid}>
            {[0, 20, 30, 50].map((pct) => (
              <Pressable
                key={pct}
                style={[
                  styles.chip,
                  localFilters.minDiscount === pct && styles.chipActive,
                ]}
                onPress={() =>
                  setLocalFilters({ ...localFilters, minDiscount: pct })
                }>
                <Text
                  style={[
                    styles.chipText,
                    localFilters.minDiscount === pct && styles.chipTextActive,
                  ]}>
                  {pct === 0 ? 'Any Discount' : `${pct}%+ OFF`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <Button
            label="Reset Filters"
            variant="outline"
            onPress={handleReset}
            style={{ flex: 1 }}
          />
          <Button
            label="Apply Filters"
            variant="primary"
            onPress={handleApply}
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[4],
    paddingVertical: spacing[2],
  },
  section: {
    gap: spacing[2],
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textPrimary,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverse,
    fontFamily: typography.bodyMedium.fontFamily,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
});
