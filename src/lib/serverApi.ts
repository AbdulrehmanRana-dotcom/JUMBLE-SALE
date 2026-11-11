import { Platform } from 'react-native';

const SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000');

export interface ServerHealth {
  status: 'ok' | 'degraded' | 'offline';
  databaseConnected: boolean;
  latencyMs?: number;
}

/**
 * Checks if the Node.js backend server is reachable and reports Supabase DB health.
 */
export async function checkServerHealth(): Promise<ServerHealth> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const res = await fetch(`${SERVER_URL}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        status: data.status || 'ok',
        databaseConnected: Boolean(data.database?.connected),
        latencyMs: data.database?.latencyMs,
      };
    }
  } catch {}

  return {
    status: 'offline',
    databaseConnected: false,
  };
}

/**
 * Call Node.js backend Shopper AI endpoint with automatic fallback.
 */
export async function callServerShopperAI(
  query: string,
  chatHistory: { role: string; content: string }[] = []
): Promise<{ reply: string; deals: any[]; is_off_topic: boolean; suggested_chips: string[] } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${SERVER_URL}/api/ai/shopper`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, history: chatHistory }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return {
          reply: data.reply,
          deals: data.deals || [],
          is_off_topic: Boolean(data.is_off_topic),
          suggested_chips: data.suggested_chips || [],
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Call Node.js backend Brand Copilot endpoint with automatic fallback.
 */
export async function callServerBrandAI(
  brandId: string,
  query: string,
  chatHistory: { role: string; content: string }[] = []
): Promise<{ reply: string; hasPostAction: boolean; actions: any[]; suggested_prompts: string[] } | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${SERVER_URL}/api/ai/brand-copilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, query, history: chatHistory }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return {
          reply: data.reply,
          hasPostAction: Boolean(data.hasPostAction),
          actions: data.actions || [],
          suggested_prompts: data.suggested_prompts || [],
        };
      }
    }
  } catch {}

  return null;
}
