import AsyncStorage from '@react-native-async-storage/async-storage';
import { interactionLogger } from '@/lib/interactionLogger';

const GUEST_DEVICE_ID_KEY = '@jumble_sale_guest_device_id';
const CLICKED_POSTS_PREFIX = '@jumble_sale_clicked_posts_';
const POST_CLICKS_COUNT_KEY = '@jumble_sale_post_clicks_count';

// In-memory cache for fast lookups per user/device
const memoryClickedCache = new Map<string, Set<string>>();

/**
 * Get or create a persistent anonymous device ID for guest users
 */
export async function getGuestDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(GUEST_DEVICE_ID_KEY);
    if (existing && existing.trim()) {
      return existing.trim();
    }
    const newId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await AsyncStorage.setItem(GUEST_DEVICE_ID_KEY, newId);
    return newId;
  } catch {
    return 'guest_fallback_device';
  }
}

/**
 * Resolves the effective tracking ID (logged in user UUID or guest device ID)
 */
export async function getEffectiveTrackerId(userId?: string | null): Promise<string> {
  if (userId && userId.trim()) {
    return userId.trim();
  }
  return await getGuestDeviceId();
}

/**
 * Returns the list of post/deal IDs this user has already clicked the website for
 */
export async function getUserClickedPostIds(userId?: string | null): Promise<string[]> {
  const trackerId = await getEffectiveTrackerId(userId);

  // Check in-memory cache first
  if (memoryClickedCache.has(trackerId)) {
    return Array.from(memoryClickedCache.get(trackerId)!);
  }

  try {
    const raw = await AsyncStorage.getItem(`${CLICKED_POSTS_PREFIX}${trackerId}`);
    if (raw) {
      const parsed: string[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryClickedCache.set(trackerId, new Set(parsed));
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[ClickTracker] Error reading user clicks:', err);
  }

  memoryClickedCache.set(trackerId, new Set());
  return [];
}

/**
 * Check if the user has already clicked this post's website link
 */
export async function hasClickedPostWebsite(
  dealId: string,
  userId?: string | null
): Promise<boolean> {
  if (!dealId) return false;
  const trackerId = await getEffectiveTrackerId(userId);

  if (memoryClickedCache.has(trackerId)) {
    return memoryClickedCache.get(trackerId)!.has(dealId);
  }

  const clickedIds = await getUserClickedPostIds(userId);
  return clickedIds.includes(dealId);
}

/**
 * Get the total number of website clicks for a specific post
 */
export async function getPostClicksCount(dealId: string): Promise<number> {
  if (!dealId) return 0;
  try {
    const raw = await AsyncStorage.getItem(POST_CLICKS_COUNT_KEY);
    if (raw) {
      const counts: Record<string, number> = JSON.parse(raw);
      return counts[dealId] || 0;
    }
  } catch (err) {
    console.warn('[ClickTracker] Error reading post clicks count:', err);
  }
  return 0;
}

/**
 * Records an outbound website click for a post.
 * - If user already clicked this post before, returns { isNewClick: false }.
 * - If this is a new click for this post, marks post as clicked, increments counter,
 *   logs interaction to backend, and returns { isNewClick: true }.
 */
export async function recordPostWebsiteClick(
  dealId: string,
  userId?: string | null
): Promise<{ isNewClick: boolean; totalClicks: number }> {
  if (!dealId) {
    return { isNewClick: false, totalClicks: 0 };
  }

  const trackerId = await getEffectiveTrackerId(userId);
  const alreadyClicked = await hasClickedPostWebsite(dealId, userId);

  // If already clicked, DO NOT count as a 2nd click!
  if (alreadyClicked) {
    const currentCount = await getPostClicksCount(dealId);
    return { isNewClick: false, totalClicks: currentCount };
  }

  // 1. Mark as clicked in-memory
  let userSet = memoryClickedCache.get(trackerId);
  if (!userSet) {
    userSet = new Set<string>();
    memoryClickedCache.set(trackerId, userSet);
  }
  userSet.add(dealId);

  // 2. Persist to AsyncStorage for this user
  try {
    const updatedList = Array.from(userSet);
    await AsyncStorage.setItem(
      `${CLICKED_POSTS_PREFIX}${trackerId}`,
      JSON.stringify(updatedList)
    );
  } catch (err) {
    console.warn('[ClickTracker] Error saving clicked posts to storage:', err);
  }

  // 3. Increment post's total clicks count locally
  let newTotalClicks = 1;
  try {
    const raw = await AsyncStorage.getItem(POST_CLICKS_COUNT_KEY);
    const counts: Record<string, number> = raw ? JSON.parse(raw) : {};
    counts[dealId] = (counts[dealId] || 0) + 1;
    newTotalClicks = counts[dealId];
    await AsyncStorage.setItem(POST_CLICKS_COUNT_KEY, JSON.stringify(counts));
  } catch (err) {
    console.warn('[ClickTracker] Error updating post clicks count:', err);
  }

  // 4. Log interaction to backend
  try {
    interactionLogger.logInteraction(dealId, 'click', userId);
  } catch (err) {
    console.warn('[ClickTracker] Error logging click interaction:', err);
  }

  return { isNewClick: true, totalClicks: newTotalClicks };
}
