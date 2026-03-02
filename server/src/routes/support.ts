import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// POST /support/ticket
router.post('/ticket', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { subject, description } = req.body;

    if (!subject || !description) {
      res.status(400).json({ error: 'subject and description are required' });
      return;
    }

    if (typeof subject !== 'string' || subject.length > 200) {
      res.status(400).json({ error: 'subject must be a string of 200 characters or less' });
      return;
    }

    if (typeof description !== 'string' || description.length > 5000) {
      res.status(400).json({ error: 'description must be a string of 5000 characters or less' });
      return;
    }

    // Strip control characters from log output
    const safeSubject = subject.replace(/[\x00-\x1f\x7f]/g, '');
    console.log(`[SUPPORT] Ticket from user ${req.user.userId}: ${safeSubject}`);

    res.json({ success: true, message: 'Support ticket received' });
  } catch (error) {
    console.error('[SUPPORT] Ticket error:', error);
    res.status(500).json({ error: 'Failed to submit support ticket' });
  }
});

export default router;
