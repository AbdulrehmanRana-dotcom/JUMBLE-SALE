import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radii, spacing, typography } from '@/theme';

export default function BrandRejectedScreen() {
  const { brand, signOut, refreshProfile } = useAuth();

  const handleContactSupport = () => {
    Linking.openURL(
      `mailto:support@jumblesale.pk?subject=Brand%20Verification%20Appeal%20-%20${encodeURIComponent(
        brand?.name || 'Partner'
      )}`
    );
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
            <Ionicons name="close-circle" size={48} color={colors.error} />
          </View>

          <Text style={styles.title}>Application Not Approved</Text>
          <Text style={styles.subtitle}>
            Your brand application for{' '}
            <Text style={styles.brandHighlight}>
              {brand?.name || 'your company'}
            </Text>{' '}
            was reviewed by our compliance team and could not be approved at this
            time.
          </Text>

          {/* Rejection Reason Card */}
          <View style={styles.reasonCard}>
            <View style={styles.reasonHeader}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={colors.error}
              />
              <Text style={styles.reasonLabel}>Reason for Rejection</Text>
            </View>
            <Text style={styles.reasonText}>
              {brand?.rejection_reason ||
                'The submitted business verification documents did not meet authenticity or eligibility criteria. Please review our partner guidelines.'}
            </Text>
          </View>

          {/* Submitted Information Summary */}
          <View style={styles.detailsBox}>
            <Text style={styles.detailsHeading}>Submitted Application Details</Text>
            <View style={styles.divider} />
            <DetailItem label="Company Name" value={brand?.name ?? '—'} />
            <DetailItem
              label="Business Email"
              value={brand?.business_email ?? '—'}
            />
            <DetailItem
              label="Contact Number"
              value={brand?.contact_number ?? '—'}
            />
            <DetailItem label="Category" value={brand?.category ?? '—'} />
            <DetailItem
              label="Documents"
              value={
                brand?.verification_doc_urls &&
                brand.verification_doc_urls.length > 0
                  ? `${brand.verification_doc_urls.length} document(s) submitted`
                  : 'No documents attached'
              }
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.actionColumn}>
            <Button
              label="Contact Support & Appeal"
              variant="primary"
              fullWidth
              onPress={handleContactSupport}
              leftIcon="mail-outline"
            />
            <Button
              label="Check Status Again"
              variant="outline"
              fullWidth
              onPress={refreshProfile}
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

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={detailStyles.value} numberOfLines={1}>
        {value}
      </Text>
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
    backgroundColor: colors.errorBg,
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
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  brandHighlight: {
    ...typography.bodyMedium,
    color: colors.error,
  },
  reasonCard: {
    width: '100%',
    backgroundColor: colors.errorBg,
    borderRadius: radii.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.error + '30',
    gap: spacing[2],
  },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  reasonLabel: {
    ...typography.bodyMedium,
    color: colors.error,
  },
  reasonText: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  detailsBox: {
    width: '100%',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[2],
  },
  detailsHeading: {
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

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  value: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontSize: 13,
    maxWidth: '60%',
    textAlign: 'right',
  },
});
