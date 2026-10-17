import { supabase } from '@/lib/supabase';
import type { InteractionType } from '@/types/database.types';

type PendingInteraction = {
  deal_id: string;
  type: InteractionType;
  user_id?: string | null;
  created_at: string;
};

class InteractionLogger {
  private queue: PendingInteraction[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private BATCH_INTERVAL_MS = 3000;
  private loggedViews = new Set<string>();

  public logInteraction(dealId: string, type: InteractionType, userId?: string | null) {
    // Deduplicate rapid view logs for the same deal in a single session
    if (type === 'view') {
      const key = `${userId || 'anon'}_${dealId}`;
      if (this.loggedViews.has(key)) return;
      this.loggedViews.add(key);
    }

    this.queue.push({
      deal_id: dealId,
      type,
      user_id: userId || null,
      created_at: new Date().toISOString(),
    });

    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.timer) return;

    this.timer = setTimeout(() => {
      this.flushQueue();
    }, this.BATCH_INTERVAL_MS);
  }

  private async flushQueue() {
    this.timer = null;
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];

    try {
      const isUUID = (v?: string | null) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');

      const { error } = await (supabase.from('interactions') as any).insert(
        batch.map((item) => ({
          deal_id: item.deal_id,
          type: item.type,
          user_id: isUUID(item.user_id) ? item.user_id : null,
        }))
      );

      if (error) {
        console.warn('[InteractionLogger] Error flushing batch:', error.message);
      }
    } catch (err) {
      console.warn('[InteractionLogger] Unexpected flush error:', err);
    }
  }
}

export const interactionLogger = new InteractionLogger();
