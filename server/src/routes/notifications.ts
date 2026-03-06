import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { findUserById, updateUserPushToken } from '../db/queries/users';
import { sendEmail } from '../services/sendgrid';
import { sendPushNotification } from '../services/notifications';
import { buildTTPOiLaunchEmail } from '../services/ttpoi-email';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// POST /notifications/push-token — register/update Expo push token
router.post('/push-token', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { pushToken } = req.body;
    if (!pushToken || typeof pushToken !== 'string') {
      res.status(400).json({ error: 'pushToken is required' });
      return;
    }

    // Basic format check: Expo push tokens start with ExponentPushToken[
    if (!pushToken.startsWith('ExponentPushToken[')) {
      res.status(400).json({ error: 'Invalid push token format' });
      return;
    }

    await updateUserPushToken(req.user.userId, pushToken);
    res.json({ success: true });
  } catch (error) {
    console.error('[NOTIFICATIONS] Push token update error:', error);
    res.status(500).json({ error: 'Failed to update push token' });
  }
});

// POST /notifications/ttpoi-launch-email — send TTPOi launch email to user
router.post('/ttpoi-launch-email', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const user = await findUserById(req.user.userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const businessName = (req.body.businessName as string) || 'your business';
    const { subject, html } = buildTTPOiLaunchEmail(businessName);
    const result = await sendEmail(user.email, subject, html);

    res.json(result);
  } catch (error) {
    console.error('[NOTIFICATIONS] TTPOi email error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// POST /notifications/ttpoi-launch-push — send TTPOi push notification to user
router.post('/ttpoi-launch-push', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const user = await findUserById(req.user.userId);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    if (!user.push_token) {
      res.json({ success: false, reason: 'No push token registered' });
      return;
    }

    // Apple-approved push notification copy (Value Proposition)
    const title = 'Accept in-person payments with Tap to Pay on iPhone.';
    const body = 'You can accept all types of contactless payments right on your iPhone\u2014from physical debit and credit cards to Apple Pay and other digital wallets. Terms apply.';

    const success = await sendPushNotification(user.push_token, title, body);
    res.json({ success });
  } catch (error) {
    console.error('[NOTIFICATIONS] TTPOi push error:', error);
    res.status(500).json({ error: 'Failed to send push notification' });
  }
});

export default router;
