import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (typeof WebSocket === 'undefined' && typeof window === 'undefined') {
  (globalThis as any).WebSocket = class DummyWebSocket {};
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.',
  );
}

// Safe storage provider that works in React Native, Web, and Node.js test environments
const storageProvider =
  typeof window !== 'undefined' || (typeof navigator !== 'undefined' && navigator.product === 'ReactNative')
    ? AsyncStorage
    : {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      };

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storageProvider,
    autoRefreshToken: typeof window !== 'undefined',
    persistSession: true,
    detectSessionInUrl: false,
  },
});

