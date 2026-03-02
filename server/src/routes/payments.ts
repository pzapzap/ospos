import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth';
import { findUserById } from '../db/queries/users';
import { createPaymentIntent, createRefund, stripe } from '../services/stripe';

const router = Router();

router.use(authMiddleware);

// Payment routes: 60 req/min per IP
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests' },
});

router.use(paymentLimiter);

// POST /payments/create-intent
router.post('/create-intent', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { amount, currency, tip_amount, idempotency_key } = req.body;

    if (!amount || !currency) {
      res.status(400).json({ error: 'Amount and currency are required' });
      return;
    }

    if (typeof amount !== 'number' || amount <= 0 || amount > 99_999_999) {
      res.status(400).json({ error: 'Amount must be a positive number (in cents), max 999,999.99' });
      return;
    }

    if (tip_amount !== undefined) {
      if (typeof tip_amount !== 'number' || tip_amount < 0 || tip_amount > 1_000_000) {
        res.status(400).json({ error: 'tip_amount must be a non-negative number' });
        return;
      }
    }

    if (typeof currency !== 'string' || currency.length !== 3) {
      res.status(400).json({ error: 'currency must be a 3-letter ISO code' });
      return;
    }

    const user = await findUserById(req.user.userId);
    if (!user?.stripe_account_id) {
      res.status(400).json({ error: 'Stripe account not set up' });
      return;
    }

    const result = await createPaymentIntent(
      amount,
      currency.toLowerCase(),
      user.stripe_account_id,
      tip_amount,
      idempotency_key
    );

    res.json(result);
  } catch (error) {
    console.error('[PAYMENTS] Create intent error:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// POST /payments/refund
router.post('/refund', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { paymentIntentId, amount } = req.body;

    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      res.status(400).json({ error: 'paymentIntentId is required' });
      return;
    }

    // Verify the payment intent belongs to this user's connected account
    const user = await findUserById(req.user.userId);
    if (!user?.stripe_account_id) {
      res.status(400).json({ error: 'Stripe account not set up' });
      return;
    }

    // Direct charges: PI lives on the connected account, so retrieve it there.
    // If the PI doesn't exist on this account, Stripe throws → 403.
    let pi;
    try {
      pi = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        { stripeAccount: user.stripe_account_id }
      );
    } catch {
      res.status(403).json({ error: 'Forbidden: payment does not belong to this account' });
      return;
    }

    if (amount !== undefined && (typeof amount !== 'number' || amount <= 0 || amount > pi.amount)) {
      res.status(400).json({ error: 'Invalid refund amount' });
      return;
    }

    const refund = await createRefund(
      paymentIntentId,
      amount ? Math.round(amount) : undefined,
      user.stripe_account_id
    );

    res.json({
      refundId: refund.id,
      status: refund.status,
      amount: refund.amount,
    });
  } catch (error) {
    console.error('[PAYMENTS] Refund error:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

export default router;
