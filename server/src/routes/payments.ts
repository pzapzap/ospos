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

    const { amount, currency, tip_amount } = req.body;

    if (!amount || !currency) {
      res.status(400).json({ error: 'Amount and currency are required' });
      return;
    }

    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 50 || amount > 99_999_999) {
      res.status(400).json({ error: 'Amount must be an integer (in cents), min 50, max 99999999' });
      return;
    }

    if (tip_amount !== undefined) {
      if (typeof tip_amount !== 'number' || !Number.isInteger(tip_amount) || tip_amount < 0 || tip_amount > amount * 2) {
        res.status(400).json({ error: 'tip_amount must be a non-negative integer, max 2x the order amount' });
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

    // Generate idempotency key server-side to prevent replay attacks
    const idempotencyKey = `pi_${req.user.userId}_${amount}_${Date.now()}`;

    const result = await createPaymentIntent(
      amount,
      currency.toLowerCase(),
      user.stripe_account_id,
      tip_amount,
      idempotencyKey
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

    if (!paymentIntentId || typeof paymentIntentId !== 'string' || !/^pi_[a-zA-Z0-9]+$/.test(paymentIntentId)) {
      res.status(400).json({ error: 'Invalid paymentIntentId' });
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
