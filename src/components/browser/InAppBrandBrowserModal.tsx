import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { PurchaseClaimModal } from '@/components/browser/PurchaseClaimModal';
import { useToast } from '@/components/ui/Toast';
import type { AttributedOrder } from '@/lib/orderStore';
import { colors, radii, spacing, typography } from '@/theme';

export interface InAppBrandBrowserModalProps {
  visible: boolean;
  url: string;
  dealId: string;
  dealTitle: string;
  brandId: string;
  brandName: string;
  brandLogo?: string | null;
  userId?: string | null;
  userName?: string | null;
  estimatedPrice?: number | null;
  onClose: () => void;
  onOrderClaimed?: (order: AttributedOrder) => void;
}

export function InAppBrandBrowserModal({
  visible,
  url,
  dealId,
  dealTitle,
  brandId,
  brandName,
  brandLogo,
  userId,
  userName,
  estimatedPrice,
  onClose,
  onOrderClaimed,
}: InAppBrandBrowserModalProps) {
  const toast = useToast();
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [hasOpenedTab, setHasOpenedTab] = useState(false);

  // Automatically open the brand link when modal opens
  useEffect(() => {
    if (visible && url && !hasOpenedTab) {
      setHasOpenedTab(true);
      Linking.openURL(url).catch(() => {
        toast.show('Could not open store link', 'error');
      });
    }
    if (!visible) {
      setHasOpenedTab(false);
    }
  }, [visible, url]);

  const handleReopenWebsite = () => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  const handleOrderSuccess = (order: AttributedOrder) => {
    setClaimModalOpen(false);
    onOrderClaimed?.(order);
    onClose();
  };

  if (!visible) return null;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}>
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.container}>
            {/* Top Companion Header */}
            <View style={styles.topHeader}>
              <View style={styles.brandInfoWrap}>
                <View style={styles.brandIconCircle}>
                  <Ionicons name="business" size={16} color="#00FF66" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.brandNameText} numberOfLines={1}>
                      {brandName}
                    </Text>
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="shield-checkmark" size={11} color="#00FF66" />
                      <Text style={styles.verifiedBadgeText}>Verified Partner</Text>
                    </View>
                  </View>
                  <Text style={styles.dealNameText} numberOfLines={1}>
                    {dealTitle}
                  </Text>
                </View>
              </View>

              <Pressable
                style={styles.closeHeaderBtn}
                onPress={onClose}
                hitSlop={8}>
                <Ionicons name="close" size={20} color="#94A3B8" />
              </Pressable>
            </View>

            {/* Central Guidance Card */}
            <View style={styles.companionCard}>
              <View style={styles.companionIllustrationBox}>
                <Ionicons name="cart-outline" size={48} color="#00FF66" />
              </View>

              <Text style={styles.companionTitle}>
                Brand Website Open Ho Gayi Hai
              </Text>
              <Text style={styles.companionDesc}>
                Aap browser tab me <Text style={{ color: '#00FF66', fontWeight: '700' }}>{brandName}</Text> ki official site par shopping complete karein. Jab aap checkout kar lein, toh neeche button daba kar apna shopping record save karein!
              </Text>

              {/* Direct Re-open Link Pill */}
              <Pressable
                style={styles.reopenLinkBtn}
                onPress={handleReopenWebsite}>
                <Ionicons name="open-outline" size={16} color="#94A3B8" />
                <Text style={styles.reopenLinkText} numberOfLines={1}>
                  {url}
                </Text>
              </Pressable>
            </View>

            {/* Sticky Bottom Action Dock */}
            <View style={styles.bottomDock}>
              {/* Primary Claim Purchase Button */}
              <Pressable
                style={styles.claimBtn}
                onPress={() => setClaimModalOpen(true)}>
                <View style={styles.claimBtnIconBox}>
                  <Ionicons name="bag-check" size={20} color="#090A0E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.claimBtnMainText}>
                    I Completed the Purchase
                  </Text>
                  <Text style={styles.claimBtnSubText}>
                    Shopping Kar Li? Tap to record in history
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color="#090A0E" />
              </Pressable>

              {/* Secondary Close Button */}
              <Pressable style={styles.cancelDockBtn} onPress={onClose}>
                <Text style={styles.cancelDockText}>Close / Return to App</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Claim Purchase Modal */}
      <PurchaseClaimModal
        visible={claimModalOpen}
        dealId={dealId}
        dealTitle={dealTitle}
        brandId={brandId}
        brandName={brandName}
        brandLogo={brandLogo}
        userId={userId}
        userName={userName}
        estimatedPrice={estimatedPrice}
        onClose={() => setClaimModalOpen(false)}
        onSuccess={handleOrderSuccess}
      />
    </>
  );
}

const styles = StyleSheet.create({
  modalSafeArea: {
    flex: 1,
    backgroundColor: 'rgba(9, 10, 14, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#141721',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#202432',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#0F121C',
    borderBottomWidth: 1,
    borderBottomColor: '#202432',
  },
  brandInfoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  brandIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandNameText: {
    ...typography.body,
    fontWeight: '700',
    color: '#FFFFFF',
    fontSize: 14,
  },
  dealNameText: {
    ...typography.caption,
    color: '#94A3B8',
    fontSize: 12,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verifiedBadgeText: {
    color: '#00FF66',
    fontSize: 10,
    fontWeight: '600',
  },
  closeHeaderBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E2333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  companionCard: {
    padding: 24,
    alignItems: 'center',
  },
  companionIllustrationBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 255, 102, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.25)',
  },
  companionTitle: {
    ...typography.h3,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  companionDesc: {
    ...typography.body,
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  reopenLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#090A0E',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#202432',
    maxWidth: '100%',
  },
  reopenLinkText: {
    color: '#64748B',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  bottomDock: {
    padding: 16,
    backgroundColor: '#0F121C',
    borderTopWidth: 1,
    borderTopColor: '#202432',
    gap: 10,
  },
  claimBtn: {
    backgroundColor: '#00FF66',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  claimBtnIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(9, 10, 14, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimBtnMainText: {
    color: '#090A0E',
    fontWeight: '800',
    fontSize: 14,
  },
  claimBtnSubText: {
    color: '#090A0E',
    fontSize: 11,
    opacity: 0.85,
    marginTop: 1,
  },
  cancelDockBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelDockText: {
    color: '#94A3B8',
    fontSize: 13,
  },
});
