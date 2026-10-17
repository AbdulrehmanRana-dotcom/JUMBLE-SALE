import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
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
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { Notification } from '@/types/database.types';
import { colors, radii, spacing, typography } from '@/theme';

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const {
    data: notifications = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<Notification[]>({
    queryKey: ['notifications-list', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as Notification[]) ?? [];
    },
    enabled: Boolean(user?.id),
  });

  const markAsRead = async (id: string) => {
    try {
      await (supabase.from('notifications') as any)
        .update({ is_read: true })
        .eq('id', id);
      refetch();
    } catch (err) {
      console.log('Error marking notification read:', err);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Notifications"
        subtitle="Stay updated on sales & brand announcements"
        onBack={() => router.back()}
      />

      {isLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No Notifications Yet"
              description="You'll get notified when your followed brands post new deals and discounts!"
              icon="notifications-outline"
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.itemCard, !item.is_read && styles.unreadCard]}
              onPress={() => {
                if (!item.is_read) markAsRead(item.id);
                if (item.deal_id) {
                  router.push(`/(consumer)/deal/${item.deal_id}` as any);
                }
              }}>
              <View style={styles.iconCircle}>
                <Ionicons
                  name="notifications"
                  size={20}
                  color={item.is_read ? colors.textMuted : colors.primary}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.date}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[3],
  },
  unreadCard: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  body: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  date: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
