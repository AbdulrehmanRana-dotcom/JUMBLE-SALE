import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radii, spacing, typography } from '@/theme';

export default function SuspendedAccountScreen() {
  const { profile, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="ban-outline" size={54} color={colors.error} />
          </View>

          <Text style={styles.title}>Account Suspended</Text>
          
          <Text style={styles.description}>
            Your Jumble Sale account ({profile?.email}) has been suspended by system administration due to a terms or policy violation.
            {'\n\n'}
            If you believe this is a mistake, please contact our support team at <Text style={styles.supportEmail}>support@jumblesale.pk</Text>.
          </Text>

          <View style={styles.statusBox}>
            <Text style={styles.statusLabel}>Account Status: </Text>
            <Text style={styles.statusValue}>Suspended (is_active = false)</Text>
          </View>

          <Button
            label="Sign Out"
            variant="danger"
            fullWidth
            onPress={signOut}
            style={styles.btn}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing[6],
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[6],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[3],
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  title: {
    ...typography.h2,
    color: colors.error,
    textAlign: 'center',
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  supportEmail: {
    fontFamily: typography.bodyMedium.fontFamily,
    color: colors.primary,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorBg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radii.md,
    marginVertical: spacing[2],
  },
  statusLabel: {
    ...typography.bodyMedium,
    color: colors.error,
  },
  statusValue: {
    ...typography.bodyMedium,
    color: colors.error,
  },
  btn: {
    marginTop: spacing[2],
  },
});
