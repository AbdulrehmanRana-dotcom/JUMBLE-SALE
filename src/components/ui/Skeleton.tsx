import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radii } from '@/theme';

export type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

/** Shimmer placeholder for loading lists and cards. */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = radii.sm,
  style,
}: SkeletonProps) {
  const [opacity] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.block,
        { width, height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

export function DealCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton height={140} borderRadius={0} />
      <View style={styles.cardBody}>
        <Skeleton width="40%" height={12} />
        <Skeleton width="90%" height={16} />
        <Skeleton width="55%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.border,
  },
  card: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  cardBody: {
    padding: 12,
    gap: 8,
  },
});
