import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '@/theme';

export type TabBarItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive?: keyof typeof Ionicons.glyphMap;
};

export type TabBarProps = {
  items: TabBarItem[];
  activeKey: string;
  onChange: (key: string) => void;
};

/** Bottom navigation shell — wire to Expo Router tabs in feature screens later. */
export function TabBar({ items, activeKey, onChange }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}>
      {items.map((item) => {
        const active = item.key === activeKey;
        const iconName = active && item.iconActive ? item.iconActive : item.icon;

        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.key)}
            style={styles.tab}>
            <Ionicons
              name={iconName}
              size={24}
              color={active ? colors.tabActive : colors.tabInactive}
            />
            <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: colors.tabBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.tabBarBorder,
    paddingTop: spacing[2],
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: spacing[1],
  },
  label: {
    ...typography.caption,
    fontSize: 11,
    color: colors.tabInactive,
  },
  labelActive: {
    color: colors.tabActive,
    fontFamily: typography.label.fontFamily,
  },
});
