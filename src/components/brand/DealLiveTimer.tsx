import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getDealExpiryTimestamp } from '@/lib/dealStore';
import type { DealStatus } from '@/types/database.types';

interface DealLiveTimerProps {
  dealId: string;
  endDate: string | null | undefined;
  status?: DealStatus;
  onExpire?: (dealId: string) => void;
  compact?: boolean;
}

export function DealLiveTimer({
  dealId,
  endDate,
  status,
  onExpire,
  compact = false,
}: DealLiveTimerProps) {
  const [now, setNow] = useState(Date.now());

  const expiryMs = getDealExpiryTimestamp(endDate);

  useEffect(() => {
    if (!expiryMs || status === 'paused' || status === 'expired') return;

    const diff = expiryMs - Date.now();
    if (diff <= 0) return;

    // If within 24 hours, tick every second for live urgency
    // If more than 24 hours, tick every 30 seconds
    const intervalMs = diff <= 24 * 60 * 60 * 1000 ? 1000 : 30000;

    const timer = setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);

      if (expiryMs - currentNow <= 0) {
        clearInterval(timer);
        if (onExpire) {
          onExpire(dealId);
        }
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [expiryMs, status, dealId, onExpire]);

  // Handle paused state
  if (status === 'paused') {
    return (
      <View style={[styles.badge, styles.pausedBadge]}>
        <Ionicons name="pause-circle" size={12} color="#F59E0B" />
        <Text style={[styles.badgeText, styles.pausedText]}>Paused (Out of Stock)</Text>
      </View>
    );
  }

  // Handle expired state
  if (!expiryMs || status === 'expired' || expiryMs <= now) {
    return (
      <View style={[styles.badge, styles.expiredBadge]}>
        <Ionicons name="time-outline" size={12} color="#64748B" />
        <Text style={[styles.badgeText, styles.expiredText]}>Expired</Text>
      </View>
    );
  }

  const diffMs = expiryMs - now;
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Urgent Flash Window (< 24 hours remaining) -> Live ticking clock
  if (days < 1) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      <View style={[styles.badge, styles.urgentBadge]}>
        <Ionicons name="flame" size={12} color="#FF3366" />
        <Text style={[styles.badgeText, styles.urgentText]}>
          {compact ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}h : ${pad(minutes)}m : ${pad(seconds)}s`}
        </Text>
      </View>
    );
  }

  // Multi-day countdown (> 24 hours)
  return (
    <View style={[styles.badge, styles.activeBadge]}>
      <Ionicons name="hourglass-outline" size={12} color="#00FF66" />
      <Text style={[styles.badgeText, styles.activeText]}>
        {days}d {hours}h left
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  activeBadge: {
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    borderColor: 'rgba(0, 255, 102, 0.35)',
  },
  activeText: {
    color: '#00FF66',
  },
  urgentBadge: {
    backgroundColor: 'rgba(255, 51, 102, 0.14)',
    borderColor: 'rgba(255, 51, 102, 0.45)',
  },
  urgentText: {
    color: '#FF3366',
  },
  pausedBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  pausedText: {
    color: '#F59E0B',
  },
  expiredBadge: {
    backgroundColor: 'rgba(100, 116, 139, 0.14)',
    borderColor: 'rgba(100, 116, 139, 0.3)',
  },
  expiredText: {
    color: '#94A3B8',
  },
});
