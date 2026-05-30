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

    const { amount, currency, tip_amount, test_mode } = req.body;

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

    // In test mode, create a simulated payment intent without connected account.
    // Only allowed for users WITHOUT a connected Stripe account — otherwise a
    // paid-tier merchant could flip test_mode mid-session and end up with a
    // payment intent on the platform account but a refund routed at the
    // connected account, breaking reconciliation.
    if (test_mode === true) {
      if (user?.stripe_account_id) {
        res.status(400).json({ error: 'Test mode is unavailable for connected Stripe accounts' });
        return;
      }
      const testIntent = await stripe.paymentIntents.create({
        amount: tip_amount ? amount + tip_amount : amount,
        currency: currency.toLowerCase(),
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
      });
      res.json({
        clientSecret: testIntent.client_secret,
        paymentIntentId: testIntent.id,
      });
      return;
    }

    if (!user?.stripe_account_id) {
      res.status(400).json({ error: 'Stripe account not set up' });
      return;
    }

    // Demo account hardening: the appstore-review merchant is shared with
    // Apple's review team and uses the founder's live Stripe Connect account.
    // Cap charge amount at $1 so an accidental real-card tap during review
    // (or a leaked credential) can't move meaningful money. Real merchants
    // are unaffected — the cap is keyed off this one email.
    if (user.email === 'appstore-review@tttships.co' && amount > 100) {
      res.status(400).json({
        error: 'This demo merchant is capped at $1.00 per transaction. Use a real merchant account for production charges.',
      });
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

    const { paymentIntentId, amount, test_mode } = req.body;

    if (!paymentIntentId || typeof paymentIntentId !== 'string' || !/^pi_[a-zA-Z0-9]+$/.test(paymentIntentId)) {
      res.status(400).json({ error: 'Invalid paymentIntentId' });
      return;
    }

    // In test mode, refund on platform account. Same guard as create-intent:
    // only allowed for users without a connected Stripe account.
    if (test_mode === true) {
      const testUser = await findUserById(req.user.userId);
      if (testUser?.stripe_account_id) {
        res.status(400).json({ error: 'Test mode is unavailable for connected Stripe accounts' });
        return;
      }

      let pi;
      try {
        pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      } catch {
        res.status(403).json({ error: 'Payment not found' });
        return;
      }

      if (amount !== undefined && (typeof amount !== 'number' || amount <= 0 || amount > pi.amount)) {
        res.status(400).json({ error: 'Invalid refund amount' });
        return;
      }

      const refund = await createRefund(paymentIntentId, amount ? Math.round(amount) : undefined);
      res.json({ refundId: refund.id, status: refund.status, amount: refund.amount });
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
