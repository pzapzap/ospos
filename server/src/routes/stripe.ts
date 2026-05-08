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

// Redirect endpoints for Stripe Connect onboarding (no auth needed).
// Stripe redirects here after onboarding. Modern Safari blocks programmatic
// navigation to custom URL schemes without a user gesture, so the page is
// designed to work without any JS — a big tappable button is the primary UX.
// The inline <script> remains as a best-effort auto-trigger that may or may
// not fire depending on the browser's gesture policy.
function deepLinkPage(deepLink: string, headline: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#09090B">
<title>${headline}</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#09090B;color:#FAFAFA;-webkit-font-smoothing:antialiased}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:24px;text-align:center}
.wrap{max-width:380px;width:100%;display:flex;flex-direction:column;align-items:center;gap:20px}
.eyebrow{font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#22D3EE;font-weight:600;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace}
.headline{font-size:28px;line-height:1.15;font-weight:700;margin:0;letter-spacing:-0.02em}
.body{font-size:17px;line-height:1.45;color:#A1A1AA;margin:0}
.btn{display:block;width:100%;background:#22D3EE;color:#09090B;font-size:18px;font-weight:700;padding:18px 24px;border:2px solid #06B6D4;border-bottom-width:6px;border-radius:14px;text-decoration:none;letter-spacing:-0.01em;margin-top:8px}
.btn:active{transform:translateY(2px);border-bottom-width:2px}
.note{font-size:13px;line-height:1.5;color:#71717A;margin:8px 0 0 0}
</style>
</head><body>
<div class="wrap">
  <div class="eyebrow">OSPOS · STRIPE</div>
  <h1 class="headline">${headline}</h1>
  <p class="body">Tap the button below to return to OSPOS and finish setup.</p>
  <a class="btn" href="${deepLink}">Open OSPOS</a>
  <p class="note">If nothing happens, switch back to the OSPOS app from your home screen — your progress is saved.</p>
</div>
<script>
setTimeout(function(){window.location.href="${deepLink}";},100);
setTimeout(function(){var i=document.createElement("iframe");i.style.display="none";i.src="${deepLink}";document.body.appendChild(i);},200);
</script>
</body></html>`;
}

// The bridge HTML uses an inline <script> to auto-trigger the ospos:// deep
// link. The global Helmet CSP (default-src 'self') would block that inline
// script and strand the user on api.ospos.app. These two routes serve a
// trusted, server-only HTML literal with a hardcoded deep link — no user
// input is reflected — so a route-scoped CSP that allows inline script and
// style is safe.
function setBridgeCsp(res: Response): void {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'self'"
  );
}

router.get('/return', (_req: Request, res: Response) => {
  setBridgeCsp(res);
  res.type('html').send(deepLinkPage('ospos://stripe/return', "You're done with Stripe"));
});
router.get('/refresh', (_req: Request, res: Response) => {
  setBridgeCsp(res);
  res.type('html').send(deepLinkPage('ospos://stripe/refresh', 'Heading back to OSPOS'));
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
      try {
        // Try account_update first (for accounts that finished initial onboarding)
        const link = await createRemediationLink(
          user.stripe_account_id,
          buildServerUrl(req, '/refresh'),
          buildServerUrl(req, '/return')
        );
        remediationUrl = link.url;
      } catch {
        // Fall back to account_onboarding (for accounts still in initial setup)
        const link = await createAccountLink(
          user.stripe_account_id,
          buildServerUrl(req, '/refresh'),
          buildServerUrl(req, '/return')
        );
        remediationUrl = link.url;
      }
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
    const user = await findUserById(req.user!.userId);

    // In test mode, create token for platform account. Only allowed if the
    // user does NOT have a connected account — otherwise we'd hand out a
    // platform token while the user is paid-tier, breaking reconciliation.
    if (test_mode === true) {
      if (user?.stripe_account_id) {
        res.status(400).json({ error: 'Test mode is unavailable for connected Stripe accounts' });
        return;
      }
      const token = await createConnectionToken();
      res.json(token);
      return;
    }

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
