import Stripe from 'stripe';
import fs from 'fs';
import { config } from '../config';

const APPLE_PRIVATE_RELAY_SUFFIX = '@private.appleid.com';

// Pin Stripe API version explicitly per design doc
const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
});

// ─── Account Management ──────────────────────────────────────────────────────

export async function createConnectedAccount(
  email: string
): Promise<Stripe.Account> {
  try {
    return await stripe.accounts.create({
      email,
      controller: {
        losses: { payments: 'application' },
        fees: { payer: 'application' },
        stripe_dashboard: { type: 'express' },
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Create account error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<Stripe.AccountLink> {
  try {
    return await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Account link error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

export async function getAccountStatus(
  accountId: string
): Promise<{
  charges_enabled: boolean;
  details_submitted: boolean;
  payouts_enabled: boolean;
}> {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return {
      charges_enabled: account.charges_enabled ?? false,
      details_submitted: account.details_submitted ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
    };
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Account status error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

export async function getAccountDetails(accountId: string): Promise<{
  business_name: string | null;
  default_currency: string | null;
  support_address_zip: string | null;
  support_address_state: string | null;
  support_address_country: string | null;
}> {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    // Check multiple address sources — support_address is often empty during onboarding
    const addr = account.business_profile?.support_address
      ?? account.company?.address
      ?? account.individual?.address
      ?? null;
    return {
      business_name: account.business_profile?.name ?? account.company?.name ?? null,
      default_currency: account.default_currency ?? null,
      support_address_zip: addr?.postal_code ?? null,
      support_address_state: addr?.state ?? null,
      support_address_country: addr?.country ?? null,
    };
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Account details error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

export async function getAccountRequirements(accountId: string): Promise<{
  has_requirements: boolean;
  currently_due: string[];
  eventually_due: string[];
  past_due: string[];
  disabled_reason: string | null;
  charges_enabled: boolean;
}> {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    const reqs = account.requirements;
    const hasOutstandingReqs = (reqs?.currently_due?.length ?? 0) > 0 || (reqs?.past_due?.length ?? 0) > 0;
    // Show requirements banner if there are outstanding items OR if charges are disabled (account restricted/under review)
    const chargesEnabled = account.charges_enabled ?? false;
    return {
      has_requirements: hasOutstandingReqs || !chargesEnabled,
      currently_due: reqs?.currently_due ?? [],
      eventually_due: reqs?.eventually_due ?? [],
      past_due: reqs?.past_due ?? [],
      disabled_reason: reqs?.disabled_reason ?? null,
      charges_enabled: chargesEnabled,
    };
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Account requirements error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

// ─── Connect OAuth (Standard accounts) ───────────────────────────────────────
//
// Standard accounts authorize the platform via OAuth instead of Express's
// account-link onboarding form. The merchant signs in to their existing
// stripe.com account (or creates a new one) and grants OSPOS read_write
// access. The wire format of downstream API calls (PaymentIntent, refund,
// Terminal connection token, dispute) is identical for Standard and Express
// once we hold a stripe_user_id (`acct_xxx`) — both flow through the
// `Stripe-Account` header.
//
// Stripe nested params (stripe_user[email]) must NOT be percent-encoded in
// the brackets — using URLSearchParams here would over-encode and Stripe's
// parser would not unwrap the prefill. Build the URL manually.

export function buildOAuthAuthorizeUrl(state: string, prefillEmail?: string): string {
  const params = [
    'response_type=code',
    `client_id=${encodeURIComponent(config.connect.clientId)}`,
    'scope=read_write',
    `redirect_uri=${encodeURIComponent(config.connect.redirectUri)}`,
    `state=${encodeURIComponent(state)}`,
    'suggested_capabilities[]=card_payments',
    'suggested_capabilities[]=transfers',
    'stripe_user[country]=US',
  ];
  // Private-relay addresses won't reach Stripe's verification — let Stripe
  // collect a real email instead of pre-filling a useless forwarder.
  if (prefillEmail && !prefillEmail.endsWith(APPLE_PRIVATE_RELAY_SUFFIX)) {
    params.push(`stripe_user[email]=${encodeURIComponent(prefillEmail)}`);
  }
  return `https://connect.stripe.com/oauth/authorize?${params.join('&')}`;
}

export interface OAuthTokenResponse {
  stripe_user_id: string;
  livemode: boolean;
  scope: string;
  access_token?: string;
  refresh_token?: string;
}

export async function exchangeOAuthCode(code: string): Promise<OAuthTokenResponse> {
  try {
    const resp = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    });
    if (!resp.stripe_user_id) {
      throw new Error('OAuth token response missing stripe_user_id');
    }
    return {
      stripe_user_id: resp.stripe_user_id,
      livemode: resp.livemode ?? false,
      scope: resp.scope ?? 'read_write',
      access_token: resp.access_token,
      refresh_token: resp.refresh_token,
    };
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[OAUTH] Exchange code error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

// Revokes the platform's access to a connected account. Used by
// /stripe/disconnect (user-initiated) and as best-effort cleanup. Stripe
// errors here are not fatal — if Stripe says the grant is already gone we
// still clear our local pointer.
export async function revokeOAuthAccess(accountId: string): Promise<void> {
  try {
    await stripe.oauth.deauthorize({
      client_id: config.connect.clientId,
      stripe_user_id: accountId,
    });
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[OAUTH] Deauthorize error (non-fatal):', stripeErr.code, stripeErr.message);
  }
}

export async function createRemediationLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<Stripe.AccountLink> {
  try {
    return await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_update',
    });
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Remediation link error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

// ─── Terminal ────────────────────────────────────────────────────────────────

export async function createTerminalLocation(
  stripeAccountId: string,
  displayName: string
): Promise<Stripe.Terminal.Location> {
  try {
    // Create a location on the connected account for Terminal readers
    return await stripe.terminal.locations.create(
      {
        display_name: displayName,
        address: {
          line1: 'OSPOS Mobile Location',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94111',
          country: 'US',
        },
      },
      { stripeAccount: stripeAccountId }
    );
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Create terminal location error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

export async function createConnectionToken(stripeAccountId?: string): Promise<{ secret: string }> {
  try {
    const token = await stripe.terminal.connectionTokens.create(
      {},
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
    return { secret: token.secret };
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Connection token error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function createPaymentIntent(
  amount: number,
  currency: string,
  stripeAccountId: string,
  tipAmount?: number,
  idempotencyKey?: string
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  try {
    const totalAmount = tipAmount ? amount + tipAmount : amount;
    const rawPercent = parseFloat(process.env.PLATFORM_FEE_PERCENT ?? '1');
    if (isNaN(rawPercent) || rawPercent < 0 || rawPercent > 50) {
      throw new Error('PLATFORM_FEE_PERCENT must be between 0 and 50');
    }
    const platformFeePercent = rawPercent / 100;
    const applicationFee = Math.round(totalAmount * platformFeePercent);

    // Direct charge on connected account — required for Terminal + Connect
    // The Terminal SDK operates under the connected account's context,
    // so the PI must also live on the connected account.
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalAmount,
        currency,
        application_fee_amount: applicationFee,
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
      },
      {
        stripeAccount: stripeAccountId,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }
    );

    if (!paymentIntent.client_secret) {
      throw new Error('PaymentIntent created without client_secret');
    }

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error(
      '[STRIPE] Create payment intent error:',
      stripeErr.code, stripeErr.decline_code, stripeErr.message
    );
    throw error;
  }
}

export async function createRefund(
  paymentIntentId: string,
  amount?: number,
  stripeAccountId?: string
): Promise<Stripe.Refund> {
  try {
    const params: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
    };
    if (amount) {
      params.amount = amount;
    }
    // Direct charges: refund on the connected account
    // Stripe automatically refunds application fee proportionally
    return await stripe.refunds.create(
      params,
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Refund error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

// ─── Disputes ────────────────────────────────────────────────────────────────

export async function submitDisputeEvidence(
  disputeId: string,
  evidence: {
    uncategorized_text?: string;
    uncategorized_file?: string;
  },
  stripeAccountId?: string
): Promise<Stripe.Dispute> {
  try {
    return await stripe.disputes.update(
      disputeId,
      { evidence },
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] Submit evidence error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

export async function uploadFile(
  filePath: string,
  purpose: Stripe.FileCreateParams.Purpose,
  stripeAccountId?: string
): Promise<Stripe.File> {
  try {
    // Guard against path traversal — only allow files from temp directory
    const os = await import('os');
    if (!filePath.startsWith(os.tmpdir())) {
      throw new Error('Invalid file path');
    }
    return await stripe.files.create(
      {
        purpose,
        file: {
          data: fs.readFileSync(filePath),
          name: 'evidence.jpg',
          type: 'application/octet-stream',
        },
      },
      stripeAccountId ? { stripeAccount: stripeAccountId } : undefined
    );
  } catch (error) {
    const stripeErr = error as Stripe.errors.StripeError;
    console.error('[STRIPE] File upload error:', stripeErr.code, stripeErr.message);
    throw error;
  }
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    config.stripe.webhookSecret
  );
}

export { stripe };
