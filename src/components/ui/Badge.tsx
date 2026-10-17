import { StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, radii, spacing, typography } from '@/theme';

export type BadgeVariant =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'error'
  | 'deal'
  | 'info'
  | 'outline';

export type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
};

const variantMap: Record<
  BadgeVariant,
  { bg: string; text: string; border?: string }
> = {
  neutral: { bg: colors.surfaceMuted, text: colors.textSecondary },
  primary: { bg: colors.primaryLight, text: colors.primary },
  success: { bg: colors.successBg, text: colors.success },
  warning: { bg: colors.warningBg, text: colors.warning },
  error: { bg: colors.errorBg, text: colors.error },
  deal: { bg: colors.dealBg, text: colors.deal },
  info: { bg: colors.infoBg, text: colors.info },
  outline: { bg: 'transparent', text: colors.textSecondary, border: colors.border },
};


export function Badge({ label, variant = 'neutral', style }: BadgeProps) {
  const palette = variantMap[variant];

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: palette.border ? 1 : 0,
        },
        style,
      ]}>
      <Text style={[styles.text, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radii.sm,
  },
  text: {
    ...typography.chip,
    fontSize: 11,
  },
});
