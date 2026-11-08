import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import type { AdminUserItem } from '@/lib/adminAnalytics';
import type { Profile } from '@/types/database.types';
import { radii, spacing, typography } from '@/theme';

const adminTheme = {
  bgApp: '#090A0D',
  bgCard: '#13151C',
  bgCardHover: '#181B24',
  bgInput: '#151821',
  border: '#1F2330',
  neon: '#00FF66',
  neonLight: 'rgba(0, 255, 102, 0.12)',
  textPrimary: '#FFFFFF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  warning: '#F59E0B',
  error: '#EF4444',
};

interface AdminUsersSectionProps {
  users: AdminUserItem[];
  loading: boolean;
  onRefresh: () => void;
  onSelectUser: (user: AdminUserItem) => void;
  onToggleUserSuspension: (user: Profile) => void;
  onDeleteUser: (user: Profile) => void;
}

export function AdminUsersSection({
  users,
  loading,
  onRefresh,
  onSelectUser,
  onToggleUserSuspension,
  onDeleteUser,
}: AdminUsersSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.full_name?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? u.is_active
          : !u.is_active;

      return matchesSearch && matchesStatus;
    });
  }, [users, searchQuery, statusFilter]);

  return (
    <View style={styles.container}>
      {/* Search & Filter Header */}
      <View style={styles.headerControls}>
        <Input
          placeholder="Search shoppers by name or email..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon="search-outline"
        />

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {(['all', 'active', 'suspended'] as const).map((filter) => (
            <Pressable
              key={filter}
              style={[
                styles.filterPill,
                statusFilter === filter && styles.filterPillActive,
              ]}
              onPress={() => setStatusFilter(filter)}>
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === filter && styles.filterPillTextActive,
                ]}>
                {filter.toUpperCase()} (
                {
                  users.filter((u) =>
                    filter === 'all' ? true : filter === 'active' ? u.is_active : !u.is_active
                  ).length
                }
                )
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Shoppers List */}
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={onRefresh}
            tintColor={adminTheme.neon}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="No Shoppers Found"
            description="No registered users match your search query."
            icon="people-outline"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.userCard}>
            <View style={styles.userCardTop}>
              <View style={styles.userAvatarWrap}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <Ionicons name="person" size={22} color={adminTheme.neon} />
                )}
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {item.display_name || item.full_name || 'Registered Shopper'}
                  </Text>
                  <Badge
                    label={item.is_active ? 'ACTIVE' : 'SUSPENDED'}
                    variant={item.is_active ? 'success' : 'error'}
                  />
                </View>
                <Text style={styles.userEmail}>{item.email}</Text>
                <Text style={styles.userJoined}>
                  Joined: {new Date(item.created_at).toLocaleDateString('en-PK')}
                </Text>
              </View>
            </View>

            {/* Quick Activity Chips */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiChip}>
                <Ionicons name="heart-outline" size={13} color="#EF4444" />
                <Text style={styles.kpiChipText}>{item.followed_brands_count} Following</Text>
              </View>
              <View style={styles.kpiChip}>
                <Ionicons name="hand-left-outline" size={13} color={adminTheme.neon} />
                <Text style={styles.kpiChipText}>{item.total_clicks} Clicks</Text>
              </View>
              <View style={styles.kpiChip}>
                <Ionicons name="share-social-outline" size={13} color="#8B5CF6" />
                <Text style={styles.kpiChipText}>{item.total_shares} Shares</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <Button
                label="View User Activity 🔍"
                variant="primary"
                size="sm"
                onPress={() => onSelectUser(item)}
                style={{ flex: 1.5 }}
              />
              <Button
                label={item.is_active ? 'Suspend' : 'Reactivate'}
                variant="outline"
                size="sm"
                onPress={() => onToggleUserSuspension(item)}
                style={{ flex: 1 }}
              />
              <Button
                label="Remove"
                variant="ghost"
                size="sm"
                onPress={() => onDeleteUser(item)}
                style={{ flex: 0.6 }}
              />
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.bgApp,
  },
  headerControls: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    gap: spacing[2],
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: adminTheme.bgCard,
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  filterPillActive: {
    backgroundColor: adminTheme.neonLight,
    borderColor: adminTheme.neon,
  },
  filterPillText: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: adminTheme.neon,
    fontWeight: 'bold',
  },
  listContent: {
    padding: spacing[4],
    gap: spacing[3],
    paddingBottom: spacing[10],
  },
  userCard: {
    backgroundColor: adminTheme.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: adminTheme.border,
    padding: spacing[4],
    gap: spacing[3],
  },
  userCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  userAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: adminTheme.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: adminTheme.border,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  userName: {
    ...typography.bodyMedium,
    color: adminTheme.textPrimary,
    fontWeight: 'bold',
    fontSize: 15,
  },
  userEmail: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    marginTop: 2,
  },
  userJoined: {
    ...typography.caption,
    color: adminTheme.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  kpiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: adminTheme.bgInput,
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  kpiChipText: {
    ...typography.caption,
    color: adminTheme.textSecondary,
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderTopWidth: 1,
    borderTopColor: adminTheme.border,
    paddingTop: spacing[3],
  },
});
