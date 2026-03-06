import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';

import authRoutes from './routes/auth';
import stripeRoutes from './routes/stripe';
import paymentsRoutes from './routes/payments';
import disputesRoutes from './routes/disputes';
import receiptsRoutes from './routes/receipts';
import syncRoutes from './routes/sync';
import webhooksRoutes from './routes/webhooks';
import supportRoutes from './routes/support';
import notificationsRoutes from './routes/notifications';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));
const allowedOrigins = process.env.CORS_ORIGINS?.split(',') ?? ['https://api.ospos.app'];
if (config.nodeEnv !== 'production') {
  allowedOrigins.push('http://localhost:3000', 'http://localhost:8081', 'http://10.0.2.2:3000');
}
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// Global rate limiter: 300 req/min per IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
}));

// Webhook route needs raw body for Stripe signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }));

// JSON body parser with size limit
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route-specific rate limiters for sensitive endpoints
const strictLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many requests' } });
const mediumLimit = rateLimit({ windowMs: 60 * 1000, max: 60, message: { error: 'Too many requests' } });

// Mount routes
app.use('/auth', strictLimit, authRoutes);
app.use('/stripe', mediumLimit, stripeRoutes);
app.use('/payments', mediumLimit, paymentsRoutes);
app.use('/disputes', mediumLimit, disputesRoutes);
app.use('/receipts', mediumLimit, receiptsRoutes);
app.use('/sync', mediumLimit, syncRoutes);
app.use('/webhooks', webhooksRoutes); // No rate limit — Stripe controls delivery
app.use('/support', strictLimit, supportRoutes);
app.use('/notifications', mediumLimit, notificationsRoutes);

// Start server
app.listen(config.port, () => {
  console.log(`[OSPOS] Server running on port ${config.port}`);
  console.log(`[OSPOS] Environment: ${config.nodeEnv}`);
});

export default app;
