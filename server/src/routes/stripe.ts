import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  findUserById,
  updateUserStripeAccount,
  updateUserTerminalLocation,
  clearUserStripeAccount,
} from '../db/queries/users';
import { createOAuthState, consumeOAuthState } from '../db/queries/stripeOAuthState';
import {
  createConnectedAccount,
  createAccountLink,
  getAccountStatus,
  getAccountDetails,
  getAccountRequirements,
  createRemediationLink,
  createConnectionToken,
  createTerminalLocation,
  buildOAuthAuthorizeUrl,
  exchangeOAuthCode,
  revokeOAuthAccess,
} from '../services/stripe';
import { config } from '../config';

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

// GET /stripe/oauth/callback — Stripe redirects the merchant's browser here
// after the OAuth consent screen. No auth middleware: this hop carries no
// JWT (Stripe is the caller). CSRF/replay protection comes from the `state`
// parameter we minted at /oauth/start and consume single-use here.
router.get('/oauth/callback', async (req: Request, res: Response): Promise<void> => {
  setBridgeCsp(res);

  const renderError = (code: string, headline = 'Almost there'): void => {
    res
      .type('html')
      .send(deepLinkPage(`ospos://stripe/return?error=${encodeURIComponent(code)}`, headline));
  };

  const state = typeof req.query.state === 'string' ? req.query.state : null;
  if (!state) {
    renderError('oauth_state_missing');
    return;
  }

  const stored = await consumeOAuthState(state);
  if (!stored) {
    renderError('oauth_state_invalid');
    return;
  }

  // Stripe surfaces user-cancellation as ?error=access_denied
  if (typeof req.query.error === 'string') {
    renderError(req.query.error === 'access_denied' ? 'access_denied' : 'oauth_denied');
    return;
  }

  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!code) {
    renderError('oauth_no_code');
    return;
  }

  try {
    const tokenResp = await exchangeOAuthCode(code);
    await updateUserStripeAccount(stored.user_id, tokenResp.stripe_user_id);

    // Best-effort: a Terminal Location is needed for TTPOi reader discovery
    // but not for the basic charge flow. If creation fails (e.g., Standard
    // accounts restrict platform-initiated location creation — see R1 in
    // the migration plan), log and continue; the merchant can still onboard.
    try {
      const location = await createTerminalLocation(
        tokenResp.stripe_user_id,
        `OSPOS - ${tokenResp.stripe_user_id}`
      );
      await updateUserTerminalLocation(stored.user_id, location.id);
    } catch (locErr) {
      console.error('[OAUTH] Terminal location create failed (non-fatal):', locErr);
    }

    res
      .type('html')
      .send(deepLinkPage('ospos://stripe/return', "You're connected"));
  } catch (err) {
    console.error('[OAUTH] Code exchange failed:', err);
    renderError('oauth_exchange_failed');
  }
});

// Build the server's own return/refresh URLs for Stripe account links
function buildServerUrl(req: Request, path: string): string {
  const proto = req.get('x-forwarded-proto') ?? req.protocol;
  const host = req.get('host');
  return `${proto}://${host}/stripe${path}`;
}

// All other Stripe routes require auth
router.use(authMiddleware);

// POST /stripe/oauth/start — authenticated. Mints a single-use state token
// bound to the caller, returns Stripe's OAuth authorize URL. The app loads
// this URL in the onboarding WebView. Only valid when mode=standard.
router.post('/oauth/start', async (req: Request, res: Response): Promise<void> => {
  try {
    if (config.connect.mode !== 'standard') {
      res.status(400).json({ error: 'OAuth not enabled in this deployment' });
      return;
    }
    const user = await findUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Short-circuit if the merchant already has a working connection. The
    // app uses this to skip the WebView entirely on subsequent launches.
    if (user.stripe_account_id) {
      res.json({
        alreadyConnected: true,
        url: null,
        stripeAccountId: user.stripe_account_id,
        terminalLocationId: user.terminal_location_id,
        mode: 'standard',
      });
      return;
    }

    const state = await createOAuthState(user.id);
    const url = buildOAuthAuthorizeUrl(state, user.email);

    res.json({
      alreadyConnected: false,
      url,
      stripeAccountId: null,
      terminalLocationId: null,
      mode: 'standard',
    });
  } catch (error) {
    console.error('[OAUTH] Start error:', error);
    res.status(500).json({ error: 'Failed to start OAuth flow' });
  }
});

// POST /stripe/disconnect — wipes the local Stripe linkage and best-effort
// revokes our platform's OAuth grant on Stripe's side. Used by the future
// "Reset Stripe Connection" Settings escape and by support workflows.
router.post('/disconnect', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (user.stripe_account_id && config.connect.mode === 'standard') {
      await revokeOAuthAccess(user.stripe_account_id);
    }
    await clearUserStripeAccount(user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[OAUTH] Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Stripe' });
  }
});

// POST /stripe/onboarding
// Feature-flagged: under `mode=standard` this returns an OAuth authorize
// URL (same response shape as before — `url` field). Under `mode=express`
// it preserves the legacy account-link flow. The app code reads `url` in
// both cases and is mode-agnostic.
router.post('/onboarding', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (config.connect.mode === 'standard') {
      if (user.stripe_account_id) {
        res.json({
          alreadyConnected: true,
          url: null,
          stripeAccountId: user.stripe_account_id,
          terminalLocationId: user.terminal_location_id,
          mode: 'standard',
        });
        return;
      }
      const state = await createOAuthState(user.id);
      const url = buildOAuthAuthorizeUrl(state, user.email);
      res.json({
        alreadyConnected: false,
        url,
        stripeAccountId: null,
        terminalLocationId: null,
        mode: 'standard',
      });
      return;
    }

    // Express mode (legacy)
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
      mode: 'express',
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
// Under standard mode, OAuth has no "refresh" — we simply mint a fresh
// authorize URL with a new state. Under express mode, regenerate the
// account_link as before.
router.post('/onboarding/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);

    if (config.connect.mode === 'standard') {
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      const state = await createOAuthState(user.id);
      const url = buildOAuthAuthorizeUrl(state, user.email);
      res.json({ url });
      return;
    }

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
// Also returns terminal_location_id so the app can keep its SecureStore cache
// in sync with the server-of-record. Callers (StripeOnboardingScreen post-OAuth
// return) treat this as cache invalidation: a stale local value from a prior
// install — e.g., from the Express era — gets overwritten with the current
// connected-account's location.
router.get('/account-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user?.stripe_account_id) {
      res.json({
        charges_enabled: false,
        details_submitted: false,
        payouts_enabled: false,
        terminal_location_id: null,
      });
      return;
    }

    const status = await getAccountStatus(user.stripe_account_id);
    res.json({ ...status, terminal_location_id: user.terminal_location_id });
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

    // Standard accounts: the merchant owns their stripe.com dashboard, which
    // is where they resolve requirements. Account-link based remediation is
    // an Express-specific concept and would 400 against a Standard account.
    // Express accounts: keep the historical account_update / account_onboarding
    // remediation link generation.
    let remediationUrl: string | null = null;
    if (requirements.has_requirements) {
      if (config.connect.mode === 'standard') {
        remediationUrl = 'https://dashboard.stripe.com/';
      } else {
        try {
          const link = await createRemediationLink(
            user.stripe_account_id,
            buildServerUrl(req, '/refresh'),
            buildServerUrl(req, '/return')
          );
          remediationUrl = link.url;
        } catch {
          const link = await createAccountLink(
            user.stripe_account_id,
            buildServerUrl(req, '/refresh'),
            buildServerUrl(req, '/return')
          );
          remediationUrl = link.url;
        }
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
