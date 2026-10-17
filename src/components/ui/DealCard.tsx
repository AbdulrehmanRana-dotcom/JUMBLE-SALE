import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { colors, shadows, spacing, typography } from '@/theme';

export type DealCardProps = {
  title: string;
  brandName: string;
  brandLogo?: string | null;
  discountLabel: string;
  price?: number | string | null;
  originalPrice?: number | string | null;
  imageUri?: string | null;
  expiresLabel?: string;
  liked?: boolean;
  saved?: boolean;
  likesCount?: number;
  onPress?: () => void;
  onToggleLike?: () => void;
  onToggleSave?: () => void;
  onShare?: () => void;
  onCommentPress?: () => void;
  style?: ViewStyle;
};

export function DealCard({
  title,
  brandName,
  brandLogo,
  discountLabel,
  price,
  originalPrice,
  imageUri,
  expiresLabel,
  liked = false,
  saved = false,
  likesCount,
  onPress,
  onToggleLike,
  onToggleSave,
  onShare,
  onCommentPress,
  style,
}: DealCardProps) {
  // Format price if valid numbers/strings passed (zero dummy stats)
  const formattedPrice =
    typeof price === 'number' && price > 0
      ? `Rs. ${price.toLocaleString()}`
      : typeof price === 'string' && price
      ? price
      : null;

  const formattedOriginalPrice =
    typeof originalPrice === 'number' && originalPrice > 0
      ? `Rs. ${originalPrice.toLocaleString()}`
      : typeof originalPrice === 'string' && originalPrice
      ? originalPrice
      : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
      {/* Banner Image Container */}
      <View style={styles.imageWrap}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="pricetag" size={36} color={colors.primary} />
          </View>
        )}

        {/* Top-Left Orange Discount Pill Badge */}
        <View style={styles.discountBadge}>
          <Text style={styles.discountBadgeText}>{discountLabel}</Text>
        </View>

        {/* Bottom-Left Image Overlay Capsule for Expiry */}
        {expiresLabel ? (
          <View style={styles.expiryCapsule}>
            <Ionicons name="time-outline" size={13} color="#FFFFFF" />
            <Text style={styles.expiryCapsuleText}>{expiresLabel}</Text>
          </View>
        ) : null}
      </View>

      {/* Card Body */}
      <View style={styles.body}>
        {/* Brand Avatar & Name Row */}
        <View style={styles.brandRow}>
          <View style={styles.brandAvatar}>
            {brandLogo ? (
              <Image source={{ uri: brandLogo }} style={styles.brandAvatarImg} contentFit="cover" />
            ) : (
              <Ionicons name="business" size={12} color={colors.textSecondary} />
            )}
          </View>
          <Text style={styles.brandName} numberOfLines={1}>
            {brandName}
          </Text>
        </View>

        {/* Deal Title */}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        {/* Price & Discount Info (Shifted higher up, right beneath title) */}
        {formattedPrice || discountLabel ? (
          <View style={styles.priceRow}>
            {formattedPrice ? (
              <View style={styles.priceCol}>
                <Text style={styles.priceText}>{formattedPrice}</Text>
                {formattedOriginalPrice ? (
                  <Text style={styles.originalPriceText}>{formattedOriginalPrice}</Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.priceCol}>
                <Text style={styles.priceText}>{discountLabel}</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Bottom Actions Row: Like, Comment, Share on Left + Save on Right Corner */}
        <View style={styles.bottomRow}>
          {/* Left Actions: Like, Comment, Share */}
          <View style={styles.leftActions}>
            {/* 1. Like Button (Heart) */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={liked ? 'Unlike deal' : 'Like deal'}
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                onToggleLike?.();
              }}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}>
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={22}
                color={liked ? '#FF3040' : '#FFFFFF'}
              />
              {typeof likesCount === 'number' && likesCount > 0 ? (
                <Text style={[styles.actionCount, liked && { color: '#FF3040' }]}>
                  {likesCount}
                </Text>
              ) : null}
            </Pressable>

            {/* 2. Comment Button (Chatbubble) */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Comments"
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                if (onCommentPress) {
                  onCommentPress();
                } else {
                  onPress?.();
                }
              }}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}>
              <Ionicons name="chatbubble-outline" size={20} color="#FFFFFF" />
            </Pressable>

            {/* 3. Share Button (Paper-Plane / Arrow) */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share deal"
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                onShare?.();
              }}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}>
              <Ionicons name="paper-plane-outline" size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* 4. Save / Bookmark Button on Bottom-Right Corner */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove from saved' : 'Save deal'}
            hitSlop={8}
            onPress={(e) => {
              e.stopPropagation();
              onToggleSave?.();
            }}
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}>
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={21}
              color={saved ? '#00FF66' : '#FFFFFF'}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141721',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#202432',
    ...shadows.md,
  },
  pressed: {
    opacity: 0.96,
  },
  imageWrap: {
    height: 180,
    backgroundColor: '#1A1D29',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#FF4500',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  discountBadgeText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  expiryCapsule: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 18, 26, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  expiryCapsuleText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  body: {
    padding: spacing[4],
    gap: spacing[2],
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1E2230',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandAvatarImg: {
    width: '100%',
    height: '100%',
  },
  brandName: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
    marginBottom: 4,
  },
  priceCol: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  priceText: {
    ...typography.h3,
    fontSize: 20,
    fontWeight: '900',
    color: '#00FF66',
  },
  originalPriceText: {
    ...typography.caption,
    fontSize: 13,
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    padding: 4,
  },
  actionBtnPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.92 }],
  },
  actionCount: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
});
