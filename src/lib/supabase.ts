import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const fallbackUrl = 'https://ajbxviddoiipcxtovxxu.supabase.co';
const fallbackKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

const supabaseUrl = rawUrl || fallbackUrl;
const supabaseAnonKey = rawKey || fallbackKey;

if (typeof WebSocket === 'undefined' && typeof window === 'undefined') {
  (globalThis as any).WebSocket = class DummyWebSocket {};
}

export const isSupabaseConfigured = Boolean(
  rawUrl &&
  !rawUrl.includes('placeholder') &&
  !rawUrl.includes('your-project') &&
  rawKey &&
  !rawKey.includes('dummy') &&
  !rawKey.includes('your_supabase') &&
  rawKey !== fallbackKey
);

if (!isSupabaseConfigured) {
  console.info(
    '[supabase] Running with local/mock credentials. To connect to a live Supabase backend, set valid EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.',
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

