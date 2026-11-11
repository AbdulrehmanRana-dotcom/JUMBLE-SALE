import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://ajbxviddoiipcxtovxxu.supabase.co';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_P73kXsfU7iZik_wvm0D9-g_63yfMCKu';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    transport: WebSocket,
  },
});

export async function checkDatabaseConnection(): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const { count, error } = await supabase
      .from('deals')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return { connected: false, latencyMs: Date.now() - start, error: error.message };
    }
    return { connected: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { connected: false, latencyMs: Date.now() - start, error: err?.message || 'Unknown error' };
  }
}
