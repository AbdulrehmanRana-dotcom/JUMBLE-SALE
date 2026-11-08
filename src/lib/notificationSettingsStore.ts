import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface NotificationSettings {
  push_enabled: boolean;
  in_app_banner_enabled: boolean;
  sound_enabled: boolean;
  likes_enabled: boolean;
  comments_enabled: boolean;
  followers_enabled: boolean;
  deals_enabled: boolean;
  orders_enabled: boolean;
  system_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string; // e.g. "23:00" (11:00 PM)
  quiet_hours_end: string;   // e.g. "08:00" (08:00 AM)
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  push_enabled: true,
  in_app_banner_enabled: true,
  sound_enabled: true,
  likes_enabled: true,
  comments_enabled: true,
  followers_enabled: true,
  deals_enabled: true,
  orders_enabled: true,
  system_enabled: true,
  quiet_hours_enabled: true,
  quiet_hours_start: '23:00',
  quiet_hours_end: '08:00',
};

const SETTINGS_STORAGE_KEY = '@jumble_sale_notification_settings_v1_';

/**
 * Fetch current notification preferences for a user
 */
export async function getNotificationSettings(
  userId?: string | null
): Promise<NotificationSettings> {
  const safeId = userId || 'default';
  const key = `${SETTINGS_STORAGE_KEY}${safeId}`;

  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_NOTIFICATION_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.warn('[NotificationSettings] Error reading settings:', err);
  }

  return DEFAULT_NOTIFICATION_SETTINGS;
}

/**
 * Update notification preferences
 */
export async function updateNotificationSettings(
  updates: Partial<NotificationSettings>,
  userId?: string | null
): Promise<NotificationSettings> {
  const safeId = userId || 'default';
  const key = `${SETTINGS_STORAGE_KEY}${safeId}`;
  const current = await getNotificationSettings(safeId);
  const updated: NotificationSettings = { ...current, ...updates };

  try {
    await AsyncStorage.setItem(key, JSON.stringify(updated));
  } catch (err) {
    console.warn('[NotificationSettings] Error saving settings:', err);
  }

  // Also sync to Supabase profile if UUID
  if (isSupabaseConfigured && userId && /^[0-9a-f-]{36}$/i.test(userId)) {
    try {
      if (typeof updates.push_enabled === 'boolean') {
        await (supabase.from('profiles') as any)
          .update({ notifications_enabled: updates.push_enabled })
          .eq('id', userId);
      }
    } catch {}
  }

  return updated;
}

/**
 * Checks whether Quiet Hours (Do Not Disturb) is currently active.
 * Handles overnight time ranges like 23:00 (11 PM) to 08:00 (8 AM).
 */
export function isQuietHoursActive(settings: NotificationSettings): boolean {
  if (!settings.quiet_hours_enabled) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = (settings.quiet_hours_start || '23:00')
    .split(':')
    .map(Number);
  const [endH, endM] = (settings.quiet_hours_end || '08:00')
    .split(':')
    .map(Number);

  const startMinutes = (startH || 23) * 60 + (startM || 0);
  const endMinutes = (endH || 8) * 60 + (endM || 0);

  // If start is before end (e.g. 01:00 to 07:00)
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  // Overnight range (e.g. 23:00 to 08:00)
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

/**
 * Evaluates whether an incoming event should be saved and how it should be delivered
 */
export function evaluateDeliveryChannels(
  category: string,
  settings: NotificationSettings,
  isLike: boolean = false
): {
  canSave: boolean;
  canShowBanner: boolean;
  canShowPush: boolean;
  isQuietHour: boolean;
} {
  // Check category toggles
  if (category === 'brand' && !settings.followers_enabled) {
    return { canSave: false, canShowBanner: false, canShowPush: false, isQuietHour: false };
  }
  if (category === 'deal' && isLike && !settings.likes_enabled) {
    return { canSave: false, canShowBanner: false, canShowPush: false, isQuietHour: false };
  }
  if (category === 'deal' && !isLike && !settings.deals_enabled) {
    return { canSave: false, canShowBanner: false, canShowPush: false, isQuietHour: false };
  }
  if (category === 'order' && !settings.orders_enabled) {
    return { canSave: false, canShowBanner: false, canShowPush: false, isQuietHour: false };
  }
  if (category === 'system' && !settings.system_enabled) {
    return { canSave: false, canShowBanner: false, canShowPush: false, isQuietHour: false };
  }

  const inQuietHours = isQuietHoursActive(settings);

  return {
    canSave: true,
    // In quiet hours, don't pop banners or push alerts (silent in-app bell only)
    canShowBanner: settings.in_app_banner_enabled && !inQuietHours,
    canShowPush: settings.push_enabled && !inQuietHours,
    isQuietHour: inQuietHours,
  };
}
