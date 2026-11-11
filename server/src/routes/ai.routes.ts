import { Router, Request, Response } from 'express';
import { processShopperAIQuery } from '../services/aiShopperService.js';
import { processBrandExecutiveQuery } from '../services/aiBrandService.js';

const router = Router();

// POST /api/ai/shopper - Consumer Shopping AI Concierge
router.post('/shopper', async (req: Request, res: Response) => {
  try {
    const { query, history } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'query string is required' });
    }

    const result = await processShopperAIQuery(query, history || []);
    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Shopper AI service error' });
  }
});

// POST /api/ai/brand-copilot - Brand Executive Copilot
router.post('/brand-copilot', async (req: Request, res: Response) => {
  try {
    const { brandId, query, history } = req.body;
    if (!brandId) {
      return res.status(400).json({ success: false, error: 'brandId is required' });
    }
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'query string is required' });
    }

    const result = await processBrandExecutiveQuery(brandId, query, history || []);
    res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Brand Copilot service error' });
  }
});

export default router;
