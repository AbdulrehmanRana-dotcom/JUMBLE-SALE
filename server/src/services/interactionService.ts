import {
  getLiveLikes,
  getLiveComments,
  toggleLiveLike,
  addLiveComment,
  getAllInteractionsBatch,
  CommentRecord,
} from '../db/interactionsDb.js';

export interface DealInteractions {
  deal_id: string;
  likes_count: number;
  comments_count: number;
  is_liked?: boolean;
}

/**
 * Get authentic original likes and comments directly from database
 */
export async function getDealEngagement(dealId: string, userId?: string): Promise<DealInteractions> {
  const [likesInfo, comments] = await Promise.all([
    getLiveLikes(dealId, userId),
    getLiveComments(dealId),
  ]);

  return {
    deal_id: dealId,
    likes_count: likesInfo.count,
    comments_count: comments.length,
    is_liked: likesInfo.isLiked,
  };
}

/**
 * Toggle like for a post - saves to real database and returns authentic count
 */
export async function toggleDealLike(
  dealId: string,
  userId: string = 'guest',
  userName: string = 'Shopper'
): Promise<{ isLiked: boolean; likesCount: number; commentsCount: number }> {
  return toggleLiveLike(dealId, userId, userName);
}

/**
 * Get authentic comments from real database
 */
export async function getDealComments(dealId: string): Promise<CommentRecord[]> {
  return getLiveComments(dealId);
}

/**
 * Add authentic comment to real database
 */
export async function addDealComment(
  dealId: string,
  userId: string,
  userName: string,
  text: string
): Promise<{ comment: CommentRecord; totalComments: number; likesCount: number }> {
  return addLiveComment(dealId, userId, userName, text);
}

/**
 * Batch get all interactions across all posts
 */
export async function getBatchInteractions(): Promise<Record<string, { likes_count: number; comments_count: number }>> {
  return getAllInteractionsBatch();
}
