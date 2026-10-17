/** Brand and semantic colors — Dark slate & vibrant neon green theme */
export const colors = {
  primary: '#00FF66',
  primaryDark: '#00D655',
  primaryLight: 'rgba(0, 255, 102, 0.15)',
  primaryContrast: '#090A0E',
  secondary: '#1A1D29',
  accent: '#00FF66',
  accentLight: 'rgba(0, 255, 102, 0.12)',

  background: '#090A0E',
  surface: '#141721',
  surfaceMuted: '#1A1D29',

  textPrimary: '#FFFFFF',
  textSecondary: '#94A3B8',
  textInverse: '#090A0E',
  textMuted: '#64748B',

  border: '#202432',
  borderFocus: '#00FF66',

  success: '#00FF66',
  successBg: 'rgba(0, 255, 102, 0.18)',
  warning: '#FF5500',
  warningBg: 'rgba(255, 85, 0, 0.18)',
  error: '#EF4444',
  errorBg: 'rgba(239, 68, 68, 0.18)',
  info: '#3B82F6',
  infoBg: 'rgba(59, 130, 246, 0.18)',

  /** Deal discount badge */
  deal: '#FF4500',
  dealBg: '#FF4500',

  overlay: 'rgba(0, 0, 0, 0.75)',

  tabBar: '#090A0E',
  tabBarBorder: '#181C28',
  tabInactive: '#64748B',
  tabActive: '#00FF66',
} as const;

export type ColorName = keyof typeof colors;


