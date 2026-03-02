import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { findUserById, updateUserStripeAccount } from '../db/queries/users';
import {
  createConnectedAccount,
  createAccountLink,
  getAccountStatus,
  createConnectionToken,
} from '../services/stripe';

const router = Router();

// Only allow ospos:// deep links and our own domain for redirect URLs
const ALLOWED_URL_PATTERN = /^ospos:\/\//;
function sanitizeRedirectUrl(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  if (ALLOWED_URL_PATTERN.test(url)) return url;
  return fallback;
}

// Redirect endpoints for Stripe Connect onboarding (no auth needed)
router.get('/return', (_req: Request, res: Response) => {
  res.redirect('ospos://stripe/return');
});
router.get('/refresh', (_req: Request, res: Response) => {
  res.redirect('ospos://stripe/refresh');
});

// All other Stripe routes require auth
router.use(authMiddleware);

// POST /stripe/onboarding
router.post('/onboarding', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    let stripeAccountId = user.stripe_account_id;

    if (!stripeAccountId) {
      const account = await createConnectedAccount(user.email);
      stripeAccountId = account.id;
      await updateUserStripeAccount(user.id, stripeAccountId);
    }

    const { return_url, refresh_url } = req.body;

    const accountLink = await createAccountLink(
      stripeAccountId,
      sanitizeRedirectUrl(refresh_url, 'ospos://stripe/refresh'),
      sanitizeRedirectUrl(return_url, 'ospos://stripe/return')
    );

    res.json({
      url: accountLink.url,
      stripeAccountId,
    });
  } catch (error) {
    console.error('[STRIPE] Onboarding error:', error);
    res.status(500).json({ error: 'Failed to start onboarding' });
  }
});

// POST /stripe/onboarding/refresh
router.post('/onboarding/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user?.stripe_account_id) {
      res.status(400).json({ error: 'No Stripe account found' });
      return;
    }

    const { return_url, refresh_url } = req.body;

    const accountLink = await createAccountLink(
      user.stripe_account_id,
      sanitizeRedirectUrl(refresh_url, 'ospos://stripe/refresh'),
      sanitizeRedirectUrl(return_url, 'ospos://stripe/return')
    );

    res.json({ url: accountLink.url });
  } catch (error) {
    console.error('[STRIPE] Onboarding refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh onboarding link' });
  }
});

// GET /stripe/account-status
router.get('/account-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user?.stripe_account_id) {
      res.json({
        charges_enabled: false,
        details_submitted: false,
        payouts_enabled: false,
      });
      return;
    }

    const status = await getAccountStatus(user.stripe_account_id);
    res.json(status);
  } catch (error) {
    console.error('[STRIPE] Account status error:', error);
    res.status(500).json({ error: 'Failed to get account status' });
  }
});

// POST /stripe/connection-token
router.post('/connection-token', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user?.stripe_account_id) {
      res.status(400).json({ error: 'Stripe account not set up' });
      return;
    }
    const token = await createConnectionToken(user.stripe_account_id);
    res.json(token);
  } catch (error) {
    console.error('[STRIPE] Connection token error:', error);
    res.status(500).json({ error: 'Failed to create connection token' });
  }
});

export default router;
