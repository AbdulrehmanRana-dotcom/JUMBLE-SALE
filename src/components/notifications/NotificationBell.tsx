import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import {
  getUnreadNotificationCount,
  type NotificationRole,
} from '@/lib/notificationStore';
import { colors, radii, spacing, typography } from '@/theme';

interface NotificationBellProps {
  role?: NotificationRole;
  userId?: string | null;
  onPress: () => void;
  style?: ViewStyle;
  iconColor?: string;
  size?: number;
}

export function NotificationBell({
  role = 'consumer',
  userId,
  onPress,
  style,
  iconColor = '#FFFFFF',
  size = 20,
}: NotificationBellProps) {
  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['notifications-unread-count', role, userId || 'default'],
    queryFn: () => getUnreadNotificationCount(role, userId),
    staleTime: 5 * 1000,
  });

  return (
    <Pressable
      style={[styles.bellBtn, style]}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Notifications, ${unreadCount} unread`}>
      <Ionicons name="notifications-outline" size={size} color={iconColor} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bellBtn: {
    position: 'relative',
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: '#12141C',
    borderWidth: 1,
    borderColor: '#1E222D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#00FF66',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#090A0E',
    shadowColor: '#00FF66',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 3,
  },
  badgeText: {
    color: '#090A0E',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
});
