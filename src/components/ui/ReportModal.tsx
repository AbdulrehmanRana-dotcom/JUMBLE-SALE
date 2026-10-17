import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { interactionLogger } from '@/lib/interactionLogger';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radii, spacing, typography } from '@/theme';

export type ReportModalProps = {
  visible: boolean;
  dealId: string;
  onClose: () => void;
};

const REPORT_REASONS = [
  'Expired or Out of Stock Deal',
  'Misleading Price / Incorrect Discount %',
  'Invalid or Expired Promo Code',
  'Outlet Address / Location Incorrect',
  'Inappropriate Content or Spam',
];

export function ReportModal({ visible, dealId, onClose }: ReportModalProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [selectedReason, setSelectedReason] = useState<string>(REPORT_REASONS[0]);
  const [loading, setLoading] = useState(false);

  const handleSubmitReport = async () => {
    if (!dealId) return;
    setLoading(true);

    try {
      const { error } = await supabase.from('reports').insert({
        deal_id: dealId,
        reporter_id: user?.id || null,
        reason: selectedReason,
        status: 'pending',
      } as any);

      if (error) {
        toast.show(error.message, 'error');
      } else {
        interactionLogger.logInteraction(dealId, 'report', user?.id);
        toast.show('Thank you! Report submitted for admin review.', 'success');
        onClose();
      }
    } catch (err: any) {
      toast.show(err.message || 'Report submission failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Report Deal Issue">
      <View style={styles.container}>
        <Text style={styles.subtitle}>
          Help us keep Jumble Sale accurate. Select a reason for reporting this deal:
        </Text>

        <View style={styles.reasonList}>
          {REPORT_REASONS.map((reason) => {
            const selected = selectedReason === reason;
            return (
              <Pressable
                key={reason}
                style={[styles.reasonOption, selected && styles.reasonSelected]}
                onPress={() => setSelectedReason(reason)}>
                <View
                  style={[
                    styles.radioCircle,
                    selected && styles.radioCircleSelected,
                  ]}
                />
                <Text
                  style={[
                    styles.reasonText,
                    selected && styles.reasonTextSelected,
                  ]}>
                  {reason}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.btnRow}>
          <Button
            label="Cancel"
            variant="outline"
            onPress={onClose}
            style={{ flex: 1 }}
          />
          <Button
            label="Submit Report"
            variant="danger"
            loading={loading}
            onPress={handleSubmitReport}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[4],
    paddingVertical: spacing[2],
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  reasonList: {
    gap: spacing[2],
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[3],
  },
  reasonSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  radioCircleSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  reasonText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  reasonTextSelected: {
    color: colors.primaryDark,
    fontFamily: typography.bodyMedium.fontFamily,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
  },
});
