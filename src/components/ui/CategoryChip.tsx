import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, typography } from '@/theme';

export type CategoryChipProps = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected?: boolean;
  onPress?: () => void;
};

export function CategoryChip({
  label,
  icon,
  selected = false,
  onPress,
}: CategoryChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}>
      {icon ? (
        <Ionicons
          name={icon}
          size={16}
          color={selected ? '#090A0E' : '#94A3B8'}
        />
      ) : null}
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#141721',
    borderWidth: 1,
    borderColor: '#202432',
  },
  chipSelected: {
    backgroundColor: '#00FF66',
    borderColor: '#00FF66',
  },
  pressed: {
    opacity: 0.9,
  },
  label: {
    ...typography.caption,
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  labelSelected: {
    color: '#090A0E',
    fontWeight: '800',
  },
});
