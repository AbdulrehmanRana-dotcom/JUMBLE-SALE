import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useToast } from '@/components/ui/Toast';
import { recordAttributedPurchase, type AttributedOrder } from '@/lib/orderStore';
import { colors, radii, spacing, typography } from '@/theme';

export interface PurchaseClaimModalProps {
  visible: boolean;
  dealId: string;
  dealTitle: string;
  brandId: string;
  brandName: string;
  brandLogo?: string | null;
  userId?: string | null;
  userName?: string | null;
  estimatedPrice?: number | null;
  onClose: () => void;
  onSuccess: (order: AttributedOrder) => void;
}

export function PurchaseClaimModal({
  visible,
  dealId,
  dealTitle,
  brandId,
  brandName,
  brandLogo,
  userId,
  userName,
  estimatedPrice,
  onClose,
  onSuccess,
}: PurchaseClaimModalProps) {
  const toast = useToast();
  const [orderRef, setOrderRef] = useState('');
  const [amountStr, setAmountStr] = useState(estimatedPrice ? String(estimatedPrice) : '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const cleanAmount = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;

    setSubmitting(true);
    try {
      const order = await recordAttributedPurchase({
        user_id: userId || 'guest',
        user_name: userName || 'Shopper',
        deal_id: dealId,
        deal_title: dealTitle,
        brand_id: brandId,
        brand_name: brandName,
        brand_logo: brandLogo,
        order_reference: orderRef.trim() || undefined,
        order_amount: cleanAmount,
        currency: 'PKR',
        status: 'confirmed',
        attribution_method: 'in_app_webview',
      });

      toast.show('🎉 Congratulations! Shopping record saved to your history!', 'success');
      onSuccess(order);
      onClose();
    } catch (err: any) {
      toast.show(err.message || 'Could not save shopping record', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="bag-check" size={22} color="#00FF66" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Claim Shopping Record</Text>
                <Text style={styles.headerSub}>Saved to your account & verified</Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Deal & Brand Capsule */}
            <View style={styles.dealBadgeCard}>
              <View style={styles.brandPill}>
                <Ionicons name="business" size={13} color="#00FF66" />
                <Text style={styles.brandPillText}>{brandName}</Text>
              </View>
              <Text style={styles.dealTitleText} numberOfLines={2}>
                {dealTitle}
              </Text>
              <View style={styles.verificationNoteRow}>
                <Ionicons name="checkmark-circle" size={15} color="#00FF66" />
                <Text style={styles.verificationNoteText}>
                  Attributed via Jumble Sale Outbound Deal
                </Text>
              </View>
            </View>

            {/* Order / Invoice Number Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Order or Invoice Number <Text style={styles.optionalTag}>(Optional)</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. ORD-98124 or INV-104"
                placeholderTextColor="#64748B"
                value={orderRef}
                onChangeText={setOrderRef}
                autoCapitalize="characters"
              />
              <Text style={styles.helperText}>
                Website ki confirmation screen ya email se order # likhein.
              </Text>
            </View>

            {/* Amount Spent Field */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Total Amount Spent (PKR)</Text>
              <View style={styles.amountInputRow}>
                <View style={styles.currencyPrefix}>
                  <Text style={styles.currencyPrefixText}>Rs.</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.amountInput]}
                  placeholder="e.g. 4500"
                  placeholderTextColor="#64748B"
                  value={amountStr}
                  onChangeText={setAmountStr}
                  keyboardType="numeric"
                />
              </View>
              <Text style={styles.helperText}>
                Brand website par jo final amount pay ki woh likhein.
              </Text>
            </View>
          </ScrollView>

          {/* Bottom Actions */}
          <View style={styles.footer}>
            <Pressable
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#090A0E" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={19} color="#090A0E" />
                  <Text style={styles.submitBtnText}>Save to My Shopping History</Text>
                </>
              )}
            </Pressable>

            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelBtnText}>I haven't bought yet / Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#141721',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#202432',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#202432',
    backgroundColor: '#0F121C',
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSub: {
    ...typography.caption,
    color: '#94A3B8',
    fontSize: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E2333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 20,
  },
  dealBadgeCard: {
    backgroundColor: '#1A1E2E',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.2)',
    marginBottom: 20,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  brandPillText: {
    ...typography.caption,
    fontWeight: '700',
    color: '#00FF66',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dealTitleText: {
    ...typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  verificationNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#252B3E',
  },
  verificationNoteText: {
    ...typography.caption,
    color: '#94A3B8',
    fontSize: 11,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  fieldLabel: {
    ...typography.body,
    fontSize: 13,
    fontWeight: '600',
    color: '#E2E8F0',
    marginBottom: 8,
  },
  optionalTag: {
    color: '#64748B',
    fontWeight: '400',
  },
  input: {
    backgroundColor: '#090A0E',
    borderWidth: 1,
    borderColor: '#2D344B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    backgroundColor: '#1E2333',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderWidth: 1,
    borderColor: '#2D344B',
    borderRightWidth: 0,
  },
  currencyPrefixText: {
    color: '#00FF66',
    fontWeight: '700',
    fontSize: 14,
  },
  amountInput: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  helperText: {
    ...typography.caption,
    color: '#64748B',
    fontSize: 11,
    marginTop: 5,
  },
  footer: {
    padding: 16,
    backgroundColor: '#0F121C',
    borderTopWidth: 1,
    borderTopColor: '#202432',
    gap: 10,
  },
  submitBtn: {
    backgroundColor: '#00FF66',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#090A0E',
    fontWeight: '700',
    fontSize: 15,
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontSize: 13,
  },
});
