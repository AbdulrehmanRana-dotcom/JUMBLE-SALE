import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { colors, radii, spacing, typography } from '@/theme';

export type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
};

export function Input({
  label,
  error,
  hint,
  leftIcon,
  style,
  editable = true,
  ...rest
}: InputProps) {
  const hasError = Boolean(error);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          hasError && styles.fieldError,
          !editable && styles.fieldDisabled,
        ]}>
        {leftIcon ? (
          <Ionicons
            name={leftIcon}
            size={20}
            color={colors.textMuted}
            style={styles.leftIcon}
          />
        ) : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          editable={editable}
          {...rest}
        />
      </View>
      {hasError ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Optional slot for custom leading content (e.g. country code). */
export function InputAffix({ children }: { children: ReactNode }) {
  return <View style={styles.affix}>{children}</View>;
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing[1],
  },
  label: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing[3],
    minHeight: 50,
  },
  fieldError: {
    borderColor: colors.error,
  },
  fieldDisabled: {
    backgroundColor: colors.surface,
    opacity: 0.6,
  },
  leftIcon: {
    marginRight: spacing[2],
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing[3],
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginTop: 2,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  affix: {
    marginRight: spacing[2],
  },
});

