import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { constructWebhookEvent } from '../services/stripe';
import {
  createDisputeRecord,
  updateDisputeStatus,
  getDisputeByStripeId,
} from '../db/queries/disputes';
import { findUserByStripeAccount, clearUserStripeAccount } from '../db/queries/users';
import { sendPushNotification } from '../services/notifications';

const router = Router();

// POST /webhooks/stripe — NO auth middleware. Stripe signs webhooks.
router.post('/stripe', async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'];

  if (!signature) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  let event: Stripe.Event;

  try {
    event = constructWebhookEvent(req.body, signature as string);
  } catch (error) {
    console.error('[WEBHOOK] Signature verification failed:', error);
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(
          `[WEBHOOK] Payment succeeded: ${paymentIntent.id}, amount: ${paymentIntent.amount}`
        );
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.error(
          `[WEBHOOK] Payment failed: ${paymentIntent.id}, error: ${paymentIntent.last_payment_error?.message}`
        );
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        console.log(`[WEBHOOK] Dispute created: ${dispute.id}`);

        // Direct charges: the connected account ID is in event.account
        const connectedAccountId = (event as Stripe.Event & { account?: string }).account;

        if (connectedAccountId) {
          const user = await findUserByStripeAccount(connectedAccountId);

          if (user) {
            await createDisputeRecord(
              user.id,
              dispute.id,
              typeof dispute.payment_intent === 'string'
                ? dispute.payment_intent
                : dispute.payment_intent?.id ?? '',
              dispute.amount,
              dispute.reason ?? null,
              dispute.evidence_details?.due_by
                ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
                : null
            );

            // Send push notification
            if (user.push_token) {
              await sendPushNotification(
                user.push_token,
                'Payment Dispute Filed',
                `A dispute for $${(dispute.amount / 100).toFixed(2)} has been filed. Respond before the deadline.`
              );
            }
          }
        }
        break;
      }

      case 'charge.dispute.updated': {
        const dispute = event.data.object as Stripe.Dispute;
        console.log(`[WEBHOOK] Dispute updated: ${dispute.id}, status: ${dispute.status}`);
        await updateDisputeStatus(dispute.id, dispute.status);
        break;
      }

      case 'charge.dispute.closed': {
        const dispute = event.data.object as Stripe.Dispute;
        console.log(`[WEBHOOK] Dispute closed: ${dispute.id}, status: ${dispute.status}`);
        await updateDisputeStatus(dispute.id, dispute.status);
        break;
      }

      case 'account.application.deauthorized': {
        // Fires when a Standard merchant disconnects OSPOS from their Stripe
        // dashboard (revoking our OAuth grant). Null out the local pointer
        // so the next /onboarding call re-enters the OAuth flow rather than
        // calling the platform API against an unauthorized connected account.
        const connectedAccountId = (event as Stripe.Event & { account?: string }).account;
        if (connectedAccountId) {
          const user = await findUserByStripeAccount(connectedAccountId);
          if (user) {
            await clearUserStripeAccount(user.id);
            console.log(`[WEBHOOK] Deauthorized: cleared stripe_account_id for user ${user.id}`);
          } else {
            console.log(`[WEBHOOK] Deauthorized for unknown account ${connectedAccountId}; ignored`);
          }
        }
        break;
      }

      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error(`[WEBHOOK] Error processing ${event.type}:`, error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
