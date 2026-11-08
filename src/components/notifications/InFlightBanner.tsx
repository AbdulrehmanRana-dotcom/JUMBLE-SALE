import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { onInFlightNotification } from '@/lib/inFlightEvents';
import {
  markNotificationAsRead,
  type AppNotification,
} from '@/lib/notificationStore';
import { fontFamily, radii, spacing, typography } from '@/theme';

export function InFlightBanner() {
  const router = useRouter();
  const [currentNotif, setCurrentNotif] = useState<AppNotification | null>(null);

  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<any>(null);

  const dismiss = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentNotif(null);
    });
  };

  const show = (notif: AppNotification) => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
    }
    setCurrentNotif(notif);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss after 4 seconds
    dismissTimer.current = setTimeout(() => {
      dismiss();
    }, 4000);
  };

  useEffect(() => {
    const unsubscribe = onInFlightNotification((notif) => {
      show(notif);
    });
    return () => {
      unsubscribe();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  // Swipe up to dismiss PanResponder
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 5,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy < 0) {
          translateY.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -20 || gesture.vy < -0.5) {
          dismiss();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            friction: 8,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const handlePress = async () => {
    if (!currentNotif) return;
    const notif = currentNotif;
    dismiss();

    try {
      await markNotificationAsRead(notif.id, notif.role, notif.user_id);
    } catch {}

    // Zero-click deep linking
    if (notif.action_url) {
      router.push(notif.action_url as any);
    } else if (notif.deal_id) {
      router.push(`/(consumer)/deal/${notif.deal_id}` as any);
    }
  };

  if (!currentNotif) return null;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'deal':
        return 'flame-outline';
      case 'brand':
        return 'person-add-outline';
      case 'order':
        return 'bag-check-outline';
      case 'moderation':
        return 'shield-checkmark-outline';
      case 'report':
        return 'alert-circle-outline';
      default:
        return 'notifications-outline';
    }
  };

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
      {...panResponder.panHandlers}>
      <Pressable
        style={styles.card}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={currentNotif.title}>
        {/* Left Neon Icon */}
        <View style={styles.iconCircle}>
          <Ionicons
            name={getCategoryIcon(currentNotif.category) as any}
            size={18}
            color="#00FF66"
          />
        </View>

        {/* Center Content */}
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>
              {currentNotif.title}
            </Text>
            {currentNotif.actor_count && currentNotif.actor_count > 1 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  +{currentNotif.actor_count}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.body} numberOfLines={2}>
            {currentNotif.body}
          </Text>
        </View>

        {/* Right CTA */}
        <View style={styles.ctaRow}>
          <View style={styles.viewPill}>
            <Text style={styles.viewPillText}>View</Text>
            <Ionicons name="arrow-forward" size={11} color="#00FF66" />
          </View>
          <Pressable onPress={dismiss} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={16} color="#64748B" />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 14 : 48,
    left: 14,
    right: 14,
    zIndex: 99999,
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F121C',
    borderRadius: radii.lg,
    borderWidth: 1.2,
    borderColor: '#1E2536',
    borderLeftWidth: 3.5,
    borderLeftColor: '#00FF66',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    width: '100%',
    maxWidth: 540,
    shadowColor: '#00FF66',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  content: {
    flex: 1,
    paddingRight: spacing[2],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  title: {
    fontSize: 13,
    fontFamily: fontFamily.bold,
    color: '#FFFFFF',
    flexShrink: 1,
  },
  countBadge: {
    backgroundColor: '#00FF66',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 10,
  },
  countBadgeText: {
    color: '#090A0E',
    fontSize: 9,
    fontWeight: '800',
  },
  body: {
    fontSize: 11.5,
    fontFamily: fontFamily.regular,
    color: '#94A3B8',
    lineHeight: 16,
  },
  ctaRow: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  viewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  viewPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00FF66',
  },
  closeBtn: {
    padding: 2,
  },
});
