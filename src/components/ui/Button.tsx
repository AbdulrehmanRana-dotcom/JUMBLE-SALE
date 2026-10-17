import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';

import { colors, radii, spacing, typography } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = PressableProps & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: keyof typeof Ionicons.glyphMap;
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leftIcon,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        variantStyles[variant].container,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && variantStyles[variant].pressed,
        isDisabled && styles.disabled,
        style as ViewStyle,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator
          color={variantStyles[variant].spinnerColor}
          size="small"
        />
      ) : (
        <>
          {leftIcon ? (
            <Ionicons
              name={leftIcon}
              size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16}
              color={variantStyles[variant].label.color}
              style={{ marginRight: spacing[1] }}
            />
          ) : null}
          <Text style={[styles.label, variantStyles[variant].label]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...typography.button,
  },
});

const sizeStyles = StyleSheet.create({
  sm: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    minHeight: 36,
  },
  md: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 48,
  },
  lg: {
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[4],
    minHeight: 52,
  },
});

const variantStyles = {
  primary: {
    container: { backgroundColor: colors.primary },
    pressed: { backgroundColor: colors.primaryDark },
    label: { color: colors.textInverse, fontWeight: '700' as const },
    spinnerColor: colors.textInverse,
  },
  secondary: {
    container: { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border },
    pressed: { backgroundColor: '#151518' },
    label: { color: colors.textPrimary },
    spinnerColor: colors.textPrimary,
  },
  outline: {
    container: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pressed: { backgroundColor: colors.surface },
    label: { color: colors.textPrimary },
    spinnerColor: colors.primary,
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    pressed: { backgroundColor: colors.primaryLight },
    label: { color: colors.primary },
    spinnerColor: colors.primary,
  },
  danger: {
    container: { backgroundColor: colors.error },
    pressed: { backgroundColor: '#B91C1C' },
    label: { color: '#FFFFFF' },
    spinnerColor: '#FFFFFF',
  },
};

