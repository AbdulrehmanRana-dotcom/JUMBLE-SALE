import fs from 'fs';
import path from 'path';
import { supabase } from '../config/supabase.js';

export interface LikeRecord {
  deal_id: string;
  user_id: string;
  user_name?: string;
  created_at: string;
}

export interface CommentRecord {
  id: string;
  deal_id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string | null;
  text: string;
  created_at: string;
}

interface DatabaseState {
  likes: LikeRecord[];
  comments: CommentRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'interactions.json');

// In-memory cache loaded from disk
let dbState: DatabaseState = {
  likes: [],
  comments: [],
};

// SSE connected clients for real-time push
const sseClients = new Set<(payload: any) => void>();

export function subscribeToInteractions(listener: (payload: any) => void): () => void {
  sseClients.add(listener);
  return () => {
    sseClients.delete(listener);
  };
}

export function broadcastInteractionUpdate(dealId: string, likesCount: number, commentsCount: number) {
  const event = {
    type: 'interaction_update',
    deal_id: dealId,
    likes_count: likesCount,
    comments_count: commentsCount,
    timestamp: new Date().toISOString(),
  };

  for (const send of sseClients) {
    try {
      send(event);
    } catch {
      // client disconnected
    }
  }
}

// Initialize database file
function initDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      dbState = {
        likes: Array.isArray(parsed.likes) ? parsed.likes : [],
        comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      };
    } else {
      dbState = { likes: [], comments: [] };
      fs.writeFileSync(DB_FILE, JSON.stringify(dbState, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('[InteractionsDB] Error initializing database:', err);
    dbState = { likes: [], comments: [] };
  }
}

// Persist to disk atomically
let writeTimeout: NodeJS.Timeout | null = null;
function persistDb() {
  if (writeTimeout) clearTimeout(writeTimeout);
  writeTimeout = setTimeout(() => {
    try {
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(dbState, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('[InteractionsDB] Error saving database:', err);
    }
  }, 100);
}

// Initial load
initDb();

/**
 * Get exact live likes count from database and Supabase
 */
export async function getLiveLikes(dealId: string, currentUserId?: string): Promise<{ count: number; isLiked: boolean }> {
  // 1. Local persistent DB likes
  const localLikes = dbState.likes.filter((l) => l.deal_id === dealId);
  const userIds = new Set(localLikes.map((l) => l.user_id));

  // 2. Supabase remote likes (if configured and valid UUID)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);
  if (isUUID) {
    try {
      const { data, error } = await supabase
        .from('likes')
        .select('user_id')
        .eq('deal_id', dealId);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (row.user_id) userIds.add(row.user_id);
        }
      }
    } catch {}
  }

  const isLiked = Boolean(currentUserId && userIds.has(currentUserId));
  return {
    count: userIds.size,
    isLiked,
  };
}

/**
 * Get exact live comments from database
 */
export async function getLiveComments(dealId: string): Promise<CommentRecord[]> {
  const localComments = dbState.comments
    .filter((c) => c.deal_id === dealId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Also query Supabase comments if available
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);
  if (isUUID) {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        const localIds = new Set(localComments.map((c) => c.id));
        for (const row of data) {
          if (!localIds.has(row.id)) {
            localComments.push({
              id: row.id,
              deal_id: row.deal_id,
              user_id: row.user_id || 'shopper',
              user_name: row.user_name || 'Shopper',
              user_avatar: row.user_avatar || null,
              text: row.text || '',
              created_at: row.created_at || new Date().toISOString(),
            });
          }
        }
      }
    } catch {}
  }

  return localComments;
}

/**
 * Toggle like for a deal
 */
export async function toggleLiveLike(
  dealId: string,
  userId: string = 'guest',
  userName: string = 'Shopper'
): Promise<{ isLiked: boolean; likesCount: number; commentsCount: number }> {
  const existingIdx = dbState.likes.findIndex((l) => l.deal_id === dealId && l.user_id === userId);
  let isNowLiked = false;

  if (existingIdx >= 0) {
    // Remove like
    dbState.likes.splice(existingIdx, 1);
    isNowLiked = false;
  } else {
    // Add like
    dbState.likes.push({
      deal_id: dealId,
      user_id: userId,
      user_name: userName,
      created_at: new Date().toISOString(),
    });
    isNowLiked = true;
  }

  persistDb();

  // Try Supabase sync if user is UUID
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);
  const isUserUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

  if (isUUID && isUserUUID) {
    try {
      if (isNowLiked) {
        await supabase.from('likes').insert({ user_id: userId, deal_id: dealId });
      } else {
        await supabase.from('likes').delete().eq('user_id', userId).eq('deal_id', dealId);
      }
    } catch {}
  }

  const { count: likesCount } = await getLiveLikes(dealId, userId);
  const comments = await getLiveComments(dealId);
  const commentsCount = comments.length;

  // Broadcast real-time update
  broadcastInteractionUpdate(dealId, likesCount, commentsCount);

  return {
    isLiked: isNowLiked,
    likesCount,
    commentsCount,
  };
}

/**
 * Add comment to a deal
 */
export async function addLiveComment(
  dealId: string,
  userId: string,
  userName: string,
  text: string
): Promise<{ comment: CommentRecord; totalComments: number; likesCount: number }> {
  const newComment: CommentRecord = {
    id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    deal_id: dealId,
    user_id: userId,
    user_name: userName || 'Shopper',
    text: text.trim(),
    created_at: new Date().toISOString(),
  };

  dbState.comments.unshift(newComment);
  persistDb();

  // Try Supabase sync
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dealId);
  if (isUUID) {
    try {
      const payload: any = {
        deal_id: dealId,
        user_name: userName,
        text: text.trim(),
      };
      const isUserUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
      if (isUserUUID) {
        payload.user_id = userId;
      }
      await supabase.from('comments').insert(payload);
    } catch {}
  }

  const comments = await getLiveComments(dealId);
  const { count: likesCount } = await getLiveLikes(dealId, userId);

  // Broadcast real-time update
  broadcastInteractionUpdate(dealId, likesCount, comments.length);

  return {
    comment: newComment,
    totalComments: comments.length,
    likesCount,
  };
}

/**
 * Batch get interactions for all deals currently stored or queried
 */
export async function getAllInteractionsBatch(): Promise<Record<string, { likes_count: number; comments_count: number }>> {
  const map: Record<string, { likes_count: number; comments_count: number }> = {};

  // Group likes by deal_id
  for (const l of dbState.likes) {
    if (!map[l.deal_id]) {
      map[l.deal_id] = { likes_count: 0, comments_count: 0 };
    }
    map[l.deal_id].likes_count += 1;
  }

  // Group comments by deal_id
  for (const c of dbState.comments) {
    if (!map[c.deal_id]) {
      map[c.deal_id] = { likes_count: 0, comments_count: 0 };
    }
    map[c.deal_id].comments_count += 1;
  }

  return map;
}
