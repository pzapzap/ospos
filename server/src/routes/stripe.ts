import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { findUserById, updateUserStripeAccount, updateUserTerminalLocation } from '../db/queries/users';
import {
  createConnectedAccount,
  createAccountLink,
  getAccountStatus,
  getAccountDetails,
  getAccountRequirements,
  createRemediationLink,
  createConnectionToken,
  createTerminalLocation,
} from '../services/stripe';

const router = Router();

// Redirect endpoints for Stripe Connect onboarding (no auth needed)
// Stripe redirects here after onboarding → page auto-opens the app via deep link
function deepLinkPage(deepLink: string, label: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Returning to OSPOS</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#09090B;color:#fff;text-align:center}
a{display:inline-block;margin-top:20px;padding:14px 28px;background:#22D3EE;color:#000;border-radius:10px;text-decoration:none;font-weight:600}</style>
</head><body><div><p>Redirecting back to OSPOS...</p><a href="${deepLink}">${label}</a></div>
<script>
setTimeout(function(){window.location.href="${deepLink}";},100);
setTimeout(function(){var i=document.createElement("iframe");i.style.display="none";i.src="${deepLink}";document.body.appendChild(i);},200);
</script>
</body></html>`;
}

router.get('/return', (_req: Request, res: Response) => {
  res.type('html').send(deepLinkPage('ospos://stripe/return', 'Return to OSPOS'));
});
router.get('/refresh', (_req: Request, res: Response) => {
  res.type('html').send(deepLinkPage('ospos://stripe/refresh', 'Return to OSPOS'));
});

// Build the server's own return/refresh URLs for Stripe account links
function buildServerUrl(req: Request, path: string): string {
  const proto = req.get('x-forwarded-proto') ?? req.protocol;
  const host = req.get('host');
  return `${proto}://${host}/stripe${path}`;
}

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
    let terminalLocationId = user.terminal_location_id;

    if (!stripeAccountId) {
      const account = await createConnectedAccount(user.email);
      stripeAccountId = account.id;
      await updateUserStripeAccount(user.id, stripeAccountId);

      // Create Terminal location for this connected account
      try {
        const location = await createTerminalLocation(stripeAccountId, `OSPOS - ${user.email}`);
        terminalLocationId = location.id;
        await updateUserTerminalLocation(user.id, location.id);
      } catch (locErr) {
        console.error('[STRIPE] Failed to create terminal location:', locErr);
        // Continue without location — user can retry later
      }
    }

    const accountLink = await createAccountLink(
      stripeAccountId,
      buildServerUrl(req, '/refresh'),
      buildServerUrl(req, '/return')
    );

    res.json({
      url: accountLink.url,
      stripeAccountId,
      terminalLocationId,
    });
  } catch (error) {
    console.error('[STRIPE] Onboarding error:', error);
    const stripeErr = error as { code?: string; message?: string };
    res.status(500).json({
      error: 'Failed to start onboarding',
      details: stripeErr.message || 'Unknown error',
      code: stripeErr.code || 'unknown'
    });
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

    const accountLink = await createAccountLink(
      user.stripe_account_id,
      buildServerUrl(req, '/refresh'),
      buildServerUrl(req, '/return')
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

// GET /stripe/account-details
router.get('/account-details', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user?.stripe_account_id) {
      res.status(400).json({ error: 'No Stripe account found' });
      return;
    }

    const details = await getAccountDetails(user.stripe_account_id);
    res.json(details);
  } catch (error) {
    console.error('[STRIPE] Account details error:', error);
    res.status(500).json({ error: 'Failed to get account details' });
  }
});

// GET /stripe/account-requirements
router.get('/account-requirements', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user?.stripe_account_id) {
      res.status(400).json({ error: 'No Stripe account found' });
      return;
    }

    const requirements = await getAccountRequirements(user.stripe_account_id);

    // If there are outstanding requirements, include a remediation link
    let remediationUrl: string | null = null;
    if (requirements.has_requirements) {
      const link = await createRemediationLink(
        user.stripe_account_id,
        buildServerUrl(req, '/refresh'),
        buildServerUrl(req, '/return')
      );
      remediationUrl = link.url;
    }

    res.json({ ...requirements, remediation_url: remediationUrl });
  } catch (error) {
    console.error('[STRIPE] Account requirements error:', error);
    res.status(500).json({ error: 'Failed to get account requirements' });
  }
});

// POST /stripe/connection-token
router.post('/connection-token', async (req: Request, res: Response): Promise<void> => {
  try {
    const { test_mode } = req.body;

    // In test mode, create token for platform account (no connected account)
    if (test_mode === true) {
      const token = await createConnectionToken();
      res.json(token);
      return;
    }

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
