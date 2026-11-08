import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useToast } from '@/components/ui/Toast';
import { recordDealShare } from '@/lib/activityStore';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radii, spacing, typography } from '@/theme';

export interface ShareDealData {
  id: string;
  title: string;
  discount_pct?: number;
  promo_code?: string | null;
  brand_name?: string;
  brand_logo?: string | null;
  image_url?: string | null;
  price?: number | string | null;
  original_price?: number | string | null;
  brand_id?: string;
}

export interface ShareDealModalProps {
  visible: boolean;
  onClose: () => void;
  deal: ShareDealData | null;
}

export function ShareDealModal({ visible, onClose, deal }: ShareDealModalProps) {
  const toast = useToast();
  const { user } = useAuth();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!deal) return null;

  const brandName = deal.brand_name || 'Brand Partner';
  const discountLabel = deal.discount_pct ? `${deal.discount_pct}% OFF` : 'Special Discount';

  // Construct canonical share URL
  const baseUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://jumblesale.app';

  const getShareUrl = (channel: string) => {
    return `${baseUrl}/(consumer)/deal/${deal.id}?utm_source=${channel}&utm_medium=social_share`;
  };

  const getShareMessage = (channel: string) => {
    const url = getShareUrl(channel);
    const codePart = deal.promo_code ? `\n🎟️ Promo Code: *${deal.promo_code}*` : '';
    return `🔥 *${deal.title}* on ${brandName}!\n💰 Offer: ${discountLabel}${codePart}\n\nCheck out this deal on Jumble Sale:\n👉 ${url}`;
  };

  const logShare = (channel: string) => {
    const effectiveUserId = user?.id || 'guest';
    const userName = user?.email ? user.email.split('@')[0] : 'Shopper';
    recordDealShare(deal.id, effectiveUserId, userName, deal.title, deal.brand_id, channel).catch(
      () => {}
    );
  };

  // 1. WhatsApp Share
  const handleWhatsApp = async () => {
    logShare('WhatsApp');
    const message = getShareMessage('whatsapp');
    const appUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    const webUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.open(webUrl, '_blank');
        } else {
          await Linking.openURL(webUrl);
        }
      } else {
        const canOpen = await Linking.canOpenURL(appUrl).catch(() => false);
        if (canOpen) {
          await Linking.openURL(appUrl);
        } else {
          await Linking.openURL(webUrl);
        }
      }
      toast.show('Opening WhatsApp... 💬', 'success');
      onClose();
    } catch {
      toast.show('Could not open WhatsApp', 'error');
    }
  };

  // 2. Copy Link
  const handleCopyLink = async () => {
    logShare('Copy Link');
    const url = getShareUrl('copy_link');

    try {
      if (Clipboard.setStringAsync) {
        await Clipboard.setStringAsync(url);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      setCopiedLink(true);
      toast.show('Deal link copied to clipboard! 🔗', 'success');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      toast.show('Failed to copy link', 'error');
    }
  };

  // 3. Copy Promo Code
  const handleCopyCode = async () => {
    if (!deal.promo_code) return;
    try {
      if (Clipboard.setStringAsync) {
        await Clipboard.setStringAsync(deal.promo_code);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(deal.promo_code);
      }
      setCopiedCode(true);
      toast.show(`Promo code "${deal.promo_code}" copied! 🎟️`, 'success');
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      toast.show('Could not copy code', 'error');
    }
  };

  // 4. SMS / Direct Text
  const handleSMS = async () => {
    logShare('SMS');
    const text = `Check out this deal on Jumble Sale: ${deal.title} (${discountLabel}) on ${brandName}! ${
      deal.promo_code ? `Code: ${deal.promo_code}. ` : ''
    }${getShareUrl('sms')}`;

    const smsUrl = `sms:?body=${encodeURIComponent(text)}`;
    try {
      await Linking.openURL(smsUrl);
      toast.show('Opening Messages... 💬', 'info');
      onClose();
    } catch {
      // Fallback to copying
      await handleCopyLink();
    }
  };

  // 5. Email
  const handleEmail = async () => {
    logShare('Email');
    const subject = `🔥 ${discountLabel}: ${deal.title} on ${brandName}`;
    const body = `Hi,\n\nI found this great offer on Jumble Sale and thought you might like it:\n\nDeal: ${deal.title}\nBrand: ${brandName}\nDiscount: ${discountLabel}${
      deal.promo_code ? `\nPromo Code: ${deal.promo_code}` : ''
    }\n\nView Deal Details:\n${getShareUrl('email')}\n\nEnjoy the savings!`;

    const mailUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(mailUrl);
      toast.show('Opening Email composer... ✉️', 'info');
      onClose();
    } catch {
      await handleCopyLink();
    }
  };

  // 6. More Options (System Share)
  const handleMoreOptions = async () => {
    logShare('System Share');
    const shareUrl = getShareUrl('system_share');
    const shareText = `Check out ${deal.title} (${discountLabel}) on ${brandName}!`;

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: deal.title,
          text: shareText,
          url: shareUrl,
        });
        toast.show('Shared successfully! 🚀', 'success');
        onClose();
        return;
      }

      await Share.share({
        title: deal.title,
        message: `${shareText}\n${shareUrl}`,
      });
      toast.show('Shared successfully! 🚀', 'success');
      onClose();
    } catch (err: any) {
      if (err?.message?.includes('AbortError')) return;
      await handleCopyLink();
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheetContainer}>
          {/* Pull Drag Indicator */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.shareBadge}>
                <Ionicons name="share-social" size={16} color="#00FF66" />
              </View>
              <Text style={styles.headerTitle}>Share Deal</Text>
            </View>
            <Pressable
              hitSlop={12}
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close share sheet">
              <Ionicons name="close" size={20} color="#94A3B8" />
            </Pressable>
          </View>

          {/* Deal Summary Snippet */}
          <View style={styles.dealPreviewCard}>
            <View style={styles.dealImageWrap}>
              {deal.image_url ? (
                <Image source={{ uri: deal.image_url }} style={styles.dealThumb} />
              ) : (
                <View style={styles.dealPlaceholder}>
                  <Ionicons name="pricetag" size={22} color="#00FF66" />
                </View>
              )}
            </View>

            <View style={styles.dealDetailsWrap}>
              <Text style={styles.brandNameText} numberOfLines={1}>
                {brandName}
              </Text>
              <Text style={styles.dealTitleText} numberOfLines={2}>
                {deal.title}
              </Text>

              <View style={styles.badgeRow}>
                <View style={styles.discountBadge}>
                  <Text style={styles.discountBadgeText}>{discountLabel}</Text>
                </View>

                {deal.promo_code ? (
                  <Pressable
                    style={styles.codePill}
                    onPress={handleCopyCode}
                    accessibilityLabel="Copy promo code">
                    <Ionicons
                      name={copiedCode ? 'checkmark-circle' : 'ticket-outline'}
                      size={13}
                      color="#00FF66"
                    />
                    <Text style={styles.codePillText}>
                      {copiedCode ? 'COPIED' : deal.promo_code}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          {/* Quick Channels Grid */}
          <Text style={styles.sectionTitle}>QUICK SHARE</Text>
          <View style={styles.channelsGrid}>
            {/* 1. WhatsApp */}
            <Pressable
              style={({ pressed }) => [
                styles.channelCard,
                { backgroundColor: 'rgba(37, 211, 102, 0.1)', borderColor: 'rgba(37, 211, 102, 0.28)' },
                pressed && styles.cardPressed,
              ]}
              onPress={handleWhatsApp}>
              <View style={[styles.channelIconCircle, { backgroundColor: '#25D366' }]}>
                <Ionicons name="logo-whatsapp" size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.channelLabel}>WhatsApp</Text>
              <Text style={styles.channelSub}>Chat & Status</Text>
            </Pressable>

            {/* 2. Copy Link */}
            <Pressable
              style={({ pressed }) => [
                styles.channelCard,
                {
                  backgroundColor: copiedLink ? 'rgba(0, 255, 102, 0.2)' : 'rgba(0, 255, 102, 0.1)',
                  borderColor: copiedLink ? '#00FF66' : 'rgba(0, 255, 102, 0.28)',
                },
                pressed && styles.cardPressed,
              ]}
              onPress={handleCopyLink}>
              <View
                style={[
                  styles.channelIconCircle,
                  { backgroundColor: copiedLink ? '#00FF66' : '#00E65B' },
                ]}>
                <Ionicons
                  name={copiedLink ? 'checkmark' : 'link'}
                  size={22}
                  color="#0F1117"
                />
              </View>
              <Text style={[styles.channelLabel, copiedLink && { color: '#00FF66' }]}>
                {copiedLink ? 'Copied!' : 'Copy Link'}
              </Text>
              <Text style={styles.channelSub}>Paste anywhere</Text>
            </Pressable>

            {/* 3. SMS */}
            <Pressable
              style={({ pressed }) => [
                styles.channelCard,
                { backgroundColor: 'rgba(56, 189, 248, 0.1)', borderColor: 'rgba(56, 189, 248, 0.25)' },
                pressed && styles.cardPressed,
              ]}
              onPress={handleSMS}>
              <View style={[styles.channelIconCircle, { backgroundColor: '#0284C7' }]}>
                <Ionicons name="chatbubble-ellipses" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.channelLabel}>SMS</Text>
              <Text style={styles.channelSub}>Direct text</Text>
            </Pressable>

            {/* 4. Email */}
            <Pressable
              style={({ pressed }) => [
                styles.channelCard,
                { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.25)' },
                pressed && styles.cardPressed,
              ]}
              onPress={handleEmail}>
              <View style={[styles.channelIconCircle, { backgroundColor: '#D97706' }]}>
                <Ionicons name="mail" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.channelLabel}>Email</Text>
              <Text style={styles.channelSub}>Send details</Text>
            </Pressable>
          </View>

          {/* More Options / Native System Sheet Button */}
          <Pressable
            style={({ pressed }) => [
              styles.moreOptionsBtn,
              pressed && { backgroundColor: '#242938' },
            ]}
            onPress={handleMoreOptions}>
            <Ionicons name="share-social-outline" size={18} color="#94A3B8" />
            <Text style={styles.moreOptionsText}>More Sharing Options (System Dialog)</Text>
            <Ionicons name="chevron-forward" size={16} color="#64748B" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetContainer: {
    backgroundColor: '#131620',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: '#22283A',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: Platform.OS === 'ios' ? spacing[8] : spacing[6],
    maxWidth: 580,
    width: '100%',
    alignSelf: 'center',
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginBottom: spacing[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  shareBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h3,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1A1E2C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealPreviewCard: {
    flexDirection: 'row',
    backgroundColor: '#181C28',
    borderRadius: radii.lg,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#252C3E',
    marginBottom: spacing[4],
    gap: spacing[3],
  },
  dealImageWrap: {
    width: 68,
    height: 68,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#0F1117',
  },
  dealThumb: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  dealPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealDetailsWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  brandNameText: {
    ...typography.caption,
    color: '#00FF66',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  dealTitleText: {
    ...typography.body,
    color: '#F8FAFC',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  discountBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  discountBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 255, 102, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  codePillText: {
    color: '#00FF66',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    ...typography.caption,
    color: '#64748B',
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: spacing[2],
  },
  channelsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  channelCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: 4,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  channelIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  channelLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
    textAlign: 'center',
  },
  channelSub: {
    color: '#94A3B8',
    fontSize: 9,
    textAlign: 'center',
  },
  moreOptionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1E2C',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#262D40',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  moreOptionsText: {
    flex: 1,
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: spacing[2],
  },
});
