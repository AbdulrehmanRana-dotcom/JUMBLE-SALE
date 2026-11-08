import { Platform, ViewStyle } from 'react-native';

type ShadowStyle = ViewStyle;

export const shadows = {
  none: Platform.select<ShadowStyle>({
    web: { boxShadow: 'none' },
    default: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
  }) as ShadowStyle,
  sm: Platform.select<ShadowStyle>({
    web: { boxShadow: '0px 1px 2px rgba(16, 24, 40, 0.06)' },
    default: {
      shadowColor: '#101828',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 2,
    },
  }) as ShadowStyle,
  md: Platform.select<ShadowStyle>({
    web: { boxShadow: '0px 4px 8px rgba(16, 24, 40, 0.08)' },
    default: {
      shadowColor: '#101828',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
  }) as ShadowStyle,
  lg: Platform.select<ShadowStyle>({
    web: { boxShadow: '0px 8px 16px rgba(16, 24, 40, 0.1)' },
    default: {
      shadowColor: '#101828',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 8,
    },
  }) as ShadowStyle,
} as const;
