import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/theme';

export type BrandChipProps = {
  name: string;
  logoUri?: string | null;
  selected?: boolean;
  onPress?: () => void;
};

export function BrandChip({
  name,
  logoUri,
  selected = false,
  onPress,
}: BrandChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}>
      <View style={styles.logoWrap}>
        {logoUri ? (
          <Image source={{ uri: logoUri }} style={styles.logo} />
        ) : (
          <Ionicons name="storefront-outline" size={16} color={colors.primary} />
        )}
      </View>
      <Text
        style={[styles.label, selected && styles.labelSelected]}
        numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 160,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  pressed: {
    opacity: 0.85,
  },
  logoWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: 28,
    height: 28,
  },
  label: {
    ...typography.chip,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  labelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
});

