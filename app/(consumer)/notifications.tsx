import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { Header } from '@/components/ui/Header';
import { useToast } from '@/components/ui/Toast';
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type AppNotification,
} from '@/lib/notificationStore';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radii, spacing, typography } from '@/theme';

const TABS = ['All', 'Unread', 'Deals', 'Orders'];

export default function NotificationsScreen() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('All');

  const {
    data: notifications = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<AppNotification[]>({
    queryKey: ['notifications-list', 'consumer', user?.id || 'default'],
    queryFn: () => getNotifications('consumer', user?.id),
    staleTime: 0,
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const filteredList = useMemo(() => {
    return notifications.filter((item) => {
      if (activeTab === 'All') return true;
      if (activeTab === 'Unread') return !item.is_read;
      if (activeTab === 'Deals') return item.category === 'deal';
      if (activeTab === 'Orders') return item.category === 'order';
      return true;
    });
  }, [notifications, activeTab]);

  const handleMarkItemRead = async (item: AppNotification) => {
    if (!item.is_read) {
      await markNotificationAsRead(item.id, 'consumer', user?.id);
      refetch();
      queryClient.invalidateQueries({
        queryKey: ['notifications-unread-count', 'consumer', user?.id || 'default'],
      });
    }

    if (item.action_url) {
      router.push(item.action_url as any);
    } else if (item.deal_id) {
      router.push(`/(consumer)/deal/${item.deal_id}` as any);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead('consumer', user?.id);
      toast.show('All notifications marked as read ✓', 'success');
      refetch();
      queryClient.invalidateQueries({
        queryKey: ['notifications-unread-count', 'consumer', user?.id || 'default'],
      });
    } catch {
      toast.show('Failed to mark all as read', 'error');
    }
  };

  const handleDeleteItem = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId, 'consumer', user?.id);
      toast.show('Notification removed', 'info');
      refetch();
      queryClient.invalidateQueries({
        queryKey: ['notifications-unread-count', 'consumer', user?.id || 'default'],
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
    <SafeAreaView style={styles.container}>
      <Header
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread alerts` : 'All caught up!'}
        onBack={() => router.back()}
        rightAction={
          unreadCount > 0 ? (
            <Pressable
              style={styles.markAllBtn}
              onPress={handleMarkAllRead}
              hitSlop={8}>
              <Ionicons name="checkmark-done" size={15} color="#00FF66" />
              <Text style={styles.markAllBtnText}>Read all</Text>
            </Pressable>
          ) : undefined
        }
      />

      {/* Filter Tabs */}
      <View style={styles.tabsRow}>
        {TABS.map((tab) => {
          const isSelected = activeTab === tab;
          return (
            <Pressable
              key={tab}
              style={[styles.tabChip, isSelected && styles.tabChipActive]}
              onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabChipText, isSelected && styles.tabChipTextActive]}>
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#00FF66" />
        </View>
      ) : filteredList.length === 0 ? (
        <View style={styles.emptyCenter}>
          <EmptyState
            title={activeTab === 'Unread' ? 'No Unread Alerts' : 'No Notifications Yet'}
            description={
              activeTab === 'Unread'
                ? 'You have caught up with all promotions and alerts!'
                : "You'll get notified when your followed brands post new deals and discounts!"
            }
            icon="notifications-outline"
          />
        </View>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#00FF66"
            />
          }
          renderItem={({ item }) => {
            const iconMeta = getCategoryIcon(item.category);
            return (
              <Pressable
                style={[styles.itemCard, !item.is_read && styles.unreadCard]}
                onPress={() => handleMarkItemRead(item)}>
                <View style={[styles.iconCircle, { backgroundColor: iconMeta.bg }]}>
                  <Ionicons name={iconMeta.name} size={18} color={iconMeta.color} />
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.cardHeaderRow}>
                    <Text
                      style={[styles.title, !item.is_read && styles.titleUnread]}
                      numberOfLines={1}>
                      {item.title}
                    </Text>

                    {/* Green Dot Indicator for unread */}
                    {!item.is_read && <View style={styles.greenUnreadDot} />}
                  </View>

                  <Text style={styles.body} numberOfLines={2}>
                    {item.body}
                  </Text>

                  <View style={styles.footerRow}>
                    <Text style={styles.date}>{formatTimeAgo(item.created_at)}</Text>
                    {item.action_url && (
                      <View style={styles.viewPromptRow}>
                        <Text style={styles.viewPromptText}>View deal</Text>
                        <Ionicons name="arrow-forward" size={11} color="#00FF66" />
                      </View>
                    )}
                  </View>
                </View>

                {/* Delete button */}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0E',
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCenter: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing[4],
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#12141C',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: '#1E222D',
  },
  markAllBtnText: {
    color: '#00FF66',
    fontSize: 11,
    fontWeight: '600',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#161922',
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
  list: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
    paddingBottom: 40,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#10121A',
    borderRadius: radii.lg,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: '#1B1E28',
    gap: spacing[3],
  },
  unreadCard: {
    borderColor: 'rgba(0, 255, 102, 0.35)',
    backgroundColor: '#121720',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  title: {
    ...typography.bodyMedium,
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  titleUnread: {
    color: '#FFFFFF',
    fontWeight: '700',
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
  body: {
    ...typography.caption,
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  date: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  viewPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  viewPromptText: {
    fontSize: 11,
    color: '#00FF66',
    fontWeight: '600',
  },
  deleteBtn: {
    padding: 4,
    marginTop: 2,
  },
});
