import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type AppNotification,
  type NotificationRole,
} from '@/lib/notificationStore';
import { colors, radii, spacing, typography } from '@/theme';

interface NotificationCenterModalProps {
  visible: boolean;
  onClose: () => void;
  role?: NotificationRole;
  userId?: string | null;
  onAdminNavigate?: (tab: string) => void;
}

export function NotificationCenterModal({
  visible,
  onClose,
  role = 'consumer',
  userId,
  onAdminNavigate,
}: NotificationCenterModalProps) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [activeFilter, setActiveFilter] = useState<string>('All');

  // Fetch notifications for active role/user
  const {
    data: notifications = [],
    isLoading,
    refetch,
  } = useQuery<AppNotification[]>({
    queryKey: ['notifications-list', role, userId || 'default'],
    queryFn: () => getNotifications(role, userId),
    enabled: visible,
    staleTime: 0,
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const filterTabs = useMemo(() => {
    if (role === 'admin') {
      return ['All', 'Unread', 'Queues', 'Reports', 'Milestones'];
    }
    if (role === 'brand') {
      return ['All', 'Unread', 'Deals', 'Followers', 'Milestones'];
    }
    return ['All', 'Unread', 'Deals', 'Orders'];
  }, [role]);

  const filteredList = useMemo(() => {
    return notifications.filter((item) => {
      if (activeFilter === 'All') return true;
      if (activeFilter === 'Unread') return !item.is_read;
      if (activeFilter === 'Deals') return item.category === 'deal';
      if (activeFilter === 'Orders') return item.category === 'order';
      if (activeFilter === 'Followers') return item.category === 'brand';
      if (activeFilter === 'Queues') return item.category === 'moderation';
      if (activeFilter === 'Reports') return item.category === 'report';
      if (activeFilter === 'Milestones') return item.category === 'milestone';
      return true;
    });
  }, [notifications, activeFilter]);

  const handleMarkItemRead = async (item: AppNotification) => {
    if (!item.is_read) {
      await markNotificationAsRead(item.id, role, userId);
      refetch();
      queryClient.invalidateQueries({
        queryKey: ['notifications-unread-count', role, userId || 'default'],
      });
    }

    // Navigation trigger
    if (item.action_url) {
      onClose();
      if (role === 'admin' && onAdminNavigate) {
        onAdminNavigate(item.action_url);
      } else {
        router.push(item.action_url as any);
      }
    } else if (item.deal_id) {
      onClose();
      router.push(`/(consumer)/deal/${item.deal_id}` as any);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead(role, userId);
      toast.show('All notifications marked as read ✓', 'success');
      refetch();
      queryClient.invalidateQueries({
        queryKey: ['notifications-unread-count', role, userId || 'default'],
      });
    } catch {
      toast.show('Failed to mark all as read', 'error');
    }
  };

  const handleDeleteItem = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId, role, userId);
      toast.show('Notification removed', 'info');
      refetch();
      queryClient.invalidateQueries({
        queryKey: ['notifications-unread-count', role, userId || 'default'],
      });
    } catch {
      toast.show('Could not delete notification', 'error');
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'deal':
        return { name: 'pricetag' as const, color: '#00FF66', bg: 'rgba(0, 255, 102, 0.15)' };
      case 'order':
        return { name: 'bag-check' as const, color: '#A855F7', bg: 'rgba(168, 85, 247, 0.15)' };
      case 'brand':
        return { name: 'person-add' as const, color: '#00E5FF', bg: 'rgba(0, 229, 255, 0.15)' };
      case 'moderation':
        return { name: 'shield-checkmark' as const, color: '#FACC15', bg: 'rgba(250, 204, 21, 0.15)' };
      case 'report':
        return { name: 'alert-circle' as const, color: '#FF4500', bg: 'rgba(255, 69, 0, 0.15)' };
      case 'milestone':
        return { name: 'rocket' as const, color: '#FFB800', bg: 'rgba(255, 184, 0, 0.15)' };
      default:
        return { name: 'notifications' as const, color: '#00FF66', bg: 'rgba(0, 255, 102, 0.15)' };
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      const now = Date.now();
      const diff = now - new Date(dateStr).getTime();
      const mins = Math.floor(diff / (1000 * 60));
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days === 1) return 'Yesterday';
      return `${days}d ago`;
    } catch {
      return 'Recently';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable
              style={styles.circleBtn}
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Close Notifications">
              <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
            </Pressable>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.headerTitle}>Notifications</Text>
                {unreadCount > 0 && (
                  <View style={styles.unreadPill}>
                    <Text style={styles.unreadPillText}>{unreadCount} New</Text>
                  </View>
                )}
              </View>
              <Text style={styles.headerSub}>
                {role === 'admin'
                  ? 'Platform & Moderation Alerts'
                  : role === 'brand'
                  ? 'Brand Analytics & Deal Updates'
                  : 'Sales, Drops & Followed Brands'}
              </Text>
            </View>
          </View>

          {unreadCount > 0 && (
            <Pressable
              style={styles.markAllBtn}
              onPress={handleMarkAllRead}
              hitSlop={8}>
              <Ionicons name="checkmark-done-sharp" size={16} color="#00FF66" />
              <Text style={styles.markAllBtnText}>Mark all read</Text>
            </Pressable>
          )}
        </View>

        {/* Filter Tabs Row */}
        <View style={styles.tabsBar}>
          {filterTabs.map((tab) => {
            const isSelected = activeFilter === tab;
            return (
              <Pressable
                key={tab}
                style={[styles.tabChip, isSelected && styles.tabChipActive]}
                onPress={() => setActiveFilter(tab)}>
                <Text style={[styles.tabChipText, isSelected && styles.tabChipTextActive]}>
                  {tab}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Notifications List */}
        {isLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color="#00FF66" />
          </View>
        ) : filteredList.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="notifications-off-outline"
              title={
                activeFilter === 'Unread'
                  ? 'All Caught Up! 🎉'
                  : 'No Notifications Yet'
              }
              description={
                activeFilter === 'Unread'
                  ? 'You have read all your recent notifications.'
                  : 'When relevant promotions, order updates or milestones occur, they will appear here.'
              }
            />
          </View>
        ) : (
          <FlatList
            data={filteredList}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const iconMeta = getCategoryIcon(item.category);
              return (
                <Pressable
                  style={[
                    styles.notificationCard,
                    !item.is_read && styles.notificationCardUnread,
                  ]}
                  onPress={() => handleMarkItemRead(item)}>
                  {/* Category Icon */}
                  <View style={[styles.categoryIconWrap, { backgroundColor: iconMeta.bg }]}>
                    <Ionicons name={iconMeta.name} size={18} color={iconMeta.color} />
                  </View>

                  {/* Body Content */}
                  <View style={styles.contentWrap}>
                    <View style={styles.cardHeaderRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                        <Text
                          style={[
                            styles.cardTitle,
                            !item.is_read && styles.cardTitleUnread,
                          ]}
                          numberOfLines={1}>
                          {item.title}
                        </Text>
                        {item.actor_count && item.actor_count > 1 ? (
                          <View style={styles.rollupPill}>
                            <Text style={styles.rollupPillText}>+{item.actor_count}</Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Green Unread Indicator Dot */}
                      {!item.is_read && <View style={styles.greenUnreadDot} />}
                    </View>

                    <Text style={styles.cardBody} numberOfLines={2}>
                      {item.body}
                    </Text>

                    <View style={styles.cardFooter}>
                      <Text style={styles.timeText}>{formatTimeAgo(item.created_at)}</Text>
                      {item.action_url && (
                        <View style={styles.actionPromptRow}>
                          <Text style={styles.actionPromptText}>View details</Text>
                          <Ionicons name="arrow-forward" size={11} color="#00FF66" />
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Delete Button */}
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDeleteItem(item.id);
                    }}
                    hitSlop={8}>
                    <Ionicons name="trash-outline" size={15} color="#64748B" />
                  </Pressable>
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: '#161922',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#12141C',
    borderWidth: 1,
    borderColor: '#1E222D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSub: {
    ...typography.caption,
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  unreadPill: {
    backgroundColor: 'rgba(0, 255, 102, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 102, 0.3)',
  },
  unreadPillText: {
    color: '#00FF66',
    fontSize: 10,
    fontWeight: '700',
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#12141C',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: '#1E222D',
  },
  markAllBtnText: {
    color: '#00FF66',
    fontSize: 11,
    fontWeight: '600',
  },
  tabsBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#12141C',
  },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: '#12141C',
    borderWidth: 1,
    borderColor: '#1E222D',
  },
  tabChipActive: {
    backgroundColor: '#00FF66',
    borderColor: '#00FF66',
  },
  tabChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  tabChipTextActive: {
    color: '#090A0E',
    fontWeight: '700',
  },
  listContent: {
    padding: spacing[4],
    gap: spacing[3],
    paddingBottom: 40,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing[4],
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#10121A',
    borderRadius: radii.lg,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#1B1E28',
    gap: spacing[3],
  },
  notificationCardUnread: {
    borderColor: 'rgba(0, 255, 102, 0.35)',
    backgroundColor: '#121720',
  },
  categoryIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  contentWrap: {
    flex: 1,
    gap: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  cardTitle: {
    ...typography.bodyMedium,
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  cardTitleUnread: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  rollupPill: {
    backgroundColor: 'rgba(0, 255, 102, 0.15)',
    borderWidth: 1,
    borderColor: '#00FF66',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  rollupPillText: {
    color: '#00FF66',
    fontSize: 9,
    fontWeight: '800',
  },
  greenUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00FF66',
    shadowColor: '#00FF66',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
    elevation: 3,
    marginLeft: 6,
  },
  cardBody: {
    ...typography.caption,
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  actionPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  actionPromptText: {
    fontSize: 11,
    color: '#00FF66',
    fontWeight: '600',
  },
  deleteBtn: {
    padding: 4,
    marginTop: 2,
  },
});
