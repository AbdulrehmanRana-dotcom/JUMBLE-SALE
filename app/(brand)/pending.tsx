import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radii, spacing, typography } from '@/theme';

export default function BrandPendingScreen() {
  const { brand, signOut, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);

  const handleRefresh = async () => {
    setChecking(true);
    try {
      await refreshProfile();
    } finally {
      setChecking(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Application Status"
        rightAction={
          <Button
            label="Sign Out"
            variant="ghost"
            size="sm"
            onPress={signOut}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {/* Status Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="time" size={48} color={colors.warning} />
          </View>

          <Badge label="Pending Admin Review" variant="warning" />

          <Text style={styles.title}>Registration Under Review</Text>
          <Text style={styles.subtitle}>
            Thank you for registering{' '}
            <Text style={styles.brandHighlight}>
              {brand?.name || 'your brand'}
            </Text>{' '}
            with Jumble Sale Pakistan.
          </Text>

          <Text style={styles.description}>
            Our team reviews every brand partner application to ensure authenticity
            for Pakistani shoppers. Verification typically takes 24–48 hours. Once
            approved, your deal posting portal and AI tools will be instantly activated.
          </Text>

          {/* Verification Checklist */}
          <View style={styles.checklistCard}>
            <Text style={styles.checklistHeading}>Verification Checklist</Text>
            <View style={styles.divider} />

            <CheckItem
              label="Account & Credentials Created"
              completed
              detail={brand?.business_email ?? 'Email registered'}
            />
            <CheckItem
              label="Business Details Submitted"
              completed
              detail={`Category: ${brand?.category || 'Retail'}`}
            />
            <CheckItem
              label="Verification Document Uploaded"
              completed={Boolean(
                brand?.verification_doc_urls &&
                  brand.verification_doc_urls.length > 0
              )}
              detail={
                brand?.verification_doc_urls &&
                brand.verification_doc_urls.length > 0
                  ? 'Private document attached for review'
                  : 'Document pending'
              }
            />
            <CheckItem
              label="Admin Compliance Approval"
              completed={false}
              detail="In progress by Jumble Sale team"
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.actionColumn}>
            <Button
              label={checking ? 'Checking Status...' : 'Refresh Status'}
              variant="primary"
              fullWidth
              loading={checking}
              onPress={handleRefresh}
              leftIcon="refresh-outline"
            />
            <Button
              label="Sign Out"
              variant="ghost"
              fullWidth
              onPress={signOut}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CheckItem({
  label,
  completed,
  detail,
}: {
  label: string;
  completed: boolean;
  detail: string;
}) {
  return (
    <View style={checkStyles.row}>
      <View
        style={[
          checkStyles.iconBox,
          completed ? checkStyles.iconBoxComplete : checkStyles.iconBoxPending,
        ]}>
        {completed ? (
          <Ionicons name="checkmark" size={14} color={colors.success} />
        ) : (
          <ActivityIndicator size="small" color={colors.warning} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={checkStyles.label}>{label}</Text>
        <Text style={checkStyles.detail}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing[4],
    paddingBottom: spacing[8],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing[6],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[4],
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  brandHighlight: {
    color: colors.primary,
    fontFamily: typography.h3.fontFamily,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  checklistCard: {
    width: '100%',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[3],
  },
  checklistHeading: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing[1],
  },
  actionColumn: {
    width: '100%',
    gap: spacing[3],
    marginTop: spacing[2],
  },
});

const checkStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  iconBoxComplete: {
    backgroundColor: colors.successBg,
  },
  iconBoxPending: {
    backgroundColor: colors.warningBg,
  },
  label: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontSize: 13,
  },
  detail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
