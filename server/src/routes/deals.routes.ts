import { Router, Request, Response } from 'express';
import { getActiveDeals, getBrandDeals } from '../services/dealService.js';
import {
  getDealEngagement,
  toggleDealLike,
  getDealComments,
  addDealComment,
  getBatchInteractions,
} from '../services/interactionService.js';
import { subscribeToInteractions } from '../db/interactionsDb.js';

const router = Router();

// GET /api/deals/interactions/batch - Batch get all interaction counts
router.get('/deals/interactions/batch', async (req: Request, res: Response) => {
  try {
    const batch = await getBatchInteractions();
    res.json({
      success: true,
      interactions: batch,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch batch interactions' });
  }
});

// GET /api/deals/interactions/stream - Server-Sent Events (SSE) for real-time live sync
router.get('/deals/interactions/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', time: new Date().toISOString() })}\n\n`);

  const unsubscribe = subscribeToInteractions((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // Heartbeat every 25 seconds
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// GET /api/deals - Fetch active verified deals with authentic likes & comments count
router.get('/deals', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '30', 10);
    const userId = (req.query.userId as string) || undefined;
    const deals = await getActiveDeals(limit, userId);
    res.json({
      success: true,
      count: deals.length,
      deals,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch deals' });
  }
});

// GET /api/brand/:brandId/deals - Fetch deals belonging to a brand with interactions
router.get('/brand/:brandId/deals', async (req: Request, res: Response) => {
  try {
    const { brandId } = req.params;
    const deals = await getBrandDeals(brandId);
    res.json({
      success: true,
      count: deals.length,
      deals,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch brand deals' });
  }
});

// GET /api/deals/:id/interactions - Get total authentic likes and comments for a post
router.get('/deals/:id/interactions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req.query.userId as string) || undefined;
    const stats = await getDealEngagement(id, userId);
    res.json({
      success: true,
      ...stats,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch interactions' });
  }
});

// POST /api/deals/:id/like - Toggle like on a post in real-time database
router.post('/deals/:id/like', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, userName } = req.body || {};
    const result = await toggleDealLike(id, userId || 'guest', userName || 'Shopper');
    res.json({
      success: true,
      deal_id: id,
      isLiked: result.isLiked,
      likesCount: result.likesCount,
      commentsCount: result.commentsCount,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to toggle like' });
  }
});

// GET /api/deals/:id/comments - Get authentic comments for a post from real-time database
router.get('/deals/:id/comments', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const comments = await getDealComments(id);
    res.json({
      success: true,
      deal_id: id,
      count: comments.length,
      comments,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch comments' });
  }
});

// POST /api/deals/:id/comments - Add authentic comment to post in real-time database
router.post('/deals/:id/comments', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId, userName, text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    const result = await addDealComment(id, userId || 'guest', userName || 'Shopper', text);
    res.json({
      success: true,
      deal_id: id,
      comment: result.comment,
      totalComments: result.totalComments,
      likesCount: result.likesCount,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to add comment' });
  }
});

export default router;
