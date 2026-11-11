import { Router, Request, Response } from 'express';
import { getActiveDeals, getBrandDeals } from '../services/dealService.js';

const router = Router();

// GET /api/deals - Fetch active verified deals
router.get('/deals', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '30', 10);
    const deals = await getActiveDeals(limit);
    res.json({
      success: true,
      count: deals.length,
      deals,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch deals' });
  }
});

// GET /api/brand/:brandId/deals - Fetch deals belonging to a brand
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

export default router;
