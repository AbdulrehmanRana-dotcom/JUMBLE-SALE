import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRoutes from './routes/health.routes.js';
import dealsRoutes from './routes/deals.routes.js';
import aiRoutes from './routes/ai.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for Expo Web & Mobile
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

// API Routes
app.use('/api', healthRoutes);
app.use('/api', dealsRoutes);
app.use('/api/ai', aiRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Jumble Sale Node.js API Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      deals: '/api/deals',
      shopperAI: '/api/ai/shopper',
      brandAI: '/api/ai/brand-copilot',
    },
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 JUMBLE SALE NODE.JS BACKEND SERVER RUNNING`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🩺 Health: http://localhost:${PORT}/api/health`);
  console.log(`🛍️ Deals: http://localhost:${PORT}/api/deals`);
  console.log(`🤖 AI Shopper: http://localhost:${PORT}/api/ai/shopper`);
  console.log(`👔 Brand Copilot: http://localhost:${PORT}/api/ai/brand-copilot`);
  console.log(`=======================================================`);
});

export default app;
