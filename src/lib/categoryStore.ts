import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from './supabase';
import type { Category } from '@/types/database.types';

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Fashion & Apparel',
    icon: 'shirt-outline',
  },
  {
    id: '77777777-7777-7777-7777-777777777777',
    name: 'Footwear & Accessories',
    icon: 'footsteps-outline',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Electronics & Mobiles',
    icon: 'phone-portrait-outline',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Food & Dining',
    icon: 'fast-food-outline',
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    name: 'Beauty & Cosmetics',
    icon: 'sparkles-outline',
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Grocery & Supermarket',
    icon: 'cart-outline',
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    name: 'Home & Living',
    icon: 'home-outline',
  },
  {
    id: '88888888-8888-8888-8888-888888888888',
    name: 'Travel & Experiences',
    icon: 'airplane-outline',
  },
];

const CATEGORIES_STORAGE_KEY = '@jumble_sale_categories_cache';
let memoryCategoriesCache: Category[] | null = null;

export async function getLocalCategories(): Promise<Category[]> {
  if (memoryCategoriesCache && memoryCategoriesCache.length > 0) {
    return memoryCategoriesCache;
  }

  // 1. Check local storage
  try {
    const raw = await AsyncStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryCategoriesCache = parsed;
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[CategoryStore] Cache read warning:', err);
  }

  // 2. Fetch from Supabase with 800ms race timeout if configured
  if (isSupabaseConfigured) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 800)
      );
      const queryPromise = supabase
        .from('categories')
        .select('*')
        .order('name');

      const res: any = await Promise.race([queryPromise, timeoutPromise]);
      if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
        memoryCategoriesCache = res.data;
        AsyncStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(res.data)).catch(() => {});
        return res.data;
      }
    } catch (err) {
      console.warn('[CategoryStore] Supabase fetch fallback to defaults:', err);
    }
  }

  // 3. Fallback to default 8 core categories
  memoryCategoriesCache = DEFAULT_CATEGORIES;
  AsyncStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(DEFAULT_CATEGORIES)).catch(() => {});
  return DEFAULT_CATEGORIES;
}
