import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { authMiddleware } from '../middleware/auth';
import {
  getDisputesByUser,
  getDisputeById,
  markEvidenceSubmitted,
} from '../db/queries/disputes';
import { submitDisputeEvidence, uploadFile } from '../services/stripe';

const router = Router();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB hard limit
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIME_TYPES.includes(file.mimetype));
  },
});

router.use(authMiddleware);

// GET /disputes/list
router.get('/list', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const disputes = await getDisputesByUser(req.user.userId);
    res.json({ disputes });
  } catch (error) {
    console.error('[DISPUTES] List error:', error);
    res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

// POST /disputes/submit-evidence
router.post(
  '/submit-evidence',
  upload.single('image'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const { dispute_id, description } = req.body;

      if (!dispute_id) {
        res.status(400).json({ error: 'dispute_id is required' });
        return;
      }

      if (description && typeof description === 'string' && description.length > 20000) {
        res.status(400).json({ error: 'description exceeds maximum length of 20000 characters' });
        return;
      }

      const dispute = await getDisputeById(dispute_id);
      if (!dispute || dispute.user_id !== req.user.userId) {
        res.status(404).json({ error: 'Dispute not found' });
        return;
      }

      let fileId: string | undefined;

      if (req.file) {
        // Compress image to <500KB with sharp
        const compressedPath = path.join(os.tmpdir(), `compressed-${Date.now()}.jpg`);
        await sharp(req.file.path)
          .jpeg({ quality: 70 })
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .toFile(compressedPath);

        // Check size, reduce further if needed
        const stats = fs.statSync(compressedPath);
        let finalPath = compressedPath;

        if (stats.size > 500 * 1024) {
          const furtherPath = path.join(os.tmpdir(), `compressed2-${Date.now()}.jpg`);
          await sharp(compressedPath)
            .jpeg({ quality: 40 })
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .toFile(furtherPath);
          finalPath = furtherPath;
          fs.unlinkSync(compressedPath);
        }

        // Upload to Stripe
        const stripeFile = await uploadFile(finalPath, 'dispute_evidence');
        fileId = stripeFile.id;

        // Clean up temp files
        fs.unlinkSync(finalPath);
        if (req.file.path !== finalPath) {
          try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
        }
      }

      // Submit evidence to Stripe
      const evidence: Record<string, string> = {};
      if (description) evidence.uncategorized_text = description;
      if (fileId) evidence.uncategorized_file = fileId;

      await submitDisputeEvidence(dispute.stripe_dispute_id, evidence);
      await markEvidenceSubmitted(dispute_id);

      res.json({ success: true });
    } catch (error) {
      console.error('[DISPUTES] Submit evidence error:', error);
      res.status(500).json({ error: 'Failed to submit evidence' });
    }
  }
);

export default router;
